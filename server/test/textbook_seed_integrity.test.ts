import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runMigrations } from '../src/db/migrator.js';
import { getDatabase, setDatabasePathOverride } from '../src/db/database.js';
import { QuestionRepository } from '../src/db/repositories/questionRepository.js';
import { ConceptRepository } from '../src/db/repositories/conceptRepository.js';
import { StudySessionRepository } from '../src/db/repositories/studySessionRepository.js';
import { ingestCleanDatabase } from '../src/scripts/ingest2024_01_clean.js';
import { setupIsolatedTestDb } from './helpers/testDb.js';
import { MockQuestionVariationGenerator } from '../src/engine/variationGenerator.js';
import { buildApp } from '../src/app.js';
import { isStudyEligible, Question } from '@jungcheogi/shared';

async function testTextbookSeedIntegrity() {
  console.log('=== TEXTBOOK_EXPECTED 시드 적재 및 AI 변형 파이프라인 검증 테스트 시작 ===\n');

  const isolated = setupIsolatedTestDb({ seed: false });

  try {
    // 1. 초기 DB 마이그레이션 및 기존 2024-01 기출 인제스트
    runMigrations();
    const realExamIngest = ingestCleanDatabase({
      dbPath: isolated.dbPath,
      seedsPath: 'seeds/real-exams/2024-01/2024-01.transcribed.json',
    });
    assert.strictEqual(realExamIngest.insertedCount, 18, '기존 2024-01 REAL_EXAM 18문항 적재 확인');

    // 2. TEXTBOOK_EXPECTED 테스트용 3문항 fixture 생성
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'textbook-seed-test-'));
    const textbookFixturePath = path.join(tempDir, 'programming_expected.json');

    const textbookSeedData = {
      sourceType: 'TEXTBOOK_EXPECTED',
      book: 'programming',
      chapter: 1,
      questions: [
        {
          questionNumber: 1,
          type: 'CODE_TRACE',
          language: 'C',
          subject: '프로그래밍언어활용',
          category: 'C 프로그래밍',
          conceptId: 'concept_c_bitwise',
          questionText: '다음 C 프로그램의 실행 결과를 작성하시오.',
          code: '#include <stdio.h>\nint main() { int a = 10, b = 20; printf("%d", a + b); return 0; }',
          groundTruthAnswer: '30',
          officialExplanation: 'a + b = 10 + 20 = 30이다.',
          difficulty: 'EASY',
          hints: ['덧셈 연산'],
          keywords: ['C', 'printf', '변수'],
        },
        {
          questionNumber: 2,
          type: 'CODE_TRACE',
          language: 'JAVA',
          subject: '프로그래밍언어활용',
          category: 'Java 프로그래밍',
          conceptId: 'concept_java_polymorphism',
          questionText: '다음 Java 프로그램의 실행 결과를 작성하시오.',
          code: 'public class Main { public static void main(String[] args) { System.out.println(10 * 2); } }',
          groundTruthAnswer: '20',
          officialExplanation: '10 * 2 = 20이다.',
          difficulty: 'MEDIUM',
          hints: ['곱셈 연산'],
          keywords: ['Java', 'println'],
        },
        {
          chapter: 2,
          questionNumber: 1,
          type: 'SHORT_ANSWER',
          subject: '정보시스템구축관리',
          category: '네트워크 아키텍처',
          conceptId: 'concept_net_ospf',
          questionText: 'Dijkstra 최단 경로 알고리즘을 사용하는 대표적인 링크 상태 라우팅 프로토콜을 영문 대문자 약어로 작성하시오.',
          groundTruthAnswer: 'OSPF',
          officialExplanation: 'OSPF는 Open Shortest Path First의 약어이다.',
          difficulty: 'EASY',
          hints: ['링크 상태 프로토콜'],
          keywords: ['OSPF', 'Dijkstra'],
        },
      ],
    };

    fs.writeFileSync(textbookFixturePath, JSON.stringify(textbookSeedData, null, 2), 'utf8');

    // 3. TEXTBOOK_EXPECTED 인제스트 실행
    console.log('--- 1. TEXTBOOK_EXPECTED 시드 정상 INSERT 검증 ---');
    const tbIngest = ingestCleanDatabase({
      dbPath: isolated.dbPath,
      seedsPath: textbookFixturePath,
    });
    assert.strictEqual(tbIngest.insertedCount, 3, 'TEXTBOOK_EXPECTED 3문항 정상 인제스트');

    const db = getDatabase();
    const qRepo = new QuestionRepository(db);
    assert.strictEqual(qRepo.count(), 21, 'REAL_EXAM(18) + TEXTBOOK_EXPECTED(3) = 총 21문항 적재 확인');

    const tb1 = qRepo.findById('tb_programming_01_01');
    const tb2 = qRepo.findById('tb_programming_01_02');
    const tb3 = qRepo.findById('tb_programming_02_01');

    assert.ok(tb1, 'tb_programming_01_01 문항 존재');
    assert.ok(tb2, 'tb_programming_01_02 문항 존재');
    assert.ok(tb3, 'tb_programming_02_01 문항 존재');

    // ID 및 questionCode 네임스페이스 및 메타데이터 검증
    assert.strictEqual(tb1?.id, 'tb_programming_01_01');
    assert.strictEqual(tb1?.questionCode, 'TB-PROG-01-01');
    assert.strictEqual(tb1?.sourceType, 'TEXTBOOK_EXPECTED');
    assert.strictEqual(tb1?.examYear, undefined, 'TEXTBOOK_EXPECTED는 examYear 없음');
    assert.strictEqual(tb1?.examRound, undefined, 'TEXTBOOK_EXPECTED는 examRound 없음');
    assert.strictEqual(tb1?.questionNumber, 1);
    assert.strictEqual(tb1?.conceptId, 'concept_c_bitwise');
    assert.strictEqual(tb1?.groundTruthAnswer, '30');
    assert.strictEqual(tb1?.studyVisibility, 'LIVE');
    assert.strictEqual(isStudyEligible(tb1!), true, '정식 학습 풀(LIVE) 대상');

    assert.strictEqual(tb2?.id, 'tb_programming_01_02');
    assert.strictEqual(tb2?.questionCode, 'TB-PROG-01-02');
    assert.strictEqual(tb2?.sourceType, 'TEXTBOOK_EXPECTED');
    assert.strictEqual(tb2?.language, 'JAVA');

    assert.strictEqual(tb3?.id, 'tb_programming_02_01');
    assert.strictEqual(tb3?.questionCode, 'TB-PROG-02-01');
    assert.strictEqual(tb3?.sourceType, 'TEXTBOOK_EXPECTED');

    console.log('OK   [1] 신규 교재 seed 정상 INSERT 및 메타데이터 검증 통과');

    // 4. 재실행 멱등성 검증 (같은 fixture 재실행 시 중복 생성 없음)
    console.log('\n--- 2. 동일 fixture 재실행 시 멱등성 검증 ---');
    const reIngest = ingestCleanDatabase({
      dbPath: isolated.dbPath,
      seedsPath: textbookFixturePath,
    });
    assert.strictEqual(reIngest.insertedCount, 3, '3문항 재실행 시 업데이트');
    const afterCount = new QuestionRepository(getDatabase()).count();
    assert.strictEqual(afterCount, 21, '중복 생성 없이 총 문항 수 21개 유지 (멱등성 보장)');
    console.log('OK   [2] 멱등성 검증 통과 (중복 생성 없이 21건 유지)');

    // 5. REAL_EXAM과 ID/questionCode 충돌 없음 검증
    console.log('\n--- 3. REAL_EXAM과 ID/questionCode 충돌 없음 검증 ---');
    const realExamQ1 = new QuestionRepository(getDatabase()).findById('q_2024_01_01');
    assert.ok(realExamQ1, 'q_2024_01_01 원본 보존');
    assert.strictEqual(realExamQ1?.questionCode, 'Q-2024-01-01');
    assert.strictEqual(realExamQ1?.sourceType, 'REAL_EXAM');
    assert.notStrictEqual(tb1?.id, realExamQ1?.id);
    assert.notStrictEqual(tb1?.questionCode, realExamQ1?.questionCode);
    console.log('OK   [3] REAL_EXAM과 TEXTBOOK_EXPECTED 네임스페이스 및 데이터 상호 불간섭 검증 통과');

    // 6. TEXTBOOK_EXPECTED → Variation Generator 연동 검증
    console.log('\n--- 4. TEXTBOOK_EXPECTED → variation 정상 생성 및 메타데이터 유지 검증 ---');
    const currentQRepo = new QuestionRepository(getDatabase());
    const parentQ = currentQRepo.findById('tb_programming_01_01')!;
    assert.ok(parentQ, '부모 문제 존재');

    const generator = new MockQuestionVariationGenerator(currentQRepo);
    const variation = await generator.generateVariation(parentQ, {
      variationType: 'PARAMETER_VARIATION',
    });

    assert.strictEqual(variation.sourceQuestionId, 'tb_programming_01_01', 'sourceQuestionId 보존');
    assert.strictEqual(variation.parentQuestionId, 'tb_programming_01_01', 'parentQuestionId 보존');
    assert.strictEqual(variation.conceptId, 'concept_c_bitwise', 'conceptId 보존');
    assert.strictEqual(variation.subject, '프로그래밍언어활용', 'subject 보존');
    assert.strictEqual(variation.category, 'C 프로그래밍', 'category 보존');
    assert.strictEqual(variation.questionType, 'CODE_TRACE', 'questionType 보존');
    assert.strictEqual(variation.language, 'C', 'language 보존');
    console.log('OK   [4] TEXTBOOK_EXPECTED 기반 AI 변형 생성 및 부모 메타데이터 유지 검증 통과');

    // 7. Fastify API /api/ai/variation-drill 엔드포인트 연동 검증
    console.log('\n--- 5. /api/ai/variation-drill API 및 UNVERIFIED / VERIFIED 안전 규칙 검증 ---');
    setDatabasePathOverride(isolated.dbPath);
    const app = buildApp();
    await app.ready();

    const drillRes = await app.inject({
      method: 'POST',
      url: '/api/ai/variation-drill',
      payload: {
        parentQuestionId: 'tb_programming_01_01',
      },
    });

    assert.strictEqual(drillRes.statusCode, 200, 'variation-drill 정상 응답');
    const drillBody = drillRes.json();
    assert.strictEqual(drillBody.success, true);
    assert.ok(drillBody.drillSession, '드릴 세션 생성');
    assert.ok(drillBody.question, '드릴 문제 생성');
    assert.strictEqual(drillBody.question.parentQuestionId, 'tb_programming_01_01', '드릴 문항의 parentQuestionId 일치');
    assert.strictEqual(drillBody.question.conceptId, 'concept_c_bitwise', '드릴 문항의 conceptId 일치');
    assert.strictEqual(drillBody.question.studyVisibility, 'TEMPORARY_DRILL', '임시 드릴로 격리');

    // UNVERIFIED 또는 VERIFIED 안전 채점 규칙 검증
    const submitRes = await app.inject({
      method: 'POST',
      url: `/api/sessions/${drillBody.drillSession.id}/submit`,
      payload: {
        questionId: drillBody.question.id,
        userAnswer: '30',
        timeSpentMs: 3000,
      },
    });

    assert.strictEqual(submitRes.statusCode, 200, '제출 응답 정상');
    const submitBody = submitRes.json();

    if (drillBody.verificationStatus === 'UNVERIFIED') {
      assert.strictEqual(submitBody.attempt.isCorrect, false, 'UNVERIFIED는 정답 미확정');
      assert.strictEqual(submitBody.attempt.scoringStatus, 'UNSCORED', 'UNVERIFIED 채점 상태 scoringStatus = UNSCORED');
      assert.strictEqual(drillBody.answerSource, 'AI_UNVERIFIED');
    } else {
      assert.strictEqual(drillBody.answerSource, 'EXECUTION_VERIFIED');
    }

    await app.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.log('OK   [5] variation drill API 연동 및 안전 채점 규칙 유지 검증 통과');

    console.log('\n🎉 [COMPLETE] TEXTBOOK_EXPECTED 시드 및 변형 생성 파이프라인 전체 검증 100% 통과!');
  } finally {
    isolated.cleanup();
  }
}

testTextbookSeedIntegrity().catch((err) => {
  console.error('테스트 실패:', err);
  process.exit(1);
});
