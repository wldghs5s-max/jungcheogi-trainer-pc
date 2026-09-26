import { Database } from 'better-sqlite3';
import {
  Question,
  GeneratedVariation,
  VariationOptions,
  VariationType,
  StagedQuestion,
  ImportBatch,
  CodeLanguage,
  normalizeVariationType,
} from '@jungcheogi/shared';
import { getDatabase } from '../db/database.js';
import { ImportBatchRepository } from '../db/repositories/importBatchRepository.js';
import { generateStructuralFingerprint } from '../db/importers/fingerprint.js';
import { VariationValidator } from './variationValidator.js';

export interface QuestionVariationGenerator {
  generateVariation(
    question: Question,
    options?: VariationOptions
  ): Promise<GeneratedVariation>;
}

export class MockQuestionVariationGenerator implements QuestionVariationGenerator {
  private db: Database;
  private importBatchRepo: ImportBatchRepository;

  constructor(customDb?: Database) {
    this.db = customDb || getDatabase();
    this.importBatchRepo = new ImportBatchRepository(this.db);
  }

  /**
   * 원본 문제를 기반으로 AI 변형 문제(GeneratedVariation)를 생성 (Mock)
   * - parentQuestionId 및 conceptId를 원본으로부터 엄격히 보존
   * - sourceType은 무조건 AI_VARIATION으로 설정
   * - 5대 canonical 변형 타입 및 기존 Phase 6 타입 완벽 호환
   */
  public async generateVariation(
    question: Question,
    options: VariationOptions = {}
  ): Promise<GeneratedVariation> {
    const rawType: VariationType = options.variationType || 'PARAMETER_VARIATION';
    const canonicalType = normalizeVariationType(rawType);
    const parentQuestionId = question.parentQuestionId || question.id;
    const nowIso = new Date().toISOString();

    let newPrompt = question.question;
    let newCode = question.code;
    let newAnswer = question.groundTruthAnswer;
    let aiExplanation = question.aiExplanation || 'AI가 생성한 변형 문제 해설입니다.';
    let aiVariationNotes = `원본 기출(${parentQuestionId}) 기반 ${canonicalType} 변형`;

    if (canonicalType === 'PARAMETER_VARIATION') {
      if (question.code) {
        // C/Java/Python 코드 내 숫자 파라미터 변형
        newCode = question.code
          .replace(/\b10\b/g, '20')
          .replace(/\b5\b/g, '7')
          .replace(/\b0\b/g, '1');
        newPrompt = `${question.question} (변수 값이 수정된 변형 문제입니다)`;
        newAnswer = Array.isArray(question.groundTruthAnswer)
          ? question.groundTruthAnswer.map((a) => `${a}_변형`)
          : `${question.groundTruthAnswer}_변형`;
      } else {
        newPrompt = `[파라미터 변형] ${question.question} (조건 값 변경 적용)`;
      }
      aiVariationNotes = `원본(${question.id})의 매개변수 및 초기값 조건을 조정한 파라미터 변형 문항`;
    } else if (canonicalType === 'CODE_VARIATION') {
      if (question.code) {
        newCode = question.code.replace(/<=/g, '<').replace(/\+\+/g, '+= 2');
        newPrompt = `${question.question} (루프 증감 조건이 수정된 코드 추적 변형)`;
      }
      aiVariationNotes = `원본(${question.id})의 제어문/연산자 구조를 수정한 코드 변형 문항`;
    } else if (canonicalType === 'SCENARIO_VARIATION') {
      newPrompt = `[실무 시나리오 변형] 다음 업무 시스템 개발 환경을 고려할 때, ${question.question}`;
      aiVariationNotes = `원본(${question.id})의 이론 개념을 실무 적용 상황 문맥으로 재구성한 변형 문항`;
    } else if (canonicalType === 'CONCEPT_VARIATION') {
      newPrompt = `[개념 재구성] ${question.question}의 반대되거나 상호 보완적인 특징을 설명하는 개념을 기술하시오.`;
      aiVariationNotes = `원본(${question.id})의 핵심 개념을 역방향 또는 보완적 관점에서 묻는 변형 문항`;
    } else if (canonicalType === 'DIFFICULTY_VARIATION') {
      newPrompt = `[난이도 심화 변형] 다음 복합 시스템 환경을 고려하여, ${question.question} (추가 예외 조건이 적용됩니다)`;
      aiVariationNotes = `원본(${question.id})의 기본 개념에 다단계 제약 조건을 추가하여 문제 해결 사고력을 검증하는 난이도 조절 변형 문항`;
    }

    const variation: GeneratedVariation = {
      sourceQuestionId: question.id,
      parentQuestionId,
      conceptId: question.conceptId,
      subject: question.subject,
      category: question.category,
      questionType: question.type,
      prompt: newPrompt,
      codeSnippet: newCode,
      language: question.language,
      options: question.options ? [...question.options] : undefined,
      groundTruthAnswer: newAnswer,
      officialExplanation: undefined, // AI 변형 문항에는 공식 기출 해설 미부여 (Ground Truth 오염 방지)
      aiExplanation,
      aiVariationNotes,
      variationType: rawType, // 요청받은 원래 variationType 타입 유지 (하위 호환성 보존)
      generationMetadata: {
        generator: 'MockQuestionVariationGenerator',
        model: 'mock-gemini-2.0-flash',
        generatedAt: nowIso,
        sourceFingerprint: question.structuralFingerprint,
      },
    };

    // 생성 직후 3단계 무결성 검증 (Schema, Domain, Ground Truth)
    variation.validationResult = VariationValidator.validate(variation, question);

    return variation;
  }

  /**
   * 생성된 AI 변형 문제를 Staging 검수 파이프라인(staged_questions)에만 안전하게 등록
   * ★ 절대 Live questions 테이블에 직접 INSERT하지 않음 (원칙 준수)
   */
  public async stageVariation(
    variation: GeneratedVariation,
    batchId?: string
  ): Promise<{ batchId: string; stagedQuestion: StagedQuestion }> {
    const nowIso = new Date().toISOString();

    // 검증 결과 확인 (없으면 즉시 검증 실행)
    const valResult =
      variation.validationResult || VariationValidator.validate(variation);

    // 1. 배치 ID 결정 또는 생성
    let targetBatchId = batchId;
    if (!targetBatchId) {
      const batches = this.importBatchRepo.findAllBatches();
      const aiBatch = batches.find(
        (b) => b.sourceType === 'AI_VARIATION' && b.status === 'PENDING_REVIEW'
      );
      if (aiBatch) {
        targetBatchId = aiBatch.id;
      } else {
        const newBatchId = `batch_ai_var_${Date.now()}`;
        const newBatch: ImportBatch = {
          id: newBatchId,
          sourceName: 'AI 변형 문제 생성 파이프라인 (검수 대기)',
          format: 'JSON',
          sourceType: 'AI_VARIATION',
          totalCount: 0,
          pendingCount: 0,
          approvedCount: 0,
          rejectedCount: 0,
          committedCount: 0,
          status: 'PENDING_REVIEW',
          createdAt: nowIso,
        };
        this.importBatchRepo.createBatch(newBatch, []);
        targetBatchId = newBatchId;
      }
    }

    // 2. Structural Fingerprint 산출
    const fingerprint = generateStructuralFingerprint(
      variation.prompt,
      variation.codeSnippet,
      variation.subject
    );

    // 3. StagedQuestion 엔티티 구성 (상태: PENDING)
    const stagedId = `stg_var_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const stagedQuestion: StagedQuestion = {
      id: stagedId,
      batchId: targetBatchId,
      indexInBatch: 0,
      sourceType: 'AI_VARIATION',
      parentQuestionId: variation.parentQuestionId,
      conceptId: variation.conceptId,
      subject: variation.subject,
      category: variation.category,
      type: variation.questionType,
      questionText: variation.prompt,
      codeSnippet: variation.codeSnippet,
      language: (variation.language as CodeLanguage) ?? undefined,
      options: variation.options,
      groundTruthAnswer: variation.groundTruthAnswer,
      officialExplanation: undefined, // AI 변형 문항은 공식 해설 컬럼 절대 비워둠
      aiExplanation: variation.aiExplanation,
      aiVariationNotes: variation.aiVariationNotes,
      difficulty: 'MEDIUM',
      keywords: [],
      structuralFingerprint: fingerprint,
      duplicateStatus: 'NEW',
      validationIssues: valResult.issues,
      reviewStatus: 'PENDING', // 반드시 사람이 검수하기 전에는 PENDING
      createdAt: nowIso,
    };

    // 4. Staging 테이블에 저장 (단일 문항 삽입)
    const stmt = this.db.prepare(`
      INSERT INTO staged_questions (
        id, batch_id, index_in_batch, source_type, parent_question_id,
        concept_id, subject, category, type, question_text,
        code_snippet, language, options_json, ground_truth_answer,
        ai_explanation, ai_variation_notes, difficulty, keywords_json,
        structural_fingerprint, duplicate_status, validation_issues_json,
        review_status, created_at
      ) VALUES (
        @id, @batch_id, @index_in_batch, @source_type, @parent_question_id,
        @concept_id, @subject, @category, @type, @question_text,
        @code_snippet, @language, @options_json, @ground_truth_answer,
        @ai_explanation, @ai_variation_notes, @difficulty, @keywords_json,
        @structural_fingerprint, @duplicate_status, @validation_issues_json,
        @review_status, @created_at
      )
    `);

    stmt.run({
      id: stagedQuestion.id,
      batch_id: stagedQuestion.batchId,
      index_in_batch: stagedQuestion.indexInBatch,
      source_type: stagedQuestion.sourceType,
      parent_question_id: stagedQuestion.parentQuestionId ?? null,
      concept_id: stagedQuestion.conceptId ?? null,
      subject: stagedQuestion.subject,
      category: stagedQuestion.category,
      type: stagedQuestion.type,
      question_text: stagedQuestion.questionText,
      code_snippet: stagedQuestion.codeSnippet ?? null,
      language: stagedQuestion.language ?? null,
      options_json: stagedQuestion.options ? JSON.stringify(stagedQuestion.options) : null,
      ground_truth_answer: JSON.stringify(stagedQuestion.groundTruthAnswer),
      ai_explanation: stagedQuestion.aiExplanation ?? null,
      ai_variation_notes: stagedQuestion.aiVariationNotes ?? null,
      difficulty: stagedQuestion.difficulty,
      keywords_json: JSON.stringify(stagedQuestion.keywords || []),
      structural_fingerprint: stagedQuestion.structuralFingerprint,
      duplicate_status: stagedQuestion.duplicateStatus,
      validation_issues_json: JSON.stringify(stagedQuestion.validationIssues || []),
      review_status: stagedQuestion.reviewStatus,
      created_at: stagedQuestion.createdAt,
    });

    // 배치 카운트 동기화
    this.importBatchRepo.syncBatchCounts(targetBatchId);

    return {
      batchId: targetBatchId,
      stagedQuestion,
    };
  }
}
