import { Question } from "./question.js";
import { StudySession } from "./session.js";
import { VariationType, GeneratedVariation } from "./recommendation.js";
import { DrillFailureReason } from "../utils/answerValidity.js";

export interface AITutoringExplanationRequest {
  questionId?: string;
  questionData?: Question;
  userAnswer?: string | string[];
  isCorrect?: boolean;
  isUnknown?: boolean;
  deepAnalysis?: boolean;
}

export type GroundTruthConflictStatus = "MATCH" | "CONFLICT" | "NOT_APPLICABLE";

export interface GroundTruthConflictReport {
  status: GroundTruthConflictStatus;
  groundTruthAnswer: string;
  calculatedAnswer: string;
  message?: string;
}

export interface AITutoringExplanationResponse {
  summary: string;
  keyPoint: string;
  whyWrong?: string;
  codeTrace?: string;
  pitfalls?: string;
  studyTips: string;
  rawExplanation?: string;
  source: "GEMINI" | "MOCK";
  modelUsed?: string;
  promotionReason?: string;
  conflictStatus?: GroundTruthConflictStatus;
  conflictReport?: GroundTruthConflictReport;
}

export interface AIProgressiveHintsRequest {
  questionId?: string;
  questionData?: Question;
  deepAnalysis?: boolean;
}

export interface AIProgressiveHintsResponse {
  hints: [string, string, string]; // [Level 1, Level 2, Level 3]
  source: "GEMINI" | "MOCK";
  modelUsed?: string;
  promotionReason?: string;
}

export interface AICodeLineRequest {
  questionId?: string;
  questionData?: Question;
  lineNumber: number;
  deepAnalysis?: boolean;
}

export interface SyntaxTermRef {
  canonicalKey: string;
  display: string;
}

export interface AICodeLineResponse {
  lineNumber: number;
  code: string;
  // 구조화된 교육 해설 필드
  lineRole?: string;             // ② 이 줄이 하는 일 (핵심 역할 및 목적)
  runtimeBehavior?: string;      // ③ 실행 시 실제 동작 (값, 조건 판별, 연산, 메모리/포인터 상태)
  flowContext?: string;          // ④ 앞뒤 코드와의 관계 (이전 줄에서 무엇을 받고 이후 줄에 무엇을 전달하는지)
  caution?: string;              // ⑤ 주의점 (시험에서 헷갈리기 쉬운 부분)
  problemHint?: string;          // ⑥ 문제 풀이 힌트 (보조 정보)
  syntaxTerms?: SyntaxTermRef[]; // ① 문법 요소 식별자 목록 (클릭 시 Syntax DB 모달 연결)

  // 하위 호환 필드
  summary?: string;
  flow?: string;
  deepExplanation?: string;
  syntaxElements?: string[];
  userDefinedElements?: string[];
  runtimeMeaning?: string;
  surroundingContext?: string;
  examTip?: string;
  source: "GEMINI" | "MOCK";
  modelUsed?: string;
  promotionReason?: string;
}

export interface AIGeminiVariationRequest {
  parentQuestionId: string;
  variationType: VariationType;
  instructions?: string;
}

export interface AIGeminiVariationResponse {
  batchId: string;
  stagedQuestionId: string;
  variation: GeneratedVariation;
  source: "GEMINI" | "MOCK";
  modelUsed?: string;
}

export interface AIBatchGenerateRequest {
  mode: "RANDOM" | "DOMAIN";
  domain?: string;
  count: number;
}

export interface AIBatchGenerateResponse {
  success: boolean;
  batchId: string;
  count: number;
  stagedQuestionIds: string[];
  passCount?: number;
  reviewCount?: number;
  rejectCount?: number;
  rejectedItems?: Array<{
    reason: string;
    details?: any;
  }>;
  message?: string;
}

export interface LearningDomainsResponse {
  languages: string[];
  subjects: string[];
  categories: string[];
  supportedIndependentLanguages: Array<"C" | "JAVA" | "PYTHON">;
}

export interface AIVariationDrillRequest {
  parentQuestionId: string;
}

export interface AIVariationDrillResponse {
  success: boolean;
  question?: Question;
  variation?: GeneratedVariation;
  drillSession?: StudySession;
  verificationStatus?: "VERIFIED" | "UNVERIFIED";
  executionStatus?: "SUCCESS" | "UNAVAILABLE" | "ERROR";
  answerSource?: "OFFICIAL" | "AI_UNVERIFIED" | "EXECUTION_VERIFIED";
  failureReason?: DrillFailureReason;
  message?: string;
  stagedQuestionId?: string;
}

export interface AIStageDrillRequest {
  variation: GeneratedVariation;
}

export interface AIStageDrillResponse {
  success: boolean;
  stagedQuestionId: string;
  batchId: string;
  message?: string;
}

export interface QuestionDesignMetadata {
  concept: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  skill: string;
  questionDesign: string;
  stepByStepTrace?: string;
}

export interface GeneratedIndependentQuestion {
  correlationId?: string;
  questionText: string;
  code?: string;
  language?: string;
  type: string;
  subject: string;
  category: string;
  groundTruthAnswer: string | string[];
  officialExplanation: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  keywords: string[];
  designMetadata: QuestionDesignMetadata;
  generationMetadata: {
    model: string;
    generator: string;
    generatedAt: string;
    strategy: "INDEPENDENT_DESIGN" | "MOCK";
  };
}

export interface IndependentGenerationContext {
  domain?: string;
  subject?: string;
  language?: string;
  conceptName?: string;
  difficulty?: "EASY" | "MEDIUM" | "HARD";
  avoidSnippets?: string[];
  instructions?: string;
  correlationId?: string;
  strictLive?: boolean;
}

export interface AICodeExplanationsRequest {
  questionId?: string;
  questionData?: Question;
  forceRegenerate?: boolean;
  requestVersion?: number;
}

export interface AICodeExplanationsResponse {
  questionId: string;
  codeHash: string;
  status: "READY" | "FAILED" | "PENDING";
  lines: AICodeLineResponse[];
  generatedAt: string;
  source: "GEMINI" | "MOCK" | "CACHE";
  modelUsed?: string;
  retryCount?: number;
  generationId?: string;
  errorMessage?: string;
}

export interface CodeDeepQuestionMessage {
  role: "user" | "assistant";
  content: string;
  selectedText?: string | null;
  selectedRange?: { startLine?: number; endLine?: number } | null;
  createdAt?: string;
}

export interface CodeDeepQuestionRequest {
  questionId?: string;
  questionText?: string;
  code: string;
  language?: string;
  selectedText?: string | null;
  selectedRange?: { startLine?: number; endLine?: number } | null;
  userQuestion: string;
  conversationHistory?: CodeDeepQuestionMessage[];
}

export interface CodeDeepQuestionResponse {
  success: boolean;
  answer: string;
  source: "GEMINI" | "MOCK";
  modelUsed?: string;
  durationMs?: number;
  errorMessage?: string;
}

