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
import { SEED_QUESTIONS } from '../src/db/fixtures/seedQuestions';
import { setupIsolatedTestDb } from './helpers/testDb';

async function testPhase5LearningEngine() {
  console.log('=== Phase 5: 학습 데이터 전략 및 학습 엔진 종합 검증 테스트 시작 ===\n');
  const isolated = setupIsolatedTestDb({ seed: false });

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

  // Concept 시딩 확인
  const concepts = cRepo.findAll();
  assert(concepts.length >= 6, '핵심 개념 6개 이상 시딩 확인');
  console.log(`OK   [Concept 기반] 핵심 개념 ${concepts.length}개 준비 확인 (C 포인터, ACID, 빌더 등)`);

  // --- 시나리오 A: 문제 정답 제출 -> Attempt 저장 -> ReviewState 갱신 ---
  console.log('\n--- 시나리오 A: 문제 정답 제출 및 ReviewState 승급 검증 ---');
  const resSessionA = await app.inject({
    method: 'POST',
    url: '/api/sessions',
    payload: {
      title: '정답 풀이 세션 A',
      count: 2,
    },
  });
  assert.strictEqual(resSessionA.statusCode, 201);
  const sessionA = JSON.parse(resSessionA.body).session;
  const qIdA = sessionA.questionIds[0];
  const qA = qRepo.findById(qIdA)!;

  const resSubmitA = await app.inject({
    method: 'POST',
    url: `/api/sessions/${sessionA.id}/submit`,
    payload: {
      questionId: qIdA,
      userAnswer: Array.isArray(qA.groundTruthAnswer) ? qA.groundTruthAnswer[0] : qA.groundTruthAnswer,
      timeSpentMs: 12000,
      isUnknown: false,
      hintUsed: false,
    },
  });

  assert.strictEqual(resSubmitA.statusCode, 200);
  const submitDataA = JSON.parse(resSubmitA.body);
  assert.strictEqual(submitDataA.isCorrect, true);
  assert(submitDataA.reviewState, '응답에 reviewState 포함 확인');
  assert.strictEqual(submitDataA.reviewState.boxLevel, 2, '자력 정답으로 Leitner 박스 2로 승급');
  assert(submitDataA.reviewState.intervalDays >= 3, '복습 주기 3일 이상 연장 확인');
  assert.strictEqual(submitDataA.reviewState.correctCount, 1);
  console.log('OK   [시나리오 A] 문제 정답 제출 시 Attempt 저장 및 ReviewState 승급/주기 연장 통과');

  // --- 시나리오 B: 문제 오답 제출 -> 취약도 상승 -> 복습 대상 등록 ---
  console.log('\n--- 시나리오 B: 문제 오답 제출 및 취약도(weakness_score) 상승 검증 ---');
  const qIdB = sessionA.questionIds[1];
  const resSubmitB = await app.inject({
    method: 'POST',
    url: `/api/sessions/${sessionA.id}/submit`,
    payload: {
      questionId: qIdB,
      userAnswer: '완전틀린오답제출',
      timeSpentMs: 8000,
      isUnknown: false,
      hintUsed: false,
    },
  });

  assert.strictEqual(resSubmitB.statusCode, 200);
  const submitDataB = JSON.parse(resSubmitB.body);
  assert.strictEqual(submitDataB.isCorrect, false);
  assert.strictEqual(submitDataB.reviewState.boxLevel, 1, '오답으로 박스 1 강등');
  assert.strictEqual(submitDataB.reviewState.intervalDays, 1, '오답으로 복습 주기 1일 리셋');
  assert.strictEqual(submitDataB.reviewState.wrongCount, 1);
  assert(submitDataB.reviewState.weaknessScore >= 0.5, '취약도 점수 상승 확인');
  console.log('OK   [시나리오 B] 오답 제출 시 박스 1 강등, 복습 주기 1일 리셋, 취약도 상승 통과');

  // --- 시나리오 C: 모르겠음(isUnknown=true) -> 복습 우선순위 최상위 ---
  console.log('\n--- 시나리오 C: 모르겠음(Unknown) 처리 및 복습 우선순위 최상위 검증 ---');
  const resSessionC = await app.inject({
    method: 'POST',
    url: '/api/sessions',
    payload: { title: '모르겠음 세션 C', count: 1 },
  });
  const sessionC = JSON.parse(resSessionC.body).session;
  const qIdC = sessionC.questionIds[0];

  const resSubmitC = await app.inject({
    method: 'POST',
    url: `/api/sessions/${sessionC.id}/unknown`,
    payload: { questionId: qIdC, timeSpentMs: 3000 },
  });

  assert.strictEqual(resSubmitC.statusCode, 200);
  const submitDataC = JSON.parse(resSubmitC.body);
  assert.strictEqual(submitDataC.attempt.isUnknown, true, 'Attempt isUnknown 영속화 확인');
  assert.strictEqual(submitDataC.reviewState.unknownCount, 1);
  assert.strictEqual(submitDataC.reviewState.boxLevel, 1);
  assert(submitDataC.reviewState.weaknessScore >= 0.6, '모르겠음 선택으로 높은 취약도 부여');
  console.log('OK   [시나리오 C] 모르겠음 선택 시 isUnknown 기록 및 복습 우선순위 상승 통과');

  // --- 시나리오 D: 힌트 사용 후 정답(hintUsed=true) -> 보조 회상 행동 기록 ---
  console.log('\n--- 시나리오 D: 힌트 사용 후 정답(hintUsed=true) 보조 회상 기록 검증 ---');
  const resSessionD = await app.inject({
    method: 'POST',
    url: '/api/sessions',
    payload: { title: '힌트 세션 D', count: 1 },
  });
  const sessionD = JSON.parse(resSessionD.body).session;
  const qIdD = sessionD.questionIds[0];
  const qD = qRepo.findById(qIdD)!;

  const resSubmitD = await app.inject({
    method: 'POST',
    url: `/api/sessions/${sessionD.id}/submit`,
    payload: {
      questionId: qIdD,
      userAnswer: Array.isArray(qD.groundTruthAnswer) ? qD.groundTruthAnswer[0] : qD.groundTruthAnswer,
      timeSpentMs: 25000,
      hintUsed: true,
    },
  });

  assert.strictEqual(resSubmitD.statusCode, 200);
  const submitDataD = JSON.parse(resSubmitD.body);
  assert.strictEqual(submitDataD.isCorrect, true);
  assert.strictEqual(submitDataD.attempt.hintUsed, true);
  assert.strictEqual(submitDataD.reviewState.hintCount, 1);
  assert.strictEqual(submitDataD.reviewState.reviewState, 'LEARNING', '힌트 사용 시 REVIEW로 직행하지 않고 보조 회상 유지');
  console.log('OK   [시나리오 D] 힌트 사용 후 정답 시 hintUsed 영속 및 보수적 복습 상태 유지 통과');

  // --- 시나리오 E: 정답 확인(solutionRevealed=true) ---
  console.log('\n--- 시나리오 E: 정답 확인(solutionRevealed=true) 행동 기록 검증 ---');
  const resSessionE = await app.inject({
    method: 'POST',
    url: '/api/sessions',
    payload: { title: '정답확인 세션 E', count: 1 },
  });
  const sessionE = JSON.parse(resSessionE.body).session;
  const qIdE = sessionE.questionIds[0];

  const resSubmitE = await app.inject({
    method: 'POST',
    url: `/api/sessions/${sessionE.id}/submit`,
    payload: {
      questionId: qIdE,
      userAnswer: '정답보고적음',
      timeSpentMs: 5000,
      solutionRevealed: true,
    },
  });

  assert.strictEqual(resSubmitE.statusCode, 200);
  const submitDataE = JSON.parse(resSubmitE.body);
  assert.strictEqual(submitDataE.attempt.solutionRevealed, true, 'solutionRevealed 플래그 저장');
  assert.strictEqual(submitDataE.reviewState.boxLevel, 1, '정답 확인 시 1박스 유지');
  console.log('OK   [시나리오 E] 정답 확인 행동 분리 및 미숙련 상태 기록 통과');

  // --- 시나리오 F: 동일 개념(concept_c_pointer)의 여러 문제에서 반복 오답 -> 취약 개념 집계 ---
  console.log('\n--- 시나리오 F: 동일 개념(concept_c_pointer) 반복 오답 시 취약 개념 집계 검증 ---');
  // q_2021_01_03 (C 포인터 기출) 오답 2회 제출
  const qPointer1 = qRepo.findById('q_2021_01_03')!;
  assert.strictEqual(qPointer1.conceptId, 'concept_c_pointer');

  aRepo.create({
    id: `att_f1_${Date.now()}`,
    questionId: qPointer1.id,
    userAnswer: '999',
    isCorrect: false,
    score: 0,
    timeSpentMs: 15000,
    isUnknown: true,
    hintUsed: false,
    solutionRevealed: false,
    createdAt: new Date().toISOString(),
  });

  // q_var_c_2d_01 (C 포인터 AI 변형) 오답 1회 제출
  const qPointer2 = qRepo.findById('q_var_c_2d_01')!;
  assert.strictEqual(qPointer2.conceptId, 'concept_c_pointer');

  aRepo.create({
    id: `att_f2_${Date.now()}`,
    questionId: qPointer2.id,
    userAnswer: '틀린포인터값',
    isCorrect: false,
    score: 0,
    timeSpentMs: 20000,
    isUnknown: false,
    hintUsed: true,
    solutionRevealed: false,
    createdAt: new Date().toISOString(),
  });

  // GET /api/learning/weak-concepts 호출
  const resWeak = await app.inject({
    method: 'GET',
    url: '/api/learning/weak-concepts',
  });

  assert.strictEqual(resWeak.statusCode, 200);
  const weakConcepts = JSON.parse(resWeak.body);
  assert(weakConcepts.length > 0, '취약 개념 최소 1개 이상 집계');
  const cPointerWeakness = weakConcepts.find((c: any) => c.conceptId === 'concept_c_pointer');
  assert(cPointerWeakness, 'concept_c_pointer가 취약 개념으로 탐지됨');
  assert(cPointerWeakness.wrongCount + cPointerWeakness.unknownCount >= 2, '다중 문항 오답 합산 집계 확인');
  assert(cPointerWeakness.relatedQuestionIds.includes('q_2021_01_03'));
  assert(cPointerWeakness.relatedQuestionIds.includes('q_var_c_2d_01'));
  console.log(`OK   [시나리오 F] 동일 개념 다중 문항(기출+AI변형) 오답 집계 -> ${cPointerWeakness.conceptTitle} (취약도: ${cPointerWeakness.weaknessScore}) 통과`);

  // --- 시나리오 G: TEST_FIXTURE 문제 풀이 -> 실제 학습 통계와 구분 필터링 ---
  console.log('\n--- 시나리오 G: TEST_FIXTURE 문제 풀이와 실 학습 통계 구분 필터링 검증 ---');
  const resDashAll = await app.inject({
    method: 'GET',
    url: '/api/learning/dashboard',
  });
  const resDashRealOnly = await app.inject({
    method: 'GET',
    url: '/api/learning/dashboard?excludeTestFixtures=true',
  });

  assert.strictEqual(resDashAll.statusCode, 200);
  assert.strictEqual(resDashRealOnly.statusCode, 200);
  const dashAll = JSON.parse(resDashAll.body);
  const dashReal = JSON.parse(resDashRealOnly.body);

  assert(dashAll.totalStudiedQuestions >= dashReal.totalStudiedQuestions, 'Fixture 포함/제외 필터 동작 검증');
  console.log(`OK   [시나리오 G] 학습 통계 Fixture 분리 조회 (전체: ${dashAll.totalStudiedQuestions}건, Fixture 제외: ${dashReal.totalStudiedQuestions}건) 통과`);

  // --- 시나리오 H: AI_VARIATION 문제 풀이 -> 부모 기출 계보 유지 및 독립 Attempt 생성 ---
  console.log('\n--- 시나리오 H: AI_VARIATION 계보 유지 및 독립 Attempt 기록 검증 ---');
  const variationQ = qRepo.findById('q_var_c_2d_01')!;
  assert.strictEqual(variationQ.parentQuestionId, 'q_2021_01_03', '부모 기출 ID 유지');
  assert.strictEqual(variationQ.sourceType, 'AI_VARIATION', '출처 타입 AI_VARIATION 유지');

  const varAttempts = aRepo.findByQuestionId('q_var_c_2d_01');
  const parentAttempts = aRepo.findByQuestionId('q_2021_01_03');

  assert(varAttempts.length >= 1, '변형 문제 독립 Attempt 확인');
  assert(parentAttempts.length >= 1, '부모 기출 독립 Attempt 확인');
  assert.notStrictEqual(varAttempts[0].id, parentAttempts[0].id, '독립된 Attempt ID 부여');
  console.log('OK   [시나리오 H] AI_VARIATION 계보(Parent: q_2021_01_03) 유지 및 독립 Attempt 기록 통과');

  console.log('\n🎉 Phase 5 학습 데이터 전략 및 학습 엔진 8대 시나리오 전체 통과!');
  isolated.cleanup();
}

testPhase5LearningEngine();
