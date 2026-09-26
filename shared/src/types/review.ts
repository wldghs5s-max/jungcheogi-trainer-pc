import { Question } from './question.js';
import { WeakConceptSummary } from './concept.js';

export type ReviewItemState = 'NEW' | 'LEARNING' | 'REVIEW' | 'MASTERED';

export interface ReviewState {
  questionId: string;
  conceptId?: string;
  boxLevel: number; // 1 to 5 (Leitner Box)
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  correctCount: number;
  wrongCount: number;
  unknownCount: number;
  hintCount: number;
  lastScore: number;
  weaknessScore: number; // 0.0 ~ 1.0 (높을수록 더 시급한 복습 대상)
  reviewState: ReviewItemState;
  lastStudiedAt?: string;
  nextReviewAt: string;
}

export interface DueReviewItem {
  reviewState: ReviewState;
  question: Question;
  priorityScore: number;
}

export interface LearningDashboardSummary {
  totalStudiedQuestions: number;
  dueReviewCount: number;
  masteredCount: number;
  weakConcepts: WeakConceptSummary[];
  recentAttemptsCount: number;
  overallAccuracy: number;
}
