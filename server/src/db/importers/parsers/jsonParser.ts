import { RawImportQuestion } from "../types";
import { QuestionSourceType } from "@jungcheogi/shared";

export function parseJsonQuestions(
  jsonContent: string,
  defaultSourceType: QuestionSourceType = "USER_IMPORTED",
): RawImportQuestion[] {
  if (!jsonContent || !jsonContent.trim()) {
    throw new Error("JSON 내용이 비어있습니다.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonContent);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "JSON 파싱 구문 오류";
    throw new Error(`유효한 JSON 형식이 아닙니다: ${msg}`);
  }

  const items = Array.isArray(parsed) ? parsed : [parsed];
  const results: RawImportQuestion[] = [];

  for (let i = 0; i < items.length; i++) {
    const raw = items[i] as Record<string, unknown>;

    // 필드 매핑 및 관용적 네이밍 지원
    const questionText = String(
      raw.questionText || raw.question || raw.text || "",
    ).trim();
    const extractedAnswer = (raw.groundTruthAnswer ??
      raw.extractedAnswer ??
      raw.answer ??
      "") as string | string[];
    const extractedExplanation = (raw.officialExplanation ??
      raw.extractedExplanation ??
      raw.explanation ??
      "") as string;
    const aiExplanation = (raw.aiExplanation || "") as string;
    const aiVariationNotes = (raw.aiVariationNotes || "") as string;

    const subject = raw.subject ? String(raw.subject) : undefined;
    const category = raw.category ? String(raw.category) : undefined;
    const subCategory = raw.subCategory ? String(raw.subCategory) : undefined;
    const type = raw.type ? String(raw.type) : undefined;

    const codeSnippet = (raw.codeSnippet ?? raw.code ?? "") as string;
    const codeLanguage = (raw.codeLanguage ?? raw.language ?? "") as string;
    const difficulty = (raw.difficulty || "MEDIUM") as string;

    let keywords: string[] = [];
    if (Array.isArray(raw.keywords)) {
      keywords = raw.keywords.map(String);
    } else if (typeof raw.keywords === "string") {
      keywords = raw.keywords.split(/[,#\s]+/).filter(Boolean);
    }

    const sourceType =
      (raw.sourceType as QuestionSourceType) || defaultSourceType;
    const examYear = raw.examYear ? Number(raw.examYear) : undefined;
    const examRound = raw.examRound ? Number(raw.examRound) : undefined;
    const questionNumber = raw.questionNumber
      ? Number(raw.questionNumber)
      : undefined;
    const parentQuestionId = raw.parentQuestionId
      ? String(raw.parentQuestionId)
      : undefined;
    const conceptId = (raw.conceptId || raw.concept_id)
      ? String(raw.conceptId || raw.concept_id)
      : undefined;

    results.push({
      rawId: raw.id ? String(raw.id) : undefined,
      sourceType,
      examYear,
      examRound,
      questionNumber,
      parentQuestionId,
      conceptId,
      subject,
      category,
      subCategory,
      type,
      questionText,
      codeSnippet: codeSnippet.trim() ? codeSnippet : undefined,
      codeLanguage: codeLanguage.trim() ? codeLanguage : undefined,
      extractedAnswer,
      extractedExplanation: extractedExplanation.trim()
        ? extractedExplanation
        : undefined,
      aiExplanation: aiExplanation.trim() ? aiExplanation : undefined,
      aiVariationNotes: aiVariationNotes.trim() ? aiVariationNotes : undefined,
      difficulty,
      keywords,
      isHumanVerified: Boolean(raw.isHumanVerified),
      verifierNotes: raw.verifierNotes ? String(raw.verifierNotes) : undefined,
    });
  }

  return results;
}
