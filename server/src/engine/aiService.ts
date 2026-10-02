import {
  Question,
  Concept,
  VariationType,
  CanonicalVariationType,
  GeneratedVariation,
  AITutoringExplanationResponse,
  AIProgressiveHintsResponse,
  AICodeLineResponse,
  normalizeVariationType,
  GroundTruthConflictStatus,
  GroundTruthConflictReport,
  GeneratedIndependentQuestion,
  IndependentGenerationContext,
} from "@jungcheogi/shared";
import { env } from "../config/env.js";
import { MockQuestionVariationGenerator } from "./variationGenerator.js";
import { VariationValidator } from "./variationValidator.js";
import { evaluateCodeOutput } from "./codeExecutionEngine.js";
import {
  C_CORE_SKILLS,
  MOCK_INDEPENDENT_C_QUESTIONS,
} from "./independentGenerator.js";
import {
  buildIndependentGenerationPrompt,
  isIndependentLanguage,
  normalizeLanguage,
  pickMockIndependentQuestion,
  UnsupportedIndependentGenerationError,
} from "./languageGeneration.js";
import { hasValidGroundTruth } from "@jungcheogi/shared";

export const DISCONTINUED_MODEL_REGEX = /gemini-(?:1\.5|2\.0|2\.5)/i;

export const DEFAULT_FAST_MODEL = "gemini-3.5-flash-lite";
export const DEFAULT_SMART_MODEL = "gemini-3.8-flash";

export function getFastModel(): string {
  const model =
    env.GEMINI_FAST_MODEL || env.GEMINI_TUTOR_MODEL || DEFAULT_FAST_MODEL;
  return DISCONTINUED_MODEL_REGEX.test(model) ? DEFAULT_FAST_MODEL : model;
}

export function getSmartModel(): string {
  const model =
    env.GEMINI_SMART_MODEL || env.GEMINI_GENERATOR_MODEL || DEFAULT_SMART_MODEL;
  return DISCONTINUED_MODEL_REGEX.test(model) ? DEFAULT_SMART_MODEL : model;
}

/**
 * 튜터용 폴백 후보 리스트 (3.5 우선)
 */
export const TUTOR_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.5-flash",
  "gemini-3.8-flash",
];

/**
 * 생성용 폴백 후보 리스트 (3.8 우선)
 */
export const GENERATOR_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
];

export interface PromotionDecision {
  shouldPromote: boolean;
  model: string;
  reason?: string;
  candidateModels: string[];
}

export interface PromotionOptions {
  isVariation?: boolean;
  deepAnalysis?: boolean;
  lineNumber?: number;
  instructions?: string;
  userAnswer?: string | string[];
}

/**
 * 모델 승격 판단 로직:
 * 기본은 저지연·저비용의 3.5 Flash-Lite를 사용하고,
 * 복잡한 추론이나 깊은 상태 추적이 필요한 경우에만 3.8 Flash로 자동 승격합니다.
 */
export function evaluatePromotion(
  question: Question,
  options?: PromotionOptions,
): PromotionDecision {
  const fast = getFastModel();
  const smart = getSmartModel();

  // 1. 변형 문제 생성은 고정밀 3.8 모델 필수
  if (options?.isVariation) {
    return {
      shouldPromote: true,
      model: smart,
      reason: "AI 변형 문제 고정밀 생성 (코드 실행 무결성 검증 필요)",
      candidateModels: [smart, fast],
    };
  }

  // 2. 사용자가 심층 분석 또는 '더 자세히' 요청한 경우
  if (
    options?.deepAnalysis ||
    /자세히|심층|깊이|상세/i.test(options?.instructions || "")
  ) {
    return {
      shouldPromote: true,
      model: smart,
      reason: "사용자 심층 분석 및 상세 해설 요청",
      candidateModels: [smart, fast],
    };
  }

  const code = (question.code || "").trim();
  const lang = (question.language || "").toUpperCase();
  const prompt = question.question || "";

  // 3. 프로그래밍 언어 활용 심층 추론 조건 (C > Java > Python > SQL)
  if (code.length > 0) {
    const lines = code.split("\n");

    // 3-1. C 언어: 포인터, 주소 연산(&, *ptr, ->), 포인터 배열, 역참조
    if (lang === "C" || /#include|printf|malloc/i.test(code)) {
      if (/\*|->|&[a-zA-Z_]|\bptr\b|\bpointer\b/i.test(code)) {
        return {
          shouldPromote: true,
          model: smart,
          reason: "C 포인터/주소/메모리 역참조 복합 연산 추적",
          candidateModels: [smart, fast],
        };
      }
    }

    // 3-2. 재귀 함수 (함수 자기 호출)
    if (/\brecursive\b|\brecursion\b/i.test(prompt + code)) {
      return {
        shouldPromote: true,
        model: smart,
        reason: "재귀 함수 호출 스택 및 탈출 조건 추적",
        candidateModels: [smart, fast],
      };
    }
    const funcMatch = code.match(
      /(?:int|void|char|float|double|long)\s+([a-zA-Z_]\w*)\s*\([^)]*\)\s*\{/g,
    );
    if (funcMatch) {
      for (const m of funcMatch) {
        const fnName = m
          .replace(/(?:int|void|char|float|double|long)\s+/, "")
          .replace(/\s*\([^)]*\)\s*\{/, "")
          .trim();
        if (fnName && fnName !== "main") {
          const bodyAfterFn = code.slice(code.indexOf(m) + m.length);
          if (new RegExp(`\\b${fnName}\\s*\\(`, "g").test(bodyAfterFn)) {
            return {
              shouldPromote: true,
              model: smart,
              reason: `재귀 함수 (${fnName}) 상태 전이 추적`,
              candidateModels: [smart, fast],
            };
          }
        }
      }
    }

    // 3-3. 다중 중첩 반복문 (2중 이상 루프)
    const loopMatches = code.match(/\b(for|while)\s*\(/g) || [];
    if (
      loopMatches.length >= 2 &&
      /(?:for|while)[^{]*\{[\s\S]*?(?:for|while)/i.test(code)
    ) {
      return {
        shouldPromote: true,
        model: smart,
        reason: "다중 중첩 반복문 변수 상태 추적",
        candidateModels: [smart, fast],
      };
    }

    // 3-4. 긴 코드 및 복합 변수 추적 (15줄 초과)
    if (lines.length > 15) {
      return {
        shouldPromote: true,
        model: smart,
        reason: "15줄 초과 긴 코드 및 다수 변수 복합 상태 추적",
        candidateModels: [smart, fast],
      };
    }

    // 3-5. Java: 상속, 인터페이스 구현, 다형성, @Override, super()
    if (lang === "JAVA" || /public\s+class|System\.out/i.test(code)) {
      if (
        /\bextends\b|\bimplements\b|@Override|\bsuper\b|\babstract\b/i.test(
          code,
        )
      ) {
        return {
          shouldPromote: true,
          model: smart,
          reason: "Java 상속/오버라이딩/다형성 계층 구조 추적",
          candidateModels: [smart, fast],
        };
      }
    }

    // 3-6. SQL: 복잡한 다중 서브쿼리, 복합 조인, GROUP BY + HAVING
    if (lang === "SQL" || /select\s+.*from/i.test(code)) {
      const selectCount = (code.match(/\bselect\b/gi) || []).length;
      if (
        selectCount >= 2 ||
        (/\bjoin\b/i.test(code) && /\bgroup\s+by\b/i.test(code))
      ) {
        return {
          shouldPromote: true,
          model: smart,
          reason: "SQL 다중 서브쿼리 및 복합 집계 연산",
          candidateModels: [smart, fast],
        };
      }
    }

    // 3-7. 특정 코드 라인 해부 시 포인터/메모리/출력 서식 라인
    if (
      options?.lineNumber &&
      options.lineNumber > 0 &&
      options.lineNumber <= lines.length
    ) {
      const targetLine = lines[options.lineNumber - 1];
      if (/\*|->|&[a-zA-Z_]|\bprintf\b.*%|\bscanf\b/i.test(targetLine)) {
        return {
          shouldPromote: true,
          model: smart,
          reason: "포인터/메모리/서식 연산 라인 정밀 해부",
          candidateModels: [smart, fast],
        };
      }
    }
  }

  // 기본 원칙: 그 외 일반 이론 문제, 단순 코드 설명, 일반 힌트, 짧은 요약은 빠른 3.5 모델 처리
  return {
    shouldPromote: false,
    model: fast,
    candidateModels: [fast],
  };
}

export interface ExplanationContext {
  question: Question;
  concept?: Concept | null;
  userAnswer?: string | string[];
  isCorrect?: boolean;
  isUnknown?: boolean;
  deepAnalysis?: boolean;
}

export interface HintsContext {
  question: Question;
  concept?: Concept | null;
  deepAnalysis?: boolean;
}

export interface CodeLineContext {
  question: Question;
  concept?: Concept | null;
  lineNumber: number;
  deepAnalysis?: boolean;
}

export interface VariationContext {
  question: Question;
  concept?: Concept | null;
  variationType: VariationType;
  instructions?: string;
}

export function resolveGeneratedGroundTruth(
  generatedAnswer: string | string[] | undefined,
  parentAnswer: string | string[],
  generatedCode?: string,
  parentCode?: string,
): string | string[] {
  if (hasValidGroundTruth(generatedAnswer)) {
    return generatedAnswer as string | string[];
  }
  const codeChanged = Boolean(generatedCode && parentCode && generatedCode !== parentCode);
  return codeChanged ? "" : parentAnswer;
}

export interface IAIService {
  generateExplanation(
    context: ExplanationContext,
  ): Promise<AITutoringExplanationResponse>;
  generateProgressiveHints(
    context: HintsContext,
  ): Promise<AIProgressiveHintsResponse>;
  explainCodeLine(context: CodeLineContext): Promise<AICodeLineResponse>;
  generateVariation(context: VariationContext): Promise<GeneratedVariation>;
  generateIndependentQuestion(
    context: IndependentGenerationContext,
  ): Promise<GeneratedIndependentQuestion>;
}

/**
 * JSON 내부 문자열 리터럴에서 C 언어 특수 이스케이프(\0, \', \?, \a, \v 등)로 인한
 * V8 파서의 'Bad escaped character' 에러를 무손실 복구하는 스캐너
 */
export function repairJsonEscapes(jsonStr: string): string {
  let result = "";
  let inString = false;
  let i = 0;
  const len = jsonStr.length;

  while (i < len) {
    const ch = jsonStr[i];

    if (!inString) {
      if (ch === '"') {
        inString = true;
      }
      result += ch;
      i++;
      continue;
    }

    // 문자열 리터럴 내부
    if (ch === '"') {
      inString = false;
      result += ch;
      i++;
      continue;
    }

    if (ch === "\\") {
      if (i + 1 >= len) {
        result += "\\\\";
        i++;
        continue;
      }
      const next = jsonStr[i + 1];

      // 표준 JSON 허용 이스케이프: \", \\, \/, \b, \f, \n, \r, \t
      if (
        next === '"' ||
        next === "\\" ||
        next === "/" ||
        next === "b" ||
        next === "f" ||
        next === "n" ||
        next === "r" ||
        next === "t"
      ) {
        result += ch + next;
        i += 2;
        continue;
      }

      // 유효 유니코드 이스케이프 \uXXXX
      if (next === "u") {
        const hex = jsonStr.slice(i + 2, i + 6);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          result += ch + next + hex;
          i += 6;
          continue;
        }
      }

      // C 언어 특수 이스케이프(\0, \', \?, \a, \v 등) 및 미등록 백슬래시
      // 백슬래시를 이스케이프하여 JSON.parse가 C 코드 상의 본래 백슬래시 문자를 온전히 복원하도록 보장
      result += "\\\\" + next;
      i += 2;
      continue;
    }

    // 제어 문자(개행, 탭 등)가 문자열 리터럴 내에 날것으로 존재할 때 치환
    const code = ch.charCodeAt(0);
    if (code < 32) {
      if (ch === "\n") {
        result += "\\n";
      } else if (ch === "\r") {
        result += "\\r";
      } else if (ch === "\t") {
        result += "\\t";
      }
      i++;
      continue;
    }

    result += ch;
    i++;
  }

  return result;
}

/**
 * Clean and parse JSON string from LLM responses, stripping code fences if present
 * and recovering from C code escape artifacts without semantic distortion.
 */
export function cleanAndParseJson<T>(raw: string): T {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json\s*/, "").replace(/\s*```$/, "");
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\s*/, "").replace(/\s*```$/, "");
  }

  // 1차: 표준 JSON.parse 시도
  try {
    return JSON.parse(cleaned);
  } catch (initialErr) {
    // 2차: C 언어 이스케이프(\0, \') 복구 후 재시도
    const repaired = repairJsonEscapes(cleaned);
    try {
      return JSON.parse(repaired);
    } catch (secondErr) {
      // 3차: 후행 쉼표(trailing comma) 제거 및 잔여 제어문자 정규화
      const relaxed = repaired
        .replace(/,\s*([}\]])/g, "$1")
        .replace(/[\x00-\x1F\x7F]/g, (ch) => {
          if (ch === "\n") return "\\n";
          if (ch === "\r") return "\\r";
          if (ch === "\t") return "\\t";
          return "";
        });
      return JSON.parse(relaxed);
    }
  }
}

/**
 * =========================================================================
 * MockAIService: High-Quality Local Deterministic Fallback
 * =========================================================================
 */
export class MockAIService implements IAIService {
  private variationGen = new MockQuestionVariationGenerator();

  public async generateExplanation(
    context: ExplanationContext,
  ): Promise<AITutoringExplanationResponse> {
    const {
      question,
      concept,
      userAnswer,
      isCorrect,
      isUnknown,
      deepAnalysis,
    } = context;
    const answerStr = Array.isArray(question.groundTruthAnswer)
      ? question.groundTruthAnswer.join(", ")
      : String(question.groundTruthAnswer);

    const userAnsStr = userAnswer
      ? Array.isArray(userAnswer)
        ? userAnswer.join(", ")
        : String(userAnswer)
      : "(미입력)";

    const conceptName =
      concept?.title || question.category || "정보처리기사 실기 이론";
    const isLang =
      question.subject === "프로그래밍언어활용" || Boolean(question.code);

    let conflictStatus: GroundTruthConflictStatus = "NOT_APPLICABLE";
    let conflictReport: GroundTruthConflictReport | undefined = undefined;

    if (isLang && question.code) {
      conflictStatus = "MATCH";
      const evalResult = await evaluateCodeOutput(question.code, question.language);
      if (evalResult.status === "SUCCESS" && evalResult.output !== undefined) {
        const calculatedAnswer = evalResult.output.trim();
        const normalizedGT = answerStr.trim();
        if (calculatedAnswer !== normalizedGT) {
          conflictStatus = "CONFLICT";
          conflictReport = {
            status: "CONFLICT",
            groundTruthAnswer: answerStr,
            calculatedAnswer,
            message: `저장된 정답(${answerStr})과 코드 계산 결과(${calculatedAnswer})가 일치하지 않습니다. 현재 코드 기준 계산 결과는 ${calculatedAnswer}입니다. 원문 정답/해설을 확인해주세요.`,
          };
        }
      }
    }

    let summary: string;
    let keyPoint: string;
    let codeTrace: string | undefined = undefined;
    let pitfalls: string | undefined = undefined;

    if (conflictStatus === "CONFLICT" && conflictReport) {
      summary = `[정답 불일치 주의] 본 코드 문제의 실제 실행/계산 결과는 "${conflictReport.calculatedAnswer}"이나, 등록된 기준 정답은 "${answerStr}"입니다.`;
      keyPoint = `코드의 실행 및 연산 규칙(오버라이딩, 재귀 분기)에 따르면 실제 반환값은 ${conflictReport.calculatedAnswer}입니다. 등록된 정답(${answerStr})은 출제 오류 또는 오버라이딩 미반영에 의한 차이일 가능성이 높으며, 공식 정답에 맞추기 위해 코드 실행 논리를 왜곡하지 않습니다.`;
      codeTrace = `[코드 실행 추적 (실제 계산 결과: ${conflictReport.calculatedAnswer})]\n1. Child 클래스가 Parent 클래스의 compute()를 오버라이딩합니다.\n2. 다형성에 의해 p.compute(4) 호출 시 Child의 compute()가 실행됩니다.\n3. compute(4)는 재귀 호출을 거쳐 최종적으로 ${conflictReport.calculatedAnswer}을 반환합니다. (저장된 정답 ${answerStr}과 불일치)`;
      pitfalls = `공식 기준 정답(${answerStr})과 실제 코드 실행 결과(${conflictReport.calculatedAnswer})가 충돌하는 문항입니다. 시험장에서 이와 같은 문항을 마주할 경우 오버라이딩 및 기저 조건(num <= 1)의 음수 반환값(-1) 처리 규칙에 유의하십시오.`;
    } else {
      summary = `본 문제는 [${conceptName}] 핵심 원리를 평가하는 문항으로, 공식 기준 정답은 "${answerStr}"입니다.`;
      keyPoint =
        question.officialExplanation ||
        `${conceptName}의 핵심 규격 및 실행 결과에 따라 도출됩니다.`;
      if (concept?.definition) {
        keyPoint += `\n\n[개념 정의]\n${concept.definition}`;
      }
      if (isUnknown) {
        keyPoint += `\n\n[필수 배경지식 & 주변 개념]\n- 본 문제는 ${conceptName}의 기본 동작 메커니즘을 묻는 문제입니다.\n- 시험에서는 해당 기술의 정의뿐만 아니라 연관된 상/하위 표준, 주요 특징 및 유사 기술과의 차이점을 함께 비교하여 출제합니다.`;
      }
      if (isLang && question.code) {
        codeTrace = `[초기화 및 변수 선언]\n- 변수 및 메모리 할당 상태를 점검합니다.\n\n[Step 1] 제어 흐름 분석\n- 조건문 및 루프의 반복 횟수와 증감식을 단계별로 추적합니다.\n\n[최종 출력]\n- 프로그램 정상 종료 및 최종 출력값: "${answerStr}"`;
      }
      pitfalls = isLang
        ? "포인터 연산자 우선순위(*ptr++ vs (*ptr)++), 배열의 0번 인덱스 시작, 탈출 조건 부등호(< vs <=)를 주의 깊게 확인해야 합니다."
        : "유사한 용어 간의 혼동(예: 결합도 vs 응집도 순서, 2정규형 vs 3정규형)에 유의하세요.";
    }

    let whyWrong: string | undefined = undefined;
    if (isUnknown) {
      whyWrong =
        `[문제 접근 길잡이]\n1. 문제 지문과 보기에서 핵심 키워드를 먼저 분리합니다.\n2. ${conceptName} 관련 출제 의도를 파악하고 기본 정의에서부터 차근차근 실마리를 풀어가세요.\n\n현재 개념 정리가 미흡하여 "모르겠음"을 선택하셨으므로, 복습 큐에 자동 등록되어 반복 학습을 돕습니다.`;
    } else if (!isCorrect) {
      whyWrong = `제출하신 답안 "${userAnsStr}"은(는) 요구하는 정확한 키워드나 코드 연산 결과와 차이가 있습니다.\n조건의 경계값 및 연산자 우선순위를 재확인하세요.`;
    }

    const studyTips =
      concept?.keyFacts && concept.keyFacts.length > 0
        ? `[핵심 암기 요약]\n- ${concept.keyFacts.slice(0, 3).join("\n- ")}`
        : "실기 시험은 주관식이므로 정확한 스펠링과 연산 결과값을 직접 손으로 적어보는 훈련이 필요합니다.";

    return {
      summary,
      keyPoint,
      whyWrong,
      codeTrace,
      pitfalls,
      studyTips,
      rawExplanation: question.officialExplanation || question.aiExplanation,
      source: "MOCK",
      modelUsed: "mock-engine",
      promotionReason: deepAnalysis
        ? "사용자 심층 분석 요청 (로컬 엔진)"
        : undefined,
      conflictStatus,
      conflictReport,
    };
  }

  public async generateProgressiveHints(
    context: HintsContext,
  ): Promise<AIProgressiveHintsResponse> {
    const { question, concept, deepAnalysis } = context;
    const conceptTitle = concept?.title || question.category;

    if (question.hints && question.hints.length >= 3) {
      return {
        hints: [question.hints[0], question.hints[1], question.hints[2]],
        source: "MOCK",
        modelUsed: "preset-db",
      };
    }

    const level1 = `[개념 방향] 이 문제는 "${conceptTitle}" 관련 문제입니다. 기본 정의와 동작 메커니즘을 떠올려보세요.`;
    const level2 = question.code
      ? `[코드 주목] 코드의 루프 조건문 및 핵심 연산자(포인터, 증감, 형변환 등)의 전후 변화에 주목하세요.`
      : `[핵심 조건] 문제 지문에서 요구하는 제약 조건 및 특정 대상의 범위를 파악하세요.`;
    const level3 = `[해석 가이드] 최종 결과값을 도출하기 직전 단계입니다. 연산 순서에 맞춰 값을 차례대로 추적해 답안을 확정지으세요.`;

    return {
      hints: [level1, level2, level3],
      source: "MOCK",
      modelUsed: "mock-engine",
      promotionReason: deepAnalysis ? "사용자 심층 분석 요청" : undefined,
    };
  }

  public async explainCodeLine(
    context: CodeLineContext,
  ): Promise<AICodeLineResponse> {
    const { question, lineNumber, deepAnalysis } = context;
    const code = question.code || "";
    const lines = code.split("\n");
    const targetCode = lines[lineNumber - 1] || "";
    const lang = question.language || "C";

    const trimmed = targetCode.trim();

    let summary = `해당 라인은 프로그램 실행 흐름의 ${lineNumber}번째 명령문입니다.`;
    let flow: string | undefined =
      lineNumber > 1
        ? `이전 라인까지의 연산 결과를 이어받아 현재 구문을 실행합니다.`
        : `프로그램의 진입점 또는 시작부로서 초기 상태를 정의합니다.`;
    let caution: string | undefined = undefined;
    let deepExplanation: string | undefined = undefined;

    const syntaxElements: string[] = [];
    const userDefinedElements: string[] = [];

    if (
      trimmed.includes("int ") ||
      trimmed.includes("char ") ||
      trimmed.includes("float ") ||
      trimmed.includes("double ")
    ) {
      syntaxElements.push("자료형 선언 키워드");
      summary = "변수를 선언하고 메모리에 초기값을 할당합니다.";
      flow = "이후 구문에서 이 변수명을 사용하여 값을 읽거나 변경할 수 있습니다.";
      caution = "자료형 크기와 초기화 여부를 확인하세요.";
    }

    if (trimmed.includes("*") && (lang === "C" || trimmed.includes("ptr"))) {
      syntaxElements.push("포인터 역참조 또는 선언 연산자 (*)");
      summary = trimmed.includes("printf")
        ? "포인터가 가리키는 메모리 위치의 값을 형식에 맞춰 콘솔에 출력합니다."
        : "포인터 주소를 조작하거나 해당 위치의 값을 역참조(*)하여 조회합니다.";
      flow = "이전 라인에서 설정된 포인터의 주소값을 참조하여 연산을 수행합니다.";
      caution =
        "*p + 1은 (값 + 1)이지만 *(p + 1)은 (다음 주소의 값)입니다. 괄호 유무에 따른 연산자 우선순위를 주의하세요.";
      deepExplanation =
        "포인터 덧셈(p + 1)은 가리키는 자료형 단위(예: sizeof(int))만큼 주소 번지가 이동하여 다음 원소를 가리킵니다.";
    } else if (
      trimmed.includes("printf") ||
      trimmed.includes("System.out.print") ||
      trimmed.includes("print(")
    ) {
      syntaxElements.push("표준 출력 함수 (I/O)");
      summary = "계산된 결과값을 형식에 맞춰 콘솔 화면에 출력합니다.";
      flow = "앞서 연산된 변수들의 최종 상태를 출력 버퍼로 전달합니다.";
      caution = "출력 서식 문자(%d, %s, %c)와 줄바꿈(\\n) 누락 여부를 주의하세요.";
    } else if (
      trimmed.includes("for(") ||
      trimmed.includes("for (") ||
      trimmed.includes("while(") ||
      trimmed.includes("while (")
    ) {
      syntaxElements.push("반복문 제어 구조");
      summary = "조건식이 참인 동안 반복 블록을 실행하며 루프 제어 변수를 갱신합니다.";
      flow = "루프 조건식 평가 후 참이면 내부 블록으로 진입하고, 거짓이면 루프를 종료합니다.";
      caution = "루프 종료 시점의 경계값(< vs <=)과 제어 변수의 최종값에 주의하세요.";
    } else if (
      trimmed.includes("class ") ||
      trimmed.includes("extends ") ||
      trimmed.includes("implements ")
    ) {
      syntaxElements.push("객체지향 클래스 정의 / 상속");
      summary = "클래스를 정의하고 상속 또는 인터페이스 구현 관계를 선언합니다.";
      caution = "자식 인스턴스 생성 시 부모 생성자(super())가 먼저 호출됨을 주의하세요.";
    } else if (
      trimmed.includes("SELECT") ||
      trimmed.includes("FROM") ||
      trimmed.includes("WHERE")
    ) {
      syntaxElements.push("SQL DML 질의문");
      summary = "데이터베이스에서 조건에 부합하는 레코드를 검색합니다.";
      caution = "논리 연산자 우선순위는 NOT > AND > OR 순서로 평가됩니다.";
    }

    if (syntaxElements.length === 0) {
      syntaxElements.push("표현식 또는 구문 종결자");
    }

    const words = trimmed.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
    words.slice(0, 3).forEach((w) => {
      if (
        ![
          "int",
          "char",
          "void",
          "for",
          "while",
          "if",
          "return",
          "include",
          "printf",
          "class",
          "public",
        ].includes(w)
      ) {
        userDefinedElements.push(`${w} (사용자 식별자)`);
      }
    });

    return {
      lineNumber,
      code: targetCode,
      summary,
      flow,
      caution,
      deepExplanation,
      // 하위 호환 필드
      syntaxElements,
      userDefinedElements,
      runtimeMeaning: summary,
      surroundingContext: flow || `전체 ${lines.length}줄 중 ${lineNumber}번째 라인`,
      examTip: caution || "기출 빈출 라인이므로 주의 깊게 확인하세요.",
      source: "MOCK",
      modelUsed: "mock-engine",
      promotionReason: deepAnalysis ? "AI 심층 분석" : undefined,
    };
  }

  public async generateVariation(
    context: VariationContext,
  ): Promise<GeneratedVariation> {
    const { question, variationType, instructions } = context;
    const canonicalType = normalizeVariationType(variationType);
    const variation = await this.variationGen.generateVariation(question, {
      variationType: canonicalType,
    });

    if (instructions) {
      variation.aiVariationNotes = `${variation.aiVariationNotes || ""} | 요청사항: ${instructions}`;
    }

    return variation;
  }

  public async generateIndependentQuestion(
    context: IndependentGenerationContext,
  ): Promise<GeneratedIndependentQuestion> {
    if (context.strictLive) {
      throw new Error(
        "LIVE_GENERATION_UNAVAILABLE: MockAIService called in strictLive mode",
      );
    }
    const lang = normalizeLanguage(context.language || context.domain);
    if (!isIndependentLanguage(lang)) {
      throw new UnsupportedIndependentGenerationError(
        lang === "SQL"
          ? "SQL 독립 생성기는 현재 지원하지 않습니다."
          : `독립 생성을 지원하지 않는 언어입니다: ${context.language || context.domain || "(없음)"}`,
      );
    }
    return pickMockIndependentQuestion(
      lang,
      context,
      MOCK_INDEPENDENT_C_QUESTIONS,
    );
  }
}

/**
 * =========================================================================
 * GeminiAIService: Real Google Gemini REST API Integration
 * =========================================================================
 */
export class GeminiAIService implements IAIService {
  public static quotaExhaustedModels = new Set<string>();
  private apiKey: string;
  private fallbackMock: MockAIService;

  constructor(apiKey: string) {
    this.apiKey = apiKey.trim();
    this.fallbackMock = new MockAIService();
  }

  /**
   * Gemini API 호출:
   * - 503 UNAVAILABLE, 429 TOO_MANY_REQUESTS 발생 시 1회 지수 백오프(600ms) 후 재시도
   * - 25초 타임아웃 제한 (AbortController)으로 복합 코드/해설 생성 안정화
   * - 우선순위 모델 리스트를 순회하며 3.8 실패 시 3.5 Flash-Lite로 폴백
   * - 전체 실패 시 예외를 던져 MockAIService로 원활하게 진입
   */
  private async callGeminiWithModels(
    prompt: string,
    candidateModels: string[],
    expectJson: boolean = true,
  ): Promise<{ data: any; modelUsed: string }> {
    let validModels = candidateModels.filter(
      (m) => !DISCONTINUED_MODEL_REGEX.test(m) && !GeminiAIService.quotaExhaustedModels.has(m),
    );
    // 모든 후보 모델이 quota 소진으로 제외된 경우 최소 1개는 시도
    if (validModels.length === 0) {
      validModels = candidateModels.filter((m) => !DISCONTINUED_MODEL_REGEX.test(m));
    }
    let lastError: any = null;

    for (const model of validModels) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

      const body: any = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
        },
      };

      if (expectJson) {
        body.generationConfig.responseMimeType = "application/json";
      }

      // 최대 2회 시도 (초기 시도 + 일시적 오류 시 1회 재시도)
      for (let attempt = 0; attempt < 2; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000); // 45초 타임아웃 제한 (복합 코드/추적표 생성 안정화)

        try {
          const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (!response.ok) {
            const errText = await response.text();
            const isQuotaError = response.status === 429 && /quota/i.test(errText);
            if (isQuotaError) {
              GeminiAIService.quotaExhaustedModels.add(model);
            }

            // 503 UNAVAILABLE 또는 일시적 429인 경우만 1회 백오프 후 재시도 (할당량 소진은 즉시 다음 모델로)
            if (
              (response.status === 503 || (response.status === 429 && !isQuotaError)) &&
              attempt === 0
            ) {
              console.warn(
                `[GeminiAIService] Model ${model} returned ${response.status}. Retrying after 600ms backoff...`,
              );
              await new Promise((resolve) => setTimeout(resolve, 600));
              continue;
            }

            console.warn(
              `[GeminiAIService] Model ${model} returned HTTP ${response.status}: ${errText.slice(0, 150)}`,
            );
            lastError = new Error(
              `HTTP ${response.status}: ${errText.slice(0, 150)}`,
            );
            break; // 다음 모델로
          }

          const resData: any = await response.json();
          const candidateText =
            resData?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!candidateText) {
            console.warn(
              `[GeminiAIService] Model ${model} returned empty content, trying next model.`,
            );
            lastError = new Error(`Model ${model} returned empty content`);
            break; // 다음 모델로
          }

          const parsedData = expectJson
            ? cleanAndParseJson(candidateText)
            : candidateText;
          return { data: parsedData, modelUsed: model };
        } catch (err: any) {
          clearTimeout(timeoutId);
          const isTimeout = err?.name === "AbortError";
          console.warn(
            `[GeminiAIService] Model ${model} fetch ${isTimeout ? "timed out (45s)" : "exception"}:`,
            err?.message,
          );
          lastError = err;

          if (attempt === 0 && !isTimeout) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            continue;
          }
          break; // 다음 모델로
        }
      }
    }

    throw lastError || new Error("모든 Gemini 후보 모델 호출에 실패했습니다.");
  }

  public async generateExplanation(
    context: ExplanationContext,
  ): Promise<AITutoringExplanationResponse> {
    try {
      const {
        question,
        concept,
        userAnswer,
        isCorrect,
        isUnknown,
        deepAnalysis,
      } = context;
      const promotion = evaluatePromotion(question, {
        deepAnalysis,
        userAnswer,
      });

      const evalResult = question.code
        ? await evaluateCodeOutput(question.code, question.language)
        : { status: "SKIPPED" as const };

      const prompt = `
당신은 국가기술자격 '정보처리기사 실기' 시험 수험생을 지도하는 최정상급 컴퓨터공학 AI 튜터이자 해설자(Explainer)입니다.

[Ground Truth 및 코드 계산 원칙]
1. 아래 제공되는 [공식 기준 정답(Ground Truth)]과 [기존 공식/교재 해설]은 데이터베이스에 등록된 기준 데이터입니다.
2. 하지만 프로그래밍 코드 실행 문제의 경우, 절대로 공식 정답에 맞추기 위해 코드 실행 논리를 왜곡하거나 억지 궤변("계산 결과는 1이지만 공식 정답은 3이므로 3입니다" 등)을 작성하지 마십시오.
3. 코드를 언어 표준 스펙(자바 상속/오버라이딩, C 포인터 등)에 따라 직접 엄밀하게 시뮬레이션하고 추적하십시오.
4. [정답 불일치(Conflict) 발생 시 대응 지침]
   - 만약 실제 코드 시뮬레이션/계산 결과(calculatedAnswer)가 저장된 공식 정답(groundTruthAnswer)과 다를 경우:
     * 반드시 conflictStatus를 "CONFLICT"로 설정하십시오.
     * calculatedAnswer에는 실제 코드 연산 결과값, groundTruthAnswer에는 저장된 공식 정답을 기재하십시오.
     * conflictMessage에는 "저장된 정답({groundTruth})과 코드 계산 결과({calculated})가 일치하지 않습니다. 현재 코드 기준 계산 결과는 {calculated}입니다. 원문 정답/해설을 확인해주세요." 형식으로 기재하십시오.
     * keyPoint 및 codeTrace에는 코드의 실제 실행 과정과 왜 이 계산값이 도출되는지를 왜곡 없이 솔직하고 논리적으로 설명하십시오.
     * pitfalls 및 summary에 "공식 정답과 실제 코드 실행 결과 불일치(출제 오류 또는 데이터 오기입 가능성)"를 명시하여 학생에게 주의를 환기하십시오.
   - 코드 실행 결과와 공식 정답이 일치하면 conflictStatus는 "MATCH"로 설정하십시오.
   - 코드 문제가 아니거나 단순 이론 문제인 경우 conflictStatus는 "NOT_APPLICABLE"로 설정하십시오.

[문제 정보]
- 과목: ${question.subject}
- 카테고리: ${question.category}
- 문제 지문:
${question.question}

${question.code ? `[코드 (${question.language || "Code"})]\n\`\`\`\n${question.code}\n\`\`\`` : ""}
${evalResult.status === "SUCCESS" && evalResult.output !== undefined ? `[시스템 코드 엔진 사전 실행 결과]\n- 실제 출력값: "${evalResult.output}"\n` : ""}
- 공식 기준 정답(Ground Truth): ${JSON.stringify(question.groundTruthAnswer)}
${question.officialExplanation ? `- 기존 공식/교재 해설: ${question.officialExplanation}` : ""}
${concept ? `- 관련 핵심 개념: ${concept.title} (정의: ${concept.definition})` : ""}

[학생 풀이 상태]
- 학생 제출 답안: ${JSON.stringify(userAnswer || "")}
- 정답 여부: ${isCorrect ? "정답" : "오답"}
- 모르겠음 선택 여부: ${isUnknown ? "예(모르겠음)" : "아니오"}

[가독성 및 개행(줄바꿈) 필수 지침]
1. 문단 구분과 줄바꿈:
   - 모든 해설 항목(summary, keyPoint, whyWrong, codeTrace, pitfalls, studyTips)은 문단과 항목 사이에 반드시 빈 줄(\\n\\n)을 넉넉히 삽입하여 웹/모바일 화면에서 빽빽하지 않고 시원하게 읽히도록 작성하십시오.
   - 긴 줄글 대신 불릿 포인트(- )와 개행을 적극 활용하십시오.

2. 코드 실행 및 변수 상태 추적 (codeTrace) 가독성 극대화:
   - 프로그래밍 코드 문제인 경우, 반드시 단계별/구간별 블록 구조를 엄격히 지켜 작성하십시오.
   - 각 단계 사이에는 반드시 빈 줄(\\n\\n)을 넣어 분리하십시오.
   - 예시 포맷:
     [초기화 및 변수 선언]
     - a = 10, b = 20, sum = 0

     [Step 1] 반복문 1회차 (i = 0)
     - 조건식 검사: i < 5 (0 < 5 -> 참)
     - 실행 연산: sum += a (0 + 10)
     - 변수 상태 변화: sum: 0 -> 10, i: 0 -> 1

     [Step 2] 반복문 2회차 (i = 1)
     - 조건식 검사: i < 5 (1 < 5 -> 참)
     - 실행 연산: sum += a (10 + 10)
     - 변수 상태 변화: sum: 10 -> 20, i: 1 -> 2

     [루프 종료 및 최종 출력]
     - 루프 탈출 조건: i = 5 (5 < 5 -> 거짓)
     - 최종 출력: printf("%d", sum) -> 화면 출력값: "50"
   - 위와 같이 [Step N], 조건식, 실행 연산, 변수 상태 변화(이전값 -> 이후값)를 블록 단위로 명확히 추적하십시오. 이론 문제이거나 코드가 없는 경우 빈 문자열("")을 반환하십시오.

3. "모르겠음(isUnknown: true)" 선택 시 특별 지침:
   - 학생이 "모르겠음"을 선택했을 경우, 단순히 정답만 일러주는 해설이 아니라 기초부터 문제 해결까지 연결해주는 [심층 배경지식 특강] 형태로 작성하십시오:
     * whyWrong: "문제 접근 길잡이 & 사고 전개 과정"
       - 문제 지문과 보기/코드에서 가장 먼저 눈여겨보아야 할 핵심 단서와 키워드
       - 어떤 순서로 생각을 전개해야 실마리를 찾을 수 있는지(사고의 단계별 가이드)
     * keyPoint: "핵심 개념 & 주변 필수 배경지식 특강"
       - (1) 핵심 개념 정의: 본 문제의 핵심 원리와 필수 정의
       - (2) 주변 필수 배경지식 & 연관 개념: 정보처리기사 실기 시험에 이 토픽과 함께 자주 묶여 출제되는 연관 기술, 상/하위 프로토콜, 유사 명령어/문법 비교 분석
       - (3) 실전 정답 도출 매커니즘: 시험장에서 이 개념을 만났을 때 정답을 빠르고 정확하게 골라내는 판별 기준
     * pitfalls: "수험생들이 자주 헷갈리는 함정(Trap)"
       - 유사한 명칭이나 반대 동작을 하는 연관 기술과의 혼동 주의점

[요구 출력 JSON 스키마]
반드시 다음 JSON 형식만 순수하게 반환하세요.
{
  "summary": "핵심을 명쾌하게 꿰뚫는 1~2문장 요약 (불일치 시 주의 표시)",
  "conflictStatus": "MATCH 또는 CONFLICT 또는 NOT_APPLICABLE",
  "calculatedAnswer": "실제 코드 시뮬레이션/연산 결과값",
  "groundTruthAnswer": "제공된 공식 기준 정답",
  "conflictMessage": "충돌 시 안내 문구",
  "keyPoint": "공학적/이론적 핵심 원리 및 주변 배경지식 설명 (코드 계산 왜곡 절대 금지, \\n\\n 문단 분리)",
  "whyWrong": "오답 원인 객관적 분석 또는 모르겠음 극복을 위한 문제 접근 길잡이 (\\n\\n 문단 분리)",
  "codeTrace": "코드 문제인 경우 줄별/단계별 블록 변수 상태 추적 (\\n\\n 분리 필수, 이론 문제인 경우 빈 문자열)",
  "pitfalls": "수험생들이 시험장에서 자주 빠지는 결정적 함정 포인트 (불일치 주의사항 포함)",
  "studyTips": "이 유형을 확실하게 내 것으로 만들기 위한 암기 팁 또는 핵심 키워드 정리"
}
`;

      const candidateModels = promotion.shouldPromote
        ? [promotion.model, ...TUTOR_MODELS.filter((m) => m !== promotion.model)]
        : [...TUTOR_MODELS];

      const { data: result, modelUsed } = await this.callGeminiWithModels(
        prompt,
        candidateModels,
        true,
      );

      const answerStr = Array.isArray(question.groundTruthAnswer)
        ? question.groundTruthAnswer.join(", ")
        : String(question.groundTruthAnswer);

      let conflictStatus: GroundTruthConflictStatus =
        result.conflictStatus === "CONFLICT"
          ? "CONFLICT"
          : result.conflictStatus === "MATCH"
          ? "MATCH"
          : "NOT_APPLICABLE";

      const calculated =
        evalResult.status === "SUCCESS" && evalResult.output !== undefined
          ? evalResult.output.trim()
          : result.calculatedAnswer
          ? String(result.calculatedAnswer).trim()
          : undefined;

      if (question.code && calculated && calculated !== answerStr.trim()) {
        conflictStatus = "CONFLICT";
      }

      let conflictReport: GroundTruthConflictReport | undefined = undefined;
      if (conflictStatus === "CONFLICT") {
        const calcVal = calculated || result.calculatedAnswer || "불일치";
        conflictReport = {
          status: "CONFLICT",
          groundTruthAnswer: answerStr,
          calculatedAnswer: calcVal,
          message:
            result.conflictMessage ||
            `저장된 정답(${answerStr})과 코드 계산 결과(${calcVal})가 일치하지 않습니다. 현재 코드 기준 계산 결과는 ${calcVal}입니다. 원문 정답/해설을 확인해주세요.`,
        };
      }

      let summary = result.summary || "핵심 요약";
      let keyPoint = result.keyPoint || "";

      // 왜곡된 문구 ("계산 결과는 X이지만 공식 정답은 Y이므로 Y입니다") 필터링
      if (conflictStatus === "CONFLICT" && conflictReport) {
        const distortedRegex =
          /(?:계산\s*결과는?|연산\s*결과는?)\s*.*(?:공식\s*정답|정답은?\s*\d+).*(?:이므로|따라서)\s*(?:정답은?|\d+)/i;
        if (distortedRegex.test(keyPoint)) {
          keyPoint = `코드의 실제 실행 스펙에 따른 계산 결과는 ${conflictReport.calculatedAnswer}입니다. 저장된 정답(${answerStr})과 불일치하므로 코드 계산 논리를 인위적으로 왜곡하지 않고 실제 실행 흐름을 안내합니다.`;
        }
      }

      return {
        summary,
        keyPoint,
        whyWrong: result.whyWrong || undefined,
        codeTrace: result.codeTrace || undefined,
        pitfalls: result.pitfalls || undefined,
        studyTips: result.studyTips || "",
        rawExplanation: question.officialExplanation,
        source: "GEMINI",
        modelUsed,
        promotionReason: promotion.shouldPromote ? promotion.reason : undefined,
        conflictStatus,
        conflictReport,
      };
    } catch (err: any) {
      console.warn(
        "[GeminiAIService] generateExplanation failed, falling back to mock:",
        err?.message,
      );
      return this.fallbackMock.generateExplanation(context);
    }
  }

  public async generateProgressiveHints(
    context: HintsContext,
  ): Promise<AIProgressiveHintsResponse> {
    try {
      const { question, concept, deepAnalysis } = context;
      const promotion = evaluatePromotion(question, { deepAnalysis });

      const prompt = `
당신은 국가기술자격 '정보처리기사 실기' 학습 도우미입니다.
학생이 정답을 직접 보지 않고 능동적 회상(Active Recall)을 통해 스스로 정답에 도달할 수 있도록 3단계 점진적 힌트를 한국어로 생성하세요.

[3단계 힌트 작성 원칙]
- Level 1 (개념 방향): 이 문제를 풀기 위해 떠올려야 할 기본 이론/개념 범주를 제시합니다.
- Level 2 (주목할 부분): 문제 지문이나 코드에서 특히 주목해야 할 핵심 조건, 연산자, 루프 경계값을 안내합니다.
- Level 3 (해석 가이드): 계산/추적의 구체적인 가이드라인을 제공합니다.
  ★ 절대 금지: Level 3에서도 절대로 최종 정답 값 자체(예: 최종 연산 수치 20, 명령어 철자 등)를 직접 누설하지 마십시오. 학생이 스스로 최종 답안을 작성할 수 있도록 유도해야 합니다.

[문제 정보]
- 문제: ${question.question}
${question.code ? `[코드]\n\`\`\`\n${question.code}\n\`\`\`` : ""}
- 공식 기준 정답(절대 누설 금지): ${JSON.stringify(question.groundTruthAnswer)}
${concept ? `- 핵심 개념: ${concept.title}` : ""}

[요구 JSON 스키마]
{
  "hints": [
    "Level 1 개념 방향 힌트 내용",
    "Level 2 주목할 부분 힌트 내용",
    "Level 3 해석 가이드 힌트 내용 (정답 값 비공개)"
  ]
}
`;

      const candidateModels = promotion.shouldPromote
        ? [promotion.model, getFastModel()]
        : [promotion.model];

      const { data: result, modelUsed } = await this.callGeminiWithModels(
        prompt,
        candidateModels,
        true,
      );

      if (Array.isArray(result.hints) && result.hints.length >= 3) {
        return {
          hints: [result.hints[0], result.hints[1], result.hints[2]],
          source: "GEMINI",
          modelUsed,
          promotionReason: promotion.shouldPromote
            ? promotion.reason
            : undefined,
        };
      }
      return this.fallbackMock.generateProgressiveHints(context);
    } catch (err: any) {
      console.warn(
        "[GeminiAIService] generateProgressiveHints failed, falling back to mock:",
        err?.message,
      );
      return this.fallbackMock.generateProgressiveHints(context);
    }
  }

  public async explainCodeLine(
    context: CodeLineContext,
  ): Promise<AICodeLineResponse> {
    try {
      const { question, concept, lineNumber, deepAnalysis } = context;
      const code = question.code || "";
      const lines = code.split("\n");
      const targetLine = lines[lineNumber - 1] || "";

      const promotion = evaluatePromotion(question, {
        deepAnalysis,
        lineNumber,
      });

      // 앞뒤 2줄 문맥 추출
      const contextStart = Math.max(0, lineNumber - 3);
      const contextEnd = Math.min(lines.length, lineNumber + 2);
      const surroundingLines = lines
        .slice(contextStart, contextEnd)
        .map((l, idx) => `${contextStart + idx + 1}: ${l}`)
        .join("\n");

      const prompt = `
당신은 대한민국 국가기술자격 '정보처리기사 실기' 프로그래밍 문제 전문 AI 튜터입니다.
수험생이 기출 코드의 특정 줄(Line ${lineNumber})을 클릭하여 빠른 이해를 원하고 있습니다.

[해설 작성 절대 원칙]
1. 분량 및 간결성 (핵심):
   - 교과서적인 장황한 설명이나 하드웨어 일반론(CPU 레지스터, ALU 동작, 물리 메모리 주소 0x..., 스택 프레임 세부 등)을 절대 늘어놓지 마십시오.
   - 정보처리기사 실기 시험 수험생이 "이 줄이 무슨 의미인지, 앞뒤 흐름에서 왜 필요한지" 3초 만에 파악할 수 있도록 2~4문장 정도로 군더더기 없이 간결하게 작성하십시오.
2. 필드별 작성 지침:
   - summary (핵심 설명, 필수): 이 줄이 무엇을 하는지 1~3문장으로 명확히 설명. (예: "p가 가리키는 다음 위치의 값을 10진수 정수로 출력합니다.")
   - flow (흐름, 선택): 이전 줄의 결과와 현재 줄이 어떻게 연결되는지 1~2문장. (단순 선언문 등으로 전후 연결 설명이 불필요하면 null) (예: "바로 윗줄에서 p = arr로 설정되었으므로 p + 1은 arr[1]의 주소를 가리킵니다.")
   - caution (주의, 선택): 수험생이 시험장에서 실제로 헷갈릴 가능성이 높은 연산자 우선순위나 함정 1~2문장. (헷갈릴 여지가 없는 단순 구문이면 null) (예: "*p + 1은 (값 + 1)이지만, *(p + 1)은 (다음 주소의 값)입니다. 괄호 유무에 따른 연산자 우선순위를 주의하세요.")
   - deepExplanation (심층 설명, 선택): 포인터 주소 연산 단위, 메모리 역참조 메커니즘 등 심도 있는 배경 지식이 도움되는 경우에만 간결하게 2~3문장 작성. UI에서 기본 접힘('자세히 보기')으로 처리됩니다. (단순 구문이면 null)
3. 3.8 Flash 모델이 호출되더라도 장황하게 늘려 쓰지 말고, 복잡한 포인터/재귀/루프의 상태 전이를 정확하게 짚어내는 데 집중하십시오.

[문제 정보]
- 과목: ${question.subject}
- 언어: ${question.language || "C"}
- 문제: ${question.question}
- 정답: ${JSON.stringify(question.groundTruthAnswer)}
${concept ? `- 관련 개념: ${concept.title}` : ""}

[전체 코드]
${lines.map((l, i) => `${i + 1}: ${l}`).join("\n")}

[대상 라인 및 전후 문맥]
- 라인 번호: ${lineNumber}
- 라인 코드: ${targetLine}
- 주변 문맥:
${surroundingLines}

[요구 JSON 스키마]
{
  "summary": "이 줄이 무엇을 하는지 1~3문장",
  "flow": "이전 줄의 결과와 현재 줄이 어떻게 연결되는지 1~2문장 (해당 없으면 null)",
  "caution": "해당 줄에서 실제로 헷갈릴 가능성이 높은 경우에만 1~2문장 (해당 없으면 null)",
  "deepExplanation": "포인터 연산이나 메모리 주소 원리 등 심층 분석 2~3문장 (해당 없으면 null)"
}
`;

      const candidateModels = promotion.shouldPromote
        ? [promotion.model, getFastModel()]
        : [promotion.model];

      const { data: result, modelUsed } = await this.callGeminiWithModels(
        prompt,
        candidateModels,
        true,
      );

      const summary =
        result.summary ||
        result.runtimeMeaning ||
        "해당 라인의 실행 의미입니다.";
      const flow =
        result.flow ||
        (result.surroundingContext &&
        result.surroundingContext !==
          `전체 ${lines.length}줄 중 ${lineNumber}번째 라인`
          ? result.surroundingContext
          : undefined);
      const caution = result.caution || result.examTip;
      const deepExplanation = result.deepExplanation || undefined;

      return {
        lineNumber,
        code: targetLine,
        summary,
        flow: flow || undefined,
        caution: caution || undefined,
        deepExplanation: deepExplanation || undefined,
        // 하위 호환 필드
        syntaxElements: Array.isArray(result.syntaxElements)
          ? result.syntaxElements
          : [],
        userDefinedElements: Array.isArray(result.userDefinedElements)
          ? result.userDefinedElements
          : [],
        runtimeMeaning: summary,
        surroundingContext:
          flow || `전체 ${lines.length}줄 중 ${lineNumber}번째 라인`,
        examTip: caution || "기출 빈출 라인이므로 주의 깊게 확인하세요.",
        source: "GEMINI",
        modelUsed,
        promotionReason: promotion.shouldPromote ? promotion.reason : undefined,
      };
    } catch (err: any) {
      console.warn(
        "[GeminiAIService] explainCodeLine failed, falling back to mock:",
        err?.message,
      );
      return this.fallbackMock.explainCodeLine(context);
    }
  }

  public async generateVariation(
    context: VariationContext,
  ): Promise<GeneratedVariation> {
    try {
      const { question, concept, variationType, instructions } = context;
      const canonicalType = normalizeVariationType(variationType);
      const promotion = evaluatePromotion(question, {
        isVariation: true,
        instructions,
      });

      const isCQuestion = Boolean(
        (question.language && question.language.toUpperCase() === "C") ||
        (question.category && question.category.toLowerCase().includes("c")) ||
        (question.code && /#include|printf/i.test(question.code))
      );

      const cGuidance = isCQuestion
        ? `
[C 프로그래밍 언어 실기 출제 핵심 가이드라인]
- 단순 상수 숫자 바꾸기(예: 10을 20으로 변경) 수준의 피상적 변형은 절대 금지합니다.
- 정보처리기사 실기 시험의 실질적 변별력인 'C 언어 핵심 메커니즘'을 적극 반영하십시오:
  1) 포인터 연산 및 주소 이동 (*ptr, *(ptr + i), ptr++, *++ptr)
  2) 문자열 포인터 순회 (while(*p), 널 문자 '\\0' 종료 조건, 문자 치환 및 역순 출력)
  3) 1차원/2차원 배열과 포인터 관계 (arr[i] == *(arr + i), arr[i][j])
  4) 재귀 함수(Recursive Function) 호출 스택과 탈출 조건
  5) 구조체(struct)와 멤버 포인터 참조 (-> 연산자)
  6) 비트 연산자 (&, |, ^, ~, <<, >>)와 시프트 복합 연산
- 변형된 코드는 실제 C 컴파일러(GCC/Clang)에서 경고 없이 완벽히 컴파일되고 결정론적(deterministic) 출력을 내야 합니다.
`
        : "";

      const prompt = `
당신은 대한민국 국가기술자격 '정보처리기사 실기' 출제위원급 AI 전문가입니다.
기존 기출문제를 바탕으로, 핵심 평가 개념(${concept?.title || question.category})을 완벽히 유지하면서 신규 변형 문제를 생성하세요.

[변형 생성 원칙 - Ground Truth 및 출제 무결성 준수]
1. 원본 문제의 핵심 학습 목표와 평가 포인트를 훼손하지 마십시오.
2. 변형 유형(${canonicalType})의 목적에 충실하게 코드를 변형하되, 컴파일/문법 오류가 없는 완벽한 코드를 작성하십시오.
3. 정답(groundTruthAnswer)은 코드 실행 시 100% 명확하게 도출되는 단일 값 또는 확정된 키워드여야 합니다.
4. AI가 생성한 이 문제는 Staging 검수 대기열(staged_questions)에 격리 적재되며, 사람의 검수(APPROVED)를 거친 후 실서비스에 진입합니다.
${cGuidance}
[원본 문제 정보]
- ID: ${question.id}
- 과목: ${question.subject}
- 카테고리: ${question.category}
- 원본 문제: ${question.question}
${question.code ? `[원본 코드]\n\`\`\`\n${question.code}\n\`\`\`` : ""}
- 원본 정답: ${JSON.stringify(question.groundTruthAnswer)}
${question.officialExplanation ? `- 원본 공식 해설: ${question.officialExplanation}` : ""}
${concept ? `- 핵심 개념: ${concept.title} (${concept.definition})` : ""}

[변형 요구사항]
- 변형 유형: ${canonicalType}
${instructions ? `- 특별 요청사항: ${instructions}` : ""}

[요구 JSON 스키마]
{
  "prompt": "새롭게 변형된 명확한 문제 지문",
  "codeSnippet": "변형된 코드 전체 (코드가 없는 이론 문제인 경우 null)",
  "groundTruthAnswer": "변형된 문제의 엄격하고 유일한 정답 (단일 문자열 또는 문자열 배열)",
  "options": null,
  "difficulty": "MEDIUM",
  "aiExplanation": "변형 문제의 상세한 단계별 풀이 및 정답 도출 원리",
  "aiVariationNotes": "어떤 부분이 어떻게 변형되었는지 (변형 의도와 변경점 요약)",
  "keywords": ["핵심키워드1", "핵심키워드2"]
}
`;

      const candidateModels = [promotion.model, getFastModel()];
      const { data: result, modelUsed } = await this.callGeminiWithModels(
        prompt,
        candidateModels,
        true,
      );

      const finalVariation: GeneratedVariation = {
        sourceQuestionId: question.id,
        parentQuestionId: question.id,
        conceptId: question.conceptId,
        subject: question.subject,
        category: question.category,
        questionType: question.type,
        prompt: result.prompt || question.question,
        codeSnippet: result.codeSnippet || question.code || undefined,
        language: question.language,
        options: result.options || question.options || undefined,
        groundTruthAnswer: resolveGeneratedGroundTruth(
          result.groundTruthAnswer,
          question.groundTruthAnswer,
          result.codeSnippet || question.code,
          question.code,
        ),
        officialExplanation: undefined, // AI 변형 문항은 공식 기출 해설 필드를 가질 수 없음
        aiExplanation: result.aiExplanation || "AI가 생성한 고품질 변형 해설",
        aiVariationNotes:
          result.aiVariationNotes ||
          `[Gemini ${modelUsed}] ${canonicalType} 변형 생성`,
        variationType: canonicalType,
        generationMetadata: {
          generator: "GeminiAIService",
          model: modelUsed,
          generatedAt: new Date().toISOString(),
        },
      };

      const validation = VariationValidator.validate(finalVariation, question);
      if (!validation.isValid) {
        console.warn(
          "[GeminiAIService] Generated variation had validation issues:",
          validation.issues,
        );
      }

      return finalVariation;
    } catch (err: any) {
      console.warn(
        "[GeminiAIService] generateVariation failed, falling back to mock:",
        err?.message,
      );
      return this.fallbackMock.generateVariation(context);
    }
  }

  public async generateIndependentQuestion(
    context: IndependentGenerationContext,
  ): Promise<GeneratedIndependentQuestion> {
    const lang = normalizeLanguage(context.language || context.domain);
    if (!isIndependentLanguage(lang)) {
      throw new UnsupportedIndependentGenerationError(
        lang === "SQL"
          ? "SQL 독립 생성기는 현재 지원하지 않습니다."
          : `독립 생성을 지원하지 않는 언어입니다: ${context.language || context.domain || "(없음)"}`,
      );
    }

    try {
      const difficulty = context.difficulty || "MEDIUM";
      let prompt: string;
      if (lang === "C") {
        const skillCatalog = C_CORE_SKILLS.map(
          (s: any) =>
            `- [${s.concept}] (${s.difficulty}): ${s.skill} (코드패턴 힌트: ${s.codePatternTip})`,
        ).join("\n");
        prompt = `당신은 대한민국 '정보처리기사 실기 시험' 출제위원급 AI 전문가입니다.
기존 문제의 변형이 아닌, **C 언어 실기에서 수험생이 공부할 가치가 있는 새로운 독립형 문제**를 설계하십시오.

[출제 요구 조건]:
1. 대상 언어: C
2. 출제 난이도: ${difficulty}
3. 핵심 출제 평가 요소 (1~2개 결합):
${skillCatalog}
4. 포인터·배열·문자열·재귀 등 기존 C 생성 품질을 유지하십시오.
5. int main(...)이 있는 완결된 결정적 출력 코드만 작성하십시오.
6. 미초기화 변수, 배열 범위 밖 접근, 시퀀스 포인트 위반 등 정의되지 않은 동작(UB)을 피하십시오.
7. scanf, 파일, 네트워크, 난수, 현재 시간을 사용하지 마십시오.
${context.instructions ? `8. 사용자 특별 지침: ${context.instructions}` : ""}
${
  context.avoidSnippets && context.avoidSnippets.length > 0
    ? `9. 피해야 할 기존 패턴:\n${context.avoidSnippets.slice(0, 3).join("\n---\n")}`
    : ""
}

[2-Phase 설계]: 설계 의도와 단계별 추적표를 먼저 작성한 뒤 코드를 작성하세요.
추적표와 해설의 최종 결론은 groundTruthAnswer와 일치해야 합니다.

반드시 유효한 JSON만 반환하세요:
{
  "designMetadata": {
    "concept": "핵심 출제 개념",
    "difficulty": "${difficulty}",
    "skill": "평가 스킬",
    "questionDesign": "설계 요약",
    "stepByStepTrace": "단계별 추적. 마지막에 최종 출력 결론을 명시"
  },
  "questionText": "다음 C 언어로 구현된 프로그램을 분석하여 그 실행 결과를 쓰시오.",
  "code": "#include <stdio.h>\\n\\nint main(void) {\\n    ...\\n    return 0;\\n}",
  "type": "CODE_TRACE",
  "subject": "프로그래밍언어활용",
  "category": "C 언어",
  "groundTruthAnswer": "실제 printf 출력 결과만",
  "officialExplanation": "단계별 해설. 마지막 문장에 최종 정답을 명시",
  "keywords": ["포인터", "배열"]
}`;
      } else {
        prompt = buildIndependentGenerationPrompt(lang, difficulty, context);
      }

      const { data: parsed, modelUsed } = await this.callGeminiWithModels(
        prompt,
        GENERATOR_MODELS,
        true,
      );

      if (!parsed || !parsed.code || !hasValidGroundTruth(parsed.groundTruthAnswer)) {
        throw new Error("Invalid independent question schema from Gemini");
      }

      const parsedLang = normalizeLanguage(parsed.language || lang);
      if (parsedLang !== lang) {
        throw new Error(
          `요청 언어(${lang})와 다른 언어 응답(${parsed.language || parsedLang})`,
        );
      }

      const correlationId =
        context.correlationId ||
        `gen_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      return {
        correlationId,
        questionText:
          parsed.questionText ||
          `다음 ${lang} 프로그램을 분석하여 그 실행 결과를 쓰시오.`,
        code: parsed.code,
        language: lang,
        type: parsed.type || "CODE_TRACE",
        subject: parsed.subject || "프로그래밍언어활용",
        category: parsed.category || `${lang} 언어`,
        groundTruthAnswer: parsed.groundTruthAnswer,
        officialExplanation: parsed.officialExplanation || "",
        difficulty: (parsed.difficulty || difficulty) as any,
        keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [lang],
        designMetadata: {
          concept: parsed.designMetadata?.concept || "독립형 설계 개념",
          difficulty: (parsed.designMetadata?.difficulty || difficulty) as any,
          skill:
            parsed.designMetadata?.skill || "코드 실행 추적 및 상태 분석",
          questionDesign: parsed.designMetadata?.questionDesign || "",
          stepByStepTrace: parsed.designMetadata?.stepByStepTrace || "",
        },
        generationMetadata: {
          model: modelUsed,
          generator: "GeminiAIService",
          generatedAt: new Date().toISOString(),
          strategy: "INDEPENDENT_DESIGN",
        },
      };
    } catch (err: any) {
      if (err instanceof UnsupportedIndependentGenerationError) {
        throw err;
      }
      console.warn(
        "[GeminiAIService] generateIndependentQuestion failed:",
        err?.message,
      );
      if (context.strictLive) {
        throw new Error(
          `LIVE_GENERATION_FAILED: ${err?.message || "Unknown error during Gemini generation"}`,
        );
      }
      return this.fallbackMock.generateIndependentQuestion(context);
    }
  }
}

/**
 * =========================================================================
 * AI Service Factory
 * =========================================================================
 */
let cachedAIService: IAIService | null = null;

export function getAIService(): IAIService {
  if (cachedAIService) {
    return cachedAIService;
  }

  const apiKey = env.GEMINI_API_KEY ? env.GEMINI_API_KEY.trim() : "";
  if (apiKey) {
    console.log(
      `[AIService] Initializing GeminiAIService with Fast: ${getFastModel()}, Smart: ${getSmartModel()}`,
    );
    cachedAIService = new GeminiAIService(apiKey);
  } else {
    console.log(
      "[AIService] GEMINI_API_KEY is not set. Operating in graceful MockAIService mode.",
    );
    cachedAIService = new MockAIService();
  }

  return cachedAIService;
}
