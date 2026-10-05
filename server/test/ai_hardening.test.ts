import assert from 'node:assert';
import { runMigrations } from '../src/db/migrator.js';
import { closeDatabase, getDatabase } from '../src/db/database.js';
import { buildApp } from '../src/app.js';
import { setupIsolatedTestDb } from './helpers/testDb.js';
import { QuestionRepository } from '../src/db/repositories/questionRepository.js';
import { SessionRepository } from '../src/db/repositories/sessionRepository.js';
import { ReviewRepository } from '../src/db/repositories/reviewRepository.js';
import { ConceptRepository } from '../src/db/repositories/conceptRepository.js';
import { RecommendationEngine } from '../src/engine/recommendationEngine.js';
import { setExecutionEngineOverride } from '../src/engine/codeExecutionEngine.js';
import { setAIServiceOverride } from '../src/engine/aiService.js';
import { GeneratedVariation, ICodeExecutionEngine, isStudyEligible } from '@jungcheogi/shared';

async function runHardeningTests() {
  console.log('=== AI 문제 생성 파이프라인 개인 학습 UX 하드닝 회귀 테스트 스위트 (Tests 1~9) 시작 ===\n');

  const isolated = setupIsolatedTestDb({ seed: true });
  runMigrations();
  const db = getDatabase();

  const questionRepo = new QuestionRepository(db);
  const sessionRepo = new SessionRepository(db);
  const reviewRepo = new ReviewRepository(db);
  const conceptRepo = new ConceptRepository(db);
  const recEngine = new RecommendationEngine(db);

  // 테스트를 위한 결정론적 Mock AI 서비스 주입 (외부 API 의존성 및 지연 방지)
  const defaultMockAIService = {
    async generateVariation(params: any): Promise<GeneratedVariation> {
      return {
        id: `var_mock_${Date.now()}`,
        parentQuestionId: params.question.id,
        conceptId: params.question.conceptId,
        questionType: 'CODE_TRACE',
        subject: params.question.subject,
        category: params.question.category,
        prompt: '다음 자바 코드의 실행 결과를 작성하시오.',
        codeSnippet: 'class Test { public static void main(String[] args) { System.out.println(10); } }',
        language: 'JAVA',
        groundTruthAnswer: '10',
        aiExplanation: '출력값은 10입니다.',
        aiVariationNotes: 'Mock 변형 문제',
        generationMetadata: {
          generator: 'MockAIService',
          model: 'mock',
          generatedAt: new Date().toISOString(),
          durationMs: 10,
        },
      };
    },
    async explainCodeLine() { throw new Error('not used'); },
    async generateTutoringExplanation() { throw new Error('not used'); },
    async generateProgressiveHints() { throw new Error('not used'); },
  };
  setAIServiceOverride(defaultMockAIService as any);

  // 로컬 자바 실행기 부재 상태 모의 (UNAVAILABLE)
  const unavailableEngine: ICodeExecutionEngine = {
    async execute() {
      return {
        status: 'UNAVAILABLE',
        stdout: '',
        stderr: '격리된 샌드박스 환경이 제공되지 않음',
        exitCode: null,
        executionTimeMs: 1,
      };
    },
  };
  setExecutionEngineOverride(unavailableEngine);

  const app = buildApp();

  // ------------------------------------------------------------------------
  // Test 1: UNAVAILABLE variation drill도 문제를 사용자에게 반환한다.
  // ------------------------------------------------------------------------
  console.log('--- Test 1: UNAVAILABLE variation drill 문제 반환 검증 ---');
  const res1 = await app.inject({
    method: 'POST',
    url: '/api/ai/variation-drill',
    payload: { parentQuestionId: 'q_2021_01_03' },
  });

  assert.strictEqual(res1.statusCode, 200, 'UNAVAILABLE 상황에서도 학습을 차단하지 않고 200 반환');
  const data1 = JSON.parse(res1.body);
  assert.strictEqual(data1.success, true, '문제 반환 성공');
  assert.ok(data1.question && data1.question.id, '사용자에게 풀이 대상 문항 객체 반환');
  assert.ok(data1.drillSession && data1.drillSession.id, '사용자가 바로 풀 수 있는 세션 객체 반환');
  console.log('OK   Test 1 PASS: UNAVAILABLE 변형 드릴도 문제를 사용자에게 즉시 반환');

  const drillQId = data1.question.id;
  const drillSessionId = data1.drillSession.id;

  // ------------------------------------------------------------------------
  // Test 2: UNAVAILABLE variation drill은 정식 questions table(LIVE)에 들어가지 않는다.
  // ------------------------------------------------------------------------
  console.log('\n--- Test 2: 정식 questions DB 격리 (study_visibility = TEMPORARY_DRILL) 검증 ---');
  const rawQRow = db.prepare('SELECT study_visibility FROM questions WHERE id = ?').get(drillQId) as {
    study_visibility: string;
  };
  assert.ok(rawQRow, '임시 드릴 문항이 DB에 존재함');
  assert.strictEqual(rawQRow.study_visibility, 'TEMPORARY_DRILL', '정식 LIVE가 아닌 TEMPORARY_DRILL로 격리');
  
  const fetchedQ = questionRepo.findById(drillQId);
  assert.ok(fetchedQ);
  assert.strictEqual(isStudyEligible(fetchedQ), false, '정규 학습 추천/랜덤 문제은행 풀에 포함되지 않음');

  const liveQuestions = questionRepo.findAllMatching({ studyVisibility: 'LIVE' as any });
  assert.strictEqual(liveQuestions.some((q) => q.id === drillQId), false, 'LIVE 문제 목록에 미노출');
  console.log('OK   Test 2 PASS: UNAVAILABLE 드릴 문항이 정식 questions LIVE 풀에 들어가지 않음');

  // ------------------------------------------------------------------------
  // Test 3: UNAVAILABLE variation drill은 UNVERIFIED PRACTICE session으로만 생성된다.
  // ------------------------------------------------------------------------
  console.log('\n--- Test 3: UNVERIFIED PRACTICE 세션 및 메타데이터 분류 검증 ---');
  assert.strictEqual(data1.verificationStatus, 'UNVERIFIED', '검증 상태: UNVERIFIED');
  assert.strictEqual(data1.answerSource, 'AI_UNVERIFIED', '정답 소스: AI_UNVERIFIED');
  assert.match(data1.drillSession.title, /비검증 연습/, '세션 타이틀에 비검증 연습 명시');
  assert.strictEqual(data1.executionStatus, 'UNAVAILABLE', '실행 검증 상태 UNAVAILABLE 보존');
  console.log('OK   Test 3 PASS: UNVERIFIED PRACTICE 세션 및 비검증 메타데이터로 정상 생성');

  // ------------------------------------------------------------------------
  // Test 4 & 5: AI answer는 채점용 Ground Truth로 사용되지 않으며 정답/오답이 확정되지 않는다.
  // ------------------------------------------------------------------------
  console.log('\n--- Test 4 & 5: AI 답안 미신뢰 및 정답/오답 미확정 (비검증 채점) 검증 ---');
  const submitRes = await app.inject({
    method: 'POST',
    url: `/api/sessions/${drillSessionId}/submit`,
    payload: {
      questionId: drillQId,
      userAnswer: 'any_answer_string',
      timeSpentMs: 2500,
    },
  });

  assert.strictEqual(submitRes.statusCode, 200);
  const submitData = JSON.parse(submitRes.body);
  assert.strictEqual(submitData.isCorrect, false, '비검증 연습 문제이므로 공식 정답으로 판정하지 않음');
  assert.strictEqual(submitData.score, 0, '점수 0점 고정');
  assert.strictEqual(submitData.isUnverifiedPractice, true, 'isUnverifiedPractice 플래그 확인');
  assert.strictEqual(submitData.verificationStatus, 'UNVERIFIED', 'verificationStatus: UNVERIFIED');
  assert.strictEqual(submitData.reviewState, undefined, '공식 reviewState 미반환');
  assert.match(submitData.feedback, /비검증 AI 연습 문제|참고용/, '비검증 연습 피드백 제공');
  
  // 세션 진행 상태에서 정답수/오답수 증가 없음 확인
  assert.strictEqual(submitData.sessionProgress.correctCount, 0, '정답수 증가 없음');
  assert.strictEqual(submitData.sessionProgress.wrongCount, 0, '오답수 증가 없음');
  console.log('OK   Test 4 & 5 PASS: AI 답안을 Ground Truth로 신뢰하지 않으며 정답/오답 확정 차단');

  // ------------------------------------------------------------------------
  // Test 6: UNVERIFIED attempt가 공식 학습 통계/weak/mastered/due 계산에 반영되지 않는다.
  // ------------------------------------------------------------------------
  console.log('\n--- Test 6: 공식 학습 통계 및 SRS 복습 상태 오염 방지 검증 ---');
  const reviewStateRow = db.prepare('SELECT * FROM review_states WHERE question_id = ?').get(drillQId);
  assert.strictEqual(reviewStateRow, undefined, 'review_states 테이블에 레코드 전혀 생성되지 않음');

  const dailySummary = recEngine.getDailyQueueSummary();
  assert.strictEqual(dailySummary.dueCount, 0, '복습 예정(dueCount)에 미반영');
  assert.strictEqual(dailySummary.recentFailedCount, 0, '최근 오답 통계(recentFailedCount)에 미반영');

  const weakConcepts = conceptRepo.findWeakConcepts();
  assert.strictEqual(weakConcepts.some((c) => c.conceptId === data1.question.conceptId), false, '취약 개념 선정에 미반영');
  console.log('OK   Test 6 PASS: review_states 및 학습 큐/취약도 통계 오염 전혀 없음');

  // ------------------------------------------------------------------------
  // Test 7: UNVERIFIED 문제가 staging queue에도 계속 보관되는지 확인한다.
  // ------------------------------------------------------------------------
  console.log('\n--- Test 7: 백그라운드 Staging 대기열(staged_questions) 보존 검증 ---');
  assert.ok(data1.stagedQuestionId, '응답에 stagedQuestionId가 포함됨');
  const stagedRow = db.prepare('SELECT id, review_status, parent_question_id FROM staged_questions WHERE id = ?').get(data1.stagedQuestionId) as {
    id: string;
    review_status: string;
    parent_question_id: string;
  };
  assert.ok(stagedRow, 'staged_questions 테이블에 정상 적재됨');
  assert.strictEqual(stagedRow.review_status, 'PENDING', '검수 대기(PENDING) 상태로 안전 격리 보존');
  assert.strictEqual(stagedRow.parent_question_id, 'q_2021_01_03', '부모 문제 계보 보존');
  console.log('OK   Test 7 PASS: Staging 검수 대기열에 PENDING으로 안전 보존 확인');

  // ------------------------------------------------------------------------
  // Test 8: 기존 VERIFIED variation drill의 정상 흐름은 하나도 깨지지 않는다.
  // ------------------------------------------------------------------------
  console.log('\n--- Test 8: VERIFIED 드릴 정상 채점 및 SRS 반영 회귀 검증 ---');
  // 코드 실행 성공 모의 엔진 주입
  const mockSuccessEngine: ICodeExecutionEngine = {
    async execute() {
      return {
        status: 'SUCCESS',
        stdout: '100\n',
        stderr: '',
        exitCode: 0,
        executionTimeMs: 12,
      };
    },
  };
  setExecutionEngineOverride(mockSuccessEngine);

  // AI 생성 결과가 계산 결과(100)와 일치하는 변형을 반환하도록 모의
  const mockAIService = {
    async generateVariation(params: any): Promise<GeneratedVariation> {
      return {
        id: 'var_mock_verified',
        parentQuestionId: params.question.id,
        conceptId: params.question.conceptId,
        questionType: 'CODE_TRACE',
        subject: params.question.subject,
        category: params.question.category,
        prompt: '다음 코드의 출력값을 구하시오 (검증 완료).',
        codeSnippet: 'print(10 * 10)',
        language: 'PYTHON',
        groundTruthAnswer: '100',
        aiExplanation: '10 * 10 = 100입니다.',
        aiVariationNotes: '성공 검증 테스트',
        generationMetadata: {
          generator: 'MockVerifiedService',
          model: 'mock',
          generatedAt: new Date().toISOString(),
          durationMs: 50,
        },
      };
    },
    async explainCodeLine() { throw new Error('not used'); },
    async generateTutoringExplanation() { throw new Error('not used'); },
    async generateProgressiveHints() { throw new Error('not used'); },
  };
  setAIServiceOverride(mockAIService as any);

  const resVerified = await app.inject({
    method: 'POST',
    url: '/api/ai/variation-drill',
    payload: { parentQuestionId: 'q_2021_01_03' },
  });

  assert.strictEqual(resVerified.statusCode, 200);
  const dataVerified = JSON.parse(resVerified.body);
  assert.strictEqual(dataVerified.success, true);
  assert.strictEqual(dataVerified.verificationStatus, 'VERIFIED', '실행 검증 성공 시 VERIFIED 상태');
  assert.strictEqual(dataVerified.answerSource, 'EXECUTION_VERIFIED', '정답 소스: EXECUTION_VERIFIED');
  assert.strictEqual(dataVerified.drillSession.title, 'AI 변형 드릴');

  // VERIFIED 문제에 정답(100) 제출 시 정상 채점 및 SRS 기록 검증
  const submitVerifiedRes = await app.inject({
    method: 'POST',
    url: `/api/sessions/${dataVerified.drillSession.id}/submit`,
    payload: {
      questionId: dataVerified.question.id,
      userAnswer: '100',
      timeSpentMs: 3000,
    },
  });

  assert.strictEqual(submitVerifiedRes.statusCode, 200);
  const submitVerifiedData = JSON.parse(submitVerifiedRes.body);
  assert.strictEqual(submitVerifiedData.isCorrect, true, 'VERIFIED 드릴 정답 판정');
  assert.strictEqual(submitVerifiedData.score, 1.0, '1.0점 획득');
  assert.ok(submitVerifiedData.reviewState, '공식 reviewState 반환');
  assert.strictEqual(submitVerifiedData.sessionProgress.correctCount, 1, '세션 정답 카운트 1 증가');
  
  const verifiedReviewRow = db.prepare('SELECT * FROM review_states WHERE question_id = ?').get(dataVerified.question.id);
  assert.ok(verifiedReviewRow, 'VERIFIED 문제는 review_states에 정상 기록됨');
  console.log('OK   Test 8 PASS: VERIFIED variation drill의 정상 채점 및 SRS 주기 흐름 완벽 보존');

  // ------------------------------------------------------------------------
  // Test 9: AI generated wrong answer + UNAVAILABLE 조건에서도
  //         사용자에게 문제는 제공되지만 wrong answer가 공식 정답으로 사용되지 않는다.
  // ------------------------------------------------------------------------
  console.log('\n--- Test 9: AI 오답 생성 + UNAVAILABLE 조건 방어 검증 ---');
  setExecutionEngineOverride(unavailableEngine);

  // AI가 계산오류로 엉뚱한 오답(999)을 제시했다고 가정
  const mockAIWrongAnswerService = {
    async generateVariation(params: any): Promise<GeneratedVariation> {
      return {
        id: 'var_mock_wrong_answer',
        parentQuestionId: params.question.id,
        conceptId: params.question.conceptId,
        questionType: 'CODE_TRACE',
        subject: params.question.subject,
        category: params.question.category,
        prompt: '다음 복잡한 코드의 실행 결과를 작성하시오.',
        codeSnippet: 'int a = 10; printf("%d", a + 5);',
        language: 'C',
        groundTruthAnswer: '999', // AI가 잘못 생성한 오답
        aiExplanation: 'AI는 999라고 착각함.',
        generationMetadata: {
          generator: 'MockWrongAIService',
          model: 'mock',
          generatedAt: new Date().toISOString(),
          durationMs: 50,
        },
      };
    },
    async explainCodeLine() { throw new Error('not used'); },
    async generateTutoringExplanation() { throw new Error('not used'); },
    async generateProgressiveHints() { throw new Error('not used'); },
  };
  setAIServiceOverride(mockAIWrongAnswerService as any);

  const resWrong = await app.inject({
    method: 'POST',
    url: '/api/ai/variation-drill',
    payload: { parentQuestionId: 'q_2021_01_03' },
  });

  assert.strictEqual(resWrong.statusCode, 200, '오답 의심이라도 UNAVAILABLE 환경에서 문제 자체는 사용자에게 제공');
  const dataWrong = JSON.parse(resWrong.body);
  assert.strictEqual(dataWrong.verificationStatus, 'UNVERIFIED');
  assert.strictEqual(dataWrong.answerSource, 'AI_UNVERIFIED');

  // 사용자가 AI가 생성한 오답('999')을 그대로 적어서 제출해도 공식 정답 처리되어서는 안 됨!
  const submitWrongRes = await app.inject({
    method: 'POST',
    url: `/api/sessions/${dataWrong.drillSession.id}/submit`,
    payload: {
      questionId: dataWrong.question.id,
      userAnswer: '999', // AI가 제안한 비검증 답안 입력
      timeSpentMs: 2000,
    },
  });

  assert.strictEqual(submitWrongRes.statusCode, 200);
  const submitWrongData = JSON.parse(submitWrongRes.body);
  assert.strictEqual(submitWrongData.isCorrect, false, 'AI의 비검증 오답과 일치하더라도 정답 판정 절대 불가');
  assert.strictEqual(submitWrongData.score, 0, '점수 부여 불가');
  assert.strictEqual(submitWrongData.isUnverifiedPractice, true);
  assert.strictEqual(submitWrongData.reviewState, undefined, 'SRS 복습 큐에 미반영');
  console.log('OK   Test 9 PASS: AI 오답 + UNAVAILABLE 상황에서도 문제는 제공되나 AI 오답을 정답으로 인정하지 않음');

  // 정리
  setExecutionEngineOverride(null);
  setAIServiceOverride(null);
  await app.close();
  closeDatabase();
  isolated.cleanup();

  console.log('\n🎉 [COMPLETE] AI 변형 드릴 개인 학습 UX 하드닝 전체 9대 회귀 테스트 100% 통과!\n');
}

runHardeningTests().catch((err) => {
  console.error('테스트 실패:', err);
  process.exit(1);
});
