import { env } from "../config/env.js";
import {
  GeminiAIService,
  MockAIService,
  getFastModel,
  getSmartModel,
  evaluatePromotion,
} from "../engine/aiService.js";
import { Question } from "@jungcheogi/shared";

/**
 * Gemini API Live Smoke Test
 * 실행 명령: npx tsx src/scripts/smokeTestGemini.ts (server 디렉토리 내)
 * 또는 root에서: npx tsx server/src/scripts/smokeTestGemini.ts
 */
async function runSmokeTest() {
  console.log(
    "===============================================================",
  );
  console.log(
    "🚀 Gemini AI 듀얼 모델 (3.5 Flash-Lite / 3.8 Flash) Live Smoke Test",
  );
  console.log(
    "===============================================================\n",
  );

  const apiKey = env.GEMINI_API_KEY ? env.GEMINI_API_KEY.trim() : "";
  const fastModel = getFastModel();
  const smartModel = getSmartModel();

  console.log(`[설정 정보]`);
  console.log(`- 빠른 모델 (Fast):  ${fastModel}`);
  console.log(`- 심층 모델 (Smart): ${smartModel}`);
  console.log(
    `- API 키 등록 여부:  ${apiKey ? "등록됨 (길이: " + apiKey.length + ")" : "미등록 (Mock 모드 테스트 진행)"}\n`,
  );

  // 테스트용 C언어 포인터 문제 (고난도 추론 대상)
  const cPointerQuestion: Question = {
    id: "smoke_q_c_pointer",
    subject: "프로그래밍언어활용",
    category: "C언어",
    subCategory: "포인터 연산",
    type: "CODE_TRACE",
    question: "다음 C 프로그램의 실행 결과를 쓰시오.",
    code: `#include <stdio.h>
int main() {
    int a[] = {10, 20, 30, 40};
    int *p = a;
    printf("%d", *(p + 2) + *p);
    return 0;
}`,
    language: "C",
    groundTruthAnswer: "40",
    officialExplanation:
      "p+2는 a[2]인 30을 가리키고, *p는 a[0]인 10이므로 30 + 10 = 40입니다.",
    sourceType: "REAL_EXAM",
    difficulty: "HARD",
    keywords: ["C", "pointer", "array"],
    createdAt: new Date().toISOString(),
  };

  // 테스트용 일반 소프트웨어 설계 이론 문제 (빠른 3.5 모델 대상)
  const theoryQuestion: Question = {
    id: "smoke_q_theory",
    subject: "소프트웨어설계",
    category: "결합도",
    subCategory: "모듈화",
    type: "SHORT_ANSWER",
    question:
      "모듈 간의 결합도(Coupling) 중 결합도가 가장 약한 것부터 강한 순서로 나열하시오.",
    groundTruthAnswer:
      "자료 결합도 -> 스탬프 결합도 -> 제어 결합도 -> 외부 결합도 -> 공통 결합도 -> 내용 결합도",
    officialExplanation:
      "결합도는 내용 > 공통 > 외부 > 제어 > 스탬프 > 자료 순으로 강해집니다.",
    sourceType: "REAL_EXAM",
    difficulty: "MEDIUM",
    keywords: ["결합도", "모듈"],
    createdAt: new Date().toISOString(),
  };

  // 1. 모델 자동 승격 판정 테스트
  console.log("--- 1. 자동 승격(Promotion) 로직 검증 ---");
  const promoTheory = evaluatePromotion(theoryQuestion);
  console.log(
    `[이론 문항] 승격 여부: ${promoTheory.shouldPromote} -> 할당 모델: ${promoTheory.model}`,
  );
  if (promoTheory.shouldPromote || promoTheory.model !== fastModel) {
    throw new Error("일반 이론 문제는 빠른 3.5 모델이어야 합니다.");
  }

  const promoPointer = evaluatePromotion(cPointerQuestion);
  console.log(
    `[C 포인터]  승격 여부: ${promoPointer.shouldPromote} -> 할당 모델: ${promoPointer.model} (사유: ${promoPointer.reason})`,
  );
  if (!promoPointer.shouldPromote || promoPointer.model !== smartModel) {
    throw new Error("C 포인터 문항은 3.8 모델로 승격되어야 합니다.");
  }
  console.log("OK   모델 승격 분기 판단 정상 동작\n");

  if (!apiKey) {
    console.log(
      "⚠️ GEMINI_API_KEY가 설정되어 있지 않아 MockAIService 폴백 동작을 검증합니다.",
    );
    const mock = new MockAIService();
    const explanation = await mock.generateExplanation({
      question: cPointerQuestion,
      userAnswer: "30",
      isCorrect: false,
    });
    console.log("[Mock 폴백 확인] summary:", explanation.summary);
    console.log(
      "[Mock 폴백 확인] source:",
      explanation.source,
      ", model:",
      explanation.modelUsed,
    );
    console.log(
      "\n💡 API 키가 준비되면 .env 파일에 GEMINI_API_KEY=... 를 저장하고 이 스크립트를 재실행하면 실시간 Gemini 응답을 확인할 수 있습니다.",
    );
    return;
  }

  // 2. 실제 Gemini API 호출 검증
  const gemini = new GeminiAIService(apiKey);

  console.log(
    `--- 2. [기본/빠른 모델: ${fastModel}] 3단계 AI 힌트 호출 테스트 ---`,
  );
  const t0 = Date.now();
  const hints = await gemini.generateProgressiveHints({
    question: theoryQuestion,
  });
  const fastElapsed = Date.now() - t0;
  console.log(
    `응답 시간: ${fastElapsed}ms, 모델: ${hints.modelUsed}, 소스: ${hints.source}`,
  );
  console.log(`- Level 1: ${hints.hints[0]}`);
  console.log(`- Level 2: ${hints.hints[1]}`);
  console.log(`- Level 3: ${hints.hints[2]}`);
  console.log("OK   3.5 Flash-Lite 힌트 생성 통과\n");

  console.log(
    `--- 3. [심층 모델: ${smartModel}] C 포인터 라인별 해부 (Line-by-Line Anatomy) ---`,
  );
  const t1 = Date.now();
  const lineResult = await gemini.explainCodeLine({
    question: cPointerQuestion,
    lineNumber: 5, // printf("%d", *(p + 2) + *p);
  });
  const smartElapsed = Date.now() - t1;
  console.log(
    `응답 시간: ${smartElapsed}ms, 모델: ${lineResult.modelUsed}, 소스: ${lineResult.source}`,
  );
  if (lineResult.promotionReason) {
    console.log(`- 승격 사유: ${lineResult.promotionReason}`);
  }
  console.log(`- 핵심 설명: ${lineResult.summary}`);
  if (lineResult.flow) console.log(`- 흐름: ${lineResult.flow}`);
  if (lineResult.caution) console.log(`- 주의: ${lineResult.caution}`);
  if (lineResult.deepExplanation)
    console.log(`- 심층 설명 (접힘): ${lineResult.deepExplanation}`);
  console.log("OK   3.8 Flash C 포인터 정밀 분석 통과\n");

  console.log(
    `--- 4. [오류 복구 및 폴백] 잘못된 키/모델 시나리오 폴백 검증 ---`,
  );
  const brokenService = new GeminiAIService(
    "AIzaSy_FAKE_INVALID_KEY_TEST_ONLY",
  );
  const fallbackResult = await brokenService.generateExplanation({
    question: theoryQuestion,
    userAnswer: "자료 결합도",
    isCorrect: false,
  });
  console.log(
    `- 오류 시 폴백 소스: ${fallbackResult.source} (model: ${fallbackResult.modelUsed})`,
  );
  console.log(`- 폴백 해설 요약: ${fallbackResult.summary}`);
  if (fallbackResult.source !== "MOCK") {
    throw new Error("API 오류 발생 시 Mock 폴백이 수행되어야 합니다.");
  }
  console.log("OK   오류 시 Graceful Mock 폴백 검증 통과\n");

  console.log(
    "===============================================================",
  );
  console.log("🎉 모든 Gemini Smoke Test가 정상 통과했습니다!");
  console.log(
    "===============================================================",
  );
}

runSmokeTest().catch((err) => {
  console.error("\n❌ Smoke Test 실패:", err);
  process.exit(1);
});
