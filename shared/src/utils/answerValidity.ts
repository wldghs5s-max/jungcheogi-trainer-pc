import type { StudyVisibility } from "../types/question.js";

export type DrillFailureReason =
  | "GENERATION_FAILED"
  | "MISSING_ANSWER"
  | "EXECUTION_UNVERIFIED"
  | "ANSWER_CONFLICT";

/**
 * 채점 가능한 정답인지 판별한다.
 * - 숫자 0 / "0"은 유효
 * - undefined, null, 빈 문자열, 공백만, 빈 배열은 무효
 */
export function hasValidGroundTruth(answer: unknown): boolean {
  if (answer === 0 || answer === 0n) return true;
  if (typeof answer === "number" && Number.isFinite(answer)) return true;
  if (answer === undefined || answer === null) return false;
  if (Array.isArray(answer)) {
    if (answer.length === 0) return false;
    return answer.every((item) => hasValidGroundTruth(item));
  }
  return String(answer).trim().length > 0;
}

export function isTemporaryDrillQuestion(question: {
  studyVisibility?: StudyVisibility | string;
}): boolean {
  return question.studyVisibility === "TEMPORARY_DRILL";
}

export function isStudyEligible(question: {
  studyVisibility?: StudyVisibility | string;
  groundTruthAnswer?: unknown;
}): boolean {
  if (isTemporaryDrillQuestion(question)) return false;
  return hasValidGroundTruth(question.groundTruthAnswer);
}

/**
 * AI 변형 문제(AI Variation Drill 또는 Batch Generate)의 부모(Seed) 문제로 사용 가능한지 판별한다.
 * - readyForGrading === false인 경우 차단
 * - transcriptionStatus === "REVIEW"인 경우 차단
 * - answerStatus === "REVIEW_NEEDED"인 경우 차단
 * - aiVariationNotes에 [SEED_REVIEW_REQUIRED]가 포함된 경우 차단
 * - groundTruthAnswer에 검토 필요 마커가 있거나 채점 불가능한 경우 차단
 */
export function isSeedVariationEligible(question: {
  readyForGrading?: boolean;
  transcriptionStatus?: string;
  answerStatus?: string;
  aiVariationNotes?: string | null;
  groundTruthAnswer?: unknown;
}): boolean {
  if (!question) return false;
  if (question.readyForGrading === false) return false;
  if (question.transcriptionStatus === "REVIEW") return false;
  if (question.answerStatus === "REVIEW_NEEDED") return false;
  if (question.aiVariationNotes?.includes("[SEED_REVIEW_REQUIRED]")) return false;
  if (
    typeof question.groundTruthAnswer === "string" &&
    (question.groundTruthAnswer.includes("[정답 검토 필요") ||
      question.groundTruthAnswer.includes("REVIEW_NEEDED"))
  ) {
    return false;
  }
  return hasValidGroundTruth(question.groundTruthAnswer);
}
