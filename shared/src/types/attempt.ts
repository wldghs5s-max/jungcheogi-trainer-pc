export type MissType = 'WRONG' | 'UNKNOWN';
export type ScoringStatus = 'GRADED' | 'UNSCORED';

export interface QuizAttempt {
  id: string;
  questionId: string;
  sessionId?: string;
  userAnswer: string | string[];
  isCorrect: boolean;
  score: number; // 0.0 ~ 1.0 (복수 정답 부분 점수 지원)
  missType?: MissType;
  scoringStatus?: ScoringStatus;
  timeSpentMs: number;
  isUnknown: boolean; // 사용자가 '모르겠음'을 선택하여 답안 제출을 생략/포기한 경우
  hintUsed: boolean; // 풀이 중 힌트나 핵심 개념을 조회했는지 여부
  solutionRevealed: boolean; // 채점 전/후 정답 및 해설을 강제 열람했는지 여부
  feedback?: string;
  createdAt: string;
}

export function isUnknownAttempt(attempt: QuizAttempt): boolean {
  if (attempt.scoringStatus === 'UNSCORED') return false;
  return !attempt.isCorrect && (attempt.isUnknown || attempt.missType === 'UNKNOWN');
}

export function isConfusedAttempt(attempt: QuizAttempt): boolean {
  if (attempt.scoringStatus === 'UNSCORED') return false;
  return !attempt.isCorrect && !attempt.isUnknown && attempt.missType !== 'UNKNOWN';
}
