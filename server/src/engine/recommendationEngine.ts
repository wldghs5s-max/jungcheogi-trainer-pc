import { Database } from 'better-sqlite3';
import {
  Question,
  ReviewState,
  QuizAttempt,
  Subject,
  StudySession,
  RecommendedQuestionItem,
  RecommendationScoreBreakdown,
  RecommendationReasonCode,
  DailyLearningMixConfig,
  DEFAULT_DAILY_MIX,
  DailyLearningQueueSummary,
  DailySessionRequest,
  DrillSessionRequest,
  isStudyEligible,
} from '@jungcheogi/shared';
import { getDatabase } from '../db/database.js';
import { QuestionRepository } from '../db/repositories/questionRepository.js';
import { ReviewRepository } from '../db/repositories/reviewRepository.js';
import { AttemptRepository } from '../db/repositories/attemptRepository.js';
import { ConceptRepository } from '../db/repositories/conceptRepository.js';
import { SessionRepository } from '../db/repositories/sessionRepository.js';

export interface RecommendationWeights {
  due: number;
  weakness: number;
  recentUnknown: number;
  solutionRevealed: number;
  recentFailure: number;
  hintDependency: number;
  longInactive: number;
  newQuestion: number;
}

export const DEFAULT_RECOMMENDATION_WEIGHTS: RecommendationWeights = {
  due: 35,
  weakness: 25,
  recentUnknown: 24,
  solutionRevealed: 20,
  recentFailure: 18,
  hintDependency: 12,
  longInactive: 10,
  newQuestion: 15,
};

export class RecommendationEngine {
  private db: Database;
  private questionRepo: QuestionRepository;
  private reviewRepo: ReviewRepository;
  private attemptRepo: AttemptRepository;
  private conceptRepo: ConceptRepository;
  private sessionRepo: SessionRepository;
  private weights: RecommendationWeights;

  constructor(customDb?: Database, customWeights?: Partial<RecommendationWeights>) {
    this.db = customDb || getDatabase();
    this.questionRepo = new QuestionRepository(this.db);
    this.reviewRepo = new ReviewRepository(this.db);
    this.attemptRepo = new AttemptRepository(this.db);
    this.conceptRepo = new ConceptRepository(this.db);
    this.sessionRepo = new SessionRepository(this.db);
    this.weights = {
      ...DEFAULT_RECOMMENDATION_WEIGHTS,
      ...(customWeights || {}),
    };
  }

  /**
   * 개별 문제에 대한 설명 가능한 추천 점수(RecommendationScore) 산출
   */
  public scoreQuestion(
    question: Question,
    review: ReviewState | null,
    recentAttempts: QuizAttempt[],
    topWeakConceptIds: Set<string>,
    weights: RecommendationWeights = this.weights,
    now: Date = new Date()
  ): RecommendationScoreBreakdown {
    const reasonCodes: RecommendationReasonCode[] = [];
    const nowIso = now.toISOString();

    let dueScore = 0;
    let weaknessScore = 0;
    let recencyScore = 0;
    let failureScore = 0;
    let unknownScore = 0;
    let solutionRevealedScore = 0;
    let hintDependencyScore = 0;
    let longInactiveScore = 0;
    let noveltyScore = 0;

    // 1. 복습 예정일(Due) 도래 여부 평가
    if (review && review.nextReviewAt) {
      const isDue = review.nextReviewAt <= nowIso;
      if (isDue) {
        const nextDate = new Date(review.nextReviewAt);
        const overdueDays = Math.max(0, (now.getTime() - nextDate.getTime()) / (1000 * 60 * 60 * 24));
        dueScore = Number((weights.due * (1.0 + Math.min(1.0, overdueDays * 0.2))).toFixed(1));
        reasonCodes.push('DUE_REVIEW');
      }
    }

    // 2. 개념 및 문항 취약도(Weakness) 평가
    const isWeakConcept = Boolean(question.conceptId && topWeakConceptIds.has(question.conceptId));
    if (isWeakConcept) {
      reasonCodes.push('WEAK_CONCEPT');
    }
    const itemWeakness = review ? review.weaknessScore : (isWeakConcept ? 0.6 : 0.0);
    weaknessScore = Number((weights.weakness * itemWeakness + (isWeakConcept ? weights.weakness * 0.4 : 0)).toFixed(1));

    // 3. 풀이 행동 이력 평가 (Unknown, Solution Revealed, Failure, Hint)
    if (recentAttempts.length > 0) {
      const latestAttempt = recentAttempts[0];

      // 최근 Unknown 여부 (스스로 회상 불가)
      if (latestAttempt.isUnknown) {
        unknownScore = weights.recentUnknown;
        reasonCodes.push('RECENT_UNKNOWN');
      }

      // 최근 Solution Revealed 여부 (풀기 전 답안 확인)
      if (latestAttempt.solutionRevealed) {
        solutionRevealedScore = weights.solutionRevealed;
        reasonCodes.push('SOLUTION_REVEALED');
      }

      // 최근 단순 오답 여부 (오답이지만 회상 시도는 함)
      if (!latestAttempt.isCorrect && !latestAttempt.isUnknown && !latestAttempt.solutionRevealed) {
        failureScore = weights.recentFailure;
        reasonCodes.push('RECENT_FAILURE');
      }

      // 힌트 의존도 평가
      const hasHintUsed = recentAttempts.some((a) => a.hintUsed);
      if (hasHintUsed || (review && review.hintCount > 0)) {
        const hintFactor = Math.min(1.0, ((review?.hintCount || 0) + 1) * 0.3);
        hintDependencyScore = Number((weights.hintDependency * hintFactor).toFixed(1));
        reasonCodes.push('HINT_DEPENDENCY');
      }

      // 장기 미복습 평가 (최근 학습 후 7일 이상 경과)
      if (review && review.lastStudiedAt && review.reviewState !== 'MASTERED') {
        const lastDate = new Date(review.lastStudiedAt);
        const daysSinceLast = (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceLast >= 7) {
          longInactiveScore = Number((weights.longInactive * Math.min(1.5, daysSinceLast / 7)).toFixed(1));
          reasonCodes.push('LONG_INACTIVE');
        }
      }

      // recencyScore: 최근 풀이 시점 기반 보조 가중
      const lastAttemptDate = new Date(latestAttempt.createdAt);
      const hoursAgo = Math.max(0, (now.getTime() - lastAttemptDate.getTime()) / (1000 * 60 * 60));
      if (hoursAgo < 24 && !latestAttempt.isCorrect) {
        recencyScore = 8; // 24시간 이내 틀린 문제 즉시 재학습 유도
      }
    } else {
      // 신규 미학습 문항 (Novelty)
      noveltyScore = weights.newQuestion;
      reasonCodes.push('NEW_UNSTUDIED');
    }

    const totalScore = Number(
      (
        dueScore +
        weaknessScore +
        recencyScore +
        failureScore +
        unknownScore +
        solutionRevealedScore +
        hintDependencyScore +
        longInactiveScore +
        noveltyScore
      ).toFixed(1)
    );

    return {
      totalScore,
      dueScore,
      weaknessScore,
      recencyScore,
      failureScore,
      unknownScore,
      solutionRevealedScore,
      hintDependencyScore,
      longInactiveScore,
      noveltyScore,
      diversityPenalty: 0,
      reasonCodes,
    };
  }

  /**
   * 개인화 추천 문항 목록 조회 (필터링 및 정렬)
   */
  public getRecommendations(options: {
    limit?: number;
    conceptId?: string;
    subject?: Subject;
    includeNew?: boolean;
    includeDue?: boolean;
    excludeTestFixtures?: boolean;
  } = {}): RecommendedQuestionItem[] {
    const limit = options.limit || 10;
    const now = new Date();

    // 1. 후보 문제 목록 조회
    let candidates = this.questionRepo.findAllMatching({
      conceptId: options.conceptId,
      subject: options.subject,
    });
    if (options.excludeTestFixtures) {
      candidates = candidates.filter((q) => q.sourceType !== 'TEST_FIXTURE');
    }
    candidates = candidates.filter((q) => isStudyEligible(q));

    if (candidates.length === 0) {
      return [];
    }

    // 2. 상위 취약 개념 ID 목록 추출
    const weakConcepts = this.conceptRepo.findWeakConcepts(5);
    const topWeakConceptIds = new Set(weakConcepts.map((c) => c.conceptId));

    // 3. 각 문항별 점수 계산
    const scoredList: RecommendedQuestionItem[] = [];

    for (const q of candidates) {
      const review = this.reviewRepo.findByQuestionId(q.id);
      const attempts = this.attemptRepo.findByQuestionId(q.id);

      const score = this.scoreQuestion(q, review, attempts, topWeakConceptIds, this.weights, now);

      // 필터 조건 적용
      if (options.includeDue === false && score.dueScore > 0) continue;
      if (options.includeNew === false && score.noveltyScore > 0) continue;

      let conceptTitle: string | undefined;
      if (q.conceptId) {
        const c = this.conceptRepo.findById(q.conceptId);
        conceptTitle = c?.title;
      }

      scoredList.push({
        question: q,
        score,
        conceptTitle,
        reviewState: review?.reviewState || 'NEW',
        boxLevel: review?.boxLevel || 1,
      });
    }

    // 4. 추천 점수 내림차순 정렬
    scoredList.sort((a, b) => b.score.totalScore - a.score.totalScore);

    return scoredList.slice(0, limit);
  }

  /**
   * "오늘의 학습" 큐 요약 통계 산출 (대시보드 노출용)
   */
  public getDailyQueueSummary(excludeTestFixtures = false): DailyLearningQueueSummary {
    const nowIso = new Date().toISOString();

    const fixtureCondition = excludeTestFixtures ? "AND q.source_type != 'TEST_FIXTURE'" : '';

    // 1. 복습 예정 문항 수
    const dueRow = this.db
      .prepare(
        `SELECT COUNT(DISTINCT r.question_id) as count
         FROM review_states r
         INNER JOIN questions q ON q.id = r.question_id
         WHERE r.next_review_at <= ? ${fixtureCondition}`
      )
      .get(nowIso) as { count: number };
    const dueCount = dueRow ? dueRow.count : 0;

    // 2. 취약 개념 수
    const weakConcepts = this.conceptRepo.findWeakConcepts(5);
    const weakConceptCount = weakConcepts.length;

    // 3. 최근 오답 / Unknown 문항 수 (최근 7일)
    const failedRow = this.db
      .prepare(
        `SELECT COUNT(DISTINCT a.question_id) as count
         FROM attempts a
         INNER JOIN questions q ON q.id = a.question_id
         WHERE (a.is_correct = 0 OR a.is_unknown = 1 OR a.solution_revealed = 1)
         ${fixtureCondition}`
      )
      .get() as { count: number };
    const recentFailedCount = failedRow ? failedRow.count : 0;

    // 4. 아직 풀지 않은 신규 문항 수
    const totalQRow = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM questions q
         WHERE 1=1 ${fixtureCondition}`
      )
      .get() as { count: number };
    const totalQ = totalQRow ? totalQRow.count : 0;

    const studiedQRow = this.db
      .prepare(
        `SELECT COUNT(DISTINCT r.question_id) as count FROM review_states r
         INNER JOIN questions q ON q.id = r.question_id
         WHERE 1=1 ${fixtureCondition}`
      )
      .get() as { count: number };
    const studiedQ = studiedQRow ? studiedQRow.count : 0;
    const newQuestionsCount = Math.max(0, totalQ - studiedQ);

    const attemptsCount = this.attemptRepo.count();
    const isColdStart = attemptsCount === 0;

    return {
      dueCount,
      weakConceptCount,
      recentFailedCount,
      newQuestionsCount,
      totalRecommendedCount: dueCount + (weakConceptCount > 0 ? 3 : 0) + Math.min(newQuestionsCount, 5),
      isColdStart,
    };
  }

  /**
   * "오늘의 학습" 자동 추천 세션 생성
   * - DEFAULT_DAILY_MIX (due 50%, weakConcept 30%, new 20%) 비율을 기본값으로 사용
   * - 부족한 카테고리는 자동으로 다른 카테고리에서 보충 (Fallback)
   * - 다양성(Diversity) 필터링으로 동일 부모 문항 또는 동일 개념 과다 중복 억제
   * - 기존 SessionRepository.create()를 재사용하여 StudySession 생성
   */
  public createDailySession(options: DailySessionRequest = {}): {
    session: StudySession;
    firstQuestion: Question;
  } {
    const totalCount = Math.min(Math.max(options.count || 10, 1), 30);
    const excludeFixtures = Boolean(options.excludeTestFixtures);
    const mix: DailyLearningMixConfig = {
      ...DEFAULT_DAILY_MIX,
      ...(options.mixConfig || {}),
    };

    // 1. 카테고리별 목표 문항 수 산출
    let dueTarget = Math.round(totalCount * mix.due);
    let weakTarget = Math.round(totalCount * mix.weakConcept);
    let newTarget = totalCount - dueTarget - weakTarget;
    if (newTarget < 0) newTarget = 0;

    const selectedQuestionIds = new Set<string>();
    const selectedQuestions: Question[] = [];

    // Helper: 문항 추가 및 중복/다양성 확인
    const tryAddQuestion = (q: Question): boolean => {
      if (selectedQuestionIds.has(q.id)) return false;

      // 다양성 검사: 한 세션 내에 동일 parentQuestionId를 가진 문항은 최대 2개까지만 허용
      if (q.parentQuestionId) {
        const sameParentCount = selectedQuestions.filter(
          (sq) => sq.parentQuestionId === q.parentQuestionId || sq.id === q.parentQuestionId
        ).length;
        if (sameParentCount >= 2) return false;
      }

      selectedQuestionIds.add(q.id);
      selectedQuestions.push(q);
      return true;
    };

    // --- 카테고리 1: 오늘 복습 예정 (Due Review) 문항 추출 ---
    const dueItems = this.reviewRepo.findDueReviews({
      subject: options.subject && options.subject !== 'ALL' ? (options.subject as Subject) : undefined,
      limit: dueTarget + 10,
      excludeTestFixtures: excludeFixtures,
    });
    for (const item of dueItems) {
      if (selectedQuestions.length >= totalCount) break;
      if (tryAddQuestion(item.question)) {
        if (--dueTarget <= 0) break;
      }
    }

    // --- 카테고리 2: 취약 개념 (Weak Concepts) 문항 추출 ---
    const weakConcepts = this.conceptRepo.findWeakConcepts(5);
    for (const wc of weakConcepts) {
      if (selectedQuestions.length >= totalCount) break;
      for (const qId of wc.relatedQuestionIds) {
        const q = this.questionRepo.findById(qId);
        if (q && (!excludeFixtures || q.sourceType !== 'TEST_FIXTURE')) {
          if (tryAddQuestion(q)) {
            if (--weakTarget <= 0) break;
          }
        }
      }
      if (weakTarget <= 0) break;
    }

    // --- 카테고리 3: 신규 미풀이 (New Unstudied) 문항 추출 ---
    const allCandidates = this.questionRepo
      .findAllMatching({
        subject:
          options.subject && options.subject !== "ALL"
            ? (options.subject as Subject)
            : undefined,
      })
      .filter((q) => !excludeFixtures || q.sourceType !== "TEST_FIXTURE")
      .filter((q) => isStudyEligible(q));

    for (const q of allCandidates) {
      if (selectedQuestions.length >= totalCount) break;
      const review = this.reviewRepo.findByQuestionId(q.id);
      if (!review || review.reviewState === 'NEW' || review.repetitions === 0) {
        if (tryAddQuestion(q)) {
          if (--newTarget <= 0) break;
        }
      }
    }

    // --- Fallback 보충: 목표 문항 수에 미달하면 가용한 모든 문항에서 보충 ---
    if (selectedQuestions.length < totalCount) {
      for (const q of allCandidates) {
        if (selectedQuestions.length >= totalCount) break;
        tryAddQuestion(q);
      }
    }

    // 만약 데이터가 전혀 없는 극단적 상황 방어
    if (selectedQuestions.length === 0) {
      throw new Error('학습 가능한 문제가 없습니다. 문제를 먼저 등록하거나 Fixture를 활성화해 주세요.');
    }

    // 2. StudySession 생성
    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const sessionTitle = `오늘의 개인화 복습 세션 (${selectedQuestions.length}제)`;

    const newSession: StudySession = {
      id: sessionId,
      title: sessionTitle,
      subjectFilter: options.subject || 'ALL',
      questionIds: selectedQuestions.map((q) => q.id),
      currentIndex: 0,
      status: 'ACTIVE',
      totalQuestions: selectedQuestions.length,
      correctCount: 0,
      wrongCount: 0,
      unknownCount: 0,
      totalTimeSpentMs: 0,
      startedAt: new Date().toISOString(),
    };

    const created = this.sessionRepo.create(newSession);
    return {
      session: created,
      firstQuestion: selectedQuestions[0],
    };
  }

  /**
   * 취약 개념 집중 드릴 (Concept Drill) 세션 생성
   * - 지정된 conceptId에 속한 문항만으로 엄격히 세션 구성 (타 개념 혼입 방지)
   * - 우선순위: (1) 최근 오답 -> (2) Unknown -> (3) Hint 의존 -> (4) 미풀이 신규 -> (5) 장기 미복습 -> (6) 숙련
   * - 동일 questionId 중복 방지 및 parentQuestionId 과다 집중 방지
   * - 기존 SessionRepository.create()를 재사용하여 StudySession 생성
   */
  public createConceptDrillSession(request: DrillSessionRequest): {
    session: StudySession;
    firstQuestion: Question;
  } {
    const { conceptId, count = 5, title } = request;
    const targetCount = Math.min(Math.max(count, 1), 30);

    const concept = this.conceptRepo.findById(conceptId);
    if (!concept) {
      throw new Error(`개념 ID '${conceptId}'를 찾을 수 없습니다.`);
    }

    // 해당 개념에 속한 문항만 조회
    const candidateQuestions = this.questionRepo
      .findAllMatching({
        conceptId,
      })
      .filter((q) => isStudyEligible(q));

    if (candidateQuestions.length === 0) {
      throw new Error(`개념 '${concept.title}'에 등록된 문제가 없습니다.`);
    }

    // 각 문항의 우선순위 점수 평가
    const scoredQuestions = candidateQuestions.map((q) => {
      const review = this.reviewRepo.findByQuestionId(q.id);
      const attempts = this.attemptRepo.findByQuestionId(q.id);
      const latestAttempt = attempts.length > 0 ? attempts[0] : null;

      let priorityScore = 0;
      const reasons: string[] = [];

      if (latestAttempt) {
        if (!latestAttempt.isCorrect && !latestAttempt.isUnknown && !latestAttempt.solutionRevealed) {
          priorityScore += 100;
          reasons.push('RECENT_WRONG');
        } else if (latestAttempt.isUnknown) {
          priorityScore += 90;
          reasons.push('RECENT_UNKNOWN');
        } else if (latestAttempt.solutionRevealed) {
          priorityScore += 80;
          reasons.push('SOLUTION_REVEALED');
        } else if (latestAttempt.hintUsed) {
          priorityScore += 70;
          reasons.push('HINT_DEPENDENT');
        }
      } else {
        // 미풀이 신규 문제
        priorityScore += 60;
        reasons.push('UNSTUDIED_NEW');
      }

      if (review) {
        priorityScore += review.weaknessScore * 30;
        if (review.reviewState === 'MASTERED') {
          priorityScore -= 40; // 이미 숙련된 문제는 우선순위 하향
        }
      }

      return {
        question: q,
        priorityScore,
        reasons,
      };
    });

    // 우선순위 내림차순 정렬
    scoredQuestions.sort((a, b) => b.priorityScore - a.priorityScore);

    // 다양성 및 중복 배제 선별
    const selectedQuestions: Question[] = [];
    const selectedIds = new Set<string>();

    for (const item of scoredQuestions) {
      if (selectedQuestions.length >= targetCount) break;
      const q = item.question;
      if (selectedIds.has(q.id)) continue;

      // 동일 parentQuestionId 변형 문제 연속/과다 몰림 완화 (최대 2문항)
      if (q.parentQuestionId) {
        const sameParentCount = selectedQuestions.filter(
          (sq) => sq.parentQuestionId === q.parentQuestionId || sq.id === q.parentQuestionId
        ).length;
        if (sameParentCount >= 2) continue;
      }

      selectedIds.add(q.id);
      selectedQuestions.push(q);
    }

    // 만약 다양성 제한으로 targetCount에 미달하면 남은 후보에서 중복 없이 보충
    if (selectedQuestions.length < targetCount) {
      for (const item of scoredQuestions) {
        if (selectedQuestions.length >= targetCount) break;
        if (!selectedIds.has(item.question.id)) {
          selectedIds.add(item.question.id);
          selectedQuestions.push(item.question);
        }
      }
    }

    const sessionId = `drill_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const sessionTitle = title || `[취약 개념 드릴] ${concept.title} (${selectedQuestions.length}제)`;

    const newSession: StudySession = {
      id: sessionId,
      title: sessionTitle,
      subjectFilter: concept.subject,
      questionIds: selectedQuestions.map((q) => q.id),
      currentIndex: 0,
      status: 'ACTIVE',
      totalQuestions: selectedQuestions.length,
      correctCount: 0,
      wrongCount: 0,
      unknownCount: 0,
      totalTimeSpentMs: 0,
      startedAt: new Date().toISOString(),
    };

    const created = this.sessionRepo.create(newSession);
    return {
      session: created,
      firstQuestion: selectedQuestions[0],
    };
  }
}
