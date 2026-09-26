import {
  LearningDashboardSummary,
  WeakConceptSummary,
  DueReviewItem,
  Concept,
  Question,
  ReviewState,
  QuizAttempt,
} from '@jungcheogi/shared';

export interface ConceptDetailResult {
  concept: Concept;
  questions: Question[];
}

export interface QuestionReviewResult {
  reviewState: ReviewState;
  attempts: QuizAttempt[];
}

/**
 * 학습 대시보드 통계 조회 (Fixture 분리 옵션 지원)
 */
export async function fetchLearningDashboard(
  excludeTestFixtures = false
): Promise<{ data: LearningDashboardSummary | null; error?: string }> {
  try {
    const url = `/api/learning/dashboard${excludeTestFixtures ? '?excludeTestFixtures=true' : ''}`;
    const res = await fetch(url);
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return { data: null, error: errBody.message || `HTTP ${res.status}: 대시보드 조회 실패` };
    }
    const data = (await res.json()) as LearningDashboardSummary;
    return { data };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : '네트워크 오류' };
  }
}

/**
 * 취약 개념 Top N 목록 조회
 */
export async function fetchWeakConcepts(
  limit = 5
): Promise<{ data: WeakConceptSummary[] | null; error?: string }> {
  try {
    const res = await fetch(`/api/learning/weak-concepts?limit=${limit}`);
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return { data: null, error: errBody.message || `HTTP ${res.status}: 취약 개념 조회 실패` };
    }
    const data = (await res.json()) as { weakConcepts: WeakConceptSummary[] };
    return { data: data.weakConcepts };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : '네트워크 오류' };
  }
}

/**
 * 오늘 복습해야 할 문항 큐 (Due Reviews) 조회
 */
export async function fetchDueReviews(
  limit = 20
): Promise<{ data: DueReviewItem[] | null; error?: string }> {
  try {
    const res = await fetch(`/api/learning/reviews/due?limit=${limit}`);
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return { data: null, error: errBody.message || `HTTP ${res.status}: 복습 큐 조회 실패` };
    }
    const data = (await res.json()) as { dueItems: DueReviewItem[] };
    return { data: data.dueItems };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : '네트워크 오류' };
  }
}

/**
 * 전체 개념 목록 조회
 */
export async function fetchConcepts(
  subject?: string
): Promise<{ data: Concept[] | null; error?: string }> {
  try {
    const url = subject ? `/api/learning/concepts?subject=${encodeURIComponent(subject)}` : '/api/learning/concepts';
    const res = await fetch(url);
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return { data: null, error: errBody.message || `HTTP ${res.status}: 개념 목록 조회 실패` };
    }
    const data = (await res.json()) as { concepts: Concept[] };
    return { data: data.concepts };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : '네트워크 오류' };
  }
}

/**
 * 단일 개념 상세 및 연관 문항 조회
 */
export async function fetchConceptDetail(
  id: string
): Promise<{ data: ConceptDetailResult | null; error?: string }> {
  try {
    const res = await fetch(`/api/learning/concepts/${encodeURIComponent(id)}`);
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return { data: null, error: errBody.message || `HTTP ${res.status}: 개념 상세 조회 실패` };
    }
    const data = (await res.json()) as ConceptDetailResult;
    return { data };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : '네트워크 오류' };
  }
}

/**
 * 문항별 복습 상태 및 풀이 이력 조회
 */
export async function fetchQuestionReview(
  questionId: string
): Promise<{ data: QuestionReviewResult | null; error?: string }> {
  try {
    const res = await fetch(`/api/learning/reviews/${encodeURIComponent(questionId)}`);
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return { data: null, error: errBody.message || `HTTP ${res.status}: 문항 복습 상태 조회 실패` };
    }
    const data = (await res.json()) as QuestionReviewResult;
    return { data };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : '네트워크 오류' };
  }
}
