import assert from 'node:assert';
import { runMigrations } from '../src/db/migrator.js';
import { getDatabase } from '../src/db/database.js';
import { buildApp } from '../src/app.js';
import { seedFixtureQuestions } from '../src/db/seeder.js';
import { QuestionRepository } from '../src/db/repositories/questionRepository.js';
import { ImportBatchRepository } from '../src/db/repositories/importBatchRepository.js';
import { ConceptRepository } from '../src/db/repositories/conceptRepository.js';
import { QuestionImportPipeline } from '../src/db/importers/importPipeline.js';
import { MockQuestionVariationGenerator } from '../src/engine/variationGenerator.js';
import { VariationValidator } from '../src/engine/variationValidator.js';
import { RecommendationEngine } from '../src/engine/recommendationEngine.js';
import { SEED_QUESTIONS } from '../src/db/fixtures/seedQuestions.js';
import { Question, VariationType } from '@jungcheogi/shared';
import { setupIsolatedTestDb } from './helpers/testDb.js';

async function runPhase7ComprehensiveTests() {
  console.log('=== Phase 7: 실제 학습 데이터 파이프라인 및 AI 변형 문제 생성 시스템 종합 검증 시작 ===\n');
  const isolated = setupIsolatedTestDb({ seed: false });

  // DB 초기화 및 마이그레이션 실행
  runMigrations();
  const db = getDatabase();

  // 기존 테이블 정리 (테스트 격리 및 멱등성 보장)
  db.prepare(`DELETE FROM attempts`).run();
  db.prepare(`DELETE FROM review_states`).run();
  db.prepare(`DELETE FROM staged_questions`).run();
  db.prepare(`DELETE FROM import_batches`).run();
  db.prepare(`DELETE FROM sessions`).run();
  db.prepare(
    `DELETE FROM questions WHERE id NOT IN (${SEED_QUESTIONS.map((q) => `'${q.id}'`).join(',')})`
  ).run();

  const seedResult = seedFixtureQuestions(db);
  const conceptRepo = new ConceptRepository(db);
  conceptRepo.seedInitialConcepts();
  const initialQuestionsCount = seedResult.totalCount;
  console.log(`[DB 준비] 시드 문항: ${initialQuestionsCount}건, 개념: ${conceptRepo.findAll().length}건 확인`);

  const app = buildApp();
  const qRepo = new QuestionRepository(db);
  const batchRepo = new ImportBatchRepository(db);
  const pipeline = new QuestionImportPipeline();
  const variationGen = new MockQuestionVariationGenerator(db);
  const recommendationEngine = new RecommendationEngine(db);

  // -------------------------------------------------------------
  // Scenario 1: REAL_EXAM 정상 Import (JSON & Markdown, 메타데이터 및 conceptId 보존)
  // -------------------------------------------------------------
  console.log('\n--- Scenario 1: REAL_EXAM 정상 Import ---');
  const realExamJson = JSON.stringify([
    {
      sourceType: 'REAL_EXAM',
      examYear: 2025,
      examRound: 1,
      questionNumber: 5,
      conceptId: 'concept_c_pointer',
      subject: '프로그래밍언어활용',
      category: 'C언어',
      type: 'CODE_TRACE',
      questionText: '다음 2025년 1회 기출 C 프로그램의 실행 결과를 쓰시오.',
      codeSnippet: '#include <stdio.h>\nint main() { int a = 10; printf("%d", a); return 0; }',
      codeLanguage: 'C',
      groundTruthAnswer: '10',
      officialExplanation: '변수 a의 초기값 10이 출력됩니다.',
      difficulty: 'EASY',
      keywords: ['C언어', '기출2025', '변수'],
    },
  ]);

  const parseResult1 = await pipeline.parseAndStage({
    format: 'JSON',
    sourceName: '2025년 1회 기출문제 공식 Import',
    sourceType: 'REAL_EXAM',
    content: realExamJson,
  });

  assert.strictEqual(parseResult1.batch.totalCount, 1, '배치 총 문항 수가 1이어야 함');
  const stagedItem1 = parseResult1.stagedQuestions[0];
  assert.strictEqual(stagedItem1.sourceType, 'REAL_EXAM');
  assert.strictEqual(stagedItem1.examYear, 2025);
  assert.strictEqual(stagedItem1.examRound, 1);
  assert.strictEqual(stagedItem1.questionNumber, 5);
  assert.strictEqual(stagedItem1.conceptId, 'concept_c_pointer', 'conceptId가 정확히 보존되어야 함');
  assert.strictEqual(stagedItem1.groundTruthAnswer, '10');
  assert.strictEqual(stagedItem1.officialExplanation, '변수 a의 초기값 10이 출력됩니다.');
  console.log('OK   [Scenario 1] REAL_EXAM JSON 데이터 정상 Parse 및 Staging 적재 확인');

  // -------------------------------------------------------------
  // Scenario 2: 동일 REAL_EXAM 재Import 시 Natural Key duplicate detection
  // -------------------------------------------------------------
  console.log('\n--- Scenario 2: 동일 REAL_EXAM 재Import 시 Natural Key Duplicate 탐지 ---');
  // 먼저 Scenario 1 문항을 승인 및 커밋하여 Live DB에 진입시킴
  batchRepo.setStagedReviewStatus(stagedItem1.id, 'APPROVED');
  const commitRes1 = pipeline.commit(parseResult1.batch.id);
  assert.strictEqual(commitRes1.committedCount, 1, '1건 커밋 완료');
  const committedRealExamId = commitRes1.committedQuestionIds[0];
  assert.strictEqual(committedRealExamId, 'q_2025_01_05', '자연 키 기반 Question ID 생성 확인');

  // 동일한 (REAL_EXAM, 2025, 1, 5) 데이터를 다시 파싱 시도
  const duplicateJson = JSON.stringify([
    {
      sourceType: 'REAL_EXAM',
      examYear: 2025,
      examRound: 1,
      questionNumber: 5,
      subject: '프로그래밍언어활용',
      category: 'C언어',
      type: 'CODE_TRACE',
      questionText: '지문 텍스트를 약간 다르게 쓴 2025년 1회 5번 기출문제 중복 시험',
      codeSnippet: '#include <stdio.h>\nint main() { printf("hi"); }',
      groundTruthAnswer: 'hi',
    },
  ]);

  const parseResult2 = await pipeline.parseAndStage({
    format: 'JSON',
    sourceName: '중복 기출 재업로드 테스트',
    sourceType: 'REAL_EXAM',
    content: duplicateJson,
  });

  const dupStaged = parseResult2.stagedQuestions[0];
  assert.strictEqual(dupStaged.duplicateStatus, 'DUPLICATE_WARNING', '자연 키 중복으로 DUPLICATE_WARNING 지정');
  assert.strictEqual(dupStaged.duplicateQuestionId, 'q_2025_01_05', '충돌하는 기존 기출 ID 일치');
  assert.ok(dupStaged.reviewerNotes?.includes('기출 자연 키 충돌'), '자연 키 충돌 안내 메시지 포함');
  console.log(`OK   [Scenario 2] 동일 회차 기출 Natural Key 충돌 탐지 (${dupStaged.duplicateQuestionId}) 확인`);

  // -------------------------------------------------------------
  // Scenario 3: TEXTBOOK Import
  // -------------------------------------------------------------
  console.log('\n--- Scenario 3: TEXTBOOK 교재 문제 Import ---');
  const textbookMarkdown = `
### [문제 1] SQL 집계 함수
- 과목: 데이터베이스구축
- 카테고리: SQL
- 출처: TEXTBOOK
- 난이도: EASY
- 개념: concept_db_acid

SQL에서 테이블의 전체 행 개수를 반환하는 집계 함수를 작성하시오.

**정답**: COUNT(*)
**해설**: COUNT(*)는 널값을 포함한 모든 행의 수를 계산합니다.
**키워드**: SQL, COUNT, 집계함수
`;

  const parseResult3 = await pipeline.parseAndStage({
    format: 'MARKDOWN',
    sourceName: '수험서 핵심 교재 문제 Import',
    sourceType: 'TEXTBOOK',
    content: textbookMarkdown,
  });

  assert.strictEqual(parseResult3.batch.totalCount, 1);
  const stagedTb = parseResult3.stagedQuestions[0];
  assert.strictEqual(stagedTb.sourceType, 'TEXTBOOK');
  assert.strictEqual(stagedTb.conceptId, 'concept_db_acid', 'Markdown에서 conceptId 추출 보존 확인');
  assert.strictEqual(stagedTb.groundTruthAnswer, 'COUNT(*)');
  console.log('OK   [Scenario 3] TEXTBOOK 마크다운 데이터 파싱 및 conceptId 연동 확인');

  // -------------------------------------------------------------
  // Scenario 4: AI_VARIATION 생성 → Staging 적재
  // -------------------------------------------------------------
  console.log('\n--- Scenario 4: AI_VARIATION 생성 및 Staging 적재 ---');
  const baseQuestion = qRepo.findById('q_2025_01_05')!;
  assert.ok(baseQuestion, '원본 기출이 존재해야 함');

  const variationTypes: VariationType[] = [
    'PARAMETER_VARIATION',
    'CODE_VARIATION',
    'SCENARIO_VARIATION',
    'CONCEPT_VARIATION',
    'DIFFICULTY_VARIATION',
  ];

  for (const vType of variationTypes) {
    const variation = await variationGen.generateVariation(baseQuestion, { variationType: vType });
    assert.strictEqual(variation.parentQuestionId, baseQuestion.id, '부모 ID 일치');
    assert.strictEqual(variation.conceptId, baseQuestion.conceptId, '개념 ID 일치');
    assert.ok(variation.prompt.length >= 5, '프롬프트 길이 유효');

    const stagedRes = await variationGen.stageVariation(variation);
    assert.strictEqual(stagedRes.stagedQuestion.reviewStatus, 'PENDING', 'Staging 상태는 반드시 PENDING');
    assert.strictEqual(stagedRes.stagedQuestion.sourceType, 'AI_VARIATION');
  }
  console.log(`OK   [Scenario 4] 5대 canonical 변형 타입(${variationTypes.join(', ')}) 생성 및 Staging PENDING 적재 확인`);

  // -------------------------------------------------------------
  // Scenario 5: AI_VARIATION 생성 후 Live DB count 불변 (Live DB 직접 삽입 차단)
  // -------------------------------------------------------------
  console.log('\n--- Scenario 5: AI_VARIATION 생성 후 Live DB 직접 삽입 차단 ---');
  const liveCountBefore = qRepo.findMany({ limit: 1000 }).total;
  const singleVar = await variationGen.generateVariation(baseQuestion, {
    variationType: 'PARAMETER_VARIATION',
  });
  await variationGen.stageVariation(singleVar);
  const liveCountAfter = qRepo.findMany({ limit: 1000 }).total;

  assert.strictEqual(
    liveCountAfter,
    liveCountBefore,
    'AI 변형 문제 생성 후 Live DB questions 카운트는 절대 변하지 않아야 함'
  );
  console.log(`OK   [Scenario 5] AI_VARIATION 생성 후 Live DB 격리 확인 (생성 전: ${liveCountBefore}, 생성 후: ${liveCountAfter})`);

  // -------------------------------------------------------------
  // Scenario 6: parentQuestionId 보존
  // -------------------------------------------------------------
  console.log('\n--- Scenario 6: parentQuestionId 보존 및 계보 유지 ---');
  assert.strictEqual(singleVar.parentQuestionId, baseQuestion.id);
  assert.strictEqual(singleVar.sourceQuestionId, baseQuestion.id);
  console.log(`OK   [Scenario 6] parentQuestionId(${singleVar.parentQuestionId}) 계보 보존 확인`);

  // -------------------------------------------------------------
  // Scenario 7: conceptId 보존 (Import → Staging → Commit 전체 흐름)
  // -------------------------------------------------------------
  console.log('\n--- Scenario 7: conceptId 전체 파이프라인 보존 ---');
  // Scenario 3의 stagedTb 문항 승인 및 커밋
  batchRepo.setStagedReviewStatus(stagedTb.id, 'APPROVED');
  const commitResTb = pipeline.commit(parseResult3.batch.id);
  const liveTbQuestion = qRepo.findById(commitResTb.committedQuestionIds[0])!;
  assert.ok(liveTbQuestion, '커밋된 Question이 Live DB에 존재');
  assert.strictEqual(
    liveTbQuestion.conceptId,
    'concept_db_acid',
    'Import -> Staging -> Commit 후 Live Question의 conceptId가 concept_db_acid로 완벽히 보존되어야 함'
  );
  console.log(`OK   [Scenario 7] Live Question conceptId 영속 보존 확인 (${liveTbQuestion.id} -> ${liveTbQuestion.conceptId})`);

  // -------------------------------------------------------------
  // Scenario 8: Ground Truth / AI Explanation 필드 분리
  // -------------------------------------------------------------
  console.log('\n--- Scenario 8: Ground Truth / AI Explanation 필드 분리 ---');
  assert.strictEqual(singleVar.officialExplanation, undefined, 'AI 변형은 공식 해설 컬럼을 비워둠');
  assert.ok(singleVar.aiExplanation, 'AI 보조 설명 컬럼이 별도로 채워져 있음');
  assert.ok(singleVar.aiVariationNotes, '변형 노트 컬럼이 별도로 채워져 있음');
  console.log('OK   [Scenario 8] officialExplanation(undefined) vs aiExplanation 분리 검증 통과');

  // -------------------------------------------------------------
  // Scenario 9: Validation 실패 문항 Live DB 진입 차단
  // -------------------------------------------------------------
  console.log('\n--- Scenario 9: Validation 실패 문항 Live DB 진입 차단 ---');
  const invalidVariation = {
    ...singleVar,
    prompt: '', // 빈 프롬프트
    groundTruthAnswer: '', // 빈 정답
    officialExplanation: '공식 기출 사칭 해설', // 공식 해설 오염
  };
  const valResult = VariationValidator.validate(invalidVariation as any);
  assert.strictEqual(valResult.isValid, false, '유효성 검증 실패해야 함');
  assert.ok(valResult.issues.some((i) => i.field === 'prompt'), 'prompt 에러 검출');
  assert.ok(valResult.issues.some((i) => i.field === 'groundTruthAnswer'), 'groundTruthAnswer 에러 검출');
  assert.ok(valResult.issues.some((i) => i.field === 'officialExplanation'), 'officialExplanation 에러 검출');

  // Staged 문항이 REJECTED 상태이면 commit 실패 검증
  const testBatch = batchRepo.findAllBatches().find((b) => b.sourceType === 'AI_VARIATION');
  if (testBatch) {
    const stagedList = batchRepo.findBatchById(testBatch.id)!.stagedQuestions;
    if (stagedList.length > 0) {
      batchRepo.setStagedReviewStatus(stagedList[0].id, 'REJECTED');
      assert.throws(() => {
        // 승인된 문항이 없으면 commit 실패
        batchRepo.commitApprovedQuestions(testBatch.id);
      }, /승인\(APPROVED\)된 문항이 없습니다/);
    }
  }
  console.log('OK   [Scenario 9] Validation 실패 및 REJECTED 문항의 Live DB 진입 원천 차단 확인');

  // -------------------------------------------------------------
  // Scenario 10: APPROVED 문항만 Live DB 진입
  // -------------------------------------------------------------
  console.log('\n--- Scenario 10: APPROVED 문항만 Live DB 진입 ---');
  // 새 배치 생성 및 2문항 중 1건만 APPROVED
  const mixedJson = JSON.stringify([
    {
      sourceType: 'USER_IMPORTED',
      questionText: '승인될 합법 문항입니다.',
      groundTruthAnswer: '정답1',
      subject: '소프트웨어설계',
      category: '일반',
    },
    {
      sourceType: 'USER_IMPORTED',
      questionText: '미승인 PENDING으로 남을 문항입니다.',
      groundTruthAnswer: '정답2',
      subject: '소프트웨어설계',
      category: '일반',
    },
  ]);
  const mixedBatch = await pipeline.parseAndStage({
    format: 'JSON',
    sourceName: '승인 선별 커밋 테스트 배치',
    content: mixedJson,
  });
  batchRepo.setStagedReviewStatus(mixedBatch.stagedQuestions[0].id, 'APPROVED');
  // 2번째 문항은 그대로 PENDING 유지

  const mixedCommitRes = pipeline.commit(mixedBatch.batch.id);
  assert.strictEqual(mixedCommitRes.committedCount, 1, '승인된 1건만 커밋되어야 함');
  const refreshedMixedBatch = batchRepo.findBatchById(mixedBatch.batch.id)!;
  assert.strictEqual(refreshedMixedBatch.stagedQuestions[0].reviewStatus, 'COMMITTED');
  assert.strictEqual(refreshedMixedBatch.stagedQuestions[1].reviewStatus, 'PENDING');
  console.log('OK   [Scenario 10] APPROVED 문항만 정확히 선별 커밋 확인 (1/2건 커밋, 1건 PENDING 유지)');

  // -------------------------------------------------------------
  // Scenario 11: TEST_FIXTURE 추천/통계 분리
  // -------------------------------------------------------------
  console.log('\n--- Scenario 11: TEST_FIXTURE 추천 및 통계 분리 검증 ---');
  const allRecommendations = recommendationEngine.getRecommendations({
    limit: 50,
    excludeTestFixtures: true,
  });
  const fixtureIncluded = allRecommendations.some(
    (item) => item.question.sourceType === 'TEST_FIXTURE'
  );
  assert.strictEqual(fixtureIncluded, false, 'excludeTestFixtures=true 시 TEST_FIXTURE가 0건이어야 함');
  console.log('OK   [Scenario 11] excludeTestFixtures=true 필터링 통과');

  // -------------------------------------------------------------
  // Scenario 12: Phase 5 Regression (Active Recall, Unknown, Solution Reveal, Leitner, Weakness)
  // -------------------------------------------------------------
  console.log('\n--- Scenario 12: Phase 5 Regression 검증 ---');
  const qList = qRepo.findMany({ limit: 10 }).items;
  const p5q = qList[0];

  // 제출 및 채점 세션 생성
  const sessRes = await app.inject({
    method: 'POST',
    url: '/api/sessions',
    payload: { questionIds: [p5q.id], sessionType: 'STANDARD' },
  });
  assert.strictEqual(sessRes.statusCode, 201);
  const sessData = JSON.parse(sessRes.body);

  // 정답 확인 행동 검증
  const revRes = await app.inject({
    method: 'POST',
    url: `/api/sessions/${sessData.session.id}/submit`,
    payload: {
      questionId: p5q.id,
      userAnswer: '모름',
      solutionRevealed: true,
    },
  });
  assert.strictEqual(revRes.statusCode, 200);
  const revData = JSON.parse(revRes.body);
  assert.strictEqual(revData.attempt.solutionRevealed, true, 'solutionRevealed 불리언 영속');
  assert.strictEqual(revData.reviewState.boxLevel, 1, '정답 확인 시 1단계 강등');
  console.log('OK   [Scenario 12] Phase 5 Active Recall 및 행동 로깅 회귀 검증 통과');

  // -------------------------------------------------------------
  // Scenario 13: Phase 6 Regression (Daily Queue, Recommendations, Drill)
  // -------------------------------------------------------------
  console.log('\n--- Scenario 13: Phase 6 Regression 검증 ---');
  const queueRes = await app.inject({ method: 'GET', url: '/api/learning/daily-queue' });
  assert.strictEqual(queueRes.statusCode, 200);
  const queueData = JSON.parse(queueRes.body);
  assert.ok(queueData.totalRecommendedCount >= 0);

  const drillRes = await app.inject({
    method: 'POST',
    url: '/api/learning/drill',
    payload: { conceptId: 'concept_c_pointer', count: 3 },
  });
  assert.strictEqual(drillRes.statusCode, 201);
  const drillData = JSON.parse(drillRes.body);
  assert.ok(drillData.session.questionIds.length > 0);
  console.log('OK   [Scenario 13] Phase 6 Daily Queue 및 Concept Drill 회귀 검증 통과');

  // -------------------------------------------------------------
  // Scenario 14: Cold Start Regression (Attempt 0건 환경에서 500 오류 없음)
  // -------------------------------------------------------------
  console.log('\n--- Scenario 14: Cold Start Regression 검증 ---');
  // Attempt 및 ReviewState 일시 비우기
  db.prepare(`DELETE FROM attempts`).run();
  db.prepare(`DELETE FROM review_states`).run();

  const coldRecRes = await app.inject({ method: 'GET', url: '/api/learning/recommendations?limit=5' });
  assert.strictEqual(coldRecRes.statusCode, 200, 'Cold Start에서 recommendations 200 OK');

  const coldQueueRes = await app.inject({ method: 'GET', url: '/api/learning/daily-queue' });
  assert.strictEqual(coldQueueRes.statusCode, 200, 'Cold Start에서 daily-queue 200 OK');
  assert.strictEqual(JSON.parse(coldQueueRes.body).isColdStart, true, 'isColdStart 플래그 true 확인');

  const coldDailyRes = await app.inject({
    method: 'POST',
    url: '/api/learning/daily-session',
    payload: { count: 3 },
  });
  assert.strictEqual(coldDailyRes.statusCode, 201, 'Cold Start에서 daily-session 정상 생성 (201 Created)');
  console.log('OK   [Scenario 14] Cold Start 3대 엔드포인트 방어 회귀 검증 통과');

  // -------------------------------------------------------------
  // Scenario 15: Phase 7 신규 API 라우트 검증 (/variations/generate, /variations/validate)
  // -------------------------------------------------------------
  console.log('\n--- Scenario 15: Phase 7 신규 API 라우트 검증 ---');
  const genApiRes = await app.inject({
    method: 'POST',
    url: '/api/learning/variations/generate',
    payload: {
      questionId: baseQuestion.id,
      variationType: 'DIFFICULTY_VARIATION',
      autoStage: true,
    },
  });
  assert.strictEqual(genApiRes.statusCode, 201);
  const genApiData = JSON.parse(genApiRes.body);
  assert.strictEqual(genApiData.variation.variationType, 'DIFFICULTY_VARIATION');
  assert.ok(genApiData.validationResult);
  assert.strictEqual(genApiData.validationResult.isValid, true);
  assert.ok(genApiData.stagedQuestion.id);

  const valApiRes = await app.inject({
    method: 'POST',
    url: '/api/learning/variations/validate',
    payload: { variation: genApiData.variation },
  });
  assert.strictEqual(valApiRes.statusCode, 200);
  const valApiData = JSON.parse(valApiRes.body);
  assert.strictEqual(valApiData.isValid, true);
  assert.strictEqual(valApiData.checks.schemaValid, true);
  assert.strictEqual(valApiData.checks.domainValid, true);
  assert.strictEqual(valApiData.checks.groundTruthValid, true);
  console.log('OK   [Scenario 15] Phase 7 /variations/generate 및 /variations/validate API 엔드투엔드 통과');

  console.log('\n🎉 Phase 7: 실제 학습 데이터 파이프라인 및 AI 변형 문제 생성 시스템 15개 시나리오 전체 통과!');
  isolated.cleanup();
}

runPhase7ComprehensiveTests().catch((err) => {
  console.error('\n❌ Phase 7 테스트 실패:', err);
  process.exit(1);
});
