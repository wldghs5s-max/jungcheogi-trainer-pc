import {
  QuestionSourceType,
  Subject,
  QuestionType,
  Difficulty,
  CodeLanguage,
} from "./question.js";

export type ImportFormat = "MARKDOWN" | "JSON";

export type ImportBatchStatus =
  | "PENDING_REVIEW"
  | "PARTIALLY_APPROVED"
  | "APPROVED"
  | "COMMITTED"
  | "REJECTED";

export type StagedReviewStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "COMMITTED";

export type DuplicateStatus =
  | "NEW"
  | "DUPLICATE_WARNING"
  | "AI_VARIATION_CANDIDATE";

export type ValidationSeverity = "ERROR" | "WARNING";

export interface ValidationIssue {
  field: string;
  message: string;
  severity: ValidationSeverity;
}

export interface ImportBatch {
  id: string;
  sourceName: string;
  format: ImportFormat;
  sourceType: QuestionSourceType;
  totalCount: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  committedCount: number;
  status: ImportBatchStatus;
  createdAt: string;
  committedAt?: string;
}

export interface StagedQuestion {
  id: string;
  batchId: string;
  indexInBatch: number;
  sourceType: QuestionSourceType;
  examYear?: number;
  examRound?: number;
  questionNumber?: number;
  parentQuestionId?: string;
  conceptId?: string;
  subject: Subject;
  category: string;
  subCategory?: string;
  type: QuestionType;
  questionText: string;
  codeSnippet?: string;
  language?: CodeLanguage;
  options?: string[];
  groundTruthAnswer: string | string[];
  officialExplanation?: string;
  aiExplanation?: string;
  aiVariationNotes?: string;
  difficulty: Difficulty;
  keywords: string[];
  structuralFingerprint: string;
  duplicateStatus: DuplicateStatus;
  duplicateQuestionId?: string;
  duplicateSimilarity?: number;
  validationIssues: ValidationIssue[];
  reviewStatus: StagedReviewStatus;
  reviewerNotes?: string;
  reviewedAt?: string;
  committedQuestionId?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ParseImportRequest {
  format: ImportFormat;
  sourceName: string;
  sourceType?: QuestionSourceType;
  conceptId?: string;
  content: string;
}

export interface ParseImportResponse {
  batch: ImportBatch;
  stagedQuestions: StagedQuestion[];
}

export interface UpdateStagedQuestionRequest {
  sourceType?: QuestionSourceType;
  examYear?: number;
  examRound?: number;
  questionNumber?: number;
  parentQuestionId?: string;
  conceptId?: string;
  subject?: Subject;
  category?: string;
  subCategory?: string;
  type?: QuestionType;
  questionText?: string;
  codeSnippet?: string;
  language?: CodeLanguage;
  options?: string[];
  groundTruthAnswer?: string | string[];
  officialExplanation?: string;
  aiExplanation?: string;
  aiVariationNotes?: string;
  difficulty?: Difficulty;
  keywords?: string[];
  reviewerNotes?: string;
}

export interface SetStagedStatusRequest {
  reviewStatus: StagedReviewStatus;
  reviewerNotes?: string;
}

export interface CommitBatchResponse {
  batch: ImportBatch;
  committedCount: number;
  committedQuestionIds: string[];
}
