import assert from 'node:assert';
import { runMigrations } from '../src/db/migrator.js';
import { getDatabase, closeDatabase, setDatabasePathOverride } from '../src/db/database.js';
import { QuestionRepository } from '../src/db/repositories/questionRepository.js';
import { ConceptRepository } from '../src/db/repositories/conceptRepository.js';
import { ingestCleanDatabase } from '../src/scripts/ingest2024_01_clean.js';
import { setupIsolatedTestDb } from './helpers/testDb.js';
import { isStudyEligible, Question } from '@jungcheogi/shared';

async function testSeedDataIntegrity() {
  console.log('=== 추가 기출(seed) 대비 구조 점검 및 무결성 회귀 테스트 시작 ===\n');

  const isolated = setupIsolatedTestDb({ seed: false });

  try {
    // 1. 마이그레이션 및 Clean Ingest 실행 (독립 테스트 DB 환경)
    runMigrations();
    const firstIngest = ingestCleanDatabase({ dbPath: isolated.dbPath });
    assert.strictEqual(firstIngest.insertedCount, 18, '최초 인제스트 시 18문항 적재');

    // 2. 18개 REAL_EXAM seed 데이터 구조 전수 검증
    console.log('--- 1. REAL_EXAM 18개 seed 메타데이터 무결성 검증 ---');
    setDatabasePathOverride(isolated.dbPath);
    const db = getDatabase();
    const qRepo = new QuestionRepository(db);
    const cRepo = new ConceptRepository(db);

    const realExamSeeds = qRepo
      .findAllMatching({ sourceType: 'REAL_EXAM' as any })
      .filter((q) => q.examYear === 2024 && q.examRound === 1)
      .sort((a, b) => (a.questionNumber || 0) - (b.questionNumber || 0));

    assert.strictEqual(realExamSeeds.length, 18, '2024년 1회 기출 seed는 정확히 18개여야 함');

    for (let i = 1; i <= 18; i++) {
      const q = realExamSeeds[i - 1];
      const pad = String(i).padStart(2, '0');
      assert.ok(q, `${i}번 문항 존재`);
      assert.strictEqual(q.id, `q_2024_01_${pad}`, `${i}번 ID 형식 일치`);
      assert.strictEqual(q.questionCode, `Q-2024-01-${pad}`, `${i}번 QuestionCode 형식 일치`);
      assert.strictEqual(q.examYear, 2024, `${i}번 examYear = 2024`);
      assert.strictEqual(q.examRound, 1, `${i}번 examRound = 1`);
      assert.strictEqual(q.questionNumber, i, `${i}번 questionNumber 일치`);
      assert.strictEqual(q.sourceType, 'REAL_EXAM', `${i}번 sourceType = REAL_EXAM`);
      assert.strictEqual(q.studyVisibility, 'LIVE', `${i}번 studyVisibility = LIVE`);
      assert.strictEqual(q.parentQuestionId, undefined, `${i}번 parentQuestionId는 root이므로 undefined/null`);
      assert.ok(q.conceptId && q.conceptId.startsWith('concept_'), `${i}번 conceptId 유효`);
      assert.ok(q.groundTruthAnswer, `${i}번 기준 정답(groundTruthAnswer) 존재`);
      assert.ok(q.officialExplanation, `${i}번 공식 해설(officialExplanation) 존재`);
      assert.strictEqual(isStudyEligible(q), true, `${i}번 문항은 정식 학습 풀(LIVE) 대상이어야 함`);

      // 유형별 규칙 검증
      if (q.type === 'CODE_TRACE') {
        assert.ok(q.code && q.code.length > 0, `${i}번 CODE_TRACE 문항은 코드를 포함해야 함`);
        assert.ok(['C', 'JAVA', 'PYTHON'].includes(q.language || ''), `${i}번 언어 일치`);
      } else if (q.type === 'SQL') {
        assert.strictEqual(q.language, 'SQL', `${i}번 SQL 문항은 language=SQL이어야 함`);
      } else if (q.type === 'SHORT_ANSWER') {
        // 단답형 이론 문항
        assert.strictEqual(q.language, undefined, `${i}번 이론 문항은 language 미지정`);
      }
    }
    console.log('OK   [1] 18개 REAL_EXAM seed 메타데이터 전수 검증 통과');

    // 3. 인제스트 멱등성(Idempotency) 검증
    console.log('\n--- 2. 인제스트 멱등성(Idempotent Re-execution) 검증 ---');
    const secondIngest = ingestCleanDatabase({ dbPath: isolated.dbPath });
    assert.strictEqual(secondIngest.insertedCount, 18, '재실행 시 18건 업데이트');
    const freshQRepo = new QuestionRepository(getDatabase());
    const freshCRepo = new ConceptRepository(getDatabase());
    const totalCountAfter = freshQRepo.count();
    assert.strictEqual(totalCountAfter, 18, '중복 삽입 없이 총 문항 수는 18개로 불변');
    console.log('OK   [2] 중복 실행 시에도 DB 레코드가 중복 생성되지 않고 멱등 유지 통과');

    // 4. question_code 유니크 제약조건(Unique Index) 검증
    console.log('\n--- 3. question_code 유니크 제약조건 충돌 방어 검증 ---');
    let uniqueConstraintThrew = false;
    try {
      const duplicateQuestion: Question = {
        ...realExamSeeds[0],
        id: 'q_duplicate_test_id',
        questionCode: 'Q-2024-01-01', // 이미 존재하는 코드
      };
      freshQRepo.create(duplicateQuestion);
    } catch (err: any) {
      uniqueConstraintThrew = true;
      assert.match(err?.message, /UNIQUE constraint failed/i);
    }
    assert.strictEqual(uniqueConstraintThrew, true, '동일 question_code 삽입 시 UNIQUE constraint 에러 발생 확인');
    console.log('OK   [3] question_code 중복 충돌 방지 DB 인덱스 검증 통과');

    // 5. 24대 핵심 개념(Concept) 존재 검증
    console.log('\n--- 4. 개념 사전(Concepts) 24종 시딩 상태 검증 ---');
    const allConcepts = freshCRepo.findAll();
    assert.strictEqual(allConcepts.length, 24, '24종 핵심 개념 적재 확인');
    for (const q of realExamSeeds) {
      const foundConcept = freshCRepo.findById(q.conceptId!);
      assert.ok(foundConcept, `시드 문항 ${q.id}의 conceptId(${q.conceptId})가 concepts 테이블에 존재함`);
    }
    console.log('OK   [4] 18개 seed 문항의 conceptId가 모두 concepts 테이블에 정상 등록되어 있음');

    // 6. 언어/유형별 분포 집계 검증
    console.log('\n--- 5. 언어 및 유형 분포 집계 검증 ---');
    const langCounts: Record<string, number> = {};
    for (const q of realExamSeeds) {
      const l = q.language || 'THEORY';
      langCounts[l] = (langCounts[l] || 0) + 1;
    }
    assert.strictEqual(langCounts['C'], 3, 'C언어 3문항');
    assert.strictEqual(langCounts['JAVA'], 2, 'Java 2문항');
    assert.strictEqual(langCounts['PYTHON'], 1, 'Python 1문항');
    assert.strictEqual(langCounts['SQL'], 2, 'SQL 2문항');
    assert.strictEqual(langCounts['THEORY'], 10, '이론/단답 10문항');
    console.log('OK   [5] 언어별 분포(C:3, JAVA:2, PYTHON:1, SQL:2, THEORY:10) 검증 통과');

    console.log('\n🎉 [COMPLETE] 기출 seed 데이터 구조 및 무결성 검증 전체 통과!');
  } finally {
    isolated.cleanup();
  }
}

testSeedDataIntegrity().catch((err) => {
  console.error('테스트 실패:', err);
  process.exit(1);
});
