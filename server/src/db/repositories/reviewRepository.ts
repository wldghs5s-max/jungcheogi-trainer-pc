import { Database } from 'better-sqlite3';
import {
  ReviewState,
  ReviewItemState,
  DueReviewItem,
  LearningDashboardSummary,
  QuizAttempt,
  Question,
  Subject,
} from '@jungcheogi/shared';
import { getDatabase } from '../database';
import { QuestionRepository } from './questionRepository';
import { ConceptRepository } from './conceptRepository';

interface ReviewStateRow {
  question_id: string;
  concept_id: string | null;
  box_level: number;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  lapses: number;
  correct_count: number;
  wrong_count: number;
  unknown_count: number;
  hint_count: number;
  last_score: number;
  weakness_score: number;
  review_state: string;
  last_studied_at: string | null;
  next_review_at: string;
}

function mapRowToReviewState(row: ReviewStateRow): ReviewState {
  return {
    questionId: row.question_id,
    conceptId: row.concept_id ?? undefined,
    boxLevel: row.box_level,
    easeFactor: row.ease_factor,
    intervalDays: row.interval_days,
    repetitions: row.repetitions,
    lapses: row.lapses,
    correctCount: row.correct_count,
    wrongCount: row.wrong_count,
    unknownCount: row.unknown_count,
    hintCount: row.hint_count,
    lastScore: row.last_score,
    weaknessScore: row.weakness_score,
    reviewState: row.review_state as ReviewItemState,
    lastStudiedAt: row.last_studied_at ?? undefined,
    nextReviewAt: row.next_review_at,
  };
}

export class ReviewRepository {
  private db: Database;
  private questionRepo: QuestionRepository;
  private conceptRepo: ConceptRepository;

  constructor(customDb?: Database) {
    this.db = customDb || getDatabase();
    this.questionRepo = new QuestionRepository(this.db);
    this.conceptRepo = new ConceptRepository(this.db);
  }

  public findByQuestionId(questionId: string): ReviewState | null {
    const stmt = this.db.prepare('SELECT * FROM review_states WHERE question_id = ?');
    const row = stmt.get(questionId) as ReviewStateRow | undefined;
    return row ? mapRowToReviewState(row) : null;
  }

  public getOrCreate(questionId: string, conceptId?: string): ReviewState {
    const existing = this.findByQuestionId(questionId);
    if (existing) return existing;

    const now = new Date().toISOString();
    const initialState: ReviewState = {
      questionId,
      conceptId,
      boxLevel: 1,
      easeFactor: 2.5,
      intervalDays: 1,
      repetitions: 0,
      lapses: 0,
      correctCount: 0,
      wrongCount: 0,
      unknownCount: 0,
      hintCount: 0,
      lastScore: 0,
      weaknessScore: 0.5,
      reviewState: 'NEW',
      nextReviewAt: now,
    };

    const stmt = this.db.prepare(`
      INSERT INTO review_states (
        question_id, concept_id, box_level, ease_factor, interval_days,
        repetitions, lapses, correct_count, wrong_count, unknown_count,
        hint_count, last_score, weakness_score, review_state, next_review_at
      ) VALUES (
        @question_id, @concept_id, @box_level, @ease_factor, @interval_days,
        @repetitions, @lapses, @correct_count, @wrong_count, @unknown_count,
        @hint_count, @last_score, @weakness_score, @review_state, @next_review_at
      )
    `);

    stmt.run({
      question_id: initialState.questionId,
      concept_id: initialState.conceptId ?? null,
      box_level: initialState.boxLevel,
      ease_factor: initialState.easeFactor,
      interval_days: initialState.intervalDays,
      repetitions: initialState.repetitions,
      lapses: initialState.lapses,
      correct_count: initialState.correctCount,
      wrong_count: initialState.wrongCount,
      unknown_count: initialState.unknownCount,
      hint_count: initialState.hintCount,
      last_score: initialState.lastScore,
      weakness_score: initialState.weaknessScore,
      review_state: initialState.reviewState,
      next_review_at: initialState.nextReviewAt,
    });

    return initialState;
  }

  /**
   * Attempt 풀이 행동을 ReviewState 및 취약도에 실시간 반영
   */
  public recordAttempt(attempt: QuizAttempt, question: Question): ReviewState {
    const current = this.getOrCreate(question.id, question.conceptId);

    const now = new Date();
    const nowIso = now.toISOString();

    const isUnknown = Boolean(attempt.isUnknown);
    const solutionRevealed = Boolean(attempt.solutionRevealed);
    const hintUsed = Boolean(attempt.hintUsed);
    const score = attempt.score ?? (attempt.isCorrect ? 1.0 : 0.0);

    const newCorrectCount = current.correctCount + (attempt.isCorrect ? 1 : 0);
    const newWrongCount = current.wrongCount + (!attempt.isCorrect && !isUnknown ? 1 : 0);
    const newUnknownCount = current.unknownCount + (isUnknown ? 1 : 0);
    const newHintCount = current.hintCount + (hintUsed ? 1 : 0);

    let newBoxLevel = current.boxLevel;
    let newIntervalDays = current.intervalDays;
    let newLapses = current.lapses;
    let newRepetitions = current.repetitions;
    let newReviewState: ReviewItemState = 'LEARNING';

    // 1. 회상 실패: 모르겠음(Unknown), 정답 확인(SolutionRevealed), 또는 완전 오답
    if (isUnknown || solutionRevealed || score < 0.5) {
      newBoxLevel = 1;
      newLapses += 1;
      newIntervalDays = 1;
      newReviewState = 'LEARNING';
    }
    // 2. 힌트 도움을 받은 부분 회상 (hintUsed)
    else if (hintUsed) {
      newIntervalDays = Math.max(1, Math.round(newIntervalDays * 1.2));
      newReviewState = 'LEARNING';
      // 힌트 사용 시 박스 레벨 보수적 승급 제한
    }
    // 3. 자력 정답 회상 (score >= 0.8 && !hintUsed && !solutionRevealed)
    else {
      newBoxLevel = Math.min(5, newBoxLevel + 1);
      newRepetitions += 1;

      // Leitner 박스별 표준 복습 주기 (일 단위)
      const INTERVAL_MAP: Record<number, number> = {
        1: 1,
        2: 3,
        3: 7,
        4: 14,
        5: 30,
      };
      newIntervalDays = INTERVAL_MAP[newBoxLevel] || 30;

      if (newBoxLevel >= 5) {
        newReviewState = 'MASTERED';
      } else {
        newReviewState = 'REVIEW';
      }
    }

    // 다음 복습 일정 계산 (현재 시간 + newIntervalDays 일)
    const nextDate = new Date(now.getTime() + newIntervalDays * 24 * 60 * 60 * 1000);
    const nextReviewAt = nextDate.toISOString();

    // 취약도 점수 산출 (0.0 ~ 1.0)
    // 오답률, 모르겠음 빈도, 힌트 의존도, 최근 점수를 종합 가중
    const totalAttempts = newCorrectCount + newWrongCount + newUnknownCount;
    let weakness = 0.5;
    if (totalAttempts > 0) {
      const penalty = (newWrongCount * 1.0 + newUnknownCount * 1.3 + newHintCount * 0.4) / totalAttempts;
      const recentScoreFactor = 1.0 - score;
      weakness = Number(Math.min(1.0, Math.max(0.0, penalty * 0.7 + recentScoreFactor * 0.3)).toFixed(2));
    }

    const updated: ReviewState = {
      questionId: question.id,
      conceptId: question.conceptId || current.conceptId,
      boxLevel: newBoxLevel,
      easeFactor: current.easeFactor,
      intervalDays: newIntervalDays,
      repetitions: newRepetitions,
      lapses: newLapses,
      correctCount: newCorrectCount,
      wrongCount: newWrongCount,
      unknownCount: newUnknownCount,
      hintCount: newHintCount,
      lastScore: score,
      weaknessScore: weakness,
      reviewState: newReviewState,
      lastStudiedAt: nowIso,
      nextReviewAt,
    };

    const stmt = this.db.prepare(`
      UPDATE review_states SET
        concept_id = @concept_id,
        box_level = @box_level,
        ease_factor = @ease_factor,
        interval_days = @interval_days,
        repetitions = @repetitions,
        lapses = @lapses,
        correct_count = @correct_count,
        wrong_count = @wrong_count,
        unknown_count = @unknown_count,
        hint_count = @hint_count,
        last_score = @last_score,
        weakness_score = @weakness_score,
        review_state = @review_state,
        last_studied_at = @last_studied_at,
        next_review_at = @next_review_at
      WHERE question_id = @question_id
    `);

    stmt.run({
      question_id: updated.questionId,
      concept_id: updated.conceptId ?? null,
      box_level: updated.boxLevel,
      ease_factor: updated.easeFactor,
      interval_days: updated.intervalDays,
      repetitions: updated.repetitions,
      lapses: updated.lapses,
      correct_count: updated.correctCount,
      wrong_count: updated.wrongCount,
      unknown_count: updated.unknownCount,
      hint_count: updated.hintCount,
      last_score: updated.lastScore,
      weakness_score: updated.weaknessScore,
      review_state: updated.reviewState,
      last_studied_at: updated.lastStudiedAt ?? null,
      next_review_at: updated.nextReviewAt,
    });

    return updated;
  }

  /**
   * 오늘 복습 도래(Due) 문항 목록 조회
   */
  public findDueReviews(options: {
    subject?: Subject;
    limit?: number;
    excludeTestFixtures?: boolean;
  } = {}): DueReviewItem[] {
    const limit = options.limit || 20;
    const nowIso = new Date().toISOString();

    const conditions: string[] = ['r.next_review_at <= ?'];
    const params: any[] = [nowIso];

    conditions.push("(q.study_visibility IS NULL OR q.study_visibility != 'TEMPORARY_DRILL')");

    if (options.subject) {
      conditions.push('q.subject = ?');
      params.push(options.subject);
    }

    if (options.excludeTestFixtures) {
      conditions.push("q.source_type != 'TEST_FIXTURE'");
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT r.*
      FROM review_states r
      INNER JOIN questions q ON q.id = r.question_id
      ${whereClause}
      ORDER BY 
        r.weakness_score DESC,
        r.next_review_at ASC
      LIMIT ?
    `;

    const rows = this.db.prepare(query).all(...params, limit) as ReviewStateRow[];
    const items: DueReviewItem[] = [];

    for (const row of rows) {
      const state = mapRowToReviewState(row);
      const q = this.questionRepo.findById(state.questionId);
      if (q) {
        // 우선순위 점수: 취약도(60%) + 지연 일수 가중(40%)
        const priorityScore = Number((state.weaknessScore * 0.6 + (state.boxLevel === 1 ? 0.4 : 0.2)).toFixed(2));
        items.push({
          reviewState: state,
          question: q,
          priorityScore,
        });
      }
    }

    return items;
  }

  /**
   * 학습 대시보드 종합 요약 통계
   */
  public getDashboardSummary(excludeTestFixtures = false): LearningDashboardSummary {
    const nowIso = new Date().toISOString();

    const fixtureCondition = excludeTestFixtures ? "AND q.source_type != 'TEST_FIXTURE'" : '';
    const visibilityCondition = "AND (q.study_visibility IS NULL OR q.study_visibility != 'TEMPORARY_DRILL')";

    const statsRow = this.db
      .prepare(
        `SELECT
          COUNT(r.question_id) as total_studied,
          SUM(CASE WHEN r.next_review_at <= ? THEN 1 ELSE 0 END) as due_count,
          SUM(CASE WHEN r.review_state = 'MASTERED' THEN 1 ELSE 0 END) as mastered_count,
          SUM(r.correct_count) as total_correct,
          SUM(r.wrong_count + r.unknown_count) as total_failed
        FROM review_states r
        INNER JOIN questions q ON q.id = r.question_id
        WHERE 1=1 ${visibilityCondition} ${fixtureCondition}`
      )
      .get(nowIso) as {
      total_studied: number;
      due_count: number;
      mastered_count: number;
      total_correct: number;
      total_failed: number;
    };

    const attemptsCountRow = this.db
      .prepare(`
        SELECT COUNT(a.id) as count
        FROM attempts a
        INNER JOIN questions q ON q.id = a.question_id
        WHERE 1=1 ${visibilityCondition} ${fixtureCondition}
      `)
      .get() as { count: number };

    const totalStudied = statsRow ? Number(statsRow.total_studied || 0) : 0;
    const dueCount = statsRow ? Number(statsRow.due_count || 0) : 0;
    const masteredCount = statsRow ? Number(statsRow.mastered_count || 0) : 0;
    const totalCorrect = statsRow ? Number(statsRow.total_correct || 0) : 0;
    const totalFailed = statsRow ? Number(statsRow.total_failed || 0) : 0;
    const totalResponses = totalCorrect + totalFailed;
    const accuracy = totalResponses > 0 ? Number(((totalCorrect / totalResponses) * 100).toFixed(1)) : 0;

    const weakConcepts = this.conceptRepo.findWeakConcepts(5);

    return {
      totalStudiedQuestions: totalStudied,
      dueReviewCount: dueCount,
      masteredCount: masteredCount,
      weakConcepts,
      recentAttemptsCount: attemptsCountRow ? attemptsCountRow.count : 0,
      overallAccuracy: accuracy,
    };
  }
}
