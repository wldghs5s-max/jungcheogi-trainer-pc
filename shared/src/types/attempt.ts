export type MissType = 'WRONG' | 'UNKNOWN';

export interface QuizAttempt {
  id: string;
  sessionId?: string;
  questionId: string;
  userAnswer: string | string[];
  isCorrect: boolean;
  missType?: MissType;
  timeSpentSeconds?: number;
  answeredAt: string;
}
