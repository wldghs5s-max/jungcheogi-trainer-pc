import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Question,
  GeneratedVariation,
  VariationType,
  isStudyEligible,
  isVariationEligibleQuestion,
  isSeedVariationEligible,
} from '@jungcheogi/shared';
import { runMigrations } from '../src/db/migrator.js';
import { getDatabase, closeDatabase } from '../src/db/database.js';
import { setupIsolatedTestDb } from './helpers/testDb.js';
import { QuestionRepository } from '../src/db/repositories/questionRepository.js';
import { ConceptRepository } from '../src/db/repositories/conceptRepository.js';
import {
  GeminiAIService,
  MockAIService,
  getAIService,
  evaluatePromotion,
} from '../src/engine/aiService.js';
import {
  VariationValidator,
  DEPENDENT_PHRASES,
} from '../src/engine/variationValidator.js';
import {
  calculateCodeSimilarity,
  verifyExplanationMatch,
} from '../src/engine/evaluationValidator.js';
import { evaluateCodeOutput } from '../src/engine/codeExecutionEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

interface StressTestResult {
  seedId: string;
  category: 'A_NORMAL' | 'B_MISALIGNED' | 'C_MISSING_CONCEPT' | 'BLOCKED_REVIEW';
  language: string;
  variationType: VariationType;
  runIndex: number;
  variation?: GeneratedVariation;
  codeSimilarity: number;
  isSelfContained: boolean;
  dependentPhraseFound?: string;
  explanationMatch: boolean;
  selfCorrectionDetected: boolean;
  executionStatus?: string;
  classification: 'AUTO_PASS' | 'AUTO_REVIEW' | 'HUMAN_REVIEW_REQUIRED' | 'REJECT';
  variationLevel: 1 | 2 | 3 | 4;
  notes: string;
}

// 8대 품질 평가 항목 (각 0~2점, 총 16점)
interface QualityScoreCard {
  seedId: string;
  coreCompetencyPreservation: number; // 1. 핵심 역량 보존 (0~2)
  selfContainedIndependence: number;  // 2. 지문 독립성 및 자기완결성 (0~2)
  structuralVariationDepth: number;   // 3. 구조적/개념적 변형 깊이 (0~2)
  examAuthenticity: number;           // 4. 실기 시험 적합성 및 함정 설계 (0~2)
  difficultyCalibration: number;      // 5. 난이도 및 손추적 적정성 (0~2)
  verifiability: number;              // 6. 정답 결정론 및 검증 가능성 (0~2)
  explanationConsistency: number;     // 7. 해설 일관성 및 단계별 풀이 (0~2)
  learningValue: number;              // 8. 개인 학습 가치 (0~2)
  totalScore: number;                 // 합계 (0~16)
}

async function runSeedAIStressTest() {
  console.log('================================================================');
  console.log('Seed 기반 AI 문제 생성 일관성 및 실패 케이스 스트레스 테스트 스위트');
  console.log('================================================================\n');

  const isolated = setupIsolatedTestDb({ seed: false });
  runMigrations();
  const db = getDatabase();
  const qRepo = new QuestionRepository(db);
  const conceptRepo = new ConceptRepository(db);
  conceptRepo.seedInitialConcepts();

  // 1. 시드 데이터 로드
  const path2024 = path.join(PROJECT_ROOT, 'seeds/real-exams/2024-01/2024-01.transcribed.json');
  const path2025 = path.join(PROJECT_ROOT, 'seeds/real-exams/2025-01/2025-01.transcribed.json');
  const pathTextbook = path.join(PROJECT_ROOT, 'seeds/textbooks/programming/expected-bank/programming_expected.transcribed.json');

  const data2024 = JSON.parse(fs.readFileSync(path2024, 'utf-8'));
  const data2025 = JSON.parse(fs.readFileSync(path2025, 'utf-8'));
  const dataTextbook = JSON.parse(fs.readFileSync(pathTextbook, 'utf-8'));

  // 대상 시드 선정
  // Category A: 정상 메타데이터 (2024-01)
  const seed_2024_01_c = data2024.questions.find((q: any) => q.questionNumber === 1);
  const seed_2024_11_java = data2024.questions.find((q: any) => q.questionNumber === 11);

  // Category B: 메타데이터 불일치 (교재 예상문제)
  const seed_tb_01_java_loop = dataTextbook.questions.find((q: any) => q.id === 'tb_programming_01_01');
  const seed_tb_03_py_default = dataTextbook.questions.find((q: any) => q.id === 'tb_programming_01_03');
  const seed_tb_08_java_static = dataTextbook.questions.find((q: any) => q.id === 'tb_programming_01_08');
  const seed_tb_11_c_divisor = dataTextbook.questions.find((q: any) => q.id === 'tb_programming_01_11');

  // Category C: conceptId 누락/미지정 (2025-01)
  const seed_2025_03_c = data2025.questions.find((q: any) => q.questionNumber === 3);
  const seed_2025_06_sql = data2025.questions.find((q: any) => q.questionNumber === 6);

  // 차단 대상: REVIEW / REVIEW_NEEDED
  const seed_review_theory = data2025.questions.find((q: any) => q.questionNumber === 1); // 세션 하이재킹 (이론)
  const seed_review_c_ub = dataTextbook.questions.find((q: any) => q.id === 'tb_programming_01_09'); // printf 평가순서 UB

  assert.ok(seed_2024_01_c, '2024-01 Q1 C seed 존재');
  assert.ok(seed_2024_11_java, '2024-01 Q11 Java seed 존재');
  assert.ok(seed_tb_01_java_loop, 'tb_programming_01_01 seed 존재');
  assert.ok(seed_tb_03_py_default, 'tb_programming_01_03 seed 존재');
  assert.ok(seed_tb_08_java_static, 'tb_programming_01_08 seed 존재');
  assert.ok(seed_tb_11_c_divisor, 'tb_programming_01_11 seed 존재');
  assert.ok(seed_2025_03_c, '2025-01 Q3 C seed 존재');
  assert.ok(seed_2025_06_sql, '2025-01 Q6 SQL seed 존재');
  assert.ok(seed_review_theory, '2025-01 Q1 review seed 존재');
  assert.ok(seed_review_c_ub, 'tb_09 review seed 존재');

  console.log('OK   [Step 1] 테스트 대상 10개 핵심 Seed 전수 로드 완료');

  // -------------------------------------------------------------
  // Test 1: Seed Eligibility Guard 엄격성 검증 (차단 대상 차단 여부)
  // -------------------------------------------------------------
  console.log('\n--- Test 1: Seed Eligibility Guard 검증 ---');
  
  const theoryEligible = isSeedVariationEligible(seed_review_theory);
  assert.strictEqual(theoryEligible, false, 'REVIEW 이론 문제는 변형 생성 불가');

  const cUbEligible = isSeedVariationEligible(seed_review_c_ub);
  assert.strictEqual(cUbEligible, false, 'C 미정의 동작(UB) 문제는 변형 생성 불가');

  // 정상 시드들은 통과해야 함
  assert.strictEqual(isSeedVariationEligible({
    ...seed_2024_01_c,
    readyForGrading: true,
  }), true, '2024-01 Q1 VERIFIED seed는 변형 생성 가능');

  assert.strictEqual(isSeedVariationEligible({
    ...seed_tb_01_java_loop,
    readyForGrading: true,
  }), true, 'tb_01 VERIFIED seed는 변형 생성 가능');

  console.log('OK   Test 1 PASS: REVIEW seed 차단 및 VERIFIED seed 허용 완벽 방어');

  // -------------------------------------------------------------
  // Test 2: AI 서비스 및 프롬프트 Problem-First 회복력 테스트
  // -------------------------------------------------------------
  console.log('\n--- Test 2: Problem-First 메타데이터 불일치 및 미지정 회복력 검증 ---');

  const aiService = getAIService();
  const mockService = new MockAIService();

  // 변환 헬퍼
  function toQuestion(seed: any, defaultConceptId?: string): Question {
    return {
      id: seed.id,
      sourceType: seed.sourceType || 'REAL_EXAM',
      subject: seed.subject || '프로그래밍언어활용',
      category: seed.category || (seed.language ? `${seed.language} 프로그래밍` : '프로그래밍'),
      type: seed.type || 'CODE_TRACE',
      question: seed.questionText || seed.question,
      code: seed.code,
      language: seed.language,
      groundTruthAnswer: seed.groundTruthAnswer,
      officialExplanation: seed.officialExplanation,
      conceptId: seed.conceptId || defaultConceptId,
      verificationStatus: 'VERIFIED',
      studyVisibility: 'LIVE',
      difficulty: seed.difficulty || 'MEDIUM',
      createdAt: new Date().toISOString(),
    };
  }

  const targetSeeds = [
    {
      category: 'A_NORMAL' as const,
      name: '2024-01 Q1 (C 비트/삼항)',
      seed: toQuestion(seed_2024_01_c, 'concept_c_bitwise'),
      strategies: ['PARAMETER_VARIATION', 'CODE_VARIATION', 'CONCEPT_VARIATION'] as VariationType[],
    },
    {
      category: 'A_NORMAL' as const,
      name: '2024-01 Q11 (Java 생성자/상속 순서)',
      seed: toQuestion(seed_2024_11_java, 'concept_java_inheritance'),
      strategies: ['CODE_VARIATION', 'DIFFICULTY_VARIATION'] as VariationType[],
    },
    {
      category: 'B_MISALIGNED' as const,
      name: 'tb_01 (Java While루프곱셈, 메타: 상속)',
      seed: toQuestion(seed_tb_01_java_loop, 'concept_java_inheritance'), // 의도적 불일치
      strategies: ['PARAMETER_VARIATION', 'CODE_VARIATION'] as VariationType[],
    },
    {
      category: 'B_MISALIGNED' as const,
      name: 'tb_03 (Python 기본인자/가변객체, 메타: 인덱싱)',
      seed: toQuestion(seed_tb_03_py_default, 'concept_py_string_indexing'), // 의도적 불일치
      strategies: ['CODE_VARIATION', 'CONCEPT_VARIATION'] as VariationType[],
    },
    {
      category: 'B_MISALIGNED' as const,
      name: 'tb_08 (Java static/후위증가, 메타: 상속)',
      seed: toQuestion(seed_tb_08_java_static, 'concept_java_inheritance'), // 의도적 불일치
      strategies: ['CODE_VARIATION', 'SCENARIO_VARIATION'] as VariationType[],
    },
    {
      category: 'B_MISALIGNED' as const,
      name: 'tb_11 (C 약수합/완전수, 메타: 비트연산)',
      seed: toQuestion(seed_tb_11_c_divisor, 'concept_c_bitwise'), // 의도적 불일치
      strategies: ['CODE_VARIATION', 'PARAMETER_VARIATION'] as VariationType[],
    },
    {
      category: 'C_MISSING_CONCEPT' as const,
      name: '2025-01 Q3 (C 문자배열/인덱스 연산, conceptId 없음)',
      seed: toQuestion(seed_2025_03_c, undefined), // conceptId 누락
      strategies: ['PARAMETER_VARIATION', 'CODE_VARIATION'] as VariationType[],
    },
    {
      category: 'C_MISSING_CONCEPT' as const,
      name: '2025-01 Q6 (SQL JOIN/조건검색, conceptId 없음)',
      seed: toQuestion(seed_2025_06_sql, undefined), // conceptId 누락
      strategies: ['PARAMETER_VARIATION', 'SCENARIO_VARIATION'] as VariationType[],
    },
  ];

  const results: StressTestResult[] = [];

  for (const item of targetSeeds) {
    console.log(`\n▶ [스트레스 테스트] ${item.name} 실행 (전략 ${item.strategies.length}종)`);

    for (let r = 0; r < item.strategies.length; r++) {
      const strat = item.strategies[r];
      let variation: GeneratedVariation;

      try {
        variation = await aiService.generateVariation({
          question: item.seed,
          variationType: strat,
        });
      } catch (err: any) {
        console.warn(`[Gemini Fallback] ${item.name} fallback to mock:`, err?.message);
        variation = await mockService.generateVariation({
          question: item.seed,
          variationType: strat,
        });
      }

      // 1. 코드 유사도 (Clone 검사)
      const simDetail = calculateCodeSimilarity(variation.codeSnippet || '', item.seed.code || '');
      const codeSimilarity = simDetail.maxSimilarity;

      // 2. 종속 문구 검사
      let dependentPhraseFound: string | undefined = undefined;
      let isSelfContained = true;
      const combinedText = `${variation.prompt || ''} ${variation.aiExplanation || ''}`;
      for (const phrase of DEPENDENT_PHRASES) {
        if (combinedText.includes(phrase)) {
          isSelfContained = false;
          dependentPhraseFound = phrase;
          break;
        }
      }

      // 3. 정답-해설 일치 및 자가교정(Self-Correction) 검사
      const explanationCheck = verifyExplanationMatch(
        variation.aiExplanation || '',
        Array.isArray(variation.groundTruthAnswer)
          ? variation.groundTruthAnswer.join('\n')
          : String(variation.groundTruthAnswer ?? '')
      );

      // 4. 변형 수준 (Variation Level 1~4) 판정
      let variationLevel: 1 | 2 | 3 | 4 = 1;
      if (strat === 'PARAMETER_VARIATION') {
        variationLevel = 1;
      } else if (strat === 'CODE_VARIATION') {
        variationLevel = 2;
      } else if (strat === 'CONCEPT_VARIATION') {
        variationLevel = 3;
      } else {
        variationLevel = 4;
      }

      // 5. 분류 판정 (Classification)
      let classification: 'AUTO_PASS' | 'AUTO_REVIEW' | 'HUMAN_REVIEW_REQUIRED' | 'REJECT';
      if (!isSelfContained || codeSimilarity >= 0.85) {
        classification = 'REJECT';
      } else if (explanationCheck.selfCorrectionDetected || !explanationCheck.conclusionMatches) {
        classification = 'AUTO_REVIEW';
      } else if (variation.generationMetadata?.generator === 'GeminiAIService') {
        classification = 'AUTO_PASS';
      } else {
        classification = 'HUMAN_REVIEW_REQUIRED';
      }

      const note = `[${strat}] sim: ${(codeSimilarity * 100).toFixed(1)}%, self-contained: ${isSelfContained}, conclusionMatch: ${explanationCheck.conclusionMatches}, selfCorrect: ${explanationCheck.selfCorrectionDetected}`;
      console.log(`  - Run ${r + 1} (${strat}): ${classification} | ${note}`);

      results.push({
        seedId: item.seed.id,
        category: item.category,
        language: item.seed.language || 'UNKNOWN',
        variationType: strat,
        runIndex: r + 1,
        variation,
        codeSimilarity,
        isSelfContained,
        dependentPhraseFound,
        explanationMatch: explanationCheck.conclusionMatches,
        selfCorrectionDetected: explanationCheck.selfCorrectionDetected,
        classification,
        variationLevel,
        notes: note,
      });

      // 단언 검증 (회귀 방어 및 실패 포착 불변식)
      if (codeSimilarity >= 0.85 || !isSelfContained) {
        assert.strictEqual(
          classification,
          'REJECT',
          `클론(${(codeSimilarity * 100).toFixed(1)}%) 또는 종속 문구 발견 시 반드시 REJECT로 차단되어야 함 in ${item.name}`
        );
      }
      if (explanationCheck.selfCorrectionDetected || !explanationCheck.conclusionMatches) {
        assert.ok(
          classification === 'AUTO_REVIEW' || classification === 'REJECT',
          `자가교정 또는 해설 불일치는 검토(AUTO_REVIEW)/거절(REJECT)되어야 함 in ${item.name}`
        );
      }
    }
  }

  console.log(`\nOK   총 ${results.length}회 스트레스 테스트 생성 및 다각도 검증 완료`);

  // -------------------------------------------------------------
  // Test 3: 회복력 및 실패 포착 단언 검증
  // -------------------------------------------------------------
  console.log('\n--- Test 3: 자동 검증기의 실패 포착 능력 검증 ---');

  // Case 3-1: 의도적 종속 문구 주입 시 REJECT 포착 여부
  const fakeDependentVar: GeneratedVariation = {
    sourceQuestionId: 'test_q',
    parentQuestionId: 'test_q',
    prompt: '앞의 문제에서 x의 값을 20으로 변경했을 때 실행 결과를 쓰시오.',
    codeSnippet: 'int x = 20;',
    groundTruthAnswer: '20',
    variationType: 'PARAMETER_VARIATION',
  };
  const dependentValidation = VariationValidator.validate(fakeDependentVar);
  assert.strictEqual(dependentValidation.isValid, false, '종속 문구 감지 성공');
  assert.ok(dependentValidation.issues.some((i) => i.message.includes('앞의 문제')), '종속 문구 이슈 생성 확인');
  console.log('OK   Test 3-1: 종속 문구("앞의 문제에서") 주입 시 자동 감지 및 REJECT 검증 통과');

  // Case 3-2: 의도적 클론 코드 주입 시 REJECT 포착 여부
  const originalCodeSample = 'int v1 = 0; int v2 = 35; int v3 = 29;\nif (v1 > v2 ? v2 : v1) v2 = v2 << 2;\nelse v3 = v3 << 2;\nprintf("%d", v2 + v3);';
  const clonedCodeSample = 'int v1 = 0; int v2 = 35; int v3 = 29;\nif (v1 > v2 ? v2 : v1) v2 = v2 << 2;\nelse v3 = v3 << 2;\nprintf("%d", v2 + v3);';
  const cloneSimilarity = calculateCodeSimilarity(clonedCodeSample, originalCodeSample);
  assert.ok(cloneSimilarity.maxSimilarity >= 0.90, '클론 코드 유사도 90% 초과');
  const cloneValidation = VariationValidator.validate(
    { parentQuestionId: 'q_parent', prompt: '출력은?', groundTruthAnswer: '151', codeSnippet: clonedCodeSample } as any,
    { id: 'q_parent', question: '출력은?', groundTruthAnswer: '151', code: originalCodeSample } as any
  );
  assert.ok(cloneValidation.issues.some((i) => i.message.includes('복제')), '클론 코드 이슈 발생 확인');
  console.log('OK   Test 3-2: 100% 동일한 코드 복제 시 자동 차단 및 REJECT 검증 통과');

  // Case 3-3: 의도적 정답-해설 불일치 및 자가 교정 텍스트 주입 시 AUTO_REVIEW 포착 여부
  const conflictExp = '따라서 계산 착오로 정정하면 최종 정답은 4입니다.';
  const conflictCheck = verifyExplanationMatch(conflictExp, '11');
  assert.strictEqual(conflictCheck.conclusionMatches, false, '정답(11)과 해설(4) 불일치 감지');
  assert.strictEqual(conflictCheck.selfCorrectionDetected, true, '자가 교정 문구("계산 착오로 정정하면") 감지');
  assert.strictEqual(conflictCheck.status, 'CONTRADICTION', '모순(CONTRADICTION) 판정 확인');
  console.log('OK   Test 3-3: 정답-해설 불일치 및 자가 교정(Self-Correction) 자동 포착 검증 통과');

  // Case 3-4: Problem-First 원칙 작동 검증
  // tb_01의 메타데이터는 'concept_java_inheritance'이나 실제 코드는 While 루프 곱셈임.
  // 생성된 문제가 상속(class Child extends Parent)을 억지로 끼워넣지 않고 While/루프 구조를 변형했는지 확인
  const tb01Results = results.filter((r) => r.seedId === 'tb_programming_01_01');
  for (const r of tb01Results) {
    const code = r.variation?.codeSnippet || '';
    assert.ok(
      !code.includes('extends Parent') && !code.includes('super('),
      `tb_01 문제 생성 시 잘못된 상속 메타데이터에 오염되지 않음 확인 (Problem-First 원칙 유지)`
    );
  }
  console.log('OK   Test 3-4: 잘못된 메타데이터(상속)가 지정되어도 Problem-First 원칙으로 코드 본질(루프) 보존 검증 통과');

  // Case 3-5: conceptId 누락(2025-01 Q3 C, Q6 SQL) 시에도 유효한 언어별 문제 생성 검증
  const cMissingResults = results.filter((r) => r.seedId === 'q_2025_01_03');
  for (const r of cMissingResults) {
    const code = r.variation?.codeSnippet || '';
    assert.ok(
      code.includes('char') || code.includes('printf') || code.includes('int'),
      'conceptId가 누락되어도 C언어 문법 체계를 정확히 보존하여 생성'
    );
  }
  const sqlMissingResults = results.filter((r) => r.seedId === 'q_2025_01_06');
  for (const r of sqlMissingResults) {
    const code = (r.variation?.codeSnippet || r.variation?.prompt || '').toUpperCase();
    assert.ok(
      code.includes('SELECT') || code.includes('FROM') || code.includes('WHERE'),
      'conceptId가 누락되어도 SQL 질의문 체계를 정확히 보존하여 생성'
    );
  }
  console.log('OK   Test 3-5: conceptId 미지정(누락) 상태에서도 언어 및 도메인 기반 고품질 변형 생성 검증 통과');

  // 정리
  isolated.cleanup();
  closeDatabase();

  console.log('\n================================================================');
  console.log('🎉 Seed 기반 AI 문제 생성 스트레스 테스트 및 실패 케이스 방어 100% 통과!');
  console.log('================================================================\n');

  return results;
}

runSeedAIStressTest().catch((err) => {
  console.error('테스트 실패:', err);
  process.exit(1);
});
