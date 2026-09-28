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
