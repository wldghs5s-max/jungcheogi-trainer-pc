import {
  LearningDashboardSummary,
  WeakConceptSummary,
  DueReviewItem,
  Concept,
  Question,
  ReviewState,
  QuizAttempt,
  StudySession,
  RecommendedQuestionItem,
  DailyLearningQueueSummary,
  DailySessionRequest,
  DrillSessionRequest,
  GeneratedVariation,
  StagedQuestion,
} from '@jungcheogi/shared';

export interface ConceptDetailResult {
  concept: Concept;
  questions: Question[];
}

export interface QuestionReviewResult {
  reviewState: ReviewState;
  attempts: QuizAttempt[];
}

export interface RecommendationsResponse {
  items: RecommendedQuestionItem[];
  questions: Array<{
    questionId: string;
    recommendationScore: number;
    reasonCodes: string[];
    conceptId?: string;
    reviewState?: string;
    sourceType: string;
  }>;
  total: number;
}

export interface SessionCreateResult {
  session: StudySession;
  firstQuestion: Question;
}

export interface MockVariationResult {
  variation: GeneratedVariation;
  batchId?: string;
  stagedQuestion?: StagedQuestion;
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
    const raw = await res.json();
    const data = Array.isArray(raw) ? raw : raw.weakConcepts || [];
    return { data };
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
    const raw = await res.json();
    const data = Array.isArray(raw) ? raw : raw.items || [];
    return { data };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : '네트워크 오류' };
  }
}

/**
 * 오늘의 학습 큐 요약 통계 조회 (복습 예정, 취약 개념, 최근 오답, 신규 문항)
 */
export async function fetchDailyQueueSummary(
  excludeTestFixtures = false
): Promise<{ data: DailyLearningQueueSummary | null; error?: string }> {
  try {
    const url = `/api/learning/daily-queue${excludeTestFixtures ? '?excludeTestFixtures=true' : ''}`;
    const res = await fetch(url);
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return { data: null, error: errBody.message || `HTTP ${res.status}: 일일 학습 큐 조회 실패` };
    }
    const data = (await res.json()) as DailyLearningQueueSummary;
    return { data };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : '네트워크 오류' };
  }
}

/**
 * 개인화 추천 문제 목록 조회 (RecommendationScore & reasonCodes)
 */
export async function fetchRecommendations(options: {
  limit?: number;
  conceptId?: string;
  subject?: string;
  includeNew?: boolean;
  includeDue?: boolean;
  excludeTestFixtures?: boolean;
} = {}): Promise<{ data: RecommendationsResponse | null; error?: string }> {
  try {
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', String(options.limit));
    if (options.conceptId) params.set('conceptId', options.conceptId);
    if (options.subject) params.set('subject', options.subject);
    if (options.includeNew !== undefined) params.set('includeNew', String(options.includeNew));
    if (options.includeDue !== undefined) params.set('includeDue', String(options.includeDue));
    if (options.excludeTestFixtures !== undefined) params.set('excludeTestFixtures', String(options.excludeTestFixtures));

    const res = await fetch(`/api/learning/recommendations?${params.toString()}`);
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return { data: null, error: errBody.message || `HTTP ${res.status}: 추천 문제 조회 실패` };
    }
    const data = (await res.json()) as RecommendationsResponse;
    return { data };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : '네트워크 오류' };
  }
}

/**
 * 오늘의 학습 자동 추천 세션 생성
 */
export async function createDailySession(
  request: DailySessionRequest = {}
): Promise<{ data: SessionCreateResult | null; error?: string }> {
  try {
    const res = await fetch('/api/learning/daily-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return { data: null, error: errBody.message || `HTTP ${res.status}: 오늘의 학습 세션 생성 실패` };
    }
    const data = (await res.json()) as SessionCreateResult;
    return { data };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : '네트워크 오류' };
  }
}

/**
 * 취약 개념 집중 드릴 (Concept Drill) 세션 생성
 */
export async function createConceptDrillSession(
  request: DrillSessionRequest
): Promise<{ data: SessionCreateResult | null; error?: string }> {
  try {
    const res = await fetch('/api/learning/drill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return { data: null, error: errBody.message || `HTTP ${res.status}: 개념 드릴 세션 생성 실패` };
    }
    const data = (await res.json()) as SessionCreateResult;
    return { data };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : '네트워크 오류' };
  }
}

/**
 * AI 변형 문제 Mock 생성 및 Staging 검수 등록
 */
export async function generateMockVariation(params: {
  questionId: string;
  variationType?: string;
  autoStage?: boolean;
}): Promise<{ data: MockVariationResult | null; error?: string }> {
  try {
    const res = await fetch('/api/learning/variations/generate-mock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return { data: null, error: errBody.message || `HTTP ${res.status}: 변형 문제 생성 실패` };
    }
    const data = (await res.json()) as MockVariationResult;
    return { data };
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
    const raw = await res.json();
    const data = Array.isArray(raw) ? raw : raw.concepts || [];
    return { data };
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
