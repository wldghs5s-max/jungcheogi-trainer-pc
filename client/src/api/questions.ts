import {
  QuestionFilter,
  QuestionListResponse,
  QuestionDetailResponse,
} from '@jungcheogi/shared';

export async function fetchQuestions(
  filter: QuestionFilter = {}
): Promise<{ data: QuestionListResponse | null; error?: string }> {
  try {
    const params = new URLSearchParams();
    if (filter.subject) params.set('subject', filter.subject);
    if (filter.type) params.set('type', filter.type);
    if (filter.difficulty) params.set('difficulty', filter.difficulty);
    if (filter.sourceType) params.set('sourceType', filter.sourceType);
    if (filter.parentQuestionId) params.set('parentQuestionId', filter.parentQuestionId);
    if (filter.search) params.set('search', filter.search);
    if (filter.limit) params.set('limit', String(filter.limit));
    if (filter.offset) params.set('offset', String(filter.offset));

    const qs = params.toString();
    const url = qs ? `/api/questions?${qs}` : '/api/questions';

    const res = await fetch(url);
    if (!res.ok) {
      return { data: null, error: `HTTP ${res.status}: 문제 목록 조회 실패` };
    }

    const data = (await res.json()) as QuestionListResponse;
    return { data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '네트워크 오류';
    return { data: null, error: msg };
  }
}

export async function fetchQuestionDetail(
  id: string
): Promise<{ data: QuestionDetailResponse | null; error?: string }> {
  try {
    const res = await fetch(`/api/questions/${encodeURIComponent(id)}`);
    if (!res.ok) {
      return { data: null, error: `HTTP ${res.status}: 문제 상세 조회 실패` };
    }

    const data = (await res.json()) as QuestionDetailResponse;
    return { data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '네트워크 오류';
    return { data: null, error: msg };
  }
}
