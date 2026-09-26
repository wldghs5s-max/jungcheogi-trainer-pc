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
  | 'PARAMETER_CHANGE'
  | 'CODE_CHANGE'
  | 'CONTEXT_CHANGE'
  | 'CONCEPT_REFRAME';

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
