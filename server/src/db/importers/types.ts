import {
  Question,
  QuestionSourceType,
  Subject,
  QuestionType,
  Difficulty,
  CodeLanguage,
} from "@jungcheogi/shared";

export type ImportSourceType =
  | "PDF_DOCUMENT"
  | "OCR_IMAGE"
  | "MARKDOWN_TXT"
  | "JSON_DATA";

export type ImportStage = "PARSED" | "DRAFT" | "VERIFIED" | "COMMITTED";

/**
 * 외부 소스(PDF, OCR, 마크다운 등)로부터 추출된 원시 문제 데이터 모델
 */
export interface RawImportQuestion {
  rawId?: string;
  sourceType: QuestionSourceType;
  sourceFile?: string;
  pageNumber?: number;
  confidenceScore?: number; // OCR/추출 신뢰도 (0.0 ~ 1.0)

  examYear?: number;
  examRound?: number;
  questionNumber?: number;
  parentQuestionId?: string;
  conceptId?: string;

  subject?: string;
  category?: string;
  subCategory?: string;
  type?: string;

  questionText: string;
  codeSnippet?: string;
  codeLanguage?: string;
  options?: string[];

  // 추출된 원본 정답 및 해설 후보
  extractedAnswer: string | string[];
  extractedExplanation?: string;
  aiExplanation?: string;
  aiVariationNotes?: string;

  difficulty?: string;
  keywords?: string[];

  // 검수자가 직접 확인했는지 여부
  isHumanVerified?: boolean;
  verifierNotes?: string;
}

export interface ValidationIssue {
  field: string;
  message: string;
  severity: "ERROR" | "WARNING";
}

export interface ImportValidationResult {
  isValid: boolean;
  issues: ValidationIssue[];
}

export interface ImportSummary {
  totalExtracted: number;
  validCount: number;
  invalidCount: number;
  committedCount: number;
  skippedCount: number;
  issues: Array<{ index: number; issues: ValidationIssue[] }>;
}

/**
 * 향후 OCR / PDF / Markdown 파이프라인 확장을 위한 추상 인터페이스
 */
export interface IQuestionImporter<TInput = unknown> {
  sourceType: ImportSourceType;
  parse(input: TInput): Promise<RawImportQuestion[]>;
  validate(raw: RawImportQuestion): ImportValidationResult;
  transformToQuestion(raw: RawImportQuestion): Question;
  commit(questions: Question[]): Promise<{ importedCount: number }>;
}
