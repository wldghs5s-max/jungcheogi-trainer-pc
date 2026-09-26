import {
  Question,
  QuestionSourceType,
  Subject,
  QuestionType,
  Difficulty,
  CodeLanguage,
  SUBJECT_LIST,
} from '@jungcheogi/shared';
import {
  IQuestionImporter,
  ImportSourceType,
  RawImportQuestion,
  ImportValidationResult,
  ValidationIssue,
  ImportSummary,
} from './types';
import { QuestionRepository } from '../repositories/questionRepository';

export class BaseQuestionValidator {
  public static validate(raw: RawImportQuestion): ImportValidationResult {
    const issues: ValidationIssue[] = [];

    // 1. 필수 문제 지문 확인
    if (!raw.questionText || !raw.questionText.trim()) {
      issues.push({
        field: 'questionText',
        message: '문제 본문(questionText)은 필수 입력 항목입니다.',
        severity: 'ERROR',
      });
    }

    // 2. Ground Truth 정답 확인
    if (
      raw.extractedAnswer === undefined ||
      raw.extractedAnswer === null ||
      (typeof raw.extractedAnswer === 'string' && !raw.extractedAnswer.trim()) ||
      (Array.isArray(raw.extractedAnswer) && raw.extractedAnswer.length === 0)
    ) {
      issues.push({
        field: 'extractedAnswer',
        message: '공식/검증 정답(extractedAnswer)은 비어 있을 수 없습니다.',
        severity: 'ERROR',
      });
    }

    // 3. 과목 유효성 확인
    if (raw.subject) {
      const validSubjects = new Set(SUBJECT_LIST);
      if (!validSubjects.has(raw.subject as Subject)) {
        issues.push({
          field: 'subject',
          message: `지정된 과목('${raw.subject}')이 표준 5대 과목 정의에 부합하지 않습니다.`,
          severity: 'WARNING',
        });
      }
    } else {
      issues.push({
        field: 'subject',
        message: '과목(subject)이 지정되지 않았습니다.',
        severity: 'WARNING',
      });
    }

    // 4. 코드 문제인 경우 코드 본문 확인
    if (raw.type === 'CODE_TRACE' && (!raw.codeSnippet || !raw.codeSnippet.trim())) {
      issues.push({
        field: 'codeSnippet',
        message: '코드 추적(CODE_TRACE) 유형 문제이나 코드 스니펫이 누락되었습니다.',
        severity: 'WARNING',
      });
    }

    // 5. AI 변형 문제인 경우 부모 기출 ID 확인
    if (raw.sourceType === 'AI_VARIATION' && !raw.parentQuestionId) {
      issues.push({
        field: 'parentQuestionId',
        message: 'AI 변형 문제(AI_VARIATION)는 원본 문제 ID(parentQuestionId)를 참조해야 합니다.',
        severity: 'ERROR',
      });
    }

    const hasError = issues.some((i) => i.severity === 'ERROR');
    return {
      isValid: !hasError,
      issues,
    };
  }

  public static transformToQuestion(raw: RawImportQuestion, generatedId?: string): Question {
    const id = raw.rawId || generatedId || `q_imported_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    return {
      id,
      sourceType: raw.sourceType || 'USER_IMPORTED',
      examYear: raw.examYear,
      examRound: raw.examRound,
      questionNumber: raw.questionNumber,
      parentQuestionId: raw.parentQuestionId,
      subject: (raw.subject as Subject) || '소프트웨어설계',
      category: raw.category || '일반',
      subCategory: raw.subCategory,
      type: (raw.type as QuestionType) || 'SHORT_ANSWER',
      question: raw.questionText,
      code: raw.codeSnippet,
      language: raw.codeLanguage as CodeLanguage,
      options: raw.options,
      groundTruthAnswer: raw.extractedAnswer,
      officialExplanation: raw.extractedExplanation,
      difficulty: (raw.difficulty as Difficulty) || 'MEDIUM',
      keywords: raw.keywords || [],
      createdAt: new Date().toISOString(),
    };
  }
}
