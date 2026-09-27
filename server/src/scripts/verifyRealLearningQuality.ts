import { getDatabase } from "../db/database.js";
import { QuestionRepository } from "../db/repositories/questionRepository.js";
import { ConceptRepository } from "../db/repositories/conceptRepository.js";
import {
  GeminiAIService,
  evaluatePromotion,
  getFastModel,
  getSmartModel,
} from "../engine/aiService.js";
import { env } from "../config/env.js";

async function verifyRealQuality() {
  console.log(
    "================================================================",
  );
  console.log("🎯 정보처리기사 실기 실제 기출 문항 AI 학습 품질 실측 검증");
  console.log(
    "================================================================\n",
  );

  const apiKey = env.GEMINI_API_KEY.trim();
  if (!apiKey) {
    console.error("❌ GEMINI_API_KEY가 없습니다.");
    process.exit(1);
  }

  const aiService = new GeminiAIService(apiKey);
  const qRepo = new QuestionRepository();
  const cRepo = new ConceptRepository();

  // 1. [일반 이론 문항] - 디자인 패턴 / ACID
  console.log(
    "================================================================",
  );
  console.log("Case 1. 일반 이론 문제: 3단계 점진적 힌트 & 오답 해설");
  console.log(
    "================================================================",
  );
  const theoryQ =
    qRepo.findById("q_2020_02_02") || qRepo.findById("q_2020_01_01");
  if (!theoryQ) {
    throw new Error("이론 문제 q_2020_02_02를 찾을 수 없습니다.");
  }

  console.log(`[문제 ID: ${theoryQ.id}] ${theoryQ.question}`);
  console.log(`[공식 정답] ${JSON.stringify(theoryQ.groundTruthAnswer)}`);
  console.log(`[공식 해설] ${theoryQ.officialExplanation}\n`);

  // 1-1. 3단계 힌트 실측
  console.log("--- 1-1. 3단계 힌트 생성 (Active Recall) ---");
  const tHintStart = Date.now();
  const hintRes = await aiService.generateProgressiveHints({
    question: theoryQ,
  });
  const hintElapsed = Date.now() - tHintStart;
  console.log(
    `모델: ${hintRes.modelUsed} | 소스: ${hintRes.source} | 지연시간: ${hintElapsed}ms`,
  );
  console.log(`• Level 1 (개념 방향): ${hintRes.hints[0]}`);
  console.log(`• Level 2 (주목할 조건): ${hintRes.hints[1]}`);
  console.log(`• Level 3 (해석 가이드): ${hintRes.hints[2]}`);

  // Level 3 정답 누설 여부 검증
  const gtStr = Array.isArray(theoryQ.groundTruthAnswer)
    ? theoryQ.groundTruthAnswer.join(" ")
    : String(theoryQ.groundTruthAnswer);
  const words = gtStr.split(/[\s,]+/);
  const leaked =
    words.length > 2 && words.every((w) => hintRes.hints[2].includes(w));
  console.log(
    `[Level 3 정답 직접 노출 여부]: ${leaked ? "❌ 정답 노출됨" : "✅ 정답 미노출 (학생 유도 성공)"}\n`,
  );

  // 1-2. 일반 오답 해설 실측
  console.log("--- 1-2. 오답 해설 생성 ---");
  const tExpStart = Date.now();
  const expRes = await aiService.generateExplanation({
    question: theoryQ,
    userAnswer: "원자성, 일관성, 지속성, 가용성", // 고립성 대신 가용성을 잘못 적은 케이스
    isCorrect: false,
    isUnknown: false,
  });
  const expElapsed = Date.now() - tExpStart;
  console.log(
    `모델: ${expRes.modelUsed} | 소스: ${expRes.source} | 지연시간: ${expElapsed}ms`,
  );
  console.log(`• 요약: ${expRes.summary}`);
  console.log(`• 정답 성립 원리: ${expRes.keyPoint}`);
  console.log(`• 오답 진단: ${expRes.whyWrong}`);
  console.log(`• 시험장 함정: ${expRes.pitfalls}`);
  console.log(`• 암기 팁: ${expRes.studyTips}\n`);

  // 2. [복잡한 C 언어 코드 문제] - C 포인터/배열/주소 연산
  console.log(
    "================================================================",
  );
  console.log("Case 2. 복잡한 C 코드 문제: 자동 승격(3.8 Flash) & 라인별 해부");
  console.log(
    "================================================================",
  );
  const cQuestion =
    qRepo.findById("q_2025_01_05") || qRepo.findById("test_c_pointer_q1");
  if (!cQuestion) {
    throw new Error("C 코드 문제를 찾을 수 없습니다.");
  }

  console.log(`[문제 ID: ${cQuestion.id}] ${cQuestion.question}`);
  console.log(`[코드]\n${cQuestion.code}`);
  console.log(`[공식 정답] ${JSON.stringify(cQuestion.groundTruthAnswer)}`);
  console.log(`[공식 해설] ${cQuestion.officialExplanation}\n`);

  // 2-1. 모델 승격 판단 확인
  const promoCheck = evaluatePromotion(cQuestion);
  console.log(
    `[승격 평가] shouldPromote: ${promoCheck.shouldPromote} | 모델: ${promoCheck.model} | 사유: ${promoCheck.reason}`,
  );

  // 2-2. C 코드 해설 실측
  console.log("--- 2-2. 복잡한 C 코드 해설 생성 ---");
  const tCExpStart = Date.now();
  const cExpRes = await aiService.generateExplanation({
    question: cQuestion,
    userAnswer: "10", // 오답 제출
    isCorrect: false,
    isUnknown: false,
  });
  const cExpElapsed = Date.now() - tCExpStart;
  console.log(
    `모델: ${cExpRes.modelUsed} | 지연시간: ${cExpElapsed}ms | 승격사유: ${cExpRes.promotionReason || "기본"}`,
  );
  console.log(`• 요약: ${cExpRes.summary}`);
  console.log(`• 정답 성립 원리: ${cExpRes.keyPoint}`);
  console.log(`• 코드 실행 추적: \n${cExpRes.codeTrace}`);
  console.log(`• 시험장 함정: ${cExpRes.pitfalls}\n`);

  // 2-3. 코드 라인별 심층 해부 (Line-by-Line Anatomy)
  console.log("--- 2-3. C 코드 핵심 라인 해부 (Line-by-Line Anatomy) ---");
  const lines = (cQuestion.code || "").split("\n");
  const targetLineIdx = lines.findIndex(
    (l) => l.includes("*") || l.includes("printf"),
  );
  const targetLineNum = targetLineIdx >= 0 ? targetLineIdx + 1 : 1;

  console.log(`선택 라인 ${targetLineNum}: ${lines[targetLineNum - 1]}`);
  const tLineStart = Date.now();
  const lineRes = await aiService.explainCodeLine({
    question: cQuestion,
    lineNumber: targetLineNum,
  });
  const lineElapsed = Date.now() - tLineStart;
  console.log(
    `모델: ${lineRes.modelUsed} | 지연시간: ${lineElapsed}ms | 승격사유: ${lineRes.promotionReason || "기본"}`,
  );
  console.log(`• 문법 요소: ${lineRes.syntaxElements.join(", ")}`);
  console.log(`• 식별자: ${lineRes.userDefinedElements.join(", ")}`);
  console.log(`• 런타임/메모리 동작: ${lineRes.runtimeMeaning}`);
  console.log(`• 문맥 설명: ${lineRes.surroundingContext}`);
  console.log(`• 기출 주의점: ${lineRes.examTip}\n`);

  // 3. [사용자 "더 자세히" 요청 시 3.8 승격]
  console.log(
    "================================================================",
  );
  console.log('Case 3. 사용자 "더 자세히 (3.8 심층 분석)" 요청 시나리오');
  console.log(
    "================================================================",
  );
  const tDeepStart = Date.now();
  const deepRes = await aiService.generateExplanation({
    question: theoryQ, // 일반 이론 문제이지만 사용자가 deepAnalysis 요청
    userAnswer: "원자성, 독립성",
    isCorrect: false,
    deepAnalysis: true,
  });
  const deepElapsed = Date.now() - tDeepStart;
  console.log(
    `모델: ${deepRes.modelUsed} | 지연시간: ${deepElapsed}ms | 승격사유: ${deepRes.promotionReason}`,
  );
  console.log(`• 심층 요약: ${deepRes.summary}`);
  console.log(`• 심층 정답 성립 원리: ${deepRes.keyPoint}`);
  console.log(`• 심층 오답 분석: ${deepRes.whyWrong}\n`);

  console.log(
    "================================================================",
  );
  console.log("🎉 실제 기출 문항 AI 학습 품질 실측 검증 완료!");
  console.log(
    "================================================================",
  );
}

verifyRealQuality().catch((err) => {
  console.error("검증 오류:", err);
  process.exit(1);
});
