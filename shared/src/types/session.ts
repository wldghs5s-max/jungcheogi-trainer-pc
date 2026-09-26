import { QuizAttempt } from './attempt.js';
import { Question } from './question.js';

export type SessionStatus = 'ACTIVE' | 'COMPLETED' | 'ABANDONED';

export interface StudySession {
  id: string;
  title: string;
  subjectFilter?: string; // 특정 과목명 또는 'ALL'
  questionIds: string[];
  currentIndex: number;
  status: SessionStatus;
  startedAt: string;
  endedAt?: string;
  totalQuestions: number;
  correctCount: number;
  wrongCount: number;
  unknownCount: number;
  totalTimeSpentMs: number;
}

export interface CreateSessionRequest {
  title?: string;
  subject?: string;
  count?: number; // 기본 5 ~ 10문제
  sourceType?: string;
}

export interface SessionSubmitRequest {
  questionId: string;
  userAnswer: string | string[];
  timeSpentMs: number;
  isUnknown?: boolean;
  hintUsed?: boolean;
  solutionRevealed?: boolean;
}

export interface SessionSubmitResponse {
  attempt: QuizAttempt;
  isCorrect: boolean;
  score: number;
  feedback?: string;
  groundTruthAnswer: string | string[];
  officialExplanation?: string;
  aiExplanation?: string;
  aiVariationNotes?: string;
  isSessionCompleted: boolean;
  nextQuestionId?: string | null;
  sessionProgress: {
    currentIndex: number;
    totalQuestions: number;
    correctCount: number;
    wrongCount: number;
    unknownCount: number;
  };
}

export interface SessionSummaryResponse {
  session: StudySession;
  attempts: QuizAttempt[];
  questions: Question[];
  accuracyRate: number; // 0 ~ 100%
  averageTimeSpentSeconds: number;
}
