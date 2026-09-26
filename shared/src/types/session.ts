export type SessionStatus = 'ACTIVE' | 'COMPLETED' | 'ABANDONED';

export interface StudySession {
  id: string;
  durationMinutes: number;
  status: SessionStatus;
  startedAt: string;
  endedAt?: string;
  totalQuestions: number;
  correctCount: number;
  unknownCount: number;
  wrongCount: number;
  weakTopics?: string[];
}
