import { Question, QuestionType, Subject } from './question.js';
import { ReviewItemState } from './review.js';

export type RecommendationReasonCode =
  | 'DUE_REVIEW'
  | 'WEAK_CONCEPT'
  | 'RECENT_FAILURE'
  | 'RECENT_UNKNOWN'
  | 'SOLUTION_REVEALED'
  | 'HINT_DEPENDENCY'
  | 'LONG_INACTIVE'
  | 'NEW_UNSTUDIED'
  | 'CONCEPT_DRILL';

export interface RecommendationScoreBreakdown {
  totalScore: number;
  dueScore: number;
  weaknessScore: number;
  recencyScore: number;
  failureScore: number;
  unknownScore: number;
  solutionRevealedScore: number;
  hintDependencyScore: number;
  longInactiveScore: number;
  noveltyScore: number;
  diversityPenalty: number;
  reasonCodes: RecommendationReasonCode[];
}

export interface RecommendedQuestionItem {
  question: Question;
  score: RecommendationScoreBreakdown;
  conceptTitle?: string;
  reviewState?: ReviewItemState;
  boxLevel?: number;
}

export interface DailyLearningMixConfig {
  due: number; // 기본값 0.5 (50%)
  weakConcept: number; // 기본값 0.3 (30%)
  newQuestion: number; // 기본값 0.2 (20%)
}

export const DEFAULT_DAILY_MIX: DailyLearningMixConfig = {
  due: 0.5,
  weakConcept: 0.3,
  newQuestion: 0.2,
};

export interface DailyLearningQueueSummary {
  dueCount: number;
  weakConceptCount: number;
  recentFailedCount: number;
  newQuestionsCount: number;
  totalRecommendedCount: number;
  isColdStart: boolean;
}

export interface DrillSessionRequest {
  conceptId: string;
  count?: number;
  title?: string;
}

export interface DailySessionRequest {
  count?: number;
  subject?: string;
  excludeTestFixtures?: boolean;
  mixConfig?: Partial<DailyLearningMixConfig>;
}

export type VariationType =
  // 기존 Phase 6 타입 (하위 호환성 100% 유지)
  | 'PARAMETER_CHANGE'
  | 'CODE_CHANGE'
  | 'CONTEXT_CHANGE'
  | 'CONCEPT_REFRAME'
  // Phase 7 Canonical 타입
  | 'PARAMETER_VARIATION'
  | 'CONCEPT_VARIATION'
  | 'CODE_VARIATION'
  | 'SCENARIO_VARIATION'
  | 'DIFFICULTY_VARIATION';

export function normalizeVariationType(type?: VariationType): VariationType {
  switch (type) {
    case 'PARAMETER_CHANGE':
    case 'PARAMETER_VARIATION':
      return 'PARAMETER_VARIATION';
    case 'CODE_CHANGE':
    case 'CODE_VARIATION':
      return 'CODE_VARIATION';
    case 'CONTEXT_CHANGE':
    case 'SCENARIO_VARIATION':
      return 'SCENARIO_VARIATION';
    case 'CONCEPT_REFRAME':
    case 'CONCEPT_VARIATION':
      return 'CONCEPT_VARIATION';
    case 'DIFFICULTY_VARIATION':
      return 'DIFFICULTY_VARIATION';
    default:
      return 'PARAMETER_VARIATION';
  }
}

export interface VariationValidationIssue {
  field: string;
  message: string;
  severity: 'ERROR' | 'WARNING';
}

export interface VariationValidationResult {
  isValid: boolean;
  issues: VariationValidationIssue[];
  checks: {
    schemaValid: boolean;
    domainValid: boolean;
    groundTruthValid: boolean;
    codeSyntaxValid: boolean;
  };
}

export interface GenerateVariationRequest {
  questionId: string;
  variationType?: VariationType;
  autoStage?: boolean;
}

export interface ValidateVariationRequest {
  variation: GeneratedVariation;
}

export interface GeneratedVariation {
  sourceQuestionId: string;
  parentQuestionId: string;
  conceptId?: string;
  subject: Subject;
  category: string;
  questionType: QuestionType;
  prompt: string;
  codeSnippet?: string;
  language?: string;
  options?: string[];
  groundTruthAnswer: string | string[];
  officialExplanation?: string;
  aiExplanation?: string;
  aiVariationNotes?: string;
  variationType: VariationType;
  validationResult?: VariationValidationResult;
  generationMetadata: {
    generator: string;
    model?: string;
    generatedAt: string;
    sourceFingerprint?: string;
  };
}

export interface VariationOptions {
  variationType?: VariationType;
  focusArea?: string;
}

