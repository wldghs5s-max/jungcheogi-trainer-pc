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

export interface AICodeLineResponse {
  lineNumber: number;
  code: string;
  summary?: string;
  flow?: string;
  caution?: string;
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

