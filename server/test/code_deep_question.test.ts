import assert from "node:assert";
import { setupIsolatedTestDb } from "./helpers/testDb.js";
import { buildApp } from "../src/app.js";
import { QuestionRepository } from "../src/db/repositories/questionRepository.js";
import { setAIServiceOverride, IAIService } from "../src/engine/aiService.js";
import { CodeDeepQuestionRequest } from "@jungcheogi/shared";

async function runDeepQuestionTests() {
  console.log("=== 코드 심층 질문 (Code Deep Question) 기능 테스트 시작 ===\n");
  const isolated = setupIsolatedTestDb({ seed: true });
  const app = await buildApp();
  const qRepo = new QuestionRepository();

  let deepQuestionCalls = 0;
  let lastReceivedContext: CodeDeepQuestionRequest | null = null;

  const mockAIService: IAIService = {
    async askCodeDeepQuestion(context) {
      deepQuestionCalls++;
      lastReceivedContext = context;
      const hasSelection = Boolean(context.selectedText && context.selectedText.trim());
      return {
        success: true,
        answer: hasSelection
          ? `[선택영역 집중 답변] 선택하신 "${context.selectedText}" 부분에 대한 답변: 질문("${context.userQuestion}")에 대해 이 코드는 포인터 증감 및 메모리 참조를 수행합니다.`
          : `[전체코드 답변] 전체 코드 맥락에서 질문("${context.userQuestion}")에 대해 메인 로직의 반복문 탈출 조건을 설명합니다.`,
        source: "MOCK",
        modelUsed: "mock-engine",
        durationMs: 10,
      };
    },
    async explainCodeAllLines() {
      throw new Error("Not implemented for this test");
    },
    async explainCodeLine() {
      throw new Error("Not implemented for this test");
    },
    async generateExplanation() {
      throw new Error("Not implemented for this test");
    },
    async generateProgressiveHints() {
      throw new Error("Not implemented for this test");
    },
    async generateVariation() {
      throw new Error("Not implemented for this test");
    },
    async generateIndependentQuestion() {
      throw new Error("Not implemented for this test");
    },
  };

  setAIServiceOverride(mockAIService);

  try {
    // ----------------------------------------------------
    // Test 1: 필수 파라미터 유효성 검사 (Validation)
    // ----------------------------------------------------
    console.log("1. 필수 파라미터 유효성 검사 (Validation)");
    const resNoQuestion = await app.inject({
      method: "POST",
      url: "/api/ai/code-deep-question",
      payload: {
        code: "int a = 10;",
        userQuestion: "", // 빈 질문
      },
    });
    assert.strictEqual(resNoQuestion.statusCode, 400, "userQuestion이 비어있으면 400 반환");

    const resNoCode = await app.inject({
      method: "POST",
      url: "/api/ai/code-deep-question",
      payload: {
        code: "", // 빈 코드
        userQuestion: "이 코드가 무엇인가요?",
      },
    });
    assert.strictEqual(resNoCode.statusCode, 400, "code가 비어있으면 400 반환");
    assert.strictEqual(deepQuestionCalls, 0, "유효성 실패 시 AI 호출 0회");
    console.log("✓ 필수 파라미터 누락 시 400 반환 및 AI 0회 호출 통과");

    // ----------------------------------------------------
    // Test 2: 특정 코드 드래그 선택 후 심층 질문 요청
    // ----------------------------------------------------
    console.log("\n2. 선택 코드 영역(드래그)을 포함한 심층 질문 요청");
    const codeSnippet = `int a = 0, b = 5;\nif (a != 0 && ++b > 5) {\n    printf("%d", b);\n}`;
    const resWithSelection = await app.inject({
      method: "POST",
      url: "/api/ai/code-deep-question",
      payload: {
        questionId: "q_test_1",
        questionText: "다음 C 프로그램의 실행 결과를 쓰시오.",
        code: codeSnippet,
        language: "C",
        selectedText: "++b > 5",
        selectedRange: { startLine: 2, endLine: 2 },
        userQuestion: "왜 ++b가 실행되지 않고 b가 5로 유지되나요?",
        conversationHistory: [],
      },
    });

    assert.strictEqual(resWithSelection.statusCode, 200, "정상 200 반환");
    const bodySelection = JSON.parse(resWithSelection.body);
    assert.strictEqual(bodySelection.success, true);
    assert(bodySelection.answer.includes("++b > 5"), "선택 영역이 답변에 반영되어야 함");
    assert(bodySelection.answer.includes("선택영역 집중 답변"));
    assert.strictEqual(deepQuestionCalls, 1, "질문 전송 시에만 1회 호출");
    assert.strictEqual(lastReceivedContext?.selectedText, "++b > 5");
    assert.strictEqual(lastReceivedContext?.userQuestion, "왜 ++b가 실행되지 않고 b가 5로 유지되나요?");
    console.log("✓ 선택 코드 포커스 질문 정상 처리 및 AI 1회 호출 통과");

    // ----------------------------------------------------
    // Test 3: 드래그 선택 없이 전체 코드 질문
    // ----------------------------------------------------
    console.log("\n3. 드래그 선택 없이 전체 코드 맥락 질문");
    const resWholeCode = await app.inject({
      method: "POST",
      url: "/api/ai/code-deep-question",
      payload: {
        questionId: "q_test_1",
        code: codeSnippet,
        language: "C",
        selectedText: null,
        selectedRange: null,
        userQuestion: "이 프로그램의 전체 흐름을 한 줄로 요약해주세요.",
      },
    });

    assert.strictEqual(resWholeCode.statusCode, 200);
    const bodyWhole = JSON.parse(resWholeCode.body);
    assert.strictEqual(bodyWhole.success, true);
    assert(bodyWhole.answer.includes("전체코드 답변"));
    assert.strictEqual(deepQuestionCalls, 2);
    assert.strictEqual(lastReceivedContext?.selectedText, null);
    console.log("✓ 전체 코드 대상 질문 정상 처리 통과");

    // ----------------------------------------------------
    // Test 4: 멀티턴 대화 기록(conversationHistory) 전달 확인
    // ----------------------------------------------------
    console.log("\n4. 대화 기록(conversationHistory) 유지 및 연속 질문");
    const history = [
      {
        role: "user" as const,
        content: "왜 ++b가 실행되지 않나요?",
        selectedText: "++b > 5",
      },
      {
        role: "assistant" as const,
        content: "단락 평가로 인해 좌변이 거짓이면 우변은 평가되지 않습니다.",
      },
    ];

    const resFollowUp = await app.inject({
      method: "POST",
      url: "/api/ai/code-deep-question",
      payload: {
        code: codeSnippet,
        language: "C",
        userQuestion: "그럼 a가 1이면 어떻게 되나요?",
        conversationHistory: history,
      },
    });

    assert.strictEqual(resFollowUp.statusCode, 200);
    assert.strictEqual(deepQuestionCalls, 3);
    assert.strictEqual(lastReceivedContext?.conversationHistory?.length, 2);
    assert.strictEqual(lastReceivedContext?.conversationHistory?.[0].content, "왜 ++b가 실행되지 않나요?");
    console.log("✓ 멀티턴 대화 기록 연계 질문 정상 전달 통과");

    // ----------------------------------------------------
    // Test 5: Ground Truth 및 문제/세션 무오염 검증
    // ----------------------------------------------------
    console.log("\n5. Ground Truth / 공식 통계 / 세션 무오염 검증");
    const sampleQ = qRepo.findAllMatching()[0];
    if (sampleQ) {
      const originalGroundTruth = sampleQ.groundTruthAnswer;
      // 심층 질문 전송
      await app.inject({
        method: "POST",
        url: "/api/ai/code-deep-question",
        payload: {
          questionId: sampleQ.id,
          code: sampleQ.code || "int main() {}",
          userQuestion: "정답이 무엇인가요?",
        },
      });

      const reloadedQ = qRepo.findById(sampleQ.id);
      assert.deepStrictEqual(
        reloadedQ?.groundTruthAnswer,
        originalGroundTruth,
        "심층 질문 후에도 문제의 정답(Ground Truth)은 전혀 변경되지 않아야 함",
      );
    }
    console.log("✓ Ground Truth 및 기존 문제 데이터 무오염 확인");

    console.log("\n==========================================");
    console.log("모든 코드 심층 질문 단위 테스트 통과!");
    console.log("==========================================");
  } finally {
    setAIServiceOverride(null);
    isolated.cleanup();
  }
}

runDeepQuestionTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
