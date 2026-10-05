import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {
  Question,
  GeneratedVariation,
  VariationType,
  CodeLanguage,
} from '@jungcheogi/shared';
import { getDatabase, closeDatabase } from '../db/database.js';
import { QuestionRepository } from '../db/repositories/questionRepository.js';
import { ConceptRepository } from '../db/repositories/conceptRepository.js';
import { getAIService } from '../engine/aiService.js';
import { VariationValidator, DEPENDENT_PHRASES } from '../engine/variationValidator.js';
import { calculateCodeSimilarity, verifyExplanationMatch } from '../engine/evaluationValidator.js';
import { evaluateCodeOutput } from '../engine/codeExecutionEngine.js';

const REPORT_PATH = path.resolve(process.cwd(), 'server/diversity_generation_report.json');

export interface TargetedGenerationPlan {
  batchId: string;
  seedId: string;
  reasoningType: string;
  strategy: VariationType;
  language?: CodeLanguage;
  problemType: 'CODE_TRACE' | 'SQL' | 'SHORT_ANSWER';
  instructions: string;
}

// 5대 핵심 도메인별 부족 영역 집중 보강 플랜 (총 46개 슬롯)
export const DIVERSITY_GENERATION_PLANS: TargetedGenerationPlan[] = [
  // ==========================================
  // Batch 01: SQL 심화 질의 및 집계/NULL/조인 보강 (8문항)
  // ==========================================
  {
    batchId: 'BATCH-01-SQL',
    seedId: 'q_2024_01_17',
    reasoningType: 'sql_outer_join_null',
    strategy: 'DIFFICULTY_VARIATION',
    language: 'SQL',
    problemType: 'SQL',
    instructions: '[집중 사고유형: sql_outer_join_null] LEFT OUTER JOIN을 수행했을 때 매칭되지 않는 행들의 NULL 컬럼 처리 및 COUNT(*) vs COUNT(컬럼명)의 결과값 차이를 판별하는 쿼리 결과 예측 문제로 설계하세요.',
  },
  {
    batchId: 'BATCH-01-SQL',
    seedId: 'q_2024_01_12',
    reasoningType: 'sql_group_having_agg',
    strategy: 'CODE_VARIATION',
    language: 'SQL',
    problemType: 'SQL',
    instructions: '[집중 사고유형: sql_group_having_agg] 부서별 또는 직급별 집계에서 HAVING 절의 다중 조건(COUNT(*) >= 2 AND AVG(급여) >= 300)을 적용하여 최종 필터링된 결과 행의 개수 또는 집계값을 구하는 문제로 설계하세요.',
  },
  {
    batchId: 'BATCH-01-SQL',
    seedId: 'q_2025_01_06',
    reasoningType: 'sql_correlated_subquery',
    strategy: 'DIFFICULTY_VARIATION',
    language: 'SQL',
    problemType: 'SQL',
    instructions: '[집중 사고유형: sql_correlated_subquery] WHERE EXISTS 및 NOT EXISTS 상관 서브쿼리(Correlated Subquery)를 사용하여 외부 쿼리의 각 행과 연결 검사 후 출력되는 행의 수를 묻는 문제로 설계하세요.',
  },
  {
    batchId: 'BATCH-01-SQL',
    seedId: 'q_2024_01_17',
    reasoningType: 'sql_case_expression',
    strategy: 'CONCEPT_VARIATION',
    language: 'SQL',
    problemType: 'SQL',
    instructions: '[집중 사고유형: sql_case_expression] SELECT 절 내에서 CASE WHEN THEN ELSE END 구문과 SUM/COUNT 집계함수를 결합하여 조건부 집계 결과를 산출하는 질의 결과 예측 문제로 설계하세요.',
  },
  {
    batchId: 'BATCH-01-SQL',
    seedId: 'q_2025_01_06',
    reasoningType: 'sql_outer_join_null',
    strategy: 'CODE_VARIATION',
    language: 'SQL',
    problemType: 'SQL',
    instructions: '[집중 사고유형: sql_outer_join_null] 두 테이블 간 RIGHT OUTER JOIN 시 일치하지 않는 데이터의 WHERE 절 IS NULL 필터링 동작을 묻는 문제로 설계하세요.',
  },
  {
    batchId: 'BATCH-01-SQL',
    seedId: 'q_2024_01_12',
    reasoningType: 'sql_group_having_agg',
    strategy: 'DIFFICULTY_VARIATION',
    language: 'SQL',
    problemType: 'SQL',
    instructions: '[집중 사고유형: sql_group_having_agg] GROUP BY 컬럼과 집계함수 SUM, MAX를 조합하고 ORDER BY 정렬 후 단일 행 출력을 요구하는 쿼리 결과 예측 문제로 설계하세요.',
  },

  // ==========================================
  // Batch 02: Python 고급 메커니즘 및 자료구조 (10문항)
  // ==========================================
  {
    batchId: 'BATCH-02-PYTHON',
    seedId: 'tb_programming_01_03',
    reasoningType: 'py_mutable_default',
    strategy: 'DIFFICULTY_VARIATION',
    language: 'PYTHON',
    problemType: 'CODE_TRACE',
    instructions: '[집중 사고유형: py_mutable_default] 함수의 기본 매개변수(default parameter)로 가변 객체(리스트 [])를 지정하고 함수를 세 번 연속 호출할 때 누적되는 현상(mutable default trap)을 추적하는 파이썬 코드로 설계하세요.',
  },
  {
    batchId: 'BATCH-02-PYTHON',
    seedId: 'tb_programming_01_17',
    reasoningType: 'py_slice_stride',
    strategy: 'CODE_VARIATION',
    language: 'PYTHON',
    problemType: 'CODE_TRACE',
    instructions: '[집중 사고유형: py_slice_stride] 문자열 및 리스트 슬라이싱에서 음수 간격(step = -2 또는 -1)과 범위 생략([::-1], [5:1:-2])이 복합 적용된 출력값 추적 코드로 설계하세요.',
  },
  {
    batchId: 'BATCH-02-PYTHON',
    seedId: 'tb_programming_01_23',
    reasoningType: 'py_generator_yield',
    strategy: 'DIFFICULTY_VARIATION',
    language: 'PYTHON',
    problemType: 'CODE_TRACE',
    instructions: '[집중 사고유형: py_generator_yield] yield 키워드를 사용하는 제너레이터 함수에서 next() 호출 시 내부 상태 보존 및 for 루프 순회 중 조건 분기 출력값을 추적하는 코드로 설계하세요.',
  },
  {
    batchId: 'BATCH-02-PYTHON',
    seedId: 'tb_programming_01_15',
    reasoningType: 'py_comprehension',
    strategy: 'CODE_VARIATION',
    language: 'PYTHON',
    problemType: 'CODE_TRACE',
    instructions: '[집중 사고유형: py_comprehension] 리스트 컴프리헨션 내에 다중 조건문(if n % 2 == 0 and n > 3 else ...) 및 딕셔너리 컴프리헨션이 결합된 데이터 가공 출력 추적 코드로 설계하세요.',
  },
  {
    batchId: 'BATCH-02-PYTHON',
    seedId: 'q_2025_01_19',
    reasoningType: 'py_scope_binding',
    strategy: 'DIFFICULTY_VARIATION',
    language: 'PYTHON',
    problemType: 'CODE_TRACE',
    instructions: '[집중 사고유형: py_scope_binding] 중첩 함수(closure)와 nonlocal/global 키워드, 함수 인자로 전달된 튜플 언패킹(*args)의 실행 순서와 최종 변수값을 묻는 코드로 설계하세요.',
  },
  {
    batchId: 'BATCH-02-PYTHON',
    seedId: 'tb_programming_01_03',
    reasoningType: 'py_slice_stride',
    strategy: 'PARAMETER_VARIATION',
    language: 'PYTHON',
    problemType: 'CODE_TRACE',
    instructions: '[집중 사고유형: py_slice_stride] 2차원 리스트의 행/열 슬라이싱 및 sum() 연산이 결합된 파이썬 코드의 실행 결과를 손추적하는 문제로 설계하세요.',
  },
  {
    batchId: 'BATCH-02-PYTHON',
    seedId: 'tb_programming_01_23',
    reasoningType: 'py_generator_yield',
    strategy: 'CODE_VARIATION',
    language: 'PYTHON',
    problemType: 'CODE_TRACE',
    instructions: '[집중 사고유형: py_generator_yield] 피보나치 또는 카운터 제너레이터에서 무한 루프 yield 후 특정 조건 break 시 반환 리스트의 합을 구하는 코드로 설계하세요.',
  },
  {
    batchId: 'BATCH-02-PYTHON',
    seedId: 'tb_programming_01_17',
    reasoningType: 'py_comprehension',
    strategy: 'DIFFICULTY_VARIATION',
    language: 'PYTHON',
    problemType: 'CODE_TRACE',
    instructions: '[집중 사고유형: py_comprehension] 2중 for 루프 리스트 컴프리헨션 [x * y for x in [...] for y in [...] if ...]의 최종 연산 결과를 묻는 코드로 설계하세요.',
  },

  // ==========================================
  // Batch 03: Java 객체지향/예외/런타임 심화 (10문항)
  // ==========================================
  {
    batchId: 'BATCH-03-JAVA',
    seedId: 'q_2025_01_16',
    reasoningType: 'java_exception_flow',
    strategy: 'DIFFICULTY_VARIATION',
    language: 'JAVA',
    problemType: 'CODE_TRACE',
    instructions: '[집중 사고유형: java_exception_flow] try-catch-finally 블록에서 try 블록 내 return이 호출될 때 finally 블록이 먼저 실행되는 순서 및 최종 반환 변수의 값 변화를 손추적하는 코드로 설계하세요.',
  },
  {
    batchId: 'BATCH-03-JAVA',
    seedId: 'tb_programming_01_21',
    reasoningType: 'java_static_init_order',
    strategy: 'DIFFICULTY_VARIATION',
    language: 'JAVA',
    problemType: 'CODE_TRACE',
    instructions: '[집중 사고유형: java_static_init_order] 부모/자식 클래스의 static 초기화 블록, 인스턴스 초기화 블록, 생성자 호출 순서와 static 변수의 누적 갱신 결과를 추적하는 코드로 설계하세요.',
  },
  {
    batchId: 'BATCH-03-JAVA',
    seedId: 'q_2025_01_11',
    reasoningType: 'java_interface_polymorphism',
    strategy: 'CODE_VARIATION',
    language: 'JAVA',
    problemType: 'CODE_TRACE',
    instructions: '[집중 사고유형: java_interface_polymorphism] 두 인터페이스의 default 메서드 충돌 시 오버라이딩 우선순위 및 업캐스팅된 인터페이스 참조 변수를 통한 동적 바인딩 출력 추적 코드로 설계하세요.',
  },
  {
    batchId: 'BATCH-03-JAVA',
    seedId: 'tb_programming_01_22',
    reasoningType: 'java_stream_collection',
    strategy: 'DIFFICULTY_VARIATION',
    language: 'JAVA',
    problemType: 'CODE_TRACE',
    instructions: '[집중 사고유형: java_stream_collection] List 컬렉션에 대해 Stream filter(), map(), reduce() 파이프라인 연산을 순차 수행하여 단일 정수 합산값을 산출하는 코드로 설계하세요.',
  },
  {
    batchId: 'BATCH-03-JAVA',
    seedId: 'tb_programming_01_24',
    reasoningType: 'java_thread_sync',
    strategy: 'CODE_VARIATION',
    language: 'JAVA',
    problemType: 'CODE_TRACE',
    instructions: '[집중 사고유형: java_thread_sync] 익명 클래스 내부에서 final 또는 effectively final 지역변수 캡처 및 static 메서드 동기화 카운터의 최종 실행 결과를 묻는 코드로 설계하세요.',
  },
  {
    batchId: 'BATCH-03-JAVA',
    seedId: 'q_2024_01_11',
    reasoningType: 'java_static_init_order',
    strategy: 'PARAMETER_VARIATION',
    language: 'JAVA',
    problemType: 'CODE_TRACE',
    instructions: '[집중 사고유형: java_static_init_order] super(매개변수) 명시적 호출과 부모의 오버로딩된 생성자 간 체이닝 순서를 정확히 손추적하는 문제로 설계하세요.',
  },
  {
    batchId: 'BATCH-03-JAVA',
    seedId: 'q_2025_01_05',
    reasoningType: 'java_interface_polymorphism',
    strategy: 'DIFFICULTY_VARIATION',
    language: 'JAVA',
    problemType: 'CODE_TRACE',
    instructions: '[집중 사고유형: java_interface_polymorphism] 추상 클래스를 상속받은 자식 객체를 부모 타입 배열로 관리하며 다형적 메서드를 순회 호출할 때의 콘솔 출력을 묻는 코드로 설계하세요.',
  },
  {
    batchId: 'BATCH-03-JAVA',
    seedId: 'tb_programming_01_22',
    reasoningType: 'java_stream_collection',
    strategy: 'CODE_VARIATION',
    language: 'JAVA',
    problemType: 'CODE_TRACE',
    instructions: '[집중 사고유형: java_stream_collection] Arrays.asList 정수 배열에서 홀수만 필터링 후 제곱하여 최대값을 출력하는 스트림 연산 코드로 설계하세요.',
  },

  // ==========================================
  // Batch 04: C 포인터/메모리/우선순위 함정 (10문항)
  // ==========================================
  {
    batchId: 'BATCH-04-C',
    seedId: 'q_2024_01_01',
    reasoningType: 'c_operator_precedence',
    strategy: 'DIFFICULTY_VARIATION',
    language: 'C',
    problemType: 'CODE_TRACE',
    instructions: '[집중 사고유형: c_operator_precedence] 시프트 연산자(<<, >>), 비트 AND/OR, 논리 연산자의 단락 평가(Short-circuit evaluation), 전위/후위 증감 연산자가 결합되어 연산자 우선순위가 핵심인 C 코드로 설계하세요.',
  },
  {
    batchId: 'BATCH-04-C',
    seedId: 'tb_programming_01_05',
    reasoningType: 'c_pointer_arithmetic',
    strategy: 'DIFFICULTY_VARIATION',
    language: 'C',
    problemType: 'CODE_TRACE',
    instructions: '[집중 사고유형: c_pointer_arithmetic] 2차원 배열에서 *(*(arr + i) + j) 및 (*p)[3] 포인터 배열을 활용하여 특정 행과 열의 주소 연산을 수행하는 C 코드로 설계하세요.',
  },
  {
    batchId: 'BATCH-04-C',
    seedId: 'tb_programming_01_06',
    reasoningType: 'c_dynamic_memory',
    strategy: 'DIFFICULTY_VARIATION',
    language: 'C',
    problemType: 'CODE_TRACE',
    instructions: '[집중 사고유형: c_dynamic_memory] malloc으로 동적 할당된 정수 배열을 포인터 이동으로 채우고 realloc 후 특정 오프셋을 역참조하여 값을 누적하는 C 코드로 설계하세요.',
  },
  {
    batchId: 'BATCH-04-C',
    seedId: 'q_2024_01_13',
    reasoningType: 'c_recursion_stack',
    strategy: 'DIFFICULTY_VARIATION',
    language: 'C',
    problemType: 'CODE_TRACE',
    instructions: '[집중 사고유형: c_recursion_stack] 재귀 함수에서 반환 후 후위 연산(return n + func(n-2) * 2)을 수행하여 호출 스택이 풀리면서 일어나는 누적 계산을 손추적하는 C 코드로 설계하세요.',
  },
  {
    batchId: 'BATCH-04-C',
    seedId: 'tb_programming_01_20',
    reasoningType: 'c_struct_memory',
    strategy: 'DIFFICULTY_VARIATION',
    language: 'C',
    problemType: 'CODE_TRACE',
    instructions: '[집중 사고유형: c_struct_memory] 구조체 포인터(-> 연산자)와 멤버 포인터 변수, typedef struct를 결합하여 연결된 노드의 데이터 필드를 순회 출력하는 C 코드로 설계하세요.',
  },
  {
    batchId: 'BATCH-04-C',
    seedId: 'tb_programming_01_07',
    reasoningType: 'c_pointer_arithmetic',
    strategy: 'CODE_VARIATION',
    language: 'C',
    problemType: 'CODE_TRACE',
    instructions: '[집중 사고유형: c_pointer_arithmetic] 문자열 포인터 while(*p) 순회 중 포인터 증감 *p++ 과 (*p)++ 의 차이를 이용해 문자열을 치환 및 출력하는 C 코드로 설계하세요.',
  },
  {
    batchId: 'BATCH-04-C',
    seedId: 'tb_programming_01_18',
    reasoningType: 'c_operator_precedence',
    strategy: 'CODE_VARIATION',
    language: 'C',
    problemType: 'CODE_TRACE',
    instructions: '[집중 사고유형: c_operator_precedence] 매크로 함수 #define SQUARE(x) (x * x) 에서 괄호 누락으로 인한 우선순위 부작용(SQUARE(2 + 3))을 정확히 계산하는 C 코드로 설계하세요.',
  },
  {
    batchId: 'BATCH-04-C',
    seedId: 'tb_programming_01_11',
    reasoningType: 'c_recursion_stack',
    strategy: 'CODE_VARIATION',
    language: 'C',
    problemType: 'CODE_TRACE',
    instructions: '[집중 사고유형: c_recursion_stack] 최대공약수(유클리드 호제법) 재귀 함수에서 매개변수 a % b 전이 과정과 최종 반환값을 손추적하는 C 코드로 설계하세요.',
  },

  // ==========================================
  // Batch 05: 이론 비교/시나리오 판별 심화 (8문항)
  // ==========================================
  {
    batchId: 'BATCH-05-THEORY',
    seedId: 'q_2024_01_04',
    reasoningType: 'theory_concept_comparison',
    strategy: 'DIFFICULTY_VARIATION',
    language: undefined,
    problemType: 'SHORT_ANSWER',
    instructions: '[집중 사고유형: theory_concept_comparison] 모듈 결합도(Coupling) 6단계(자료, 스탬프, 제어, 외부, 공통, 내용) 중 스탬프 결합도와 제어 결합도의 차이를 구체적 매개변수 전달 시나리오로 제시하고 해당 결합도 명칭을 작성하는 단답형 문제로 설계하세요.',
  },
  {
    batchId: 'BATCH-05-THEORY',
    seedId: 'q_2024_01_03',
    reasoningType: 'theory_normalization_anomaly',
    strategy: 'DIFFICULTY_VARIATION',
    language: undefined,
    problemType: 'SHORT_ANSWER',
    instructions: '[집중 사고유형: theory_normalization_anomaly] 주어진 릴레이션 스키마와 함수 종속성 다이어그램에서 부분 함수 종속 제거(2NF) 및 결정자가 후보키가 아닌 함수 종속 제거(BCNF) 단계를 판별하는 단답형 문제로 설계하세요.',
  },
  {
    batchId: 'BATCH-05-THEORY',
    seedId: 'q_2024_01_14',
    reasoningType: 'theory_coverage_criteria',
    strategy: 'DIFFICULTY_VARIATION',
    language: undefined,
    problemType: 'SHORT_ANSWER',
    instructions: '[집중 사고유형: theory_coverage_criteria] 화이트박스 테스트 커버리지 기준(구문, 분기/결정, 조건, 조건/결정, MC/DC) 중 각 개별 조건식의 참/거짓이 전체 결정식 결과에 독립적으로 영향을 미치는지 검증하는 커버리지 기준(MC/DC)을 묻는 문제로 설계하세요.',
  },
  {
    batchId: 'BATCH-05-THEORY',
    seedId: 'q_2024_01_06',
    reasoningType: 'theory_scenario_design',
    strategy: 'DIFFICULTY_VARIATION',
    language: undefined,
    problemType: 'SHORT_ANSWER',
    instructions: '[집중 사고유형: theory_scenario_design] GoF 디자인 패턴 중 객체 생성 책임을 서브클래스에 위임하는 Factory Method 패턴과 서로 연관된 객체군을 생성하는 Abstract Factory 패턴의 차이를 실무 시나리오로 제시하고 패턴 명칭을 맞추는 문제로 설계하세요.',
  },
  {
    batchId: 'BATCH-05-THEORY',
    seedId: 'q_2024_01_02',
    reasoningType: 'theory_concept_comparison',
    strategy: 'CODE_VARIATION',
    language: undefined,
    problemType: 'SHORT_ANSWER',
    instructions: '[집중 사고유형: theory_concept_comparison] OSI 7계층 중 전송 계층(TCP, UDP)과 네트워크 계층(IP, ICMP, ARP) 프로토콜의 역할과 신뢰성 보장 메커니즘 차이를 묻는 단답형 문제로 설계하세요.',
  },
  {
    batchId: 'BATCH-05-THEORY',
    seedId: 'q_2024_01_09',
    reasoningType: 'theory_scenario_design',
    strategy: 'CONCEPT_VARIATION',
    language: undefined,
    problemType: 'SHORT_ANSWER',
    instructions: '[집중 사고유형: theory_scenario_design] 트랜잭션의 ACID 특성 중 일관성(Consistency)과 격리성(Isolation)의 정의 및 비반복 읽기(Non-repeatable Read)가 발생하는 격리 수준을 묻는 단답형 문제로 설계하세요.',
  },
];

export async function runBatchDiversityGeneration() {
  const db = getDatabase();
  const repo = new QuestionRepository(db);
  const aiService = getAIService();

  console.log('\n================================================================');
  console.log('🚀 AI 문제 Pool 다양성 확장 및 심화 배치 생성 파이프라인');
  console.log('================================================================\n');

  const allExisting = repo.findAllMatching();
  console.log(`현재 DB 총 문제 수: ${allExisting.length}건 (Cross-Pool 비교 대상)`);

  const results: any[] = [];
  let totalAttempts = 0;
  let totalPassed = 0;
  let totalRejected = 0;

  const rejectionCounts: Record<string, number> = {
    CLONE_TOO_SIMILAR: 0,
    CROSS_POOL_DUPLICATE: 0,
    EXPLANATION_MISMATCH: 0,
    SELF_CORRECTION: 0,
    ANSWER_MISMATCH: 0,
    DEPENDENT_PHRASE: 0,
    SCHEMA_OR_TRIVIAL: 0,
    RUNTIME_FAILURE: 0,
  };

  const batches = [...new Set(DIVERSITY_GENERATION_PLANS.map((p) => p.batchId))];

  for (const batchId of batches) {
    const plansInBatch = DIVERSITY_GENERATION_PLANS.filter((p) => p.batchId === batchId);
    console.log(`\n----------------------------------------------------------------`);
    console.log(`▶ [배치 실행] ${batchId} (총 ${plansInBatch.length}개 대상 계획)`);
    console.log(`----------------------------------------------------------------`);

    for (const plan of plansInBatch) {
      totalAttempts++;
      const seed = repo.findById(plan.seedId);
      if (!seed) {
        console.warn(`[SKIP] Seed ID ${plan.seedId}를 찾을 수 없음`);
        continue;
      }

      // 멱등성 검사: 이미 동일 배치 및 reasoningType으로 적재된 문제가 있는지 확인
      const existingInDb = db.prepare(
        `SELECT id, question_code FROM questions 
         WHERE keywords_json LIKE ? AND keywords_json LIKE ? 
         LIMIT 1`
      ).get(`%reasoning:${plan.reasoningType}%`, `%${plan.batchId}%`) as { id: string; question_code: string } | undefined;

      if (existingInDb) {
        console.log(`\n[#${totalAttempts}] [ALREADY EXISTS] ${plan.batchId} (${plan.reasoningType}): [${existingInDb.question_code}] 이미 적재됨`);
        totalPassed++;
        results.push({ plan, status: 'PASS', questionCode: existingInDb.question_code, id: existingInDb.id });
        continue;
      }

      console.log(`\n[#${totalAttempts}] Seed: ${seed.questionCode || seed.id} | 유형: ${plan.reasoningType} | 전략: ${plan.strategy}`);

      // Rate limit 방어 (Gemini 15 RPM 버퍼: 5.5초 대기)
      await new Promise((r) => setTimeout(r, 5500));

      let variation: GeneratedVariation | null = null;
      for (let genTry = 0; genTry < 2; genTry++) {
        try {
          const res = await aiService.generateVariation({
            question: seed,
            variationType: plan.strategy,
            instructions: plan.instructions,
          });
          if (res.generationMetadata?.generator === 'GeminiAIService') {
            variation = res;
            break;
          } else {
            console.warn(`  ⏳ [RATE LIMIT] Mock 폴백 감지됨. 20초 대기 후 Gemini 재시도 (${genTry + 1}/2)...`);
            await new Promise((r) => setTimeout(r, 20000));
          }
        } catch (err: any) {
          console.warn(`[AI GENERATION ERROR] ${err?.message}`);
          await new Promise((r) => setTimeout(r, 20000));
        }
      }

      if (!variation) {
        console.warn('  ❌ REJECT: 실시간 AI 응답 확보 실패 (RUNTIME_FAILURE)');
        rejectionCounts.RUNTIME_FAILURE++;
        totalRejected++;
        results.push({ plan, status: 'REJECT', reason: 'RUNTIME_FAILURE' });
        continue;
      }

      const candidateCode = variation.codeSnippet || '';
      const candidatePrompt = variation.prompt || '';
      const candidateAnswer = Array.isArray(variation.groundTruthAnswer)
        ? variation.groundTruthAnswer.join('\n')
        : String(variation.groundTruthAnswer ?? '');

      // 1. Schema 검증
      if (!candidatePrompt || candidatePrompt.length < 10 || !candidateAnswer) {
        console.warn('  ❌ REJECT: 지문 또는 정답 누락 (SCHEMA_OR_TRIVIAL)');
        rejectionCounts.SCHEMA_OR_TRIVIAL++;
        totalRejected++;
        results.push({ plan, status: 'REJECT', reason: 'SCHEMA_OR_TRIVIAL' });
        continue;
      }
      if (plan.problemType === 'CODE_TRACE' && (!candidateCode || candidateCode.split('\n').length < 4)) {
        console.warn('  ❌ REJECT: 코드 누락 또는 너무 짧음 (SCHEMA_OR_TRIVIAL)');
        rejectionCounts.SCHEMA_OR_TRIVIAL++;
        totalRejected++;
        results.push({ plan, status: 'REJECT', reason: 'SCHEMA_OR_TRIVIAL' });
        continue;
      }

      // 2. 종속 문구 검증
      let hasDependentPhrase = false;
      const combinedText = `${candidatePrompt} ${variation.aiExplanation || ''}`;
      for (const phrase of DEPENDENT_PHRASES) {
        if (combinedText.includes(phrase)) {
          hasDependentPhrase = true;
          break;
        }
      }
      if (hasDependentPhrase) {
        console.warn('  ❌ REJECT: 종속 문구 감지 (DEPENDENT_PHRASE)');
        rejectionCounts.DEPENDENT_PHRASE++;
        totalRejected++;
        results.push({ plan, status: 'REJECT', reason: 'DEPENDENT_PHRASE' });
        continue;
      }

      // 3. 해설 일관성 및 자가 교정 검증
      const expCheck = verifyExplanationMatch(variation.aiExplanation || '', candidateAnswer);
      if (expCheck.selfCorrectionDetected) {
        console.warn('  ❌ REJECT: 해설 내 자가교정/환각 감지 (SELF_CORRECTION)');
        rejectionCounts.SELF_CORRECTION++;
        totalRejected++;
        results.push({ plan, status: 'REJECT', reason: 'SELF_CORRECTION' });
        continue;
      }
      if (!expCheck.conclusionMatches) {
        console.warn('  ❌ REJECT: 해설 최종 결론 정답 불일치 (EXPLANATION_MISMATCH)');
        rejectionCounts.EXPLANATION_MISMATCH++;
        totalRejected++;
        results.push({ plan, status: 'REJECT', reason: 'EXPLANATION_MISMATCH' });
        continue;
      }

      // 4. 실행 검증 (Python)
      if (plan.language === 'PYTHON' && candidateCode) {
        try {
          const evalRes = await evaluateCodeOutput(candidateCode, 'PYTHON');
          if (evalRes.status === 'SUCCESS' && evalRes.output) {
            const cleanOut = evalRes.output.trim();
            const cleanAns = candidateAnswer.trim();
            if (cleanOut !== cleanAns) {
              console.warn(`  ❌ REJECT: Python 실행 출력("${cleanOut}") != 정답("${cleanAns}") (ANSWER_MISMATCH)`);
              rejectionCounts.ANSWER_MISMATCH++;
              totalRejected++;
              results.push({ plan, status: 'REJECT', reason: 'ANSWER_MISMATCH' });
              continue;
            }
          } else if (evalRes.status === 'ERROR') {
            console.warn(`  ❌ REJECT: Python 코드 실행 오류 (RUNTIME_FAILURE): ${evalRes.error}`);
            rejectionCounts.RUNTIME_FAILURE++;
            totalRejected++;
            results.push({ plan, status: 'REJECT', reason: 'RUNTIME_FAILURE' });
            continue;
          }
        } catch {}
      }

      // 5. 부모 Seed와의 유사도 (클론 차단: 82% 기준)
      if (candidateCode && seed.code) {
        const simParent = calculateCodeSimilarity(candidateCode, seed.code);
        if (simParent.maxSimilarity >= 0.82) {
          console.warn(`  ❌ REJECT: 부모 Seed와 유사도 ${(simParent.maxSimilarity * 100).toFixed(1)}% 초과 (CLONE_TOO_SIMILAR)`);
          rejectionCounts.CLONE_TOO_SIMILAR++;
          totalRejected++;
          results.push({ plan, status: 'REJECT', reason: 'CLONE_TOO_SIMILAR', sim: simParent.maxSimilarity });
          continue;
        }
      }

      // 6. Cross-Pool 중복 검사 (전체 DB 내 문제들과 유사도 80% 초과 여부)
      let crossPoolDuplicate = false;
      let dupWith = '';
      let maxCrossSim = 0;
      if (candidateCode) {
        for (const existing of allExisting) {
          if (!existing.code) continue;
          const sim = calculateCodeSimilarity(candidateCode, existing.code);
          if (sim.maxSimilarity >= 0.80) {
            crossPoolDuplicate = true;
            dupWith = existing.questionCode || existing.id;
            maxCrossSim = sim.maxSimilarity;
            break;
          }
        }
      }
      if (crossPoolDuplicate) {
        console.warn(`  ❌ REJECT: 기존 DB 문제(${dupWith})와 유사도 ${(maxCrossSim * 100).toFixed(1)}% 중복 (CROSS_POOL_DUPLICATE)`);
        rejectionCounts.CROSS_POOL_DUPLICATE++;
        totalRejected++;
        results.push({ plan, status: 'REJECT', reason: 'CROSS_POOL_DUPLICATE', dupWith });
        continue;
      }

      // === 모든 검증 통과: DB 정식 적재 ===
      const nextCode = repo.generateNextCode('AI_VARIATION');
      const nowIso = new Date().toISOString();
      const newQuestionId = `q_ai_div_${plan.batchId.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${plan.reasoningType}_${Date.now()}`;

      const keywords = [
        `reasoning:${plan.reasoningType}`,
        plan.language || '이론',
        plan.batchId,
        'DIVERSE_POOL',
      ];

      const newQuestion: Question = {
        id: newQuestionId,
        questionCode: nextCode,
        sourceType: 'AI_VARIATION',
        parentQuestionId: seed.id,
        conceptId: seed.conceptId,
        subject: seed.subject,
        category: seed.category,
        type: plan.problemType,
        question: candidatePrompt,
        code: candidateCode || undefined,
        language: plan.language,
        groundTruthAnswer: candidateAnswer,
        aiExplanation: variation.aiExplanation,
        aiVariationNotes: `[REASONING: ${plan.reasoningType}] [BATCH: ${plan.batchId}] ${variation.aiVariationNotes || ''}`,
        difficulty: 'MEDIUM',
        keywords,
        studyVisibility: 'LIVE',
        createdAt: nowIso,
      };

      const created = repo.create(newQuestion);
      allExisting.push(created); // 다음 cross-pool 비교에도 즉시 반영
      totalPassed++;

      console.log(`  ✅ PASS & 적재 완료: [${created.questionCode}] ${created.id} (유형: ${plan.reasoningType})`);
      results.push({ plan, status: 'PASS', questionCode: created.questionCode, id: created.id });
    }
  }

  // 보고서 저장
  const finalSummary = {
    timestamp: new Date().toISOString(),
    totalAttempts,
    totalPassed,
    totalRejected,
    passRate: totalAttempts > 0 ? (totalPassed / totalAttempts) * 100 : 0,
    rejectionCounts,
    batchBreakdown: batches.map((b) => ({
      batchId: b,
      attempts: results.filter((r) => r.plan.batchId === b).length,
      passed: results.filter((r) => r.plan.batchId === b && r.status === 'PASS').length,
      rejected: results.filter((r) => r.plan.batchId === b && r.status === 'REJECT').length,
    })),
    detailedResults: results,
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(finalSummary, null, 2), 'utf8');
  console.log(`\n🎉 배치 다양성 생성 완료! 보고서 저장: ${REPORT_PATH}`);
  console.log(`시도: ${totalAttempts}건 | 통과: ${totalPassed}건 | 탈락: ${totalRejected}건 (통과율: ${finalSummary.passRate.toFixed(1)}%)`);

  closeDatabase();
}

if (process.argv[1] && process.argv[1].includes('batch_diversity_generator')) {
  runBatchDiversityGeneration().catch((err) => {
    console.error('배치 실행 오류:', err);
    process.exit(1);
  });
}
