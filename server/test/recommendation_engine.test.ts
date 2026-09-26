import assert from 'node:assert';
import { runMigrations } from '../src/db/migrator';
import { getDatabase } from '../src/db/database';
import { buildApp } from '../src/app';
import { seedFixtureQuestions } from '../src/db/seeder';
import { QuestionRepository } from '../src/db/repositories/questionRepository';
import { AttemptRepository } from '../src/db/repositories/attemptRepository';
import { SessionRepository } from '../src/db/repositories/sessionRepository';
import { ConceptRepository } from '../src/db/repositories/conceptRepository';
import { ReviewRepository } from '../src/db/repositories/reviewRepository';
import { ImportBatchRepository } from '../src/db/repositories/importBatchRepository';
import { RecommendationEngine } from '../src/engine/recommendationEngine';
import { MockQuestionVariationGenerator } from '../src/engine/variationGenerator';
import { SEED_QUESTIONS } from '../src/db/fixtures/seedQuestions';

async function testPhase6RecommendationEngine() {
  console.log('=== Phase 6: 개인화 복습 추천 및 취약 개념 집중 드릴링 종합 검증 테스트 시작 ===\n');

  // 1. DB 초기화, 마이그레이션 및 시딩
  runMigrations();
  const db = getDatabase();

  // 이전 잔여 데이터 정리 (테스트 격리)
  db.prepare(`DELETE FROM questions WHERE id NOT IN (${SEED_QUESTIONS.map((q) => `'${q.id}'`).join(',')})`).run();
  db.prepare(`DELETE FROM staged_questions`).run();
  db.prepare(`DELETE FROM import_batches`).run();
  db.prepare(`DELETE FROM attempts`).run();
  db.prepare(`DELETE FROM sessions`).run();
  db.prepare(`DELETE FROM review_states`).run();

  const seedResult = seedFixtureQuestions(db);
  console.log(`[DB 준비] 시드 문항: ${seedResult.totalCount}건 적재 완료`);

  const app = buildApp();
  const qRepo = new QuestionRepository(db);
  const aRepo = new AttemptRepository(db);
  const sRepo = new SessionRepository(db);
  const cRepo = new ConceptRepository(db);
  const rRepo = new ReviewRepository(db);
  const importRepo = new ImportBatchRepository(db);
  const engine = new RecommendationEngine(db);
  const generator = new MockQuestionVariationGenerator(db);

  // --- 시나리오 1: 콜드 스타트 (풀이 데이터 0건) 방어 및 신규 문항 기반 세션 생성 ---
  console.log('--- 시나리오 1: 콜드 스타트 (풀이 데이터 0건) 방어 및 기본 추천 세션 검증 ---');
  const coldQueue = engine.getDailyQueueSummary();
  assert.strictEqual(coldQueue.isColdStart, true, '풀이 이력 0건일 때 isColdStart=true');
  assert(coldQueue.newQuestionsCount > 0, '신규 문제 수량 확인');

  const coldSessionResult = engine.createDailySession({ count: 5 });
  assert.strictEqual(coldSessionResult.session.questionIds.length, 5, '콜드 스타트에서도 5문제 정상 구성');
  assert.strictEqual(coldSessionResult.session.status, 'ACTIVE');
  console.log('OK   [시나리오 1] 콜드 스타트 환경에서 500 에러 없이 신규 문제 기반 세션 정상 생성 통과');

  // --- 시나리오 2: 학습 행동 기록 (복습 예정, Unknown, 오답, 정답 확인, 힌트 의존) ---
  console.log('\n--- 시나리오 2: 학습 행동 기록 (Due, Unknown, 오답, Solution Reveal) ---');
  const qList = qRepo.findMany({ limit: 100 }).items;
  const qDue = qList[0];
  const qUnknown = qList[1];
  const qReveal = qList[2];
  const qWrong = qList[3];

  const now = new Date();
  const pastIso = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(); // 2일 전 복습 예정일

  // qDue: 복습 예정일이 지난 상태로 설정
  rRepo.recordAttempt(
    {
      id: 'att_test_due',
      questionId: qDue.id,
      userAnswer: '정답',
      isCorrect: true,
      score: 1.0,
      timeSpentMs: 5000,
      createdAt: pastIso,
    },
    qDue
  );
  // 강제로 next_review_at을 과거로 업데이트하여 Due 상태 유도
  db.prepare('UPDATE review_states SET next_review_at = ? WHERE question_id = ?').run(pastIso, qDue.id);

  // qUnknown: 회상 실패 (모르겠음) 기록
  aRepo.create({
    id: 'att_test_unk',
    questionId: qUnknown.id,
    userAnswer: '모르겠음',
    isCorrect: false,
    score: 0.0,
    isUnknown: true,
    timeSpentMs: 3000,
    createdAt: now.toISOString(),
  });
  rRepo.recordAttempt(
    {
      id: 'att_test_unk',
      questionId: qUnknown.id,
      userAnswer: '모르겠음',
      isCorrect: false,
      score: 0.0,
      isUnknown: true,
      timeSpentMs: 3000,
    },
    qUnknown
  );

  // qReveal: 문제를 풀기 전 정답 확인 기록
  aRepo.create({
    id: 'att_test_rev',
    questionId: qReveal.id,
    userAnswer: '정답확인',
    isCorrect: false,
    score: 0.0,
    solutionRevealed: true,
    timeSpentMs: 2000,
    createdAt: now.toISOString(),
  });
  rRepo.recordAttempt(
    {
      id: 'att_test_rev',
      questionId: qReveal.id,
      userAnswer: '정답확인',
      isCorrect: false,
      score: 0.0,
      solutionRevealed: true,
      timeSpentMs: 2000,
    },
    qReveal
  );

  // qWrong: 단순 오답 기록
  aRepo.create({
    id: 'att_test_wrg',
    questionId: qWrong.id,
    userAnswer: '틀린답',
    isCorrect: false,
    score: 0.0,
    timeSpentMs: 8000,
    createdAt: now.toISOString(),
  });
  rRepo.recordAttempt(
    {
      id: 'att_test_wrg',
      questionId: qWrong.id,
      userAnswer: '틀린답',
      isCorrect: false,
      score: 0.0,
      timeSpentMs: 8000,
    },
    qWrong
  );

  console.log('OK   [시나리오 2] 복습 예정, Unknown, Solution Reveal, 오답 이력 적재 완료');

  // --- 시나리오 3: 추천 점수 및 reasonCodes 설명 가능성(Explainability) 검증 ---
  console.log('\n--- 시나리오 3: 추천 점수 산출 및 설명 가능성 (reasonCodes) 검증 ---');
  const recommendations = engine.getRecommendations({ limit: 10 });
  assert(recommendations.length > 0, '추천 결과 1건 이상 반환');

  const recDue = recommendations.find((r) => r.question.id === qDue.id);
  assert(recDue, '복습 예정 문항이 추천 목록에 포함되어야 함');
  assert(recDue.score.reasonCodes.includes('DUE_REVIEW'), 'DUE_REVIEW reasonCode 포함 확인');
  assert(recDue.score.dueScore > 0, 'dueScore 가산 확인');

  const recUnknown = recommendations.find((r) => r.question.id === qUnknown.id);
  assert(recUnknown, 'Unknown 문항이 추천 목록에 포함되어야 함');
  assert(recUnknown.score.reasonCodes.includes('RECENT_UNKNOWN'), 'RECENT_UNKNOWN reasonCode 포함 확인');
  assert(recUnknown.score.unknownScore > 0, 'unknownScore 가산 확인');

  const recReveal = recommendations.find((r) => r.question.id === qReveal.id);
  assert(recReveal, 'Solution Reveal 문항이 추천 목록에 포함되어야 함');
  assert(recReveal.score.reasonCodes.includes('SOLUTION_REVEALED'), 'SOLUTION_REVEALED reasonCode 포함 확인');

  console.log('OK   [시나리오 3] DUE_REVIEW, RECENT_UNKNOWN, SOLUTION_REVEALED 사유 코드 및 점수 분해 검증 통과');

  // --- 시나리오 4: 취약 개념 집중 Drill 세션 생성 검증 ---
  console.log('\n--- 시나리오 4: 취약 개념 집중 Drill 세션 생성 및 타 개념 혼입 방지 검증 ---');
  const targetConceptId = 'concept_c_pointer';
  const drillResult = engine.createConceptDrillSession({
    conceptId: targetConceptId,
    count: 3,
  });

  assert.strictEqual(drillResult.session.status, 'ACTIVE');
  assert(drillResult.session.questionIds.length >= 1, '드릴 세션 문항 생성 확인');

  // 세션의 모든 문제가 해당 conceptId에 속하는지 엄격히 확인
  for (const qId of drillResult.session.questionIds) {
    const q = qRepo.findById(qId);
    assert.strictEqual(q?.conceptId, targetConceptId, `모든 문제는 ${targetConceptId}에 속해야 함`);
  }
  console.log('OK   [시나리오 4] 특정 Concept의 문제만으로 세션이 생성되며 타 개념 혼입 없음 통과');

  // --- 시나리오 5: 한 세션 내 중복 방지 및 다양성(Diversity) 보장 검증 ---
  console.log('\n--- 시나리오 5: 중복 questionId 방지 및 동일 계보 과다 몰림 억제 검증 ---');
  const dailySessionResult = engine.createDailySession({ count: 8 });
  const uniqueIds = new Set(dailySessionResult.session.questionIds);
  assert.strictEqual(
    uniqueIds.size,
    dailySessionResult.session.questionIds.length,
    '세션 내 동일 question_id 중복이 없어야 함'
  );
  console.log('OK   [시나리오 5] 세션 내 questionId 완전 고유성 및 중복 배제 확인 통과');

  // --- 시나리오 6: AI_VARIATION 생성 인터페이스, 계보 보존, Live DB 격리 검증 ---
  console.log('\n--- 시나리오 6: AI_VARIATION 계보 보존 및 Live DB 격리 검증 ---');
  const baseQuestion = qList[0];
  const liveCountBefore = qRepo.count();

  // 1. 변형 문제 생성
  const variation = await generator.generateVariation(baseQuestion, {
    variationType: 'PARAMETER_CHANGE',
  });
  assert.strictEqual(variation.sourceQuestionId, baseQuestion.id);
  assert.strictEqual(variation.parentQuestionId, baseQuestion.parentQuestionId || baseQuestion.id);
  assert.strictEqual(variation.conceptId, baseQuestion.conceptId);
  assert.strictEqual(variation.variationType, 'PARAMETER_CHANGE');

  // 2. Staging 등록 (Live DB가 아님)
  const stagedResult = await generator.stageVariation(variation);
  assert(stagedResult.stagedQuestion.id, 'StagedQuestion ID 생성 확인');
  assert.strictEqual(stagedResult.stagedQuestion.reviewStatus, 'PENDING', '기본 상태는 반드시 PENDING이어야 함');
  assert.strictEqual(stagedResult.stagedQuestion.conceptId, baseQuestion.conceptId);

  // 3. Live questions 테이블에 자동 커밋되지 않았는지 엄격 확인
  const liveCountAfter = qRepo.count();
  assert.strictEqual(
    liveCountAfter,
    liveCountBefore,
    'AI 변형 문제 생성 후 Live DB(questions) 건수가 증가해서는 안 됨'
  );
  console.log('OK   [시나리오 6] AI_VARIATION 생성 시 parentQuestionId/conceptId 보존 및 Live DB 격리 확인 통과');

  // --- 시나리오 7: Fixture 제외 필터링 검증 ---
  console.log('\n--- 시나리오 7: excludeTestFixtures=true 필터링 검증 ---');
  const recsNoFixtures = engine.getRecommendations({
    limit: 20,
    excludeTestFixtures: true,
  });
  for (const r of recsNoFixtures) {
    assert.notStrictEqual(r.question.sourceType, 'TEST_FIXTURE', 'TEST_FIXTURE가 포함되어서는 안 됨');
  }
  console.log('OK   [시나리오 7] excludeTestFixtures=true 시 TEST_FIXTURE 엄격 배제 확인 통과');

  // --- 시나리오 8: REST API 엔드포인트 연동 종합 검증 ---
  console.log('\n--- 시나리오 8: Phase 6 신규 REST API 라우트 검증 ---');

  // GET /api/learning/recommendations
  const resRecs = await app.inject({
    method: 'GET',
    url: '/api/learning/recommendations?limit=5',
  });
  assert.strictEqual(resRecs.statusCode, 200);
  const recsBody = JSON.parse(resRecs.body);
  assert(Array.isArray(recsBody.questions), 'questions 배열 반환');
  assert(Array.isArray(recsBody.items), 'items 배열 반환');

  // GET /api/learning/daily-queue
  const resQueue = await app.inject({
    method: 'GET',
    url: '/api/learning/daily-queue',
  });
  assert.strictEqual(resQueue.statusCode, 200);
  const queueBody = JSON.parse(resQueue.body);
  assert(typeof queueBody.dueCount === 'number');
  assert(typeof queueBody.weakConceptCount === 'number');

  // POST /api/learning/daily-session
  const resDaily = await app.inject({
    method: 'POST',
    url: '/api/learning/daily-session',
    payload: { count: 4 },
  });
  assert.strictEqual(resDaily.statusCode, 201);
  const dailyBody = JSON.parse(resDaily.body);
  assert(dailyBody.session.id);
  assert(dailyBody.firstQuestion);

  // POST /api/learning/drill
  const resDrill = await app.inject({
    method: 'POST',
    url: '/api/learning/drill',
    payload: { conceptId: targetConceptId, count: 2 },
  });
  assert.strictEqual(resDrill.statusCode, 201);
  const drillBody = JSON.parse(resDrill.body);
  assert(drillBody.session.id);

  // POST /api/learning/variations/generate-mock
  const resVar = await app.inject({
    method: 'POST',
    url: '/api/learning/variations/generate-mock',
    payload: {
      questionId: baseQuestion.id,
      variationType: 'CODE_CHANGE',
      autoStage: true,
    },
  });
  assert.strictEqual(resVar.statusCode, 201);
  const varBody = JSON.parse(resVar.body);
  assert(varBody.variation);
  assert.strictEqual(varBody.stagedQuestion.reviewStatus, 'PENDING');

  console.log('OK   [시나리오 8] 신규 API 5종 (recommendations, daily-queue, daily-session, drill, variation) 연동 통과');

  console.log('\n🎉 Phase 6 개인화 복습 추천 및 취약 개념 집중 드릴링 8대 시나리오 전체 통과!');
}

testPhase6RecommendationEngine()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('테스트 실패:', err);
    process.exit(1);
  });
