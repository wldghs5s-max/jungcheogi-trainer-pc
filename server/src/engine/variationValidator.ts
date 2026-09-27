import {
  GeneratedVariation,
  Question,
  VariationValidationResult,
  VariationValidationIssue,
} from "@jungcheogi/shared";

const VALID_VARIATION_TYPES = new Set([
  "PARAMETER_CHANGE",
  "CODE_CHANGE",
  "CONTEXT_CHANGE",
  "CONCEPT_REFRAME",
  "PARAMETER_VARIATION",
  "CONCEPT_VARIATION",
  "CODE_VARIATION",
  "SCENARIO_VARIATION",
  "DIFFICULTY_VARIATION",
]);

export class VariationValidator {
  /**
   * AI 변형 문제에 대한 스키마, 도메인, Ground Truth 3단계 무결성 검증
   */
  public static validate(
    variation: GeneratedVariation,
    parentQuestion?: Question | null,
  ): VariationValidationResult {
    const issues: VariationValidationIssue[] = [];

    // --- 1. Schema Validation ---
    let schemaValid = true;

    if (!variation.prompt || !variation.prompt.trim()) {
      schemaValid = false;
      issues.push({
        field: "prompt",
        message: "변형 문제 본문(prompt)은 필수 항목입니다.",
        severity: "ERROR",
      });
    } else if (variation.prompt.trim().length < 5) {
      schemaValid = false;
      issues.push({
        field: "prompt",
        message: "변형 문제 본문이 너무 짧습니다 (최소 5자 이상).",
        severity: "ERROR",
      });
    }

    if (
      variation.groundTruthAnswer === undefined ||
      variation.groundTruthAnswer === null ||
      (typeof variation.groundTruthAnswer === "string" &&
        !variation.groundTruthAnswer.trim()) ||
      (Array.isArray(variation.groundTruthAnswer) &&
        variation.groundTruthAnswer.length === 0)
    ) {
      schemaValid = false;
      issues.push({
        field: "groundTruthAnswer",
        message:
          "변형 문제의 기준 정답(groundTruthAnswer)은 비어 있을 수 없습니다.",
        severity: "ERROR",
      });
    }

    if (!variation.parentQuestionId || !variation.parentQuestionId.trim()) {
      schemaValid = false;
      issues.push({
        field: "parentQuestionId",
        message:
          "부모 기출 ID(parentQuestionId)는 계보 형성을 위한 필수 항목입니다.",
        severity: "ERROR",
      });
    }

    if (!VALID_VARIATION_TYPES.has(variation.variationType)) {
      schemaValid = false;
      issues.push({
        field: "variationType",
        message: `유효하지 않은 변형 유형('${variation.variationType}')입니다.`,
        severity: "ERROR",
      });
    }

    // --- 2. Domain Validation ---
    let domainValid = true;

    // 공식 해설(officialExplanation) 오염 방지: AI 변형은 공식 기출 해설을 직접 사칭할 수 없음
    if (variation.officialExplanation && variation.officialExplanation.trim()) {
      domainValid = false;
      issues.push({
        field: "officialExplanation",
        message:
          "AI 변형 문항은 공식 기출 해설 필드(officialExplanation)를 가질 수 없으며, aiExplanation 필드를 사용해야 합니다.",
        severity: "ERROR",
      });
    }

    // AI 보조 설명 혹은 변형 노트가 최소 1개 이상 존재해야 함
    if (
      (!variation.aiExplanation || !variation.aiExplanation.trim()) &&
      (!variation.aiVariationNotes || !variation.aiVariationNotes.trim())
    ) {
      issues.push({
        field: "aiExplanation",
        message:
          "AI 변형 문항은 해설(aiExplanation) 또는 변형 노트(aiVariationNotes)를 포함해야 합니다.",
        severity: "WARNING",
      });
    }

    // conceptId 일관성 확인
    if (parentQuestion && parentQuestion.conceptId) {
      if (
        variation.conceptId &&
        variation.conceptId !== parentQuestion.conceptId
      ) {
        issues.push({
          field: "conceptId",
          message: `부모 문항의 conceptId('${parentQuestion.conceptId}')와 변형 문항의 conceptId('${variation.conceptId}')가 일치하지 않습니다.`,
          severity: "WARNING",
        });
      }
    }

    // --- 3. Ground Truth Validation ---
    let groundTruthValid = true;

    // 지문과 정답이 완전히 동일한 경우 오류
    if (
      variation.prompt &&
      variation.groundTruthAnswer &&
      typeof variation.groundTruthAnswer === "string" &&
      variation.prompt.trim().toLowerCase() ===
        variation.groundTruthAnswer.trim().toLowerCase()
    ) {
      groundTruthValid = false;
      issues.push({
        field: "groundTruthAnswer",
        message: "변형 문제의 지문과 정답이 완전히 동일할 수 없습니다.",
        severity: "ERROR",
      });
    }

    // 객관식 문제인 경우 정답이 보기 목록에 존재하는지 검증
    if (variation.options && variation.options.length > 0) {
      const ans = String(variation.groundTruthAnswer).trim();
      const ansNum = Number(ans);
      const isIndexMatch =
        !isNaN(ansNum) && ansNum >= 1 && ansNum <= variation.options.length;
      const isTextMatch = variation.options.some(
        (opt: string) => opt.trim().toLowerCase() === ans.toLowerCase(),
      );

      if (!isIndexMatch && !isTextMatch) {
        issues.push({
          field: "groundTruthAnswer",
          message: `객관식 정답('${ans}')이 제공된 보기 목록과 일치하지 않거나 범위를 벗어납니다.`,
          severity: "WARNING",
        });
      }
    }

    // 원본 문제를 단어 하나 바꾸지 않고 100% 그대로 복제한 경우 경고
    if (parentQuestion) {
      const parentPrompt =
        parentQuestion.question || (parentQuestion as any).prompt || "";
      const isIdenticalText = variation.prompt.trim() === parentPrompt.trim();
      const isIdenticalCode =
        (variation.codeSnippet || "").trim() ===
        (parentQuestion.code || "").trim();
      const isIdenticalAns =
        JSON.stringify(variation.groundTruthAnswer) ===
        JSON.stringify(parentQuestion.groundTruthAnswer);

      if (isIdenticalText && isIdenticalCode && isIdenticalAns) {
        issues.push({
          field: "prompt",
          message: "원본 기출문제가 전혀 변형되지 않고 그대로 복제되었습니다.",
          severity: "WARNING",
        });
      }
    }

    // --- 4. Code Syntax Sanity Check (정적 토큰 수준) ---
    let codeSyntaxValid = true;
    if (variation.codeSnippet && variation.codeSnippet.trim()) {
      const code = variation.codeSnippet;
      // 괄호 짝 검사
      let braceCount = 0;
      let parenCount = 0;
      for (const ch of code) {
        if (ch === "{") braceCount++;
        else if (ch === "}") braceCount--;
        else if (ch === "(") parenCount++;
        else if (ch === ")") parenCount--;
      }

      if (braceCount !== 0 || parenCount !== 0) {
        codeSyntaxValid = false;
        issues.push({
          field: "codeSnippet",
          message: `코드 내 괄호의 짝이 맞지 않습니다 (중괄호 불균형: ${braceCount}, 소괄호 불균형: ${parenCount}).`,
          severity: "WARNING",
        });
      }
    }

    const hasError = issues.some((i) => i.severity === "ERROR");

    return {
      isValid: !hasError,
      issues,
      checks: {
        schemaValid:
          schemaValid &&
          !issues.some((i) => i.field === "prompt" && i.severity === "ERROR"),
        domainValid:
          domainValid &&
          !issues.some(
            (i) => i.field === "officialExplanation" && i.severity === "ERROR",
          ),
        groundTruthValid:
          groundTruthValid &&
          !issues.some(
            (i) => i.field === "groundTruthAnswer" && i.severity === "ERROR",
          ),
        codeSyntaxValid,
      },
    };
  }
}
