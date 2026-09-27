import {
  AITutoringExplanationRequest,
  AITutoringExplanationResponse,
  AIProgressiveHintsRequest,
  AIProgressiveHintsResponse,
  AICodeLineRequest,
  AICodeLineResponse,
  AIGeminiVariationRequest,
  AIGeminiVariationResponse,
} from '@jungcheogi/shared';

/**
 * AI 맞춤형 심층 해설 요청 (오답 분석, 코드 트레이스, 함정, 암기 팁)
 */
export async function fetchAIExplanation(
  req: AITutoringExplanationRequest
): Promise<{ data: AITutoringExplanationResponse | null; error?: string }> {
  try {
    const res = await fetch('/api/ai/explanation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { data: null, error: err.message || `AI 해설 요청 실패 (${res.status})` };
    }

    const data: AITutoringExplanationResponse = await res.json();
    return { data };
  } catch (err: any) {
    return { data: null, error: err?.message || '네트워크 오류가 발생했습니다.' };
  }
}

/**
 * 3단계 점진적 AI 힌트 요청 (Active Recall 유도)
 */
export async function fetchAIProgressiveHints(
  req: AIProgressiveHintsRequest
): Promise<{ data: AIProgressiveHintsResponse | null; error?: string }> {
  try {
    const res = await fetch('/api/ai/hints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { data: null, error: err.message || `AI 힌트 요청 실패 (${res.status})` };
    }

    const data: AIProgressiveHintsResponse = await res.json();
    return { data };
  } catch (err: any) {
    return { data: null, error: err?.message || '네트워크 오류가 발생했습니다.' };
  }
}

/**
 * 코드 라인별 심층 해부 요청 (Line-by-Line Anatomy)
 */
export async function fetchAICodeLine(
  req: AICodeLineRequest
): Promise<{ data: AICodeLineResponse | null; error?: string }> {
  try {
    const res = await fetch('/api/ai/code-line', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { data: null, error: err.message || `코드 라인 해부 요청 실패 (${res.status})` };
    }

    const data: AICodeLineResponse = await res.json();
    return { data };
  } catch (err: any) {
    return { data: null, error: err?.message || '네트워크 오류가 발생했습니다.' };
  }
}

/**
 * Gemini 기반 AI 변형 문제 생성 요청 (Staging 등록)
 */
export async function generateAIVariation(
  req: AIGeminiVariationRequest
): Promise<{ data: AIGeminiVariationResponse | null; error?: string }> {
  try {
    const res = await fetch('/api/ai/variation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { data: null, error: err.message || `AI 변형 문제 생성 실패 (${res.status})` };
    }

    const data: AIGeminiVariationResponse = await res.json();
    return { data };
  } catch (err: any) {
    return { data: null, error: err?.message || '네트워크 오류가 발생했습니다.' };
  }
}
