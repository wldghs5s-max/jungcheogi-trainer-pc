import {
  ParseImportRequest,
  ParseImportResponse,
  ImportBatch,
  StagedQuestion,
  UpdateStagedQuestionRequest,
  SetStagedStatusRequest,
  CommitBatchResponse,
} from "@jungcheogi/shared";
import { apiFetch } from "./http";

export interface BatchDetailResponse {
  batch: ImportBatch;
  stagedQuestions: StagedQuestion[];
}

export async function parseAndStageImport(
  request: ParseImportRequest,
): Promise<{ data: ParseImportResponse | null; error?: string }> {
  try {
    const res = await apiFetch("/api/imports/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return {
        data: null,
        error: errBody.message || `HTTP ${res.status}: Import 파싱 실패`,
      };
    }

    const data = (await res.json()) as ParseImportResponse;
    return { data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "네트워크 오류";
    return { data: null, error: msg };
  }
}

export async function fetchImportBatches(): Promise<{
  data: ImportBatch[] | null;
  error?: string;
}> {
  try {
    const res = await apiFetch("/api/imports/batches");
    if (!res.ok) {
      return { data: null, error: `HTTP ${res.status}: 배치 목록 조회 실패` };
    }
    const json = await res.json();
    const data = (Array.isArray(json) ? json : json.batches || []) as ImportBatch[];
    return { data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "네트워크 오류";
    return { data: null, error: msg };
  }
}

export async function fetchImportBatchDetail(
  batchId: string,
): Promise<{ data: BatchDetailResponse | null; error?: string }> {
  try {
    const res = await apiFetch(
      `/api/imports/batches/${encodeURIComponent(batchId)}`,
    );
    if (!res.ok) {
      return { data: null, error: `HTTP ${res.status}: 배치 상세 조회 실패` };
    }
    const data = (await res.json()) as BatchDetailResponse;
    return { data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "네트워크 오류";
    return { data: null, error: msg };
  }
}

export async function updateStagedQuestionApi(
  stagedId: string,
  updates: UpdateStagedQuestionRequest,
): Promise<{
  data: { stagedQuestion: StagedQuestion; batch: ImportBatch } | null;
  error?: string;
}> {
  try {
    const res = await apiFetch(
      `/api/imports/questions/${encodeURIComponent(stagedId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      },
    );

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return {
        data: null,
        error: errBody.message || `HTTP ${res.status}: 문항 수정 실패`,
      };
    }

    const data = (await res.json()) as {
      stagedQuestion: StagedQuestion;
      batch: ImportBatch;
    };
    return { data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "네트워크 오류";
    return { data: null, error: msg };
  }
}

export async function setStagedStatusApi(
  stagedId: string,
  request: SetStagedStatusRequest,
): Promise<{
  data: { stagedQuestion: StagedQuestion; batch: ImportBatch } | null;
  error?: string;
}> {
  try {
    const res = await apiFetch(
      `/api/imports/questions/${encodeURIComponent(stagedId)}/status`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      },
    );

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return {
        data: null,
        error: errBody.message || `HTTP ${res.status}: 상태 변경 실패`,
      };
    }

    const data = (await res.json()) as {
      stagedQuestion: StagedQuestion;
      batch: ImportBatch;
    };
    return { data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "네트워크 오류";
    return { data: null, error: msg };
  }
}

export async function approveAllStagedApi(
  batchId: string,
): Promise<{
  data: { batch: ImportBatch; approvedCount: number } | null;
  error?: string;
}> {
  try {
    const res = await apiFetch(
      `/api/imports/batches/${encodeURIComponent(batchId)}/approve-all`,
      {
        method: "POST",
      },
    );

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return {
        data: null,
        error: errBody.message || `HTTP ${res.status}: 일괄 승인 실패`,
      };
    }

    const raw = (await res.json()) as {
      batch?: ImportBatch;
      approvedCount?: number;
    };
    const data = {
      batch: raw.batch as ImportBatch,
      approvedCount: Number(raw.approvedCount || 0),
    };
    return { data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "네트워크 오류";
    return { data: null, error: msg };
  }
}

export async function commitImportBatchApi(
  batchId: string,
): Promise<{ data: CommitBatchResponse | null; error?: string }> {
  try {
    const res = await apiFetch(
      `/api/imports/batches/${encodeURIComponent(batchId)}/commit`,
      {
        method: "POST",
      },
    );

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return {
        data: null,
        error: errBody.message || `HTTP ${res.status}: Live DB 커밋 실패`,
      };
    }

    const data = (await res.json()) as CommitBatchResponse;
    return { data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "네트워크 오류";
    return { data: null, error: msg };
  }
}

export async function deleteImportBatchApi(
  batchId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await apiFetch(
      `/api/imports/batches/${encodeURIComponent(batchId)}`,
      {
        method: "DELETE",
      },
    );

    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}: 배치 삭제 실패` };
    }

    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "네트워크 오류";
    return { success: false, error: msg };
  }
}
