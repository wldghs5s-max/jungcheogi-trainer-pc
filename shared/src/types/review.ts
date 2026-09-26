export interface ReviewState {
  id: string;
  questionId: string;
  intervalDays: number;
  repetitionCount: number;
  easeFactor: number;
  lastReviewedAt: string;
  dueDate: string;
}
