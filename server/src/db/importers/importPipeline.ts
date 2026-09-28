import {
  ImportFormat,
  ImportBatch,
  StagedQuestion,
  QuestionSourceType,
  Subject,
  QuestionType,
  Difficulty,
  CodeLanguage,
  Question,
} from "@jungcheogi/shared";
import { parseJsonQuestions } from "./parsers/jsonParser";
import { parseMarkdownQuestions } from "./parsers/markdownParser";
import { QuestionValidator } from "./validator";
import {
  generateStructuralFingerprint,
  analyzeDuplicates,
} from "./fingerprint";
import { ImportBatchRepository } from "../repositories/importBatchRepository";
import { QuestionRepository } from "../repositories/questionRepository";
import { getDatabase } from "../database";

export interface ParseAndStageInput {
  format: ImportFormat;
  sourceName: string;
  sourceType?: QuestionSourceType;
  conceptId?: string;
  content: string;
}

export class QuestionImportPipeline {
  private batchRepo: ImportBatchRepository;
  private questionRepo: QuestionRepository;

  constructor() {
    const db = getDatabase();
    this.batchRepo = new ImportBatchRepository(db);
    this.questionRepo = new QuestionRepository(db);
  }

  /**
   * 1단계: Parse -> Validate -> Fingerprint/Duplicate -> Stage 저장
   */
  public async parseAndStage(
    input: ParseAndStageInput,
  ): Promise<{ batch: ImportBatch; stagedQuestions: StagedQuestion[] }> {
    const defaultSource: QuestionSourceType =
      input.sourceType || "USER_IMPORTED";

    // 1. 파싱 (Markdown 또는 JSON)
    const rawList =
      input.format === "MARKDOWN"
        ? parseMarkdownQuestions(input.content, defaultSource)
        : parseJsonQuestions(input.content, defaultSource);

    if (rawList.length === 0) {
      throw new Error("문항을 추출할 수 없습니다. 입력 형식을 확인해주세요.");
    }

    // 기존 라이브 DB 문항 전체 로드 (중복 판별용, 페이지 상한 없음)
    const existing = this.questionRepo.findAllMatching();
    const inBatchSeen: Question[] = [];

    const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();

    const stagedQuestions: StagedQuestion[] = [];

    for (let i = 0; i < rawList.length; i++) {
      const raw = rawList[i];

      // 2. 필드 유효성 검증
      const validation = QuestionValidator.validate(raw);

      // 3. 구조적 핑거프린트 생성
      const fingerprint = generateStructuralFingerprint(
        raw.questionText,
        raw.codeSnippet,
        raw.subject,
      );

      // 4. 중복 및 AI_VARIATION 계보 분석
      const dupAnalysis = analyzeDuplicates(
        {
          questionText: raw.questionText,
          codeSnippet: raw.codeSnippet,
          subject: raw.subject || "소프트웨어설계",
          fingerprint,
          parentQuestionId: raw.parentQuestionId,
          sourceType: raw.sourceType || defaultSource,
          examYear: raw.examYear,
          examRound: raw.examRound,
          questionNumber: raw.questionNumber,
        },
        [...existing, ...inBatchSeen],
      );

      const stagedId = `staged_${batchId}_${i + 1}`;

      stagedQuestions.push({
        id: stagedId,
        batchId,
        indexInBatch: i + 1,
        sourceType: raw.sourceType || defaultSource,
        examYear: raw.examYear,
        examRound: raw.examRound,
        questionNumber: raw.questionNumber,
        parentQuestionId:
          raw.parentQuestionId ||
          (dupAnalysis.status === "AI_VARIATION_CANDIDATE"
            ? dupAnalysis.duplicateQuestionId
            : undefined),
        conceptId: raw.conceptId || input.conceptId,
        subject: (raw.subject as Subject) || "소프트웨어설계",
        category: raw.category || "일반",
        subCategory: raw.subCategory,
        type:
          (raw.type as QuestionType) ||
          (raw.codeSnippet ? "CODE_TRACE" : "SHORT_ANSWER"),
        questionText: raw.questionText,
        codeSnippet: raw.codeSnippet,
        language: raw.codeLanguage as CodeLanguage,
        options: raw.options,
        groundTruthAnswer: raw.extractedAnswer,
        officialExplanation: raw.extractedExplanation,
        aiExplanation: raw.aiExplanation,
        aiVariationNotes: raw.aiVariationNotes,
        difficulty: (raw.difficulty as Difficulty) || "MEDIUM",
        keywords: raw.keywords || [],
        structuralFingerprint: fingerprint,
        duplicateStatus: dupAnalysis.status,
        duplicateQuestionId: dupAnalysis.duplicateQuestionId,
        duplicateSimilarity: dupAnalysis.similarity,
        validationIssues: validation.issues,
        reviewStatus: "PENDING",
        reviewerNotes: dupAnalysis.reason,
        createdAt: now,
      });

      inBatchSeen.push({
        id: stagedId,
        sourceType: raw.sourceType || defaultSource,
        examYear: raw.examYear,
        examRound: raw.examRound,
        questionNumber: raw.questionNumber,
        subject: (raw.subject as Subject) || "소프트웨어설계",
        category: raw.category || "일반",
        type:
          (raw.type as QuestionType) ||
          (raw.codeSnippet ? "CODE_TRACE" : "SHORT_ANSWER"),
        question: raw.questionText,
        code: raw.codeSnippet,
        groundTruthAnswer: raw.extractedAnswer || "",
        difficulty: (raw.difficulty as Difficulty) || "MEDIUM",
        keywords: raw.keywords || [],
        structuralFingerprint: fingerprint,
        createdAt: now,
      });
    }

    const batch: ImportBatch = {
      id: batchId,
      sourceName: input.sourceName,
      format: input.format,
      sourceType: defaultSource,
      totalCount: stagedQuestions.length,
      pendingCount: stagedQuestions.length,
      approvedCount: 0,
      rejectedCount: 0,
      committedCount: 0,
      status: "PENDING_REVIEW",
      createdAt: now,
    };

    // Staging 테이블에 영속 저장
    this.batchRepo.createBatch(batch, stagedQuestions);

    return {
      batch,
      stagedQuestions,
    };
  }

  /**
   * 2단계: 승인(APPROVED)된 문항들을 live DB로 원자적 Commit
   */
  public commit(batchId: string): {
    committedCount: number;
    committedQuestionIds: string[];
  } {
    return this.batchRepo.commitApprovedQuestions(batchId);
  }
}
