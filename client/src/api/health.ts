import { HealthCheckResponse } from '@jungcheogi/shared';
import { apiFetch } from './http';

export async function checkBackendHealth(): Promise<{
  data: HealthCheckResponse | null;
  error?: string;
}> {
  try {
    const res = await apiFetch('/api/health');
    if (!res.ok) {
      return {
        data: null,
        error: `서버 응답 오류 (HTTP ${res.status})`,
      };
    }
    const data = (await res.json()) as HealthCheckResponse;
    return { data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '연결 실패';
    return {
      data: null,
      error: `백엔드 서버(:8765)에 연결할 수 없습니다 (${msg}). 서버가 구동 중인지 확인해 주세요.`,
    };
  }
}
