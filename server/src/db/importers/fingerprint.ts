import crypto from "crypto";
import { Question, DuplicateStatus } from "@jungcheogi/shared";

/**
 * 지문과 코드 스니펫의 핵심 구조를 추출하여 핑거프린트 문자열을 생성합니다.
 */
export function generateStructuralFingerprint(
  questionText: string,
  codeSnippet?: string,
  subject?: string,
): string {
  const normText = (questionText || "")
    .toLowerCase()
    .replace(/[()[\]{}.,·\-_/'":;?`~!@#$%^&*+=<>\s]/g, "");

  const normCode = (codeSnippet || "")
    .replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "") // 주석 제거
    .replace(/\s+/g, "")
    .toLowerCase();

  const raw = `${subject || ""}|${normText}|${normCode}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

/**
 * 두 문자열 간의 자카드(Jaccard) 토큰 유사도 (0.0 ~ 1.0)를 계산합니다.
 */
export function calculateTextSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a.trim() === b.trim()) return 1.0;

  const tokenize = (str: string) => {
    return new Set(
      str
        .toLowerCase()
        .replace(/[()[\]{}.,·\-_/'":;?`~!@#$%^&*+=<>]/g, " ")
        .split(/\s+/)
        .filter((s) => s.length >= 2),
    );
  };

  const tokensA = tokenize(a);
  const tokensB = tokenize(b);

  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) {
      intersection++;
    }
  }

  const union = tokensA.size + tokensB.size - intersection;
  return Number((intersection / union).toFixed(2));
}

export interface DuplicateAnalysisResult {
  status: DuplicateStatus;
  duplicateQuestionId?: string;
  similarity: number;
  reason?: string;
}

/**
 * 기존 DB 문항들과 비교하여 중복 또는 AI_VARIATION 관계 후보를 판별합니다.
 */
export function analyzeDuplicates(
  staged: {
    questionText: string;
    codeSnippet?: string;
    subject: string;
    fingerprint: string;
    parentQuestionId?: string;
    sourceType?: string;
    examYear?: number;
    examRound?: number;
    questionNumber?: number;
  },
  existingQuestions: Question[],
): DuplicateAnalysisResult {
  // 0. 기출문제(REAL_EXAM) 자연 키(Natural Key) 중복 사전 검사
  if (
    staged.sourceType === "REAL_EXAM" &&
    staged.examYear !== undefined &&
    staged.examRound !== undefined &&
    staged.questionNumber !== undefined
  ) {
    const naturalKeyMatch = existingQuestions.find(
      (q) =>
        q.sourceType === "REAL_EXAM" &&
        q.examYear === staged.examYear &&
        q.examRound === staged.examRound &&
        q.questionNumber === staged.questionNumber,
    );
    if (naturalKeyMatch) {
      return {
        status: "DUPLICATE_WARNING",
        duplicateQuestionId: naturalKeyMatch.id,
        similarity: 1.0,
        reason: `동일한 회차의 실제 기출문제(${staged.examYear}년 ${staged.examRound}회 ${staged.questionNumber}번, ID: ${naturalKeyMatch.id})가 이미 등록되어 있습니다 (기출 자연 키 충돌).`,
      };
    }
  }

  // 1. 완전 일치 핑거프린트 검사
  const exactMatch = existingQuestions.find(
    (q) => q.structuralFingerprint === staged.fingerprint,
  );
  if (exactMatch) {
    return {
      status: "DUPLICATE_WARNING",
      duplicateQuestionId: exactMatch.id,
      similarity: 1.0,
      reason: `동일한 구조의 문항(${exactMatch.id})이 이미 존재합니다 (핑거프린트 완전 일치).`,
    };
  }

  // 2. 이미 parentQuestionId가 명시된 경우 변형 문제로 인정
  if (staged.parentQuestionId) {
    return {
      status: "AI_VARIATION_CANDIDATE",
      duplicateQuestionId: staged.parentQuestionId,
      similarity: 0.75,
      reason: `명시된 원본 기출(${staged.parentQuestionId})의 파생 변형 문항입니다.`,
    };
  }

  // 3. 텍스트 유사도 및 코드 유사도 스캔
  let highestSim = 0;
  let candidateQuestion: Question | null = null;
  let isCodeMatch = false;

  const stagedNormCode = (staged.codeSnippet || "")
    .replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "")
    .replace(/\s+/g, "");

  for (const q of existingQuestions) {
    // 코드 문제인 경우: 코드 스니펫의 유사도가 핵심 실질 내용임
    if (stagedNormCode && q.code) {
      const qNormCode = q.code
        .replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "")
        .replace(/\s+/g, "");
      const codeSim = calculateTextSimilarity(stagedNormCode, qNormCode);
      const textSim = calculateTextSimilarity(staged.questionText, q.question);

      // 코드가 80% 이상 일치하는 경우 중복 또는 변형 문제
      if (codeSim >= 0.85) {
        isCodeMatch = true;
        candidateQuestion = q;
        highestSim = Math.max(highestSim, codeSim);
        break;
      }

      // 코드가 다르면 지문이 상용구("다음 C언어 프로그램의...")라도 별개 문제로 판정 (가중치: 코드 80%, 지문 20%)
      const combinedSim = Number((codeSim * 0.8 + textSim * 0.2).toFixed(2));
      if (combinedSim > highestSim) {
        highestSim = combinedSim;
        candidateQuestion = q;
      }
      continue;
    }

    const sim = calculateTextSimilarity(staged.questionText, q.question);
    if (sim > highestSim) {
      highestSim = sim;
      candidateQuestion = q;
    }
  }

  // 유사도 판정 임계치
  if (isCodeMatch && candidateQuestion) {
    return {
      status: "AI_VARIATION_CANDIDATE",
      duplicateQuestionId: candidateQuestion.id,
      similarity: highestSim,
      reason: `기존 문항(${candidateQuestion.id})과 동일한 코드를 공유하여 AI 변형 문항 후보로 분류됩니다.`,
    };
  }

  if (highestSim >= 0.85 && candidateQuestion) {
    return {
      status: "DUPLICATE_WARNING",
      duplicateQuestionId: candidateQuestion.id,
      similarity: highestSim,
      reason: `기존 문항(${candidateQuestion.id})과 지문 유사도가 ${Math.round(highestSim * 100)}%로 중복 가능성이 높습니다.`,
    };
  }

  if (highestSim >= 0.65 && candidateQuestion) {
    return {
      status: "AI_VARIATION_CANDIDATE",
      duplicateQuestionId: candidateQuestion.id,
      similarity: highestSim,
      reason: `기존 문항(${candidateQuestion.id})과 유사한 개념(${Math.round(highestSim * 100)}%)을 다루고 있어 변형 후보로 검토 가능합니다.`,
    };
  }

  return {
    status: "NEW",
    similarity: highestSim,
    reason: "신규 고유 문항입니다.",
  };
}
