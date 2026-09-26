import {
  RawImportQuestion,
  ValidationIssue,
  ImportValidationResult,
} from './types';
import { SUBJECT_LIST, Subject, QuestionType } from '@jungcheogi/shared';

const VALID_TYPES: Set<string> = new Set([
  'SHORT_ANSWER',
  'CODE_TRACE',
  'SQL',
  'ACTIVE_RECALL',
  'MULTIPLE_CHOICE',
]);

const VALID_SUBJECTS: Set<string> = new Set(SUBJECT_LIST);

export class QuestionValidator {
  public static validate(raw: RawImportQuestion): ImportValidationResult {
    const issues: ValidationIssue[] = [];

    // 1. 필수 문제 본문(지문) 확인
    if (!raw.questionText || !raw.questionText.trim()) {
      issues.push({
        field: 'questionText',
        message: '문제 지문(questionText)은 필수 항목입니다.',
        severity: 'ERROR',
      });
    }

    // 2. 정답 후보(Ground Truth) 확인
    if (
      raw.extractedAnswer === undefined ||
      raw.extractedAnswer === null ||
      (typeof raw.extractedAnswer === 'string' && !raw.extractedAnswer.trim()) ||
      (Array.isArray(raw.extractedAnswer) && raw.extractedAnswer.length === 0)
    ) {
      issues.push({
        field: 'groundTruthAnswer',
        message: '기준 정답(groundTruthAnswer)은 비어 있을 수 없습니다.',
        severity: 'ERROR',
      });
    }

    // 3. 표준 과목 유효성 확인
    if (!raw.subject || !raw.subject.trim()) {
      issues.push({
        field: 'subject',
        message: '과목(subject)이 지정되지 않았습니다.',
        severity: 'WARNING',
      });
    } else if (!VALID_SUBJECTS.has(raw.subject.trim())) {
      issues.push({
        field: 'subject',
        message: `과목 '${raw.subject}'은(는) 표준 5대 과목 정의에 일치하지 않습니다. (소프트웨어설계, 데이터베이스구축, 프로그래밍언어활용, 정보시스템구축관리, 신기술/보안)`,
        severity: 'WARNING',
      });
    }

    // 4. 문제 유형 유효성
    if (raw.type && !VALID_TYPES.has(raw.type.toUpperCase())) {
      issues.push({
        field: 'type',
        message: `유효하지 않은 문제 유형('${raw.type}')입니다. 기본값 SHORT_ANSWER로 조정됩니다.`,
        severity: 'WARNING',
      });
    }

    // 5. 코드 문제인 경우 코드 스니펫 유무 확인
    if (raw.type === 'CODE_TRACE' && (!raw.codeSnippet || !raw.codeSnippet.trim())) {
      issues.push({
        field: 'codeSnippet',
        message: '코드 추적(CODE_TRACE) 유형 문제이나 코드 본문이 없습니다.',
        severity: 'WARNING',
      });
    }

    // 6. 실제 기출(REAL_EXAM) 메타데이터 검증
    if (raw.sourceType === 'REAL_EXAM') {
      if (!raw.examYear || !raw.examRound) {
        issues.push({
          field: 'sourceType',
          message: '실제 기출(REAL_EXAM)로 등록하려면 출제 연도와 회차 정보가 필요합니다.',
          severity: 'WARNING',
        });
      }
    }

    // 7. AI 변형 문제의 부모 기출 ID 연동 확인
    if (raw.sourceType === 'AI_VARIATION' && !raw.parentQuestionId) {
      issues.push({
        field: 'parentQuestionId',
        message: 'AI 변형 문제(AI_VARIATION)는 부모 기출 ID(parentQuestionId)가 지정되어야 계보가 형성됩니다.',
        severity: 'WARNING',
      });
    }

    const hasError = issues.some((i) => i.severity === 'ERROR');

    return {
      isValid: !hasError,
      issues,
    };
  }
}
