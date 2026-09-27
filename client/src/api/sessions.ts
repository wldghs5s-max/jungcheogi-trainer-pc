import {
  CreateSessionRequest,
  SessionSubmitRequest,
  SessionSubmitResponse,
  SessionSummaryResponse,
  StudySession,
  Question,
  GradingResult,
  GradeContext,
} from '@jungcheogi/shared';
import { apiFetch } from './http';

export interface CreateSessionResult {
  session: StudySession;
  firstQuestion: Question;
}

export interface GetSessionResult {
  session: StudySession;
  currentQuestion: Question | null;
}

export async function createStudySession(
  request: CreateSessionRequest
): Promise<{ data: CreateSessionResult | null; error?: string }> {
  try {
    const res = await apiFetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return { data: null, error: errBody.message || `HTTP ${res.status}: 세션 생성 실패` };
    }

    const data = (await res.json()) as CreateSessionResult;
    return { data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '네트워크 오류';
    return { data: null, error: msg };
  }
}

export async function fetchStudySession(
  sessionId: string
): Promise<{ data: GetSessionResult | null; error?: string }> {
  try {
    const res = await apiFetch(`/api/sessions/${encodeURIComponent(sessionId)}`);
    if (!res.ok) {
      return { data: null, error: `HTTP ${res.status}: 세션 조회 실패` };
    }
    const data = (await res.json()) as GetSessionResult;
    return { data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '네트워크 오류';
    return { data: null, error: msg };
  }
}

export async function submitSessionAnswer(
  sessionId: string,
  request: SessionSubmitRequest
): Promise<{ data: SessionSubmitResponse | null; error?: string }> {
  try {
    const res = await apiFetch(`/api/sessions/${encodeURIComponent(sessionId)}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return { data: null, error: errBody.message || `HTTP ${res.status}: 답안 제출 실패` };
    }

    const data = (await res.json()) as SessionSubmitResponse;
    return { data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '네트워크 오류';
    return { data: null, error: msg };
  }
}

export async function submitSessionUnknown(
  sessionId: string,
  payload: { questionId: string; timeSpentMs: number; hintUsed?: boolean; recordOnly?: boolean }
): Promise<{ data: SessionSubmitResponse | null; error?: string }> {
  try {
    const res = await apiFetch(`/api/sessions/${encodeURIComponent(sessionId)}/unknown`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return { data: null, error: errBody.message || `HTTP ${res.status}: 모르겠음 제출 실패` };
    }

    const data = (await res.json()) as SessionSubmitResponse;
    return { data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '네트워크 오류';
    return { data: null, error: msg };
  }
}

export async function fetchSessionSummary(
  sessionId: string
): Promise<{ data: SessionSummaryResponse | null; error?: string }> {
  try {
    const res = await apiFetch(`/api/sessions/${encodeURIComponent(sessionId)}/summary`);
    if (!res.ok) {
      return { data: null, error: `HTTP ${res.status}: 세션 요약 조회 실패` };
    }
    const data = (await res.json()) as SessionSummaryResponse;
    return { data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '네트워크 오류';
    return { data: null, error: msg };
  }
}

export async function gradeStandaloneAnswer(
  userAnswer: string | string[],
  groundTruthAnswer: string | string[],
  context?: GradeContext,
): Promise<{ data: GradingResult | null; error?: string }> {
  try {
    const res = await apiFetch('/api/grade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userAnswer,
        groundTruthAnswer,
        questionType: context?.questionType,
        language: context?.language,
        mode: context?.mode,
      }),
    });

    if (!res.ok) {
      return { data: null, error: `HTTP ${res.status}: 채점 실패` };
    }

    const data = (await res.json()) as GradingResult;
    return { data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '네트워크 오류';
    return { data: null, error: msg };
  }
}
