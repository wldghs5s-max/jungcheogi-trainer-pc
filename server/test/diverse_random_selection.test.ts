import assert from 'node:assert';
import { QuestionRepository } from '../src/db/repositories/questionRepository.js';
import { setupIsolatedTestDb } from './helpers/testDb.js';
import { getDatabase, closeDatabase } from '../src/db/database.js';
import { Question } from '@jungcheogi/shared';

async function testDiverseRandomSelection() {
  console.log('\n================================================================');
  console.log('🧪 Diverse Random 문제 선별 알고리즘 검증 테스트');
  console.log('================================================================\n');

  // Test 1: 실제 프로덕션 DB 상에서의 Diverse Random 동작 검증
  const prodDb = getDatabase();
  const repo = new QuestionRepository(prodDb);

  console.log('--- Test 1: 프로덕션 DB 5회 연속 세션 다양성 검증 ---');
  for (let s = 1; s <= 5; s++) {
    const sessionQuestions = repo.pickRandom({}, 5);
    assert.strictEqual(sessionQuestions.length, 5, `세션 ${s}: 5문제 선별 완료`);

    // 1-1. REVIEW_NEEDED 문항 배제 검증
    for (const q of sessionQuestions) {
      assert.notStrictEqual(q.readyForGrading, false, `[${q.questionCode}] 미검수(REVIEW_NEEDED) 문제는 랜덤 세션에 노출되지 않아야 함`);
      assert.notStrictEqual(q.answerStatus, 'REVIEW_NEEDED', `[${q.questionCode}] answerStatus는 REVIEW_NEEDED가 아니어야 함`);
    }

    // 1-2. 부모 Seed 다양성 검증 (5문제 중 최소 4개 이상 고유 부모)
    const parents = sessionQuestions.map((q) => q.parentQuestionId || q.id);
    const uniqueParents = new Set(parents);
    assert.ok(
      uniqueParents.size >= 4,
      `세션 ${s}: 동일 세션 내 부모 Seed 다양성 확보 (고유 부모 ${uniqueParents.size}/5)`
    );

    // 1-3. 언어/유형 분포 확인
    const langs = sessionQuestions.map((q) => q.language || 'THEORY');
    console.log(`  Session ${s} PASS: 고유 부모 ${uniqueParents.size}/5 | 언어 분포: [${langs.join(', ')}]`);
  }
  console.log('OK   Test 1 PASS: 프로덕션 DB에서 부모 다양성 및 REVIEW 격리 완벽 검증');

  // Test 2: 최근 풀이 이력(Attempts) 감점 및 제외 검증
  console.log('\n--- Test 2: 최근 풀이 이력(Attempts) 감점 방어 검증 ---');
  const isolated = setupIsolatedTestDb({ seed: false });
  try {
    const isoDb = getDatabase();
    const isoRepo = new QuestionRepository(isoDb);

    // 10개의 테스트 문제 생성
    const testQuestions: Question[] = [];
    for (let i = 1; i <= 10; i++) {
      const q: Question = {
        id: `q_diverse_test_${i}`,
        questionCode: `TST-${String(i).padStart(3, '0')}`,
        sourceType: 'TEST_FIXTURE',
        subject: '프로그래밍언어활용',
        category: '테스트',
        type: 'CODE_TRACE',
        question: `테스트 문제 ${i}`,
        code: `int x = ${i};`,
        language: i % 2 === 0 ? 'C' : 'JAVA',
        groundTruthAnswer: `${i}`,
        difficulty: 'MEDIUM',
        keywords: [],
        studyVisibility: 'LIVE',
        readyForGrading: true,
        createdAt: new Date().toISOString(),
      };
      isoRepo.create(q);
      testQuestions.push(q);
    }

    // q_diverse_test_1 ~ 5 번을 최근 attempts에 삽입
    for (let i = 1; i <= 5; i++) {
      isoDb.prepare(`
        INSERT INTO attempts (id, question_id, session_id, user_answer, is_correct, created_at, answered_at)
        VALUES (?, ?, 'sess_dummy', '1', 1, ?, ?)
      `).run(`att_${i}`, `q_diverse_test_${i}`, new Date().toISOString(), new Date().toISOString());
    }

    // 5문제를 Diverse Random으로 선별
    // 최근 푼 1~5번은 큰 감점(-70)을 받았으므로, 풀지 않은 6~10번이 우선 선별되어야 함
    const picked = isoRepo.pickRandom({}, 5);
    const pickedIds = picked.map((q) => q.id);
    const freshCount = pickedIds.filter((id) => !id.match(/_[1-5]$/)).length;

    console.log('  선별된 문제 목록:', pickedIds);
    assert.ok(freshCount >= 4, `최근 푼 문제가 감점되어 안 푼 문제(${freshCount}/5)가 우선 선별됨`);
    console.log('OK   Test 2 PASS: 최근 푼 문제에 대한 감점 및 신규/미풀이 문제 우선 선별 검증 통과');

    // Test 3: 동일 부모 Seed 집중 감점 검증
    console.log('\n--- Test 3: 동일 부모 Seed 복수 존재 시 분산 검증 ---');
    // 부모 P1과 P2 등록
    isoRepo.create({
      id: 'parent_P1',
      questionCode: 'PAR-001',
      sourceType: 'REAL_EXAM',
      subject: '프로그래밍언어활용',
      category: '테스트',
      type: 'CODE_TRACE',
      question: '부모 문제 1',
      code: 'int p = 1;',
      language: 'PYTHON',
      groundTruthAnswer: '1',
      difficulty: 'MEDIUM',
      keywords: [],
      studyVisibility: 'LIVE',
      readyForGrading: true,
      createdAt: new Date().toISOString(),
    });
    isoRepo.create({
      id: 'parent_P2',
      questionCode: 'PAR-002',
      sourceType: 'REAL_EXAM',
      subject: '프로그래밍언어활용',
      category: '테스트',
      type: 'CODE_TRACE',
      question: '부모 문제 2',
      code: 'int p = 2;',
      language: 'PYTHON',
      groundTruthAnswer: '2',
      difficulty: 'MEDIUM',
      keywords: [],
      studyVisibility: 'LIVE',
      readyForGrading: true,
      createdAt: new Date().toISOString(),
    });

    // 부모 P1 아래 자식 5개, 부모 P2 아래 자식 5개
    for (let i = 11; i <= 20; i++) {
      const parentId = i <= 15 ? 'parent_P1' : 'parent_P2';
      isoRepo.create({
        id: `q_child_${i}`,
        questionCode: `CH-${i}`,
        sourceType: 'AI_VARIATION',
        parentQuestionId: parentId,
        subject: '프로그래밍언어활용',
        category: '테스트',
        type: 'CODE_TRACE',
        question: `자식 문제 ${i}`,
        code: `int y = ${i};`,
        language: 'PYTHON',
        groundTruthAnswer: `${i}`,
        difficulty: 'MEDIUM',
        keywords: [],
        studyVisibility: 'LIVE',
        readyForGrading: true,
        createdAt: new Date().toISOString(),
      });
    }

    const childPicked = isoRepo.pickRandom({ sourceType: 'AI_VARIATION' as any }, 4);
    const childParents = childPicked.map((q) => q.parentQuestionId);
    console.log('  자식 선별 부모 분포:', childParents);
    // P1과 P2가 골고루 섞여야 함 (P1만 4개 나오지 않아야 함)
    const p1Count = childParents.filter((p) => p === 'parent_P1').length;
    const p2Count = childParents.filter((p) => p === 'parent_P2').length;
    assert.ok(p1Count > 0 && p2Count > 0, '동일 부모에 편중되지 않고 P1과 P2가 균등 분산되어 출제됨');
    console.log('OK   Test 3 PASS: 동일 부모 Seed에 대한 동적 감점으로 다양한 Seed 출제 검증 통과');

  } finally {
    isolated.cleanup();
  }

  console.log('\n================================================================');
  console.log('🎉 Diverse Random 문제 선별 알고리즘 테스트 100% 통과!');
  console.log('================================================================\n');
}

testDiverseRandomSelection().catch((err) => {
  console.error('테스트 실패:', err);
  process.exit(1);
});
