export type Subject =
  | '소프트웨어설계'
  | '데이터베이스구축'
  | '프로그래밍언어활용'
  | '정보시스템구축관리'
  | '신기술/보안';

export type QuestionType =
  | 'SHORT_ANSWER'
  | 'MULTIPLE_CHOICE'
  | 'CODE_TRACE'
  | 'SQL'
  | 'ACTIVE_RECALL';

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

export type CodeLanguage = 'C' | 'JAVA' | 'PYTHON' | 'SQL';

export type AnswerVerificationStatus =
  | 'OFFICIAL_CONFIRMED'
  | 'TEXTBOOK_CONFIRMED'
  | 'PROVISIONAL_DRAFT'
  | 'TEST_FIXTURE';

/**
 * 문제 출처 및 신뢰 수준 분류
 * - REAL_EXAM: 실제 공단 기출문제 (출처가 엄격히 검증된 문항)
 * - TEST_FIXTURE: 시스템 도메인 및 API 동작 검증을 위한 테스트용 Fixture (미검증 기출 후보 포함)
 * - TEXTBOOK: 공인 수험서/교재 수록 문제
 * - USER_IMPORTED: 사용자가 직접 파일(OCR/PDF/텍스트)로 가져와 검수한 문제
 * - AI_GENERATED: AI가 주제 시드로부터 신규 생성한 문제
 * - AI_VARIATION: 실제 기출(parentQuestionId)을 기반으로 파라미터/구조를 변형한 문제
 */
export type QuestionSourceType =
  | 'REAL_EXAM'
  | 'TEST_FIXTURE'
  | 'TEXTBOOK'
  | 'USER_IMPORTED'
  | 'AI_GENERATED'
  | 'AI_VARIATION';

export interface Question {
  id: string;
  sourceType: QuestionSourceType;

  // 실제 기출 메타데이터
  examYear?: number;
  examRound?: number;
  questionNumber?: number;

  // 기출 -> AI 변형 문제 관계 (Parent-Child)
  parentQuestionId?: string;

  subject: Subject;
  category: string;
  subCategory?: string;
  type: QuestionType;
  question: string;
  code?: string;
  language?: CodeLanguage;
  options?: string[];

  // Ground Truth (기준 정답 및 원본 해설)
  groundTruthAnswer: string | string[];
  answerVerificationStatus?: AnswerVerificationStatus;
  officialExplanation?: string;

  // AI 보조 해석 및 변형 노트 (Ground Truth와 명확히 분리)
  aiExplanation?: string;
  aiVariationNotes?: string;

  difficulty: Difficulty;
  keywords: string[];
  structuralFingerprint?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface QuestionFilter {
  subject?: Subject;
  type?: QuestionType;
  difficulty?: Difficulty;
  sourceType?: QuestionSourceType;
  parentQuestionId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface QuestionListResponse {
  items: Question[];
  total: number;
  limit: number;
  offset: number;
}

export interface QuestionDetailResponse {
  question: Question;
  variations: Question[];
  parentQuestion?: Question | null;
}
