import {
  BugReportCreateRequest,
  BugReportCreateResponse,
} from "@jungcheogi/shared";
import { apiFetch } from "./http";

export async function submitBugReport(
  req: BugReportCreateRequest,
): Promise<{ data: BugReportCreateResponse | null; error?: string }> {
  try {
    const res = await apiFetch("/api/bug-reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return {
        data: null,
        error: err.message || `신고 접수 실패 (${res.status})`,
      };
    }

    const data: BugReportCreateResponse = await res.json();
    return { data };
  } catch (err: any) {
    return {
      data: null,
      error: err?.message || "네트워크 통신 중 오류가 발생했습니다.",
    };
  }
}

