/**
 * C 언어 독립형 AI 문제 생성기 실전 품질 평가 하네스 (Evaluation Harness)
 *
 * [원칙]
 * 1. Strict Live 모드: Gemini REST API 실시간 호출만 허용 (Mock Fallback 완전 금지)
 * 2. Live DB 격리: questions, staged_questions 절대 수정하지 않음 (읽기 전용 비교)
 * 3. correlationId 추적: evaluation request -> AI engine -> evaluation item 전 구간 보존
 * 4. 정답-해설-추적표 정합성 3자 검증 및 자가 정정 모순 감지
 * 5. 결과는 server/evaluation/results/ 에 별도 JSON 파일로 영구 보존
 */

import fs from "fs";
import path from "path";
import {
  C_CORE_SKILLS,
  calculateTextSimilarity,
} from "../engine/independentGenerator.js";
import {
  verifyStepTraceMatch,
  verifyExplanationMatch,
  ensureRejectionInvariant,
  calculateCodeSimilarity,
} from "../engine/evaluationValidator.js";
import { getAIService } from "../engine/aiService.js";
import { QuestionRepository } from "../db/repositories/questionRepository.js";
import {
  GeneratedIndependentQuestion,
  Question,
} from "@jungcheogi/shared";
import { env } from "../config/env.js";

// 명령줄 인자 파싱 (--count 30)
const args = process.argv.slice(2);
let targetCount = 30;
const countIdx = args.indexOf("--count");
if (countIdx !== -1 && args[countIdx + 1]) {
  targetCount = parseInt(args[countIdx + 1], 10) || 30;
}

export interface EvaluationItem {
  evaluationId: string;
  correlationId: string;
  generatedAt: string;
  attempt: number;

  questionText: string;
  code: string;
  answer: string;
  explanation: string;
  stepByStepTrace?: string;

  targetConcept: string;
  skill: string;
  difficulty: string;
  estimatedDifficulty: "하" | "중" | "중상" | "상";

  generationStrategy: string;
  model: string;
  sourceType: string;

  // 1. 구조 완전성
  structuralPass: boolean;
  structuralIssues: string[];

  // 2. 기존 DB 유사도
  nearestExistingSimilarity: number;
  nearestExistingQuestionCode?: string;
  nearestExistingQuestionId?: string;

  // 3. 배치 내 상호(Peer) 유사도
  maxPeerSimilarity: number;
  mostSimilarPeerId?: string;
  isIdenticalPeerDuplicate?: boolean;

  // 4. 독립성 등급
  independentNovelty: "HIGH" | "MEDIUM" | "LOW";

  // 5. 학습 가치 분석
  learningValueScore: {
    hasPointerOrArray: boolean;
    hasControlFlow: boolean;
    hasStateMutation: boolean;
    cSyntaxValid: boolean;
  };

  // 6. 구문 검사
  codeSyntaxCheck: {
    balancedBraces: boolean;
    balancedParens: boolean;
    hasMain: boolean;
    hasReturn: boolean;
    notes: string[];
  };

  // 7. 정합성 및 모순 검사
  consistencyCheck: {
    answerInExplanation: boolean;
    stepTraceMatchesAnswer: boolean;
    explanationConclusionMatchesAnswer: boolean;
    selfCorrectionDetected: boolean;
    riskFlags: string[];
  };

  // 8. 판정 및 세부 상태
  decision: "PASS" | "REVIEW" | "REJECT";
  stepTraceStatus: "MATCH" | "CONTRADICTION" | "INSUFFICIENT";
  explanationStatus: "MATCH" | "CONTRADICTION" | "INSUFFICIENT";
  cloneType: "NONE" | "IDENTICAL" | "MUTATION_CLONE";
  codeExecutionStatus: "UNAVAILABLE" | "AVAILABLE";
  generationRejected: boolean;
  rejectionReasons: string[];
  humanReviewRecommended: boolean;
  humanReviewReasons: string[];
}

export interface EvaluationReport {
  summary: {
    targetCount: number;
    requestedCount: number;
    successCount: number;
    failureCount: number;
    retryCount: number;
    mockFallbackCount: number;
    evaluatedAt: string;
    modelUsed: string;
    modelBreakdown: Record<string, number>;
    strictLive: boolean;
    passCount: number;
    reviewCount: number;
    rejectCount: number;
    traceContradictionCount: number;
    traceInsufficientCount: number;
    explContradictionCount: number;
    explInsufficientCount: number;
    identicalCloneCount: number;
    mutationCloneCount: number;
  };
  representativeSamples?: {
    bestPass?: EvaluationItem;
    obviousReject?: EvaluationItem;
    highestSimilarity?: {
      pair: [string, string];
      similarity: number;
      reason: string;
    };
    mostComplex?: EvaluationItem;
    reviewSample?: EvaluationItem;
  };
  metrics: {
    schemaPassRate: number;
    highNoveltyRate: number;
    mediumNoveltyRate: number;
    lowNoveltyRate: number;
    nearDuplicateExistingRate: number;
    nearDuplicatePeerRate: number;
    identicalPeerDuplicateRate: number;
    codeSyntaxPassRate: number;
    answerExplanationConsistencyRate: number;
    stepTraceConsistencyRate: number;
    humanReviewRate: number;
    generationRejectionRate: number;
  };
  conceptDistribution: Record<string, number>;
  difficultyDistribution: Record<string, number>;
  peerDuplicates: Array<{
    pair: [string, string];
    similarity: number;
    reason: string;
  }>;
  humanReviewItems: string[];
  rejectedItems: string[];
  sampleQuestions: {
    highestNovelty: EvaluationItem[];
    highestSimilarity: EvaluationItem[];
    hardest: EvaluationItem[];
    easiest: EvaluationItem[];
  };
  items: EvaluationItem[];
}

// 괄호 균형 검사
function checkBalancedTokens(code: string): {
  balancedBraces: boolean;
  balancedParens: boolean;
} {
  let brace = 0;
  let paren = 0;
  for (const ch of code) {
    if (ch === "{") brace++;
    if (ch === "}") brace--;
    if (ch === "(") paren++;
    if (ch === ")") paren--;
  }
  return {
    balancedBraces: brace === 0,
    balancedParens: paren === 0,
  };
}

// 딜레이 헬퍼 (Gemini Rate Limiting 방지)
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function runEvaluation() {
  console.log(
    "=================================================================",
  );
  console.log(
    "🧪 C 언어 독립형 AI 문제 생성기 Strict Live 품질 평가 하네스",
  );
  console.log(
    "=================================================================",
  );

  // 1. API 키 검증 (Strict Live)
  const apiKey = (env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    console.error(
      "\n❌ LIVE_GENERATION_UNAVAILABLE: GEMINI_API_KEY is missing in environment.",
    );
    console.error("실제 Gemini API 호출이 불가능하여 평가를 중단합니다.\n");
    process.exit(1);
  }

  console.log(`- 목표 문항 수: ${targetCount}문제`);
  console.log(
    `- API 키 확인: ${apiKey.slice(0, 8)}... (길이: ${apiKey.length})`,
  );
  console.log(`- 스마트 모델: ${env.GEMINI_SMART_MODEL || "gemini-3.8-flash"}`);
  console.log(
    `- 빠른 모델:   ${env.GEMINI_FAST_MODEL || "gemini-3.5-flash-lite"}`,
  );
  console.log(`- 평가 모드:   Strict Live (Mock Fallback 완전 금지)\n`);

  // DB 읽기 전용으로 기존 문항 로드 (비교용)
  const questionRepo = new QuestionRepository();
  const existingQuestions: Question[] = questionRepo.findMany({
    limit: 500,
  }).items;
  console.log(
    `- 비교 대상 기존 Live DB 문항 수: ${existingQuestions.length}건\n`,
  );

  const aiService = getAIService();
  const generatedItems: EvaluationItem[] = [];

  let totalAttempts = 0;
  let failureCount = 0;
  let retryCount = 0;
  let mockFallbackCount = 0;
  const modelBreakdown: Record<string, number> = {};

  console.log(
    `🚀 [Phase 1] ${targetCount}개 독립형 C 언어 문제 실시간 생성 시작...`,
  );

const C_CONCEPT_VARIATIONS: Record<string, string[]> = {
  "포인터와 1차원 배열": [
    "배열 원소의 포인터 오프셋 누적 및 홀수/짝수 인덱스별 조건 분기 연산",
    "포인터를 활용한 배열 요소 간의 위치 교환(스왑) 및 특정 범위 역순 합산",
    "시작 포인터와 끝 포인터가 양쪽에서 좁혀오며 값을 비교/누적하는 대칭형 순회",
    "포인터 간의 주소 뺄셈(p2 - p1) 및 오프셋 연산을 활용한 요소 간격 계산",
  ],
  "포인터 증감 연산자": [
    "*p++와 *++p의 연산자 결합 우선순위 및 루프 종료 후 포인터와 sum의 최종 상태",
    "(*p)++와 *p++가 혼합되어 특정 배열 원소의 값이 직접 수정되는 연쇄 동작 추적",
    "while(*p) 루프 조건식 내부에서 포인터 증감과 특정 문자/수치 감지 시 탈출",
    "증감 연산자와 배열 인덱스 역참조가 교차 호출되는 다중 포인터 추적",
  ],
  "함수와 포인터 (Call by Reference)": [
    "함수에 두 변수의 포인터를 넘겨 내부에서 연산 후 원본 값 갱신 및 반환값 누적",
    "함수에 1차원 배열과 길이를 전달하여 조건에 맞는 원소들을 선별 수정",
    "포인터 매개변수를 통해 연산 결과를 저장하고, 함수 반환값은 별도의 상태 플래그 반환",
    "중첩 함수 호출(f1 -> f2) 간에 포인터를 연속 전달하여 메모리 단계적 변이 추적",
  ],
  "문자열 포인터와 널문자": [
    "char* 포인터를 이동하며 대소문자 상호 변환 및 특수문자/숫자 필터링",
    "널문자('\\0') 위치를 탐색하며 부분 문자열 복사 및 뒤에서부터 역방향 출력",
    "포인터를 이용한 문자열 내 특정 알파벳 빈도수 계산 및 치환",
    "두 개의 문자열 포인터를 순회하며 공통 접두사 또는 문자 일치 여부 판별",
  ],
  "조건 분기형 재귀 함수": [
    "인자 감소와 짝수/홀수 조건에 따른 서로 다른 재귀 호출 및 반환값 가중치 합",
    "유클리드 호제법 변형(나머지 연산 '%' 기반 재귀 단계 축소)",
    "기저 조건(Base case) 도달 전까지의 호출 스택 누적 및 역순 반환 곱셈/덧셈",
    "조건에 따라 한쪽만 재귀 호출되는 분기 트리 탐색형 재귀",
  ],
  "구조체와 화살표(->) 연산자": [
    "구조체 배열을 구조체 포인터(p)로 순회하며 특정 조건의 멤버 변수 필드 갱신",
    "단순 단일 연결 리스트 구조(struct Node with next pointer) 3개 노드 순회 및 값 누적",
    "구조체 내부에 배열이 포함된 복합 데이터 구조에 화살표 연산자로 접근",
    "구조체 포인터를 함수의 인자로 전달하여 구조체 멤버 값을 직접 변경",
  ],
  "비트 연산자 (Bitwise)": [
    "비트 마스크(&, |)를 사용한 특정 비트 추출 및 XOR(^) 토글 연산 결합",
    "시프트(<<, >>) 연산자를 활용한 2의 거듭제곱 곱셈/나눗셈과 플래그 판정",
    "16진수(0x) 비트 마스크와 비트 반전(~)을 결합한 보수 연산 추적",
  ],
  "정적 변수(static)와 스코프": [
    "함수 내 static 변수와 전역 변수(global)의 상호작용 및 누적 상태 보존",
    "서로 다른 2개의 함수가 각각의 static 변수를 유지하며 교대로 호출되는 상황",
    "루프 내에서 호출될 때마다 static 변수 증가치에 가중치가 부여되는 스코프 추적",
  ],
};

  for (let i = 0; i < targetCount; i++) {
    const evalId = `EVAL-C-${String(i + 1).padStart(2, "0")}`;
    const targetSkill = C_CORE_SKILLS[i % C_CORE_SKILLS.length];
    const varList =
      C_CONCEPT_VARIATIONS[targetSkill.concept] || [targetSkill.codePatternTip];
    const varIndex = Math.floor(i / C_CORE_SKILLS.length) % varList.length;
    const selectedVariation = varList[varIndex];

    const instructions = `[평가 타겟 스킬]: ${targetSkill.skill}
[세부 실행 구조 지침]: ${selectedVariation}
[품질 준수 사항]:
1. 단순 숫자/변수명만 바꾼 판박이 코드를 절대 생성하지 마십시오.
2. main() 함수가 반드시 존재하고 printf로 명확한 결과값을 출력해야 합니다.
3. Undefined Behavior(정의되지 않은 동작), unsequenced modification(예: i = i++ 등), 범위를 벗어난 배열 인덱스 접근을 엄격히 배제하십시오.
4. stepByStepTrace 추적표의 계산과 groundTruthAnswer의 최종 결과가 100% 일치해야 합니다.`;

    let attemptsForThis = 0;
    let itemData: GeneratedIndependentQuestion | null = null;
    let correlationId = `eval_${evalId}_${Date.now()}`;

    // 최대 3회 시도 (일시적 429/503 시 재시도)
    while (attemptsForThis < 3 && !itemData) {
      totalAttempts++;
      attemptsForThis++;
      correlationId = `eval_${evalId}_att${attemptsForThis}_${Date.now()}`;

      process.stdout.write(
        `  [${i + 1}/${targetCount}] (${targetSkill.concept} - var${varIndex + 1}) 시도 ${attemptsForThis}... `,
      );

      try {
        const result = await aiService.generateIndependentQuestion({
          domain: "C",
          language: "C",
          conceptName: targetSkill.concept,
          difficulty: targetSkill.difficulty,
          instructions,
          strictLive: true,
          correlationId,
        });

        // Mock Fallback 감지 (엄격 금지)
        if (
          result.generationMetadata.generator === "MockAIService" ||
          result.generationMetadata.model === "mock" ||
          result.generationMetadata.strategy === "MOCK"
        ) {
          mockFallbackCount++;
          console.log(`❌ MOCK FALLBACK 감지 (Strict Live 위반)`);
          throw new Error("MOCK_FALLBACK_DETECTED_IN_STRICT_LIVE");
        }

        const usedModel = result.generationMetadata.model || "Unknown";
        modelBreakdown[usedModel] = (modelBreakdown[usedModel] || 0) + 1;
        console.log(`OK (${usedModel}) [corr: ${result.correlationId || correlationId}]`);

        itemData = result;
      } catch (err: any) {
        console.log(`FAIL (${err.message})`);
        retryCount++;
        // 백오프 후 재시도
        await delay(3000 * attemptsForThis);
      }
    }

    if (!itemData) {
      failureCount++;
      console.warn(`  ❌ ${evalId} 최종 실시간 생성 실패 (LIVE_GENERATION_UNAVAILABLE)`);
      continue;
    }

    // 2. 구조 완전성(Structural Completeness) 검사
    const structuralIssues: string[] = [];
    if (!itemData.questionText || itemData.questionText.trim().length < 5) {
      structuralIssues.push("문제 지문 누락 또는 너무 짧음");
    }
    if (!itemData.code || itemData.code.trim().length < 10) {
      structuralIssues.push("C 코드 누락 또는 너무 짧음");
    }
    if (
      !itemData.groundTruthAnswer ||
      String(itemData.groundTruthAnswer).trim().length === 0
    ) {
      structuralIssues.push("정답 누락");
    }
    if (
      !itemData.officialExplanation ||
      itemData.officialExplanation.trim().length < 10
    ) {
      structuralIssues.push("해설 누락");
    }
    if (!itemData.designMetadata || !itemData.designMetadata.concept) {
      structuralIssues.push("2-Phase designMetadata 누락");
    }

    const structuralPass = structuralIssues.length === 0;

    // 3. 코드 정적 정합성 검사
    const codeStr = itemData.code || "";
    const balance = checkBalancedTokens(codeStr);
    const hasMain = /int\s+main\s*\(/.test(codeStr);
    const hasReturn = /return\s+0\s*;/.test(codeStr);
    const syntaxNotes: string[] = [];
    if (!balance.balancedBraces) syntaxNotes.push("중괄호({}) 불균형");
    if (!balance.balancedParens) syntaxNotes.push("소괄호(()) 불균형");
    if (!hasMain) syntaxNotes.push("main 함수 선언 미감지");
    if (!hasReturn) syntaxNotes.push("return 0; 미감지");

    // 4. 학습 가치 분석
    const hasPointerOrArray = /\*|&|\[|\bptr\b|->/i.test(codeStr);
    const hasControlFlow = /if|for|while|switch/i.test(codeStr);
    const hasStateMutation = /\+\+|--|\+=|-=|\*=|=(?!=)/.test(codeStr);
    const cSyntaxValid = /#include|printf|int|char|void/.test(codeStr);

    // 5. 기존 Live DB 문항과의 유사도 검사
    let maxExistingSim = 0;
    let nearestCode = "";
    let nearestId = "";
    for (const eq of existingQuestions) {
      if (eq.code) {
        const sim = calculateTextSimilarity(codeStr, eq.code);
        if (sim > maxExistingSim) {
          maxExistingSim = sim;
          nearestCode = (eq as any).questionCode || eq.id;
          nearestId = eq.id;
        }
      }
    }

    // 6. 독립성 평가 (Novelty)
    let independentNovelty: "HIGH" | "MEDIUM" | "LOW" = "HIGH";
    if (maxExistingSim >= 0.7) {
      independentNovelty = "LOW";
    } else if (maxExistingSim >= 0.45) {
      independentNovelty = "MEDIUM";
    }

    // 7. 정답/해설/추적표 일관성 검사 (evaluationValidator 적용)
    const ansStr = String(itemData.groundTruthAnswer).trim();
    const explStr = itemData.officialExplanation || "";
    const stepTrace = itemData.designMetadata?.stepByStepTrace || "";

    const traceResult = verifyStepTraceMatch(stepTrace, ansStr);
    const stepTraceMatchesAnswer = traceResult.matches;

    const explResult = verifyExplanationMatch(explStr, ansStr);
    const {
      conclusionMatches: explanationConclusionMatchesAnswer,
      answerInExplanation,
      selfCorrectionDetected,
      conclusionSentence: lastConclusionSentence = "",
    } = explResult;

    const riskFlags: string[] = [];
    if (!stepTraceMatchesAnswer) {
      riskFlags.push(traceResult.reason || "stepByStepTrace와 최종 정답(answer) 불일치");
    }
    if (selfCorrectionDetected) {
      riskFlags.push("해설 본문 내 자가 정정/착오 흔적 감지 (잠깐/정정/수정 등)");
    }
    if (!explanationConclusionMatchesAnswer) {
      riskFlags.push(
        explResult.reason ||
          `해설 최종 결론 문장("${lastConclusionSentence.slice(0, 50)}...")과 정답("${ansStr}") 불일치`,
      );
    }
    if (!answerInExplanation) {
      riskFlags.push("해설 본문에 정답 수치/키워드가 직접적으로 언급되지 않음");
    }

    // 8. 난이도 자체 추정
    let conceptPoints = 0;
    if (codeStr.includes("->")) conceptPoints += 3;
    if (codeStr.includes("recursive") || targetSkill.concept.includes("재귀"))
      conceptPoints += 3;
    if (/\*p\+\+|\(\*p\)\+\+|\*\+\+p/.test(codeStr)) conceptPoints += 3;
    if (codeStr.includes("&") && codeStr.includes("^")) conceptPoints += 2;
    if (hasPointerOrArray) conceptPoints += 2;
    if (hasControlFlow) conceptPoints += 1;
    if (hasStateMutation) conceptPoints += 1;

    let estimatedDifficulty: "하" | "중" | "중상" | "상" = "중";
    if (conceptPoints <= 2) estimatedDifficulty = "하";
    else if (conceptPoints <= 4) estimatedDifficulty = "중";
    else if (conceptPoints <= 7) estimatedDifficulty = "중상";
    else estimatedDifficulty = "상";

    // 9. 사람 검토 필요 여부 & 생성 불합격 판정
    const humanReviewReasons: string[] = [];
    const rejectionReasons: string[] = [];

    if (!structuralPass) {
      humanReviewReasons.push(...structuralIssues);
      rejectionReasons.push(...structuralIssues);
    }
    if (!balance.balancedBraces || !balance.balancedParens) {
      humanReviewReasons.push("괄호 불균형");
      rejectionReasons.push("괄호 불균형");
    }
    if (maxExistingSim >= 0.75) {
      humanReviewReasons.push(
        `기존 문항(${nearestCode})과 과다 유사(${(maxExistingSim * 100).toFixed(1)}%)`,
      );
    }
    if (!stepTraceMatchesAnswer) {
      const reason = traceResult.reason || "추적표(stepTrace)와 정답 불일치";
      humanReviewReasons.push(reason);
      rejectionReasons.push(reason);
    }
    if (!explanationConclusionMatchesAnswer) {
      const reason =
        explResult.reason ||
        `해설 결론("${lastConclusionSentence.slice(0, 30)}...")과 정답("${ansStr}") 불일치`;
      humanReviewReasons.push(reason);
      rejectionReasons.push(reason);
    }
    if (selfCorrectionDetected) {
      humanReviewReasons.push("해설 내 자가 정정/계산 착오 의심");
      rejectionReasons.push("해설 내 자가 정정/계산 착오 의심");
    }

    const humanReviewRecommended = humanReviewReasons.length > 0;
    const generationRejected = rejectionReasons.length > 0;

    const evalItem: EvaluationItem = {
      evaluationId: evalId,
      correlationId: itemData.correlationId || correlationId,
      generatedAt:
        itemData.generationMetadata.generatedAt || new Date().toISOString(),
      attempt: attemptsForThis,
      questionText: itemData.questionText,
      code: codeStr,
      answer: ansStr,
      explanation: explStr,
      stepByStepTrace: stepTrace,
      targetConcept: targetSkill.concept,
      skill: targetSkill.skill,
      difficulty: itemData.difficulty,
      estimatedDifficulty,
      generationStrategy: itemData.generationMetadata.strategy,
      model: itemData.generationMetadata.model || "Unknown",
      sourceType: "INDEPENDENT_EVALUATION",
      structuralPass,
      structuralIssues,
      nearestExistingSimilarity: Number(maxExistingSim.toFixed(3)),
      nearestExistingQuestionCode: nearestCode,
      nearestExistingQuestionId: nearestId,
      maxPeerSimilarity: 0,
      independentNovelty,
      learningValueScore: {
        hasPointerOrArray,
        hasControlFlow,
        hasStateMutation,
        cSyntaxValid,
      },
      codeSyntaxCheck: {
        balancedBraces: balance.balancedBraces,
        balancedParens: balance.balancedParens,
        hasMain,
        hasReturn,
        notes: syntaxNotes,
      },
      consistencyCheck: {
        answerInExplanation,
        stepTraceMatchesAnswer,
        explanationConclusionMatchesAnswer,
        selfCorrectionDetected,
        riskFlags,
      },
      decision: generationRejected
        ? "REJECT"
        : traceResult.status === "INSUFFICIENT" || explResult.status === "INSUFFICIENT"
        ? "REVIEW"
        : "PASS",
      stepTraceStatus: traceResult.status,
      explanationStatus: explResult.status,
      cloneType: "NONE",
      codeExecutionStatus: "UNAVAILABLE",
      generationRejected,
      rejectionReasons,
      humanReviewRecommended,
      humanReviewReasons,
    };

    generatedItems.push(evalItem);

    // Rate limiting 방지 딜레이
    await delay(2000);
  }

  console.log(
    `\n🔍 [Phase 2] 생성된 ${generatedItems.length}개 문항 상호 간(Peer) 유사도 매트릭스 계산...`,
  );

  // 생성 문항 간 상호 유사도 매트릭스
  const peerDuplicates: Array<{
    pair: [string, string];
    similarity: number;
    reason: string;
  }> = [];

  for (let i = 0; i < generatedItems.length; i++) {
    for (let j = i + 1; j < generatedItems.length; j++) {
      const itemA = generatedItems[i];
      const itemB = generatedItems[j];
      const detail = calculateCodeSimilarity(itemA.code, itemB.code);
      const sim = detail.rawSimilarity;

      if (sim > itemA.maxPeerSimilarity) {
        itemA.maxPeerSimilarity = Number(sim.toFixed(3));
        itemA.mostSimilarPeerId = itemB.evaluationId;
      }
      if (sim > itemB.maxPeerSimilarity) {
        itemB.maxPeerSimilarity = Number(sim.toFixed(3));
        itemB.mostSimilarPeerId = itemA.evaluationId;
      }

      // 완전 동일 코드 감지 (100% 동일)
      if (detail.category === "IDENTICAL" || sim >= 0.99) {
        itemA.cloneType = "IDENTICAL";
        itemB.cloneType = "IDENTICAL";
        itemA.isIdenticalPeerDuplicate = true;
        itemB.isIdenticalPeerDuplicate = true;
        itemA.independentNovelty = "LOW";
        itemB.independentNovelty = "LOW";
        itemA.generationRejected = true;
        itemB.generationRejected = true;

        const reasonA = `동일 배치 내 ${itemB.evaluationId}와 완전 동일 코드(100%) 중복`;
        const reasonB = `동일 배치 내 ${itemA.evaluationId}와 완전 동일 코드(100%) 중복`;

        if (!itemA.rejectionReasons.some((r) => r.includes("완전 동일 코드"))) {
          itemA.rejectionReasons.push(reasonA);
        }
        if (!itemB.rejectionReasons.some((r) => r.includes("완전 동일 코드"))) {
          itemB.rejectionReasons.push(reasonB);
        }
        if (!itemA.humanReviewReasons.some((r) => r.includes("완전 동일 코드"))) {
          itemA.humanReviewReasons.push(reasonA);
        }
        if (!itemB.humanReviewReasons.some((r) => r.includes("완전 동일 코드"))) {
          itemB.humanReviewReasons.push(reasonB);
        }
        itemA.humanReviewRecommended = true;
        itemB.humanReviewRecommended = true;
      } else if (detail.category === "MUTATION_CLONE") {
        if (itemA.cloneType !== "IDENTICAL") itemA.cloneType = "MUTATION_CLONE";
        if (itemB.cloneType !== "IDENTICAL") itemB.cloneType = "MUTATION_CLONE";
        itemA.generationRejected = true;
        itemB.generationRejected = true;
        const reasonA = `동일 배치 내 ${itemB.evaluationId}와 변수명/상수만 변경된 변이 복제(MUTATION_CLONE: ${(detail.structuralSimilarity * 100).toFixed(1)}%)`;
        const reasonB = `동일 배치 내 ${itemA.evaluationId}와 변수명/상수만 변경된 변이 복제(MUTATION_CLONE: ${(detail.structuralSimilarity * 100).toFixed(1)}%)`;
        if (!itemA.rejectionReasons.some((r) => r.includes("변이 복제"))) {
          itemA.rejectionReasons.push(reasonA);
        }
        if (!itemB.rejectionReasons.some((r) => r.includes("변이 복제"))) {
          itemB.rejectionReasons.push(reasonB);
        }
        if (!itemA.humanReviewReasons.some((r) => r.includes("변이 복제"))) {
          itemA.humanReviewReasons.push(reasonA);
        }
        if (!itemB.humanReviewReasons.some((r) => r.includes("변이 복제"))) {
          itemB.humanReviewReasons.push(reasonB);
        }
        itemA.humanReviewRecommended = true;
        itemB.humanReviewRecommended = true;
      } else if (sim >= 0.75) {
        peerDuplicates.push({
          pair: [itemA.evaluationId, itemB.evaluationId],
          similarity: Number(sim.toFixed(3)),
          reason: `유사도 ${(sim * 100).toFixed(1)}% (개념: ${itemA.targetConcept} vs ${itemB.targetConcept})`,
        });
        if (!itemA.humanReviewRecommended) {
          itemA.humanReviewRecommended = true;
          itemA.humanReviewReasons.push(
            `동일 배치 내 ${itemB.evaluationId}와 높은 코드 유사도(${(sim * 100).toFixed(1)}%)`,
          );
        }
      }
    }
  }

  // Decision 및 불변식 확정
  for (const item of generatedItems) {
    if (item.rejectionReasons.length > 0) {
      item.decision = "REJECT";
      item.generationRejected = true;
      item.humanReviewRecommended = true;
    } else if (
      item.stepTraceStatus === "INSUFFICIENT" ||
      item.explanationStatus === "INSUFFICIENT" ||
      item.nearestExistingSimilarity >= 0.75
    ) {
      item.decision = "REVIEW";
      item.generationRejected = false;
      item.humanReviewRecommended = true;
    } else {
      item.decision = "PASS";
      item.generationRejected = false;
      item.humanReviewRecommended = false;
    }
    ensureRejectionInvariant(item);
  }

  // 통계 집계
  const totalSuccess = generatedItems.length;
  const conceptDist: Record<string, number> = {};
  const diffDist: Record<string, number> = { 하: 0, 중: 0, 중상: 0, 상: 0 };

  let structuralPassCount = 0;
  let highNoveltyCount = 0;
  let mediumNoveltyCount = 0;
  let lowNoveltyCount = 0;
  let nearDupExistingCount = 0;
  let nearDupPeerCount = 0;
  let identicalPeerDupCount = 0;
  let syntaxPassCount = 0;
  let consistencyPassCount = 0;
  let stepTracePassCount = 0;
  let humanReviewCount = 0;
  let rejectedCount = 0;

  for (const item of generatedItems) {
    conceptDist[item.targetConcept] =
      (conceptDist[item.targetConcept] || 0) + 1;
    diffDist[item.estimatedDifficulty] =
      (diffDist[item.estimatedDifficulty] || 0) + 1;

    if (item.structuralPass) structuralPassCount++;
    if (item.independentNovelty === "HIGH") highNoveltyCount++;
    if (item.independentNovelty === "MEDIUM") mediumNoveltyCount++;
    if (item.independentNovelty === "LOW") lowNoveltyCount++;
    if (item.nearestExistingSimilarity >= 0.75) nearDupExistingCount++;
    if (item.maxPeerSimilarity >= 0.75) nearDupPeerCount++;
    if (item.isIdenticalPeerDuplicate) identicalPeerDupCount++;
    if (
      item.codeSyntaxCheck.balancedBraces &&
      item.codeSyntaxCheck.balancedParens
    )
      syntaxPassCount++;
    if (
      item.consistencyCheck.answerInExplanation &&
      item.consistencyCheck.explanationConclusionMatchesAnswer &&
      !item.consistencyCheck.selfCorrectionDetected
    )
      consistencyPassCount++;
    if (item.consistencyCheck.stepTraceMatchesAnswer) stepTracePassCount++;
    if (item.humanReviewRecommended) humanReviewCount++;
    if (item.generationRejected) rejectedCount++;
  }

  const passCount = generatedItems.filter((i) => i.decision === "PASS").length;
  const reviewCount = generatedItems.filter((i) => i.decision === "REVIEW").length;
  const rejectCount = generatedItems.filter((i) => i.decision === "REJECT").length;
  const traceContradictionCount = generatedItems.filter(
    (i) => i.stepTraceStatus === "CONTRADICTION",
  ).length;
  const traceInsufficientCount = generatedItems.filter(
    (i) => i.stepTraceStatus === "INSUFFICIENT",
  ).length;
  const explContradictionCount = generatedItems.filter(
    (i) => i.explanationStatus === "CONTRADICTION",
  ).length;
  const explInsufficientCount = generatedItems.filter(
    (i) => i.explanationStatus === "INSUFFICIENT",
  ).length;
  const identicalCloneCount = generatedItems.filter(
    (i) => i.cloneType === "IDENTICAL",
  ).length;
  const mutationCloneCount = generatedItems.filter(
    (i) => i.cloneType === "MUTATION_CLONE",
  ).length;

  // 대표 샘플 추출
  const sortedByNovelty = [...generatedItems].sort(
    (a, b) => a.nearestExistingSimilarity - b.nearestExistingSimilarity,
  );
  const highestNovelty = sortedByNovelty.slice(0, 2);
  const highestSimilarity = sortedByNovelty.slice(-2).reverse();

  const hardest = [...generatedItems]
    .filter((i) => i.estimatedDifficulty === "상")
    .slice(0, 2);
  if (hardest.length < 2) {
    hardest.push(
      ...[...generatedItems]
        .filter((i) => i.estimatedDifficulty === "중상")
        .slice(0, 2 - hardest.length),
    );
  }

  const easiest = [...generatedItems]
    .filter((i) => i.estimatedDifficulty === "하")
    .slice(0, 2);
  if (easiest.length < 2) {
    easiest.push(
      ...[...generatedItems]
        .filter((i) => i.estimatedDifficulty === "중")
        .slice(0, 2 - easiest.length),
    );
  }

  // 대표 5종 샘플 선정
  const bestPass = generatedItems.find(
    (i) => i.decision === "PASS" && i.independentNovelty === "HIGH" && i.estimatedDifficulty === "상",
  ) || generatedItems.find((i) => i.decision === "PASS" && i.independentNovelty === "HIGH") || generatedItems.find((i) => i.decision === "PASS");

  const obviousReject = generatedItems.find((i) => i.decision === "REJECT");
  const reviewSample = generatedItems.find((i) => i.decision === "REVIEW");
  const mostComplex = generatedItems.find((i) => i.estimatedDifficulty === "상") || generatedItems.find((i) => i.estimatedDifficulty === "중상");

  let highestPeerPair: { pair: [string, string]; similarity: number; reason: string } | undefined = peerDuplicates[0];
  if (!highestPeerPair && generatedItems.length >= 2) {
    const sortedByPeer = [...generatedItems].sort((a, b) => b.maxPeerSimilarity - a.maxPeerSimilarity);
    const topPeer = sortedByPeer[0];
    if (topPeer && topPeer.mostSimilarPeerId) {
      highestPeerPair = {
        pair: [topPeer.evaluationId, topPeer.mostSimilarPeerId],
        similarity: topPeer.maxPeerSimilarity,
        reason: `배치 내 최고 유사도 (${(topPeer.maxPeerSimilarity * 100).toFixed(1)}%)`,
      };
    }
  }

  const representativeSamples = {
    bestPass,
    obviousReject,
    highestSimilarity: highestPeerPair,
    mostComplex,
    reviewSample,
  };

  const report: EvaluationReport = {
    summary: {
      targetCount,
      requestedCount: targetCount,
      successCount: totalSuccess,
      failureCount,
      retryCount,
      mockFallbackCount,
      evaluatedAt: new Date().toISOString(),
      modelUsed: Object.keys(modelBreakdown).join(", ") || "Unknown",
      modelBreakdown,
      strictLive: true,
      passCount,
      reviewCount,
      rejectCount,
      traceContradictionCount,
      traceInsufficientCount,
      explContradictionCount,
      explInsufficientCount,
      identicalCloneCount,
      mutationCloneCount,
    },
    representativeSamples,
    metrics: {
      schemaPassRate: Number(
        (structuralPassCount / Math.max(totalSuccess, 1)).toFixed(3),
      ),
      highNoveltyRate: Number(
        (highNoveltyCount / Math.max(totalSuccess, 1)).toFixed(3),
      ),
      mediumNoveltyRate: Number(
        (mediumNoveltyCount / Math.max(totalSuccess, 1)).toFixed(3),
      ),
      lowNoveltyRate: Number(
        (lowNoveltyCount / Math.max(totalSuccess, 1)).toFixed(3),
      ),
      nearDuplicateExistingRate: Number(
        (nearDupExistingCount / Math.max(totalSuccess, 1)).toFixed(3),
      ),
      nearDuplicatePeerRate: Number(
        (nearDupPeerCount / Math.max(totalSuccess, 1)).toFixed(3),
      ),
      identicalPeerDuplicateRate: Number(
        (identicalPeerDupCount / Math.max(totalSuccess, 1)).toFixed(3),
      ),
      codeSyntaxPassRate: Number(
        (syntaxPassCount / Math.max(totalSuccess, 1)).toFixed(3),
      ),
      answerExplanationConsistencyRate: Number(
        (consistencyPassCount / Math.max(totalSuccess, 1)).toFixed(3),
      ),
      stepTraceConsistencyRate: Number(
        (stepTracePassCount / Math.max(totalSuccess, 1)).toFixed(3),
      ),
      humanReviewRate: Number(
        (humanReviewCount / Math.max(totalSuccess, 1)).toFixed(3),
      ),
      generationRejectionRate: Number(
        (rejectedCount / Math.max(totalSuccess, 1)).toFixed(3),
      ),
    },
    conceptDistribution: conceptDist,
    difficultyDistribution: diffDist,
    peerDuplicates,
    humanReviewItems: generatedItems
      .filter((i) => i.humanReviewRecommended)
      .map((i) => i.evaluationId),
    rejectedItems: generatedItems
      .filter((i) => i.generationRejected)
      .map((i) => i.evaluationId),
    sampleQuestions: {
      highestNovelty,
      highestSimilarity,
      hardest,
      easiest,
    },
    items: generatedItems,
  };

  // 평가 결과 파일 저장
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const resultFileName = `c_generation_${totalSuccess}_final_strict_live_${timestamp}.json`;
  const baseDir = process.cwd().endsWith("server")
    ? process.cwd()
    : path.join(process.cwd(), "server");
  const resultFilePath = path.join(
    baseDir,
    "evaluation/results",
    resultFileName,
  );
  fs.writeFileSync(resultFilePath, JSON.stringify(report, null, 2), "utf8");

  console.log(`\n💾 Strict Live 평가 결과가 파일로 저장되었습니다:`);
  console.log(`   ${resultFilePath}\n`);

  printStrictLiveReport(report);
}

function printStrictLiveReport(r: EvaluationReport) {
  console.log(`=================================================================`);
  console.log(`📊 [Strict Live C 언어 독립형 AI 문제 생성기 30문항 실전 평가 보고서]`);
  console.log(`=================================================================\n`);

  console.log(`[Live Generation]`);
  console.log(`요청: ${r.summary.targetCount}`);
  console.log(`Gemini 성공: ${r.summary.successCount}`);
  console.log(`실패: ${r.summary.failureCount}`);
  console.log(`Mock fallback: ${r.summary.mockFallbackCount}`);
  console.log(`재시도 횟수: ${r.summary.retryCount}\n`);

  console.log(`[Decision Breakdown]`);
  console.log(`- PASS:   ${r.summary.passCount}문제`);
  console.log(`- REVIEW: ${r.summary.reviewCount}문제`);
  console.log(`- REJECT: ${r.summary.rejectCount}문제`);
  console.log(`- Trace 모순: ${r.summary.traceContradictionCount}건, Trace 불충분: ${r.summary.traceInsufficientCount}건`);
  console.log(`- Expl 모순:  ${r.summary.explContradictionCount}건, Expl 불충분:  ${r.summary.explInsufficientCount}건`);
  console.log(`- 복제 감지:  Identical ${r.summary.identicalCloneCount}건, MutationClone ${r.summary.mutationCloneCount}건`);
  console.log(`- Code Execution: UNAVAILABLE (컴파일러/샌드박스 미탑재, 정적 검증만 수행)\n`);

  console.log(`[Model]`);
  for (const [model, cnt] of Object.entries(r.summary.modelBreakdown)) {
    console.log(`- ${model}: ${cnt}문제`);
  }
  console.log();

  console.log(`[Duplicate]`);
  const identicalCount = r.items.filter((i) => i.isIdenticalPeerDuplicate).length;
  const highExistingCount = r.items.filter((i) => i.nearestExistingSimilarity >= 0.75).length;
  console.log(`- 완전 동일 코드: ${identicalCount}건`);
  console.log(`- 기존 DB 과유사(>= 75%): ${highExistingCount}건`);
  console.log(`- 배치 내 과유사(>= 75%): ${r.peerDuplicates.length}쌍\n`);

  console.log(`[Consistency]`);
  const traceMismatchCount = r.items.filter(
    (i) => !i.consistencyCheck.stepTraceMatchesAnswer,
  ).length;
  const explMismatchCount = r.items.filter(
    (i) =>
      !i.consistencyCheck.explanationConclusionMatchesAnswer ||
      i.consistencyCheck.selfCorrectionDetected,
  ).length;
  const otherFailCount = r.items.filter(
    (i) => !i.structuralPass || !i.codeSyntaxCheck.balancedBraces,
  ).length;

  console.log(`- answer/trace mismatch: ${traceMismatchCount}건`);
  console.log(`- answer/explanation mismatch (자가정정 포함): ${explMismatchCount}건`);
  console.log(`- 기타 검증 실패: ${otherFailCount}건`);
  console.log(
    `- 완전 무결 통과율: ${(r.metrics.answerExplanationConsistencyRate * 100).toFixed(1)}%\n`,
  );

  console.log(`[Concept]`);
  for (const [concept, cnt] of Object.entries(r.conceptDistribution)) {
    console.log(`- ${concept.padEnd(25, " ")}: ${cnt}문제`);
  }
  console.log();

  console.log(`[Difficulty]`);
  for (const [diff, cnt] of Object.entries(r.difficultyDistribution)) {
    console.log(`- ${diff.padEnd(6, " ")}: ${cnt}문제`);
  }
  console.log();

  console.log(`[Human Review]`);
  if (r.humanReviewItems.length === 0) {
    console.log(`- 특이점 없음 (모든 문항 정합성 통과)`);
  } else {
    for (const itemId of r.humanReviewItems) {
      const item = r.items.find((i) => i.evaluationId === itemId);
      console.log(
        `- ${itemId} [${item?.targetConcept}]: ${item?.humanReviewReasons.join(" / ")}`,
      );
    }
  }
  console.log();
}

runEvaluation().catch((e) => {
  console.error("Strict Live Evaluation Fatal Error:", e);
  process.exit(1);
});
