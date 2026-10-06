export type BugReportCategory =
  | "ANSWER_OR_EXPLANATION"
  | "GRADING"
  | "AI_VARIATION"
  | "AI_LINE_EXPLANATION"
  | "CODE_DEEP_QUESTION"
  | "UI"
  | "OTHER";

export const BUG_REPORT_CATEGORIES: BugReportCategory[] = [
  "ANSWER_OR_EXPLANATION",
  "GRADING",
  "AI_VARIATION",
  "AI_LINE_EXPLANATION",
  "CODE_DEEP_QUESTION",
  "UI",
  "OTHER",
];

export const BUG_REPORT_CATEGORY_LABELS: Record<BugReportCategory, string> = {
  ANSWER_OR_EXPLANATION: "문제/정답/해설 오류",
  GRADING: "채점 결과 오류",
  AI_VARIATION: "AI 변형 문제 품질",
  AI_LINE_EXPLANATION: "AI 줄별 해설 오류",
  CODE_DEEP_QUESTION: "코드 심층 질문 답변 오류",
  UI: "화면/버튼/동작 버그",
  OTHER: "기타 제보",
};

export interface BugReportQuestionContext {
  questionId?: string;
  questionCode?: string;
  sourceType?: string;
  studyVisibility?: string;
  questionType?: string;
  language?: string;
  subject?: string;
  category?: string;
  conceptId?: string;
  parentQuestionId?: string;
  provenance?: string;
  codeSnippet?: string;
  sessionId?: string;
  clientTimestamp?: string;
  appRoute?: string;
}

export interface BugReportCreateRequest {
  category: BugReportCategory;
  description: string;
  expectedBehavior?: string;
  actualBehavior?: string;
  questionContext?: BugReportQuestionContext;
}

export interface BugReportCreateResponse {
  success: boolean;
  bugReportId: string;
  message?: string;
}
