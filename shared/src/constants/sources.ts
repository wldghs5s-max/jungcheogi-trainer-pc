import { QuestionSourceType } from '../types/question.js';

export const QUESTION_SOURCE_LABELS: Record<QuestionSourceType, string> = {
  REAL_EXAM: '실제 기출 (검증됨)',
  TEST_FIXTURE: '테스트용 Fixture (미검증)',
  TEXTBOOK: '공인 교재',
  USER_IMPORTED: '사용자 등록',
  AI_GENERATED: 'AI 생성',
  AI_VARIATION: '기출 변형',
};
