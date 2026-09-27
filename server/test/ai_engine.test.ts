import assert from "node:assert";
import {
  DISCONTINUED_MODEL_REGEX,
  TUTOR_MODELS,
  GENERATOR_MODELS,
  MockAIService,
  getAIService,
  evaluatePromotion,
} from "../src/engine/aiService.js";
import { runMigrations } from "../src/db/migrator.js";
import { closeDatabase, getDatabase } from "../src/db/database.js";
import { QuestionRepository } from "../src/db/repositories/questionRepository.js";
import { ImportBatchRepository } from "../src/db/repositories/importBatchRepository.js";
import { buildApp } from "../src/app.js";
import { Question, normalizeVariationType } from "@jungcheogi/shared";

async function runAIEngineTests() {
  console.log(
    "=== Phase 8: AI 학습 엔진 및 Gemini 3.5/3.8 모델 연동 테스트 시작 ===\n",
  );

  // 1. 모델 정책 및 정규식 검증
  console.log("--- 1. Gemini 모델 지원 정책 및 폐기 모델 필터링 검증 ---");
  assert(
    DISCONTINUED_MODEL_REGEX.test("gemini-1.5-flash"),
    "gemini-1.5-flash는 폐기 모델로 필터링되어야 함",
  );
  assert(
    DISCONTINUED_MODEL_REGEX.test("gemini-1.5-pro"),
    "gemini-1.5-pro는 폐기 모델로 필터링되어야 함",
  );
  assert(
    DISCONTINUED_MODEL_REGEX.test("gemini-2.0-flash"),
    "gemini-2.0-flash는 폐기 모델로 필터링되어야 함",
  );
  assert(
    !DISCONTINUED_MODEL_REGEX.test("gemini-3.5-flash-lite"),
    "gemini-3.5-flash-lite는 정상 지원 모델이어야 함",
  );
  assert(
    !DISCONTINUED_MODEL_REGEX.test("gemini-3.8-flash"),
    "gemini-3.8-flash는 정상 지원 모델이어야 함",
  );

  assert.strictEqual(
    TUTOR_MODELS[0],
    "gemini-3.5-flash-lite",
    "AI 튜터링 최우선 모델은 gemini-3.5-flash-lite 이어야 함",
  );
  assert.strictEqual(
    GENERATOR_MODELS[0],
    "gemini-3.8-flash",
    "변형 문제 고정밀 추론 최우선 모델은 gemini-3.8-flash 이어야 함",
  );
  console.log("OK   Gemini 1.5/2.0 차단 및 3.5/3.8 듀얼 모델 정책 검증 통과");

  // 1-2. 변형 타입 및 별칭(Alias) 하위 호환성 정규화 검증
  assert.strictEqual(
    normalizeVariationType("VALUE_CHANGE"),
    "PARAMETER_VARIATION",
  );
  assert.strictEqual(
    normalizeVariationType("STRUCTURE_SWAP"),
    "CODE_VARIATION",
  );
  assert.strictEqual(
    normalizeVariationType("CONCEPT_EXTENSION"),
    "CONCEPT_VARIATION",
  );
  assert.strictEqual(
    normalizeVariationType("BLANK_REVERSAL"),
    "CODE_VARIATION",
  );
  assert.strictEqual(
    normalizeVariationType("NEGATIVE_CASE"),
    "DIFFICULTY_VARIATION",
  );
  console.log(
    "OK   변형 타입 5대 Canonical 및 UI 별칭(Alias) 호환성 정규화 검증 통과",
  );

  // 1-3. 모델 자동 승격(Promotion) 로직 검증
  const generalTheoryQ: Question = {
    id: "theory_q1",
    subject: "소프트웨어설계",
    category: "디자인패턴",
    type: "SHORT_ANSWER",
    question: "GoF 디자인 패턴 중 생성 패턴 5가지를 쓰시오.",
    groundTruthAnswer:
      "Factory Method, Singleton, Prototype, Builder, Abstract Factory",
    sourceType: "REAL_EXAM",
    difficulty: "MEDIUM",
    keywords: ["GoF", "pattern"],
    createdAt: new Date().toISOString(),
  };

  const normalDecision = evaluatePromotion(generalTheoryQ);
  assert.strictEqual(
    normalDecision.shouldPromote,
    false,
    "일반 이론 문제는 빠른 3.5 모델 유지",
  );
  assert.strictEqual(normalDecision.model, "gemini-3.5-flash-lite");

  const deepDecision = evaluatePromotion(generalTheoryQ, {
    deepAnalysis: true,
  });
  assert.strictEqual(
    deepDecision.shouldPromote,
    true,
    "사용자 심층 분석 요청 시 3.8 승격",
  );
  assert.strictEqual(deepDecision.model, "gemini-3.8-flash");

  const pointerQ: Question = {
    id: "c_pointer_q",
    subject: "프로그래밍언어활용",
    category: "C언어",
    type: "CODE_TRACE",
    question: "다음 C 프로그램의 출력 결과를 쓰시오.",
    code: 'int arr[] = {1, 2, 3};\nint *ptr = arr;\nprintf("%d", *(ptr + 1));',
    language: "C",
    groundTruthAnswer: "2",
    sourceType: "REAL_EXAM",
    difficulty: "MEDIUM",
    keywords: ["pointer"],
    createdAt: new Date().toISOString(),
  };

  const pointerDecision = evaluatePromotion(pointerQ);
  assert.strictEqual(
    pointerDecision.shouldPromote,
    true,
    "C 포인터 연산 문제는 3.8 자동 승격",
  );
  assert.strictEqual(pointerDecision.model, "gemini-3.8-flash");
  console.log(
    "OK   3.5 기본 라우팅 및 3.8 자동 승격(Promotion) 로직 검증 통과",
  );

  // 2. MockAIService 동작 검증
  console.log("\n--- 2. MockAIService 핵심 기능 단위 검증 ---");
  const mockService = new MockAIService();

  const sampleQuestion: Question = {
    id: "test_c_pointer_q1",
    subject: "프로그래밍언어활용",
    category: "C언어",
    subCategory: "포인터 연산",
    type: "SHORT_ANSWER",
    question: "다음 C 프로그램의 실행 결과를 쓰시오.",
    code: '#include <stdio.h>\nint main() {\n  int arr[] = {10, 20, 30};\n  int *p = arr;\n  printf("%d", *(p + 1));\n  return 0;\n}',
    groundTruthAnswer: "20",
    officialExplanation: "p+1은 arr[1]의 주소를 가리키므로 *(p+1)은 20입니다.",
    sourceType: "REAL_EXAM",
    difficulty: "MEDIUM",
    keywords: ["C", "pointer", "array"],
    createdAt: new Date().toISOString(),
  };

  // 2-1. 맞춤 해설 생성
  const explanation = await mockService.generateExplanation({
    question: sampleQuestion,
    userAnswer: "10",
    isCorrect: false,
    isUnknown: false,
  });
  assert(explanation.summary.length > 0, "해설 요약이 존재해야 함");
  assert(explanation.keyPoint.length > 0, "핵심 포인트가 존재해야 함");
  assert(explanation.studyTips.length > 0, "학습 팁이 존재해야 함");
  assert.strictEqual(explanation.source, "MOCK");
  console.log("OK   AI 맞춤 해설 생성 단위 검증 통과");

  // 2-2. 3단계 점진적 힌트 생성
  const hintsResult = await mockService.generateProgressiveHints({
    question: sampleQuestion,
  });
  assert.strictEqual(
    hintsResult.hints.length,
    3,
    "점진적 힌트는 정확히 3단계여야 함",
  );
  assert(
    hintsResult.hints[0].includes("[개념 방향]"),
    "1단계 개념 방향 힌트 포함",
  );
  assert(
    hintsResult.hints[1].includes("[코드 주목]"),
    "2단계 코드 주목 힌트 포함",
  );
  assert(
    hintsResult.hints[2].includes("[해석 가이드]"),
    "3단계 해석 가이드 힌트 포함",
  );
  console.log("OK   3단계 점진적 AI 힌트 생성 단위 검증 통과");

  // 2-3. 코드 라인별 심층 분석 (Line-by-Line Anatomy)
  const lineAnalysis = await mockService.explainCodeLine({
    question: sampleQuestion,
    lineNumber: 5, // printf("%d", *(p + 1));
  });
  assert.strictEqual(lineAnalysis.lineNumber, 5);
  assert(lineAnalysis.code.includes("printf"));
  assert(lineAnalysis.syntaxElements.length > 0, "문법 요소 추출 확인");
  assert(lineAnalysis.runtimeMeaning.length > 0, "런타임 실행 의미 확인");
  assert(lineAnalysis.examTip.length > 0, "기출 팁 확인");
  console.log("OK   코드 라인별 심층 분석 단위 검증 통과");

  // 2-4. AI 변형 문제 생성
  const variation = await mockService.generateVariation({
    question: sampleQuestion,
    variationType: "PARAMETER_VARIATION",
  });
  assert(variation.sourceQuestionId === sampleQuestion.id);
  assert.strictEqual(variation.variationType, "PARAMETER_VARIATION");
  assert(variation.prompt.length > 0);
  console.log("OK   AI 변형 문제 생성 단위 검증 통과");

  // 3. Fastify 엔드포인트 통합 테스트
  console.log("\n--- 3. Fastify AI API 라우트 통합 검증 ---");
  runMigrations();
  const db = getDatabase();
  const questionRepo = new QuestionRepository();

  // 테스트 문제 시드 확인 또는 등록
  let targetQ = questionRepo.findById("test_c_pointer_q1");
  if (!targetQ) {
    questionRepo.create(sampleQuestion);
    targetQ = questionRepo.findById("test_c_pointer_q1");
  }
  assert(targetQ !== null, "테스트 문제가 DB에 존재해야 함");

  const app = buildApp();

  // 3-1. POST /api/ai/explanation
  const resExp = await app.inject({
    method: "POST",
    url: "/api/ai/explanation",
    payload: {
      questionId: "test_c_pointer_q1",
      userAnswer: "30",
      isCorrect: false,
      isUnknown: false,
    },
  });
  assert.strictEqual(resExp.statusCode, 200, "/api/ai/explanation 200 반환");
  const expBody = JSON.parse(resExp.body);
  assert(expBody.summary, "summary 필드 반환");
  assert(expBody.keyPoint, "keyPoint 필드 반환");
  console.log("OK   POST /api/ai/explanation 엔드포인트 통과");

  // 3-2. POST /api/ai/hints
  const resHints = await app.inject({
    method: "POST",
    url: "/api/ai/hints",
    payload: {
      questionId: "test_c_pointer_q1",
    },
  });
  assert.strictEqual(resHints.statusCode, 200, "/api/ai/hints 200 반환");
  const hintsBody = JSON.parse(resHints.body);
  assert.strictEqual(hintsBody.hints.length, 3, "3단계 힌트 반환");
  console.log("OK   POST /api/ai/hints 엔드포인트 통과");

  // 3-3. POST /api/ai/code-line
  const resCodeLine = await app.inject({
    method: "POST",
    url: "/api/ai/code-line",
    payload: {
      questionId: "test_c_pointer_q1",
      lineNumber: 5,
    },
  });
  assert.strictEqual(resCodeLine.statusCode, 200, "/api/ai/code-line 200 반환");
  const lineBody = JSON.parse(resCodeLine.body);
  assert.strictEqual(lineBody.lineNumber, 5);
  assert(lineBody.runtimeMeaning, "runtimeMeaning 반환");
  console.log("OK   POST /api/ai/code-line 엔드포인트 통과");

  // 3-4. POST /api/ai/variation (Staging 적재 연동)
  const countBefore = (
    db
      .prepare(
        "SELECT COUNT(*) as c FROM staged_questions WHERE review_status = 'PENDING'",
      )
      .get() as { c: number }
  ).c;
  const resVar = await app.inject({
    method: "POST",
    url: "/api/ai/variation",
    payload: {
      parentQuestionId: "test_c_pointer_q1",
      variationType: "PARAMETER_VARIATION",
      instructions: "배열 크기를 5로 늘리고 두 번째 원소를 참조하도록 변경",
    },
  });
  assert.strictEqual(resVar.statusCode, 201, "/api/ai/variation 201 생성 반환");
  const varBody = JSON.parse(resVar.body);
  assert(varBody.batchId, "batchId 발급");
  assert(varBody.stagedQuestionId, "stagedQuestionId 발급");
  assert.strictEqual(varBody.variation.sourceQuestionId, "test_c_pointer_q1");

  const countAfter = (
    db
      .prepare(
        "SELECT COUNT(*) as c FROM staged_questions WHERE review_status = 'PENDING'",
      )
      .get() as { c: number }
  ).c;
  assert.strictEqual(
    countAfter,
    countBefore + 1,
    "Staging PENDING 목록에 1건 적재되어야 함",
  );
  console.log("OK   POST /api/ai/variation 엔드포인트 및 Staging 연동 통과");

  // 3-5. 예외 처리 테스트 (잘못된 요청 파라미터)
  const res400 = await app.inject({
    method: "POST",
    url: "/api/ai/explanation",
    payload: {},
  });
  assert.strictEqual(res400.statusCode, 400, "questionId 누락 시 400 에러");

  const res404 = await app.inject({
    method: "POST",
    url: "/api/ai/explanation",
    payload: { questionId: "non_existent_id" },
  });
  assert.strictEqual(res404.statusCode, 404, "존재하지 않는 문제 시 404 에러");
  console.log("OK   예외 상황(400, 404) 방어 검증 통과");

  await app.close();
  closeDatabase();

  console.log(
    "\n🎉 Phase 8 AI 학습 엔진 및 Gemini 3.5/3.8 모델 연동 전체 검증 통과!",
  );
}

runAIEngineTests().catch((err) => {
  console.error("FAIL: 테스트 실행 중 오류 발생:", err);
  process.exit(1);
});
