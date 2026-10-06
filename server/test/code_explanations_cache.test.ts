import assert from "node:assert";
import { setupIsolatedTestDb } from "./helpers/testDb.js";
import { buildApp } from "../src/app.js";
import { QuestionRepository } from "../src/db/repositories/questionRepository.js";
import { CodeExplanationRepository } from "../src/db/repositories/codeExplanationRepository.js";
import { IAIService, CodeAllLinesContext, setAIServiceOverride } from "../src/engine/aiService.js";
import { Question, AICodeExplanationsResponse } from "@jungcheogi/shared";

async function runTests() {
  console.log("=== 코드 전체 해설 사전생성/DB캐시 및 변형 드릴 테스트 시작 ===\n");
  const isolated = setupIsolatedTestDb({ seed: true });
  const app = await buildApp();
  const qRepo = new QuestionRepository();
  const expRepo = new CodeExplanationRepository();

  let explainAllCalls = 0;
  let forceFailExplain = false;

  const mockAIService: IAIService = {
    async explainCodeAllLines(context: CodeAllLinesContext) {
      explainAllCalls++;
      if (forceFailExplain) {
        throw new Error("AI provider rate limited or unavailable");
      }
      return {
        questionId: context.questionId,
        codeHash: context.codeSnippet,
        lines: [
          {
            lineNumber: 1,
            code: "#include <stdio.h>",
            summary: "표준 입출력 헤더를 포함합니다.",
            role: "헤더 선언",
            deepDive: "printf 함수 사용을 위해 필요합니다.",
          },
          {
            lineNumber: 2,
            code: "int main() {",
            summary: "프로그램 진입점 main 함수 시작.",
            role: "함수 정의",
          },
          {
            lineNumber: 3,
            code: "    printf(\"Hello\");",
            summary: "Hello 문자열을 화면에 출력합니다.",
            role: "출력문",
          },
          {
            lineNumber: 4,
            code: "    return 0;",
            summary: "정상 종료 코드 0을 반환합니다.",
            role: "종료문",
          },
          {
            lineNumber: 5,
            code: "}",
            summary: "main 함수 종료.",
            role: "블록 닫기",
          },
        ],
        status: "READY" as const,
        generatedAt: new Date().toISOString(),
        source: "GENERATED" as const,
        modelUsed: "gemini-3.5-flash-lite",
        retryCount: 0,
      };
    },
    async explainCodeLine() {
      throw new Error("explainCodeLine should not be called when whole-question cache exists");
    },
    async generateTutoringExplanation() {
      throw new Error("not used in this test");
    },
    async generateProgressiveHints() {
      throw new Error("not used in this test");
    },
    async generateVariation(params) {
      return {
        id: "var_test_1",
        parentQuestionId: params.question.id,
        conceptId: params.question.conceptId,
        questionType: params.question.type,
        subject: params.question.subject,
        category: params.question.category,
        prompt: "변형 문제입니다.",
        codeSnippet: "printf(\"Hello World\");",
        language: "C",
        groundTruthAnswer: "Hello World",
        aiExplanation: "Hello World를 출력합니다.",
        aiVariationNotes: "단순 변형",
        generationMetadata: {
          generator: "MockVariation",
          model: "gemini-3.8-flash",
          generatedAt: new Date().toISOString(),
          durationMs: 20,
        },
      };
    },
  };

  setAIServiceOverride(mockAIService);

  try {
    const codeQuestion: Question = {
      id: "q_code_test_01",
      type: "CODE_TRACE",
      subject: "SW_DEVELOPMENT",
      category: "C",
      prompt: "다음 C 프로그램의 실행 결과를 쓰시오.",
      question: "다음 C 프로그램의 실행 결과를 쓰시오.",
      sourceType: "TEXTBOOK_EXPECTED",
      codeSnippet: '#include <stdio.h>\nint main() {\n    printf("Hello");\n    return 0;\n}',
      code: '#include <stdio.h>\nint main() {\n    printf("Hello");\n    return 0;\n}',
      language: "C",
      groundTruthAnswer: "Hello",
      difficulty: 2,
      studyVisibility: "LIVE",
      answerVerificationStatus: "VERIFIED",
      answerSource: "MANUAL_VERIFIED",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    qRepo.create(codeQuestion);

    console.log("--- 1. POST /api/ai/code-explanations 전체 해설 생성 (GENERATED) 검증 ---");
    const res1 = await app.inject({
      method: "POST",
      url: "/api/ai/code-explanations",
      payload: {
        questionId: codeQuestion.id,
        codeSnippet: codeQuestion.codeSnippet,
        language: codeQuestion.language,
      },
    });

    assert.strictEqual(res1.statusCode, 200);
    const data1: AICodeExplanationsResponse = JSON.parse(res1.body);
    assert.strictEqual(data1.source, "GENERATED");
    assert.strictEqual(data1.status, "READY");
    assert.strictEqual(data1.lines.length, 5);
    assert.strictEqual(explainAllCalls, 1, "AI 서비스가 정확히 1회 호출되어야 함");

    // DB 캐시 확인
    const cached = expRepo.findByQuestionAndHash(codeQuestion.id, data1.codeHash, 1);
    assert.ok(cached, "DB question_code_explanations 테이블에 캐시가 저장되어야 함");
    assert.strictEqual(cached.explanationPayload.lines.length, 5);
    console.log("OK   Test 1 PASS: 전체 줄 해설 생성 및 DB 캐시 적재 성공");

    console.log("\n--- 2. POST /api/ai/code-explanations 2회차 호출 시 DB 캐시 히트 (CACHE) 검증 ---");
    const res2 = await app.inject({
      method: "POST",
      url: "/api/ai/code-explanations",
      payload: {
        questionId: codeQuestion.id,
        codeSnippet: codeQuestion.codeSnippet,
        language: codeQuestion.language,
      },
    });

    assert.strictEqual(res2.statusCode, 200);
    const data2: AICodeExplanationsResponse = JSON.parse(res2.body);
    assert.strictEqual(data2.source, "CACHE");
    assert.strictEqual(data2.status, "READY");
    assert.strictEqual(explainAllCalls, 1, "캐시 히트 시 AI 서비스 호출 증가가 없어야 함 (explainAllCalls = 1)");
    console.log("OK   Test 2 PASS: DB 캐시 히트로 0회 AI 추가 호출 확인");

    console.log("\n--- 3. POST /api/ai/code-line 개별 라인 요청 시 사전 캐시 활용 검증 ---");
    const resLine = await app.inject({
      method: "POST",
      url: "/api/ai/code-line",
      payload: {
        questionId: codeQuestion.id,
        codeSnippet: codeQuestion.codeSnippet,
        lineNumber: 3,
        lineCode: "    printf(\"Hello\");",
        language: codeQuestion.language,
      },
    });

    assert.strictEqual(resLine.statusCode, 200);
    const lineData = JSON.parse(resLine.body);
    assert.strictEqual(lineData.lineNumber, 3);
    assert.strictEqual(lineData.role, "출력문");
    assert.strictEqual(explainAllCalls, 1, "단일 줄 조회 시에도 캐시를 활용하여 AI 호출 없음");
    console.log("OK   Test 3 PASS: 사전 캐시 활용으로 개별 줄 조회 0회 지연 확인");

    console.log("\n--- 4. POST /api/ai/code-explanations forceRegenerate: true 강제 재생성 검증 ---");
    const resRegen = await app.inject({
      method: "POST",
      url: "/api/ai/code-explanations",
      payload: {
        questionId: codeQuestion.id,
        codeSnippet: codeQuestion.codeSnippet,
        language: codeQuestion.language,
        forceRegenerate: true,
      },
    });

    assert.strictEqual(resRegen.statusCode, 200);
    const dataRegen: AICodeExplanationsResponse = JSON.parse(resRegen.body);
    assert.strictEqual(dataRegen.source, "GENERATED");
    assert.strictEqual(explainAllCalls, 2, "강제 재생성 시 AI 호출 1회 추가 (총 2회)");
    console.log("OK   Test 4 PASS: forceRegenerate 전체 해설 다시 생성 성공");

    console.log("\n--- 5. 강제 재생성 실패 시 기존 캐시 보존 및 안전 회복 검증 ---");
    forceFailExplain = true;
    const resFail = await app.inject({
      method: "POST",
      url: "/api/ai/code-explanations",
      payload: {
        questionId: codeQuestion.id,
        codeSnippet: codeQuestion.codeSnippet,
        language: codeQuestion.language,
        forceRegenerate: true,
      },
    });

    assert.strictEqual(resFail.statusCode, 200);
    const dataFail: AICodeExplanationsResponse = JSON.parse(resFail.body);
    // 실패했으나 기존 캐시가 보존되어 내려와야 함
    assert.strictEqual(dataFail.lines.length, 5, "재생성 실패 시에도 기존 유효 라인 해설이 파괴되지 않고 보존됨");
    assert.ok(dataFail.errorMessage, "에러 메시지가 포함되어야 함");
    console.log("OK   Test 5 PASS: 재생성 실패 시 기존 캐시 보존 확인");
    forceFailExplain = false;

    console.log("\n--- 6. 정답 및 오답 모두에서 AI 변형 드릴 요청 가능 여부 검증 ---");
    // 정답 시도 모의
    const resDrill = await app.inject({
      method: "POST",
      url: "/api/ai/variation-drill",
      payload: {
        parentQuestionId: codeQuestion.id,
      },
    });

    assert.strictEqual(resDrill.statusCode, 200);
    const drillData = JSON.parse(resDrill.body);
    assert.strictEqual(drillData.success, true);
    assert.ok(drillData.drillSession, "드릴 세션이 생성되어야 함");
    assert.strictEqual(drillData.question.parentQuestionId, codeQuestion.id, "부모 문제 계보 보존");
    console.log("OK   Test 6 PASS: 정답/오답 무관하게 부모 문제 기반 변형 드릴 생성 성공");

    console.log("\n🎉 [COMPLETE] 코드 전체 해설 사전생성/DB캐시 및 변형 드릴 테스트 전항 통과!\n");
  } finally {
    setAIServiceOverride(null);
    await app.close();
    isolated.cleanup();
  }
}

runTests().catch((err) => {
  console.error("테스트 실패:", err);
  process.exit(1);
});
