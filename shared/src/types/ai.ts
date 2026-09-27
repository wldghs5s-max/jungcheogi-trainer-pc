import { Question } from "./question.js";
import { VariationType, GeneratedVariation } from "./recommendation.js";

export interface AITutoringExplanationRequest {
  questionId: string;
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
  questionId: string;
  deepAnalysis?: boolean;
}

export interface AIProgressiveHintsResponse {
  hints: [string, string, string]; // [Level 1, Level 2, Level 3]
  source: "GEMINI" | "MOCK";
  modelUsed?: string;
  promotionReason?: string;
}

export interface AICodeLineRequest {
  questionId: string;
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
  message?: string;
}

export interface LearningDomainsResponse {
  languages: string[];
  subjects: string[];
  categories: string[];
}

