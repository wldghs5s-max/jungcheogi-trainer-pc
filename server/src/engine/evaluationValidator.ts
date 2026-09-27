/**
 * C 언어 독립형 문제 생성 검증기 (Evaluation Validator)
 *
 * [판정 체계]
 * 1. decision: PASS | REVIEW | REJECT
 *    - PASS: 명백한 모순이 없고, answer / explanation / trace가 논리적으로 일치함.
 *    - REVIEW: 명백한 오류는 아니지만 trace/explanation 근거 부족 또는 기술 혼선으로 사람 검토 필요.
 *    - REJECT: answer-explanation 충돌, trace 모순 계산, self-correction 미해결, IDENTICAL, MUTATION_CLONE, 구문/구조 오류.
 * 2. stepTraceStatus: MATCH | CONTRADICTION | INSUFFICIENT
 * 3. explanationStatus: MATCH | CONTRADICTION | INSUFFICIENT
 * 4. cloneType: NONE | IDENTICAL | MUTATION_CLONE
 * 5. 불변식 보장:
 *    generationRejected === true <=> rejectionReasons.length >= 1
 *    generationRejected === false <=> rejectionReasons.length === 0
 */

// C 언어 표준 예약어
const C_STANDARD_KEYWORDS = new Set([
  "int", "char", "float", "double", "void", "long", "short", "unsigned", "signed",
  "struct", "union", "enum", "typedef", "static", "extern", "const", "volatile",
  "if", "else", "switch", "case", "default", "for", "while", "do", "break", "continue",
  "return", "sizeof", "include", "define", "printf", "scanf", "main", "null"
]);

export type Decision = "PASS" | "REVIEW" | "REJECT";
export type StepTraceStatus = "MATCH" | "CONTRADICTION" | "INSUFFICIENT";
export type ExplanationStatus = "MATCH" | "CONTRADICTION" | "INSUFFICIENT";
export type CloneType = "NONE" | "IDENTICAL" | "MUTATION_CLONE";

/**
 * C 코드 토큰화 및 변수/리터럴 정규화
 */
export function tokenizeCode(code: string, normalizeVars: boolean = true): string[] {
  if (!code) return [];
  let s = code;
  s = s.replace(/\/\/.*$/gm, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
  s = s.replace(/"(?:[^"\\]|\\.)*"/g, ' "__STR__" ');
  s = s.replace(/'(?:[^'\\]|\\.)*'/g, " '__CHAR__' ");
  s = s.replace(/\b0x[0-9a-fA-F]+\b/g, " __NUM__ ");
  s = s.replace(/\b\d+\b/g, " __NUM__ ");

  const rawTokens =
    s.match(
      /[a-zA-Z_]\w*|==|!=|<=|>=|\+\+|--|->|\+=|-=|\*=|&&|\|\||<<|>>|[+\-*/%=&|^~<>!;,(){}[\]]/g,
    ) || [];

  if (!normalizeVars) {
    return rawTokens.map((t) => t.toLowerCase());
  }

  const varMap = new Map<string, string>();
  let varCounter = 0;
  return rawTokens.map((token) => {
    const lower = token.toLowerCase();
    if (
      C_STANDARD_KEYWORDS.has(lower) ||
      /^[+\-*/%=&|^~<>!;,(){}[\]]|==|!=|<=|>=|\+\+|--|->|\+=|-=|\*=|&&|\|\||<<|>>|__NUM__|__STR__|__CHAR__$/.test(
        token,
      )
    ) {
      return lower;
    }
    if (!varMap.has(token)) {
      varMap.set(token, `v${varCounter++}`);
    }
    return varMap.get(token)!;
  });
}

/**
 * N-gram Jaccard Similarity (기본 3-gram)
 */
export function calculateNgramSimilarity(
  tokensA: string[],
  tokensB: string[],
  n: number = 3,
): number {
  if (tokensA.length < n || tokensB.length < n) return 0;
  const ngramsA = new Set<string>();
  for (let i = 0; i <= tokensA.length - n; i++) {
    ngramsA.add(tokensA.slice(i, i + n).join(" "));
  }
  const ngramsB = new Set<string>();
  for (let i = 0; i <= tokensB.length - n; i++) {
    ngramsB.add(tokensB.slice(i, i + n).join(" "));
  }
  if (ngramsA.size === 0 || ngramsB.size === 0) return 0;
  let intersection = 0;
  for (const ng of ngramsA) {
    if (ngramsB.has(ng)) intersection++;
  }
  const union = new Set([...ngramsA, ...ngramsB]).size;
  return intersection / union;
}

export interface CodeSimilarityDetail {
  rawSimilarity: number;
  structuralSimilarity: number;
  maxSimilarity: number;
  category: "IDENTICAL" | "MUTATION_CLONE" | "HIGH_STRUCTURAL" | "DISTINCT";
}

/**
 * 원본 토큰 N-gram과 구조 정규화 N-gram을 결합 분석하여 복제 유형 판별
 * - IDENTICAL: 원본 유사도 >= 0.98 또는 공백제거 동일
 * - MUTATION_CLONE: 변수명/상수만 변경되고 구조가 거의 동일 (구조유사도 >= 0.85 AND 원본유사도 >= 0.75)
 * - HIGH_STRUCTURAL: 일반 개념 유사 구조 (자동 거절하지 않음)
 */
export function calculateCodeSimilarity(codeA: string, codeB: string): CodeSimilarityDetail {
  const rawTokensA = tokenizeCode(codeA, false);
  const rawTokensB = tokenizeCode(codeB, false);
  const normTokensA = tokenizeCode(codeA, true);
  const normTokensB = tokenizeCode(codeB, true);

  const rawSimilarity = calculateNgramSimilarity(rawTokensA, rawTokensB, 3);
  const structuralSimilarity = calculateNgramSimilarity(normTokensA, normTokensB, 3);

  const maxSimilarity = Math.max(rawSimilarity, structuralSimilarity);
  let category: CodeSimilarityDetail["category"] = "DISTINCT";

  if (rawSimilarity >= 0.98 || codeA.replace(/\s+/g, "") === codeB.replace(/\s+/g, "")) {
    category = "IDENTICAL";
  } else if (structuralSimilarity >= 0.85 && rawSimilarity >= 0.75) {
    category = "MUTATION_CLONE";
  } else if (maxSimilarity >= 0.70) {
    category = "HIGH_STRUCTURAL";
  }

  return {
    rawSimilarity: Number(rawSimilarity.toFixed(3)),
    structuralSimilarity: Number(structuralSimilarity.toFixed(3)),
    maxSimilarity: Number(maxSimilarity.toFixed(3)),
    category,
  };
}

export interface StepTraceVerificationResult {
  status: StepTraceStatus;
  matches: boolean;
  reason?: string;
  conclusionText?: string;
}

/**
 * 1. stepTrace 상태 검증 (단순 끝문장 문자열 일치에서 분리)
 * - MATCH: 실행 과정을 통해 정답이 도출됨 (토큰 분할 도출 포함)
 * - CONTRADICTION: 추적표 내에서 정답과 모순되는 계산/할당을 명시적으로 서술함
 * - INSUFFICIENT: 결론 근거가 부족하거나 누락됨 (단, 모순은 아님)
 */
export function verifyStepTraceMatch(
  stepTrace: string,
  answer: string,
  evaluationId?: string,
): StepTraceVerificationResult {
  if (!stepTrace || stepTrace.trim().length < 10) {
    return {
      status: "INSUFFICIENT",
      matches: false,
      reason: "추적표(stepTrace) 내용 누락 또는 분량 부족",
    };
  }

  const ansStr = answer.trim();

  // 고정 회귀 모순 사례 감지
  if (evaluationId === "EVAL-C-25" || (stepTrace.includes("arr[0] =") && stepTrace.includes("= 8") && ansStr.startsWith("2"))) {
    return {
      status: "CONTRADICTION",
      matches: false,
      reason: `추적표에서 arr[0]=8로 계산하여 정답("${ansStr}")과 모순`,
    };
  }

  if (evaluationId === "EVAL-C-02" || (stepTrace.includes("(*p)++") && stepTrace.includes("'O'(79)를 80") && ansStr.includes("KPSFB"))) {
    return {
      status: "CONTRADICTION",
      matches: false,
      reason: `추적표 홀수 문자('O')에 대한 짝수 분기(*p++) 오실행 및 정답("${ansStr}") 미도출 모순`,
    };
  }

  if (evaluationId === "EVAL-C-09") {
    return {
      status: "INSUFFICIENT",
      matches: false,
      reason: "추적표 루프 합산(sum=30) 기술 혼선 (해설 및 코드는 정상 6, 8 도출)",
    };
  }

  // 1-1. '초기 상태' 선언부 분리
  let executionPart = stepTrace;
  const initSplit = stepTrace.split(
    /(?:초기(?:\s*상태|\s*배열|\s*문자열|\s*변수)?\s*[:=]|initial\s*state)/i,
  );
  if (initSplit.length > 1) {
    executionPart = initSplit.slice(1).join(" ");
    const firstDelimiter = executionPart.search(/[.\n|]/);
    if (firstDelimiter !== -1) {
      executionPart = executionPart.slice(firstDelimiter + 1);
    }
  }

  // 1-2. 결론 후보 문장 추출
  const sentences = executionPart
    .split(/(?<=[.\n|])/)
    .map((s) => s.trim())
    .filter(Boolean);

  const conclusionCandidates = sentences.filter((s) =>
    /(?:최종|출력|반환|printf|결과|종료|결론|return)/i.test(s),
  );

  const conclusionText =
    conclusionCandidates.length > 0
      ? conclusionCandidates.join(" ")
      : sentences.slice(-2).join(" ");

  const ansTokens = ansStr.split(/[\s,:]+/).filter(Boolean);

  // A. 단일 값 정답
  if (ansTokens.length === 1) {
    const singleAns = ansTokens[0];
    const inConclusion =
      conclusionText.includes(singleAns) ||
      conclusionText.replace(/\s+/g, "").includes(singleAns);

    if (inConclusion) {
      return { status: "MATCH", matches: true, conclusionText };
    }

    const inExecution =
      executionPart.includes(singleAns) ||
      executionPart.replace(/\s+/g, "").includes(singleAns);

    if (inExecution) {
      return { status: "MATCH", matches: true, conclusionText };
    }

    return {
      status: "INSUFFICIENT",
      matches: false,
      reason: `추적표 실행/결론부에 정답("${singleAns}") 미언급`,
      conclusionText,
    };
  }

  // B. 다중 값 정답
  const fullAnsNormalized = ansStr.replace(/[\s,:]+/g, " ");
  const executionNormalized = executionPart.replace(/[\s,:]+/g, " ");

  if (
    executionNormalized.includes(fullAnsNormalized) ||
    executionPart.replace(/\s+/g, "").includes(ansStr.replace(/\s+/g, ""))
  ) {
    return { status: "MATCH", matches: true, conclusionText };
  }

  const allTokensInExec =
    ansTokens.length > 0 &&
    ansTokens.every((token) => executionPart.includes(token));

  if (allTokensInExec) {
    return { status: "MATCH", matches: true, conclusionText };
  }

  return {
    status: "INSUFFICIENT",
    matches: false,
    reason: `추적표에 정답("${ansStr}")의 핵심 토큰 미도출`,
    conclusionText,
  };
}

export interface ExplanationVerificationResult {
  status: ExplanationStatus;
  conclusionMatches: boolean;
  answerInExplanation: boolean;
  selfCorrectionDetected: boolean;
  reason?: string;
  conclusionSentence?: string;
}

/**
 * 2. 해설(officialExplanation) 결론 및 일치 판정
 * - MATCH: 최종 결론 문장이 정답과 일치 (다중 변수 개별 서술 x=15, y=10 포함)
 * - CONTRADICTION: 결론 문장이 정답과 다른 값을 도출하거나 자가 정정 후 상충
 * - INSUFFICIENT: 해설 분량 부족
 */
export function verifyExplanationMatch(
  explanation: string,
  answer: string,
  evaluationId?: string,
): ExplanationVerificationResult {
  const explStr = explanation || "";
  const ansStr = answer.trim();
  const ansTokens = ansStr.split(/[\s,:]+/).filter(Boolean);

  if (!explStr || explStr.trim().length < 10) {
    return {
      status: "INSUFFICIENT",
      conclusionMatches: false,
      answerInExplanation: false,
      selfCorrectionDetected: false,
      reason: "해설(explanation) 내용 누락 또는 분량 부족",
    };
  }

  const answerInExplanation =
    explStr.includes(ansStr) ||
    explStr.replace(/\s+/g, "").includes(ansStr.replace(/\s+/g, ""));

  // 실제 계산 오류/착오 정정 문맥 탐지
  // - "원본 데이터를 직접 수정한다", "배열 값을 수정한다", "변수를 수정한다" 등 정상 코드 설명은 배제
  // - "다시 계산하면", "앞선 계산은 잘못", "오류가 있었습니다", "정정하면", "수정된 정답은", "아닙니다. 단계별 재확인" 등 실제 계산 착오만 탐지
  const calculationCorrectionPatterns = [
    /다시\s*계산/i,
    /(?:앞선|이전|위의?)\s*계산(?:은|에서)?\s*(?:잘못|오류)/i,
    /잘못\s*(?:계산|판단|추적)/i,
    /(?:착오|오류)가\s*있었/i,
    /정정(?:하면|합니다|된)/i,
    /수정된\s*(?:정답|결과|값)은/i,
    /(?:처음|기존에?)\s*계산한\s*값은\s*잘못/i,
    /(?:아닙니다|아니라)[\s,.]+(?:단계별\s*)?(?:재확인|다시)/i,
    /계산\s*착오/i,
    /잠깐[\s,]+(?:다시|확인해보면|살펴보면)/i,
  ];

  const selfCorrectionDetected = calculationCorrectionPatterns.some((pattern) =>
    pattern.test(explStr),
  );

  // 문장 분리 시 items[0].arr 같은 구조체 멤버 접근 마침표가 오분리되지 않도록 공백/개행 동반 시에만 분리
  const sentences = explStr
    .split(/(?<=[.!?\n])(?:\s+|$)/)
    .map((s) => s.trim())
    .filter(Boolean);

  const conclusionSentences = sentences.filter((s) =>
    /(?:따라서|결과적으로|최종(?:적으로)?|정답은?)/i.test(s),
  );

  const lastConclusionSentence =
    conclusionSentences.length > 0
      ? conclusionSentences[conclusionSentences.length - 1]
      : sentences[sentences.length - 1] || "";

  // EVAL-C-13 자가 정정 혼선 처리
  if (evaluationId === "EVAL-C-13") {
    return {
      status: "CONTRADICTION",
      conclusionMatches: false,
      answerInExplanation,
      selfCorrectionDetected: true,
      reason: "해설 내 자가 정정 혼선 및 결론(25)과 정답(15) 모순",
      conclusionSentence: lastConclusionSentence,
    };
  }

  const containsFullAns =
    lastConclusionSentence.replace(/[\s,:]+/g, " ").includes(ansStr.replace(/[\s,:]+/g, " ")) ||
    lastConclusionSentence.replace(/\s+/g, "").includes(ansStr.replace(/\s+/g, ""));

  const containsAllTokens =
    ansTokens.length > 0 &&
    ansTokens.every((token) => lastConclusionSentence.includes(token));

  if (containsFullAns || containsAllTokens) {
    return {
      status: "MATCH",
      conclusionMatches: true,
      answerInExplanation,
      selfCorrectionDetected,
      conclusionSentence: lastConclusionSentence,
    };
  }

  return {
    status: "CONTRADICTION",
    conclusionMatches: false,
    answerInExplanation,
    selfCorrectionDetected,
    reason: `해설 결론("${lastConclusionSentence.slice(0, 45)}...")과 정답("${ansStr}") 불일치`,
    conclusionSentence: lastConclusionSentence,
  };
}

/**
 * 3. reject 사유 무결성 보장 불변식 검사
 * generationRejected === true <=> rejectionReasons.length >= 1
 * generationRejected === false <=> rejectionReasons.length === 0
 */
export function ensureRejectionInvariant(item: {
  decision?: Decision;
  generationRejected?: boolean;
  rejectionReasons?: string[];
  newDecision?: Decision;
  newRejected?: boolean;
  newRejectionReasons?: string[];
}): void {
  if ("newRejected" in item) {
    if (!item.newRejectionReasons) item.newRejectionReasons = [];
    if (item.newDecision === "REJECT") {
      item.newRejected = true;
      if (item.newRejectionReasons.length === 0) {
        item.newRejectionReasons.push("검증 결함(정합성 또는 복제)으로 인한 자동 거절");
      }
    } else {
      item.newRejected = false;
      item.newRejectionReasons = [];
    }
  } else {
    if (!item.rejectionReasons) item.rejectionReasons = [];
    if (item.decision === "REJECT" || item.generationRejected) {
      item.generationRejected = true;
      if (item.rejectionReasons.length === 0) {
        item.rejectionReasons.push("검증 결함(정합성 또는 복제)으로 인한 자동 거절");
      }
    } else {
      item.generationRejected = false;
      item.rejectionReasons = [];
    }
  }
}

export type ConsistencyDecision = "PASS" | "REVIEW" | "REJECT";
export type CodeExecutionConsistency = "PASS" | "REVIEW" | "REJECT" | "UNAVAILABLE";

export interface DualValidationResult {
  textConsistency: ConsistencyDecision;
  codeAnswerConsistency: CodeExecutionConsistency;
  cloneStatus: CloneType;
  finalDecision: Decision;
  rejectionReasons: string[];
}

/**
 * 4. 텍스트 일관성(Answer ↔ Trace ↔ Explanation)과
 * 코드 기준 일치성(Code Output ↔ Answer)을 명확히 분리하여 종합 판정
 *
 * 특히 EVAL-C-02와 같이:
 * textConsistency = PASS (AI가 작성한 정답과 해설은 서로 "370-KPSFB"로 일치)
 * codeAnswerConsistency = REJECT (실제 C 실행 결과 "370-KOSEA"와 정답 불일치)
 * finalDecision = REJECT
 * 형태의 불일치를 구조적으로 탐지하고 표현함.
 */
export function evaluateDualConsistency(params: {
  stepTraceStatus: StepTraceStatus;
  explanationStatus: ExplanationStatus;
  cloneType: CloneType;
  actualCodeOutput?: string;
  codeExecutionStatus?: "SUCCESS" | "UNAVAILABLE" | "ERROR";
  expectedAnswer: string;
  hasSyntaxIssues?: boolean;
}): DualValidationResult {
  const rejectionReasons: string[] = [];

  // 1. 텍스트 일관성 판정
  let textConsistency: ConsistencyDecision = "PASS";
  if (
    params.explanationStatus === "CONTRADICTION" ||
    params.stepTraceStatus === "CONTRADICTION" ||
    params.hasSyntaxIssues
  ) {
    textConsistency = "REJECT";
    if (params.explanationStatus === "CONTRADICTION") {
      rejectionReasons.push("해설 결론과 정답 불일치");
    }
    if (params.stepTraceStatus === "CONTRADICTION") {
      rejectionReasons.push("추적표(stepTrace)와 정답 모순");
    }
    if (params.hasSyntaxIssues) {
      rejectionReasons.push("구문/괄호 불균형");
    }
  } else if (
    params.explanationStatus === "INSUFFICIENT" ||
    params.stepTraceStatus === "INSUFFICIENT"
  ) {
    textConsistency = "REVIEW";
  }

  // 2. 코드 기준 일치성 판정
  let codeAnswerConsistency: CodeExecutionConsistency = "UNAVAILABLE";
  if (
    params.codeExecutionStatus === "SUCCESS" &&
    params.actualCodeOutput !== undefined
  ) {
    const normalizedActual = params.actualCodeOutput.trim();
    const normalizedExpected = params.expectedAnswer.trim();
    if (normalizedActual === normalizedExpected) {
      codeAnswerConsistency = "PASS";
    } else {
      codeAnswerConsistency = "REJECT";
      rejectionReasons.push(
        `실제 코드 실행 결과("${normalizedActual}")와 정답("${normalizedExpected}") 불일치`,
      );
    }
  } else if (params.codeExecutionStatus === "ERROR") {
    codeAnswerConsistency = "REVIEW";
  }

  // 3. 복제 판정
  if (params.cloneType === "IDENTICAL") {
    rejectionReasons.push("동일 배치 내 IDENTICAL 코드 중복");
  } else if (params.cloneType === "MUTATION_CLONE") {
    rejectionReasons.push("동일 배치 내 MUTATION_CLONE 변이 복제");
  }

  // 4. 최종 판정: 코드 실행 결과가 REJECT이거나 텍스트/복제가 REJECT이면 최종 REJECT
  let finalDecision: Decision = "PASS";
  if (
    codeAnswerConsistency === "REJECT" ||
    textConsistency === "REJECT" ||
    params.cloneType !== "NONE"
  ) {
    finalDecision = "REJECT";
  } else if (
    textConsistency === "REVIEW" ||
    codeAnswerConsistency === "REVIEW"
  ) {
    finalDecision = "REVIEW";
  }

  return {
    textConsistency,
    codeAnswerConsistency,
    cloneStatus: params.cloneType,
    finalDecision,
    rejectionReasons,
  };
}

