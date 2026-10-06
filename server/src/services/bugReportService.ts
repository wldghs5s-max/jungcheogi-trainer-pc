import fs from "fs";
import path from "path";
import crypto from "crypto";
import {
  BugReportCreateRequest,
  BugReportCategory,
  BUG_REPORT_CATEGORIES,
  BUG_REPORT_CATEGORY_LABELS,
} from "@jungcheogi/shared";

// In-memory rate limiting: IP -> Array of timestamps (ms)
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 15;

export function resolveBugReportsBaseDir(customBaseDir?: string): string {
  if (customBaseDir) {
    return path.resolve(customBaseDir);
  }
  const cwd = process.cwd();
  // Check if we are running in workspace root or server directory
  if (fs.existsSync(path.join(cwd, "server", "data"))) {
    return path.join(cwd, "server", "data", "bug-reports");
  }
  if (fs.existsSync(path.join(cwd, "data"))) {
    return path.join(cwd, "data", "bug-reports");
  }
  return path.resolve(cwd, "server", "data", "bug-reports");
}

export class BugReportService {
  private baseDir: string;

  constructor(customBaseDir?: string) {
    this.baseDir = resolveBugReportsBaseDir(customBaseDir);
    this.ensureDirectories();
  }

  public getBaseDir(): string {
    return this.baseDir;
  }

  public getOpenDir(): string {
    return path.join(this.baseDir, "open");
  }

  public getResolvedDir(): string {
    return path.join(this.baseDir, "resolved");
  }

  public ensureDirectories(): void {
    const openDir = this.getOpenDir();
    const resolvedDir = this.getResolvedDir();

    if (!fs.existsSync(openDir)) {
      fs.mkdirSync(openDir, { recursive: true });
    }
    if (!fs.existsSync(resolvedDir)) {
      fs.mkdirSync(resolvedDir, { recursive: true });
    }
  }

  /**
   * 충돌 방지 및 시간순 정렬이 보장되는 고유 Bug ID 생성
   * 형식: BR-YYYYMMDD-HHmmss-XXXX (예: BR-20261006-231500-A1B2)
   */
  public generateBugReportId(): string {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const min = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    const randSuffix = crypto.randomBytes(2).toString("hex").toUpperCase();

    return `BR-${yyyy}${mm}${dd}-${hh}${min}${ss}-${randSuffix}`;
  }

  /**
   * Cloudflare Tunnel 환경 대비 간단한 IP 기반 Rate Limiting 검사
   */
  public checkRateLimit(clientIp: string = "127.0.0.1"): boolean {
    const now = Date.now();
    const timestamps = rateLimitMap.get(clientIp) || [];
    const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

    if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
      rateLimitMap.set(clientIp, recent);
      return false;
    }

    recent.push(now);
    rateLimitMap.set(clientIp, recent);
    return true;
  }

  /**
   * 안전한 마크다운 버그 리포트 생성 및 저장 (Atomic Write)
   */
  public createBugReport(
    req: BugReportCreateRequest,
    clientIp: string = "127.0.0.1",
  ): { bugReportId: string; filePath: string } {
    // 1. 유효성 검증
    if (!this.checkRateLimit(clientIp)) {
      throw new Error(
        "신고 요청이 너무 많습니다. 잠시 후 다시 시도해주세요 (Rate limit exceeded).",
      );
    }

    if (!req.category || !BUG_REPORT_CATEGORIES.includes(req.category)) {
      throw new Error(
        `올바르지 않은 신고 유형입니다: ${req.category || "(미입력)"}`,
      );
    }

    const description = (req.description || "").trim();
    if (!description) {
      throw new Error("오류 내용(description)은 필수 입력 사항입니다.");
    }
    if (description.length > 3000) {
      throw new Error("오류 내용은 최대 3,000자까지 입력 가능합니다.");
    }

    const expectedBehavior = (req.expectedBehavior || "").trim();
    if (expectedBehavior.length > 2000) {
      throw new Error("예상 동작은 최대 2,000자까지 입력 가능합니다.");
    }

    const actualBehavior = (req.actualBehavior || "").trim();
    if (actualBehavior.length > 2000) {
      throw new Error("실제 동작은 최대 2,000자까지 입력 가능합니다.");
    }

    // 2. ID 생성
    const bugReportId = this.generateBugReportId();
    const createdAt = new Date().toISOString();
    const categoryLabel = BUG_REPORT_CATEGORY_LABELS[req.category] || req.category;
    const qCtx = req.questionContext || {};

    // 3. Markdown 내용 빌드
    const mdLines: string[] = [
      `# Bug Report ${bugReportId}`,
      "",
      `- status: OPEN`,
      `- createdAt: ${createdAt}`,
      `- category: ${req.category}`,
      `- categoryLabel: ${categoryLabel}`,
      `- questionId: ${qCtx.questionId || "N/A"}`,
      `- questionCode: ${qCtx.questionCode || "N/A"}`,
      `- sourceType: ${qCtx.sourceType || "N/A"}`,
      `- studyVisibility: ${qCtx.studyVisibility || "N/A"}`,
      `- questionType: ${qCtx.questionType || "N/A"}`,
      `- language: ${qCtx.language || "N/A"}`,
      `- subject: ${qCtx.subject || "N/A"}`,
      `- category: ${qCtx.category || "N/A"}`,
      `- conceptId: ${qCtx.conceptId || "N/A"}`,
      "",
      `## 오류 내용`,
      "",
      description,
      "",
      `## 예상한 동작`,
      "",
      expectedBehavior || "(작성되지 않음)",
      "",
      `## 실제 동작`,
      "",
      actualBehavior || "(작성되지 않음)",
      "",
      `## 자동 첨부 정보`,
      "",
      `- sessionId: ${qCtx.sessionId || "N/A"}`,
      `- parentQuestionId: ${qCtx.parentQuestionId || "N/A"}`,
      `- provenance: ${qCtx.provenance || "N/A"}`,
      `- appRoute: ${qCtx.appRoute || "N/A"}`,
      `- clientTimestamp: ${qCtx.clientTimestamp || "N/A"}`,
    ];

    if (qCtx.codeSnippet && qCtx.codeSnippet.trim()) {
      mdLines.push("");
      mdLines.push(`## 문제 코드 스니펫`);
      mdLines.push("");
      mdLines.push(`\`\`\`${(qCtx.language || "").toLowerCase()}`);
      mdLines.push(qCtx.codeSnippet.trim());
      mdLines.push("```");
    }

    mdLines.push("");

    const markdownContent = mdLines.join("\n");

    // 4. 저장 (Atomic Write: temp 파일 작성 후 rename)
    this.ensureDirectories();
    const openDir = this.getOpenDir();
    const targetFilePath = path.join(openDir, `${bugReportId}.md`);
    const tempFilePath = path.join(openDir, `.${bugReportId}.tmp`);

    fs.writeFileSync(tempFilePath, markdownContent, "utf-8");
    fs.renameSync(tempFilePath, targetFilePath);

    return {
      bugReportId,
      filePath: targetFilePath,
    };
  }
}

// Singleton instance
let defaultService: BugReportService | null = null;

export function getBugReportService(): BugReportService {
  if (!defaultService) {
    defaultService = new BugReportService();
  }
  return defaultService;
}

