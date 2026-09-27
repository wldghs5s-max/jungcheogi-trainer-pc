import assert from 'node:assert';
import { runMigrations } from '../src/db/migrator';
import { closeDatabase, getDatabase } from '../src/db/database';
import { buildApp } from '../src/app';
import { QuestionRepository } from '../src/db/repositories/questionRepository';
import { seedFixtureQuestions } from '../src/db/seeder';
import { BaseQuestionValidator } from '../src/db/importers/baseImporter';
import { Question } from '@jungcheogi/shared';
import { setupIsolatedTestDb } from './helpers/testDb';

async function testQuestionsDomainAndApi() {
  console.log('=== Phase 2: 문제 도메인 및 API 종합 검증 테스트 시작 ===\n');
  const isolated = setupIsolatedTestDb({ seed: false });

  // 1. 마이그레이션 실행
  runMigrations();
  const db = getDatabase();
  const repo = new QuestionRepository(db);

  // 2. Fixture 데이터 시딩
  const seedResult = seedFixtureQuestions(db);
  console.log(`[Seed] Fixture 문항 적재 완료: ${seedResult.insertedCount}건 삽입 (총 ${seedResult.totalCount}건)`);
  assert(seedResult.totalCount >= 12, '시드 문항이 최소 12건 이상이어야 함');

  // 3. 필수 문제 유형 검증
  const allQuestions = repo.findMany({ limit: 100 }).items;

  // (1) 주관식 단답형
  const shortAnswer = allQuestions.find((q) => q.id === 'q_2020_01_01');
  assert(shortAnswer, '주관식 단답형(빌더 패턴) 존재 확인');
  assert.strictEqual(typeof shortAnswer.groundTruthAnswer, 'string', '단일 키워드 정답 문자열');
  assert.strictEqual(shortAnswer.groundTruthAnswer, '빌더');
  console.log('OK   [1] 주관식 단답형 모델 검증 통과 (빌더 패턴)');

  // (2) 복수 키워드 문제
  const multiKeyword = allQuestions.find((q) => q.id === 'q_2020_02_02');
  assert(multiKeyword, '복수 키워드(트랜잭션 ACID) 문제 존재 확인');
  assert(Array.isArray(multiKeyword.groundTruthAnswer), '복수 키워드 정답 배열 타입');
  assert.deepStrictEqual(multiKeyword.groundTruthAnswer, ['원자성', '영속성']);
  console.log('OK   [2] 복수 키워드 정답 모델 검증 통과 (원자성, 영속성)');

  // (3) 코드 문제 (C, Java, Python)
  const cQuestion = allQuestions.find((q) => q.language === 'C' && q.sourceType === 'TEST_FIXTURE');
  const javaQuestion = allQuestions.find((q) => q.language === 'JAVA');
  const pythonQuestion = allQuestions.find((q) => q.language === 'PYTHON');
  assert(cQuestion && cQuestion.code && cQuestion.groundTruthAnswer === '40', 'C언어 코드 문제 검증');
  assert(javaQuestion && javaQuestion.code && javaQuestion.groundTruthAnswer === '3', 'Java 다형성 코드 문제 검증');
  assert(pythonQuestion && pythonQuestion.code && pythonQuestion.groundTruthAnswer === '18', 'Python 슬라이싱 코드 문제 검증');
  console.log('OK   [3] C / Java / Python 코드 추적 문제 모델 검증 통과');

  // (4) 설명/서술형 문제
  const descQuestion = allQuestions.find((q) => q.id === 'q_2020_03_07');
  assert(descQuestion, '설명/서술형(순차적 응집도) 존재 확인');
  assert(descQuestion.officialExplanation?.includes('순차적 응집도'), '공식 해설 보존 확인');
  console.log('OK   [4] 설명/서술형 모델 검증 통과 (순차적 응집도)');

  // (5) 기출 -> AI 변형 문제 계층 구조 (Parent-Child)
  const aiVariationC = allQuestions.find((q) => q.id === 'q_var_c_2d_01');
  assert(aiVariationC, 'AI 변형 C언어 문제 존재');
  assert.strictEqual(aiVariationC.parentQuestionId, 'q_2021_01_03', '부모 기출 ID 올바르게 연결됨');
  assert(aiVariationC.aiVariationNotes, 'AI 변형 근거/메모 존재 확인');
  assert.strictEqual(aiVariationC.groundTruthAnswer, '50', '변형 문제 독립 정답 확인');
  console.log('OK   [5] 기출 → AI 변형 문제 parentQuestionId 계층 구조 검증 통과');

  // 4. Fastify REST API 통신 테스트
  const app = buildApp();

  // (1) GET /api/questions (전체 목록)
  const resAll = await app.inject({ method: 'GET', url: '/api/questions' });
  assert.strictEqual(resAll.statusCode, 200);
  const dataAll = JSON.parse(resAll.body);
  assert(dataAll.total >= 12, '전체 문제 개수 확인');
  console.log(`OK   [API] GET /api/questions 응답 성공 (총 ${dataAll.total}건)`);

  // (2) 과목 필터링: 프로그래밍언어활용
  const resSubject = await app.inject({
    method: 'GET',
    url: '/api/questions?subject=프로그래밍언어활용',
  });
  assert.strictEqual(resSubject.statusCode, 200);
  const dataSubject = JSON.parse(resSubject.body);
  assert(dataSubject.items.every((q: Question) => q.subject === '프로그래밍언어활용'));
  console.log(`OK   [API] 과목별 필터링 검증 통과 (${dataSubject.items.length}건 반환)`);

  // (3) 출처 필터링: AI_VARIATION
  const resSource = await app.inject({
    method: 'GET',
    url: '/api/questions?sourceType=AI_VARIATION',
  });
  assert.strictEqual(resSource.statusCode, 200);
  const dataSource = JSON.parse(resSource.body);
  assert(dataSource.items.length >= 2);
  assert(dataSource.items.every((q: Question) => q.sourceType === 'AI_VARIATION'));
  console.log(`OK   [API] 출처 필터링(AI_VARIATION) 검증 통과 (${dataSource.items.length}건 반환)`);

  // (4) 키워드 검색: '포인터'
  const resSearch = await app.inject({
    method: 'GET',
    url: '/api/questions?search=포인터',
  });
  assert.strictEqual(resSearch.statusCode, 200);
  const dataSearch = JSON.parse(resSearch.body);
  assert(dataSearch.items.length >= 2, '포인터 검색 결과 2건 이상');
  console.log(`OK   [API] 키워드 검색(?search=포인터) 검증 통과 (${dataSearch.items.length}건 반환)`);

  // (5) 단건 상세 조회 및 관계 검증: GET /api/questions/q_2021_01_03
  const resDetail = await app.inject({
    method: 'GET',
    url: '/api/questions/q_2021_01_03',
  });
  assert.strictEqual(resDetail.statusCode, 200);
  const dataDetail = JSON.parse(resDetail.body);
  assert.strictEqual(dataDetail.question.id, 'q_2021_01_03');
  assert(dataDetail.variations.length >= 1, '파생된 AI 변형 문제 1건 이상 포함');
  assert.strictEqual(dataDetail.variations[0].id, 'q_var_c_2d_01');
  assert.strictEqual(dataDetail.parentQuestion, null, '원본 기출이므로 parentQuestion은 null');
  console.log('OK   [API] 기출 원본 상세 조회 시 파생된 변형 문제 목록 자동 조회 검증 통과');

  // (6) 변형 문제 상세 조회 시 원본 부모 문제 정보 검증: GET /api/questions/q_var_c_2d_01
  const resVarDetail = await app.inject({
    method: 'GET',
    url: '/api/questions/q_var_c_2d_01',
  });
  assert.strictEqual(resVarDetail.statusCode, 200);
  const dataVarDetail = JSON.parse(resVarDetail.body);
  assert(dataVarDetail.parentQuestion, '변형 문제 상세 조회 시 원본 부모 문제 정보 포함');
  assert.strictEqual(dataVarDetail.parentQuestion.id, 'q_2021_01_03');
  console.log('OK   [API] 변형 문제 상세 조회 시 부모 기출 문제 연동 검증 통과');

  // (7) CRUD 검증: POST /api/questions
  const newQId = `test_q_${Date.now()}`;
  const resCreate = await app.inject({
    method: 'POST',
    url: '/api/questions',
    payload: {
      id: newQId,
      sourceType: 'USER_IMPORTED',
      subject: '소프트웨어설계',
      category: '요구사항 확인',
      type: 'SHORT_ANSWER',
      question: '테스트용 신규 문제 지문입니다.',
      groundTruthAnswer: '정답123',
      officialExplanation: '공식 해설 텍스트',
      difficulty: 'EASY',
      keywords: ['테스트', '신규'],
    },
  });
  assert.strictEqual(resCreate.statusCode, 201);
  const createdQ = JSON.parse(resCreate.body);
  assert.strictEqual(createdQ.id, newQId);
  console.log('OK   [API] POST /api/questions 신규 문제 등록 검증 통과');

  // (8) CRUD 검증: PUT /api/questions/:id (Ground Truth 보호 확인)
  const resUpdate = await app.inject({
    method: 'PUT',
    url: `/api/questions/${newQId}`,
    payload: {
      aiExplanation: 'AI가 추가한 보조 해설입니다.',
      // groundTruthAnswer를 비워두어도 기존 원본 정답은 보존되어야 함
    },
  });
  assert.strictEqual(resUpdate.statusCode, 200);
  const updatedQ = JSON.parse(resUpdate.body);
  assert.strictEqual(updatedQ.aiExplanation, 'AI가 추가한 보조 해설입니다.');
  assert.strictEqual(updatedQ.groundTruthAnswer, '정답123', 'Ground Truth 정답 원본 보존 확인');
  console.log('OK   [API] PUT /api/questions Ground Truth 보존 및 AI 보조 정보 수정 검증 통과');

  // (9) CRUD 검증: DELETE /api/questions/:id
  const resDelete = await app.inject({
    method: 'DELETE',
    url: `/api/questions/${newQId}`,
  });
  assert.strictEqual(resDelete.statusCode, 200);
  const deletedCheck = repo.findById(newQId);
  assert.strictEqual(deletedCheck, null, '삭제 후 조회 시 null 확인');
  console.log('OK   [API] DELETE /api/questions 삭제 검증 통과');

  // 5. 향후 Import 파이프라인 유효성 검사기 검증
  const validTest = BaseQuestionValidator.validate({
    sourceType: 'REAL_EXAM',
    questionText: '테스트 본문',
    extractedAnswer: '테스트 정답',
    subject: '소프트웨어설계',
    type: 'SHORT_ANSWER',
  });
  assert.strictEqual(validTest.isValid, true, '유효한 문항 통과');

  const invalidTest = BaseQuestionValidator.validate({
    sourceType: 'AI_VARIATION',
    questionText: '변형 본문',
    extractedAnswer: '변형 정답',
    subject: '소프트웨어설계',
    // parentQuestionId 누락
  });
  assert.strictEqual(invalidTest.isValid, false, 'AI 변형 문제에 parentQuestionId 누락 시 에러 감지');
  console.log('OK   [Importer] 향후 Import 파이프라인 검증 로직 통과');

  await app.close();
  closeDatabase();
  isolated.cleanup();

  console.log('\n🎉 Phase 2: 문제 도메인, 필터링 API, 계층 관계, Import 구조 테스트 전체 통과!');
}

testQuestionsDomainAndApi().catch((err) => {
  console.error('FAIL: 테스트 실패:', err);
  process.exit(1);
});
