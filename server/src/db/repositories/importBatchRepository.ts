import { Database } from "better-sqlite3";
import {
  ImportBatch,
  StagedQuestion,
  StagedReviewStatus,
  ImportBatchStatus,
  Question,
  QuestionSourceType,
  Subject,
  QuestionType,
  Difficulty,
  CodeLanguage,
  stripSubItemPrefix,
} from "@jungcheogi/shared";
import { getDatabase } from "../database";
import { QuestionRepository } from "./questionRepository";

interface StagedRow {
  id: string;
  question_code: string | null;
  batch_id: string;
  index_in_batch: number;
  source_type: string;
  exam_year: number | null;
  exam_round: number | null;
  question_number: number | null;
  parent_question_id: string | null;
  concept_id: string | null;
  subject: string;
  category: string;
  sub_category: string | null;
  type: string;
  question_text: string;
  code_snippet: string | null;
  language: string | null;
  options_json: string | null;
  ground_truth_answer: string;
  official_explanation: string | null;
  ai_explanation: string | null;
  ai_variation_notes: string | null;
  difficulty: string;
  keywords_json: string;
  structural_fingerprint: string;
  duplicate_status: string;
  duplicate_question_id: string | null;
  duplicate_similarity: number;
  validation_issues_json: string;
  review_status: string;
  reviewer_notes: string | null;
  reviewed_at: string | null;
  committed_question_id: string | null;
  created_at: string;
  updated_at: string | null;
}

interface BatchRow {
  id: string;
  source_name: string;
  format: string;
  source_type: string;
  total_count: number;
  pending_count: number;
  approved_count: number;
  rejected_count: number;
  committed_count: number;
  status: string;
  created_at: string;
  committed_at: string | null;
}

function mapRowToStaged(row: StagedRow): StagedQuestion {
  let groundTruthAnswer: string | string[];
  try {
    const parsed = JSON.parse(row.ground_truth_answer);
    if (Array.isArray(parsed)) {
      groundTruthAnswer = parsed.map(String);
    } else {
      groundTruthAnswer = String(parsed);
    }
  } catch {
    groundTruthAnswer = row.ground_truth_answer;
  }

  if (
    typeof groundTruthAnswer === "string" &&
    !groundTruthAnswer.includes("->") &&
    /[①-⑳]/.test(groundTruthAnswer)
  ) {
    const parts = groundTruthAnswer
      .split(/[,;\n]+/)
      .map((p) => stripSubItemPrefix(p))
      .filter(Boolean);
    if (parts.length > 1) {
      groundTruthAnswer = parts;
    }
  }

  return {
    id: row.id,
    questionCode: row.question_code ?? undefined,
    batchId: row.batch_id,
    indexInBatch: row.index_in_batch,
    sourceType: row.source_type as QuestionSourceType,
    examYear: row.exam_year ?? undefined,
    examRound: row.exam_round ?? undefined,
    questionNumber: row.question_number ?? undefined,
    parentQuestionId: row.parent_question_id ?? undefined,
    conceptId: row.concept_id ?? undefined,
    subject: row.subject as Subject,
    category: row.category,
    subCategory: row.sub_category ?? undefined,
    type: row.type as QuestionType,
    questionText: row.question_text,
    codeSnippet: row.code_snippet ?? undefined,
    language: (row.language as CodeLanguage) ?? undefined,
    options: row.options_json ? JSON.parse(row.options_json) : undefined,
    groundTruthAnswer,
    officialExplanation: row.official_explanation ?? undefined,
    aiExplanation: row.ai_explanation ?? undefined,
    aiVariationNotes: row.ai_variation_notes ?? undefined,
    difficulty: row.difficulty as Difficulty,
    keywords: row.keywords_json ? JSON.parse(row.keywords_json) : [],
    structuralFingerprint: row.structural_fingerprint,
    duplicateStatus: row.duplicate_status as any,
    duplicateQuestionId: row.duplicate_question_id ?? undefined,
    duplicateSimilarity: row.duplicate_similarity,
    validationIssues: row.validation_issues_json
      ? JSON.parse(row.validation_issues_json)
      : [],
    reviewStatus: row.review_status as StagedReviewStatus,
    reviewerNotes: row.reviewer_notes ?? undefined,
    reviewedAt: row.reviewed_at ?? undefined,
    committedQuestionId: row.committed_question_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
  };
}

function mapRowToBatch(row: BatchRow): ImportBatch {
  return {
    id: row.id,
    sourceName: row.source_name,
    format: row.format as any,
    sourceType: row.source_type as QuestionSourceType,
    totalCount: row.total_count,
    pendingCount: row.pending_count,
    approvedCount: row.approved_count,
    rejectedCount: row.rejected_count,
    committedCount: row.committed_count,
    status: row.status as ImportBatchStatus,
    createdAt: row.created_at,
    committedAt: row.committed_at ?? undefined,
  };
}

export class ImportBatchRepository {
  private db: Database;
  private questionRepo: QuestionRepository;

  constructor(customDb?: Database) {
    this.db = customDb || getDatabase();
    this.questionRepo = new QuestionRepository(this.db);
  }

  public createBatch(batch: ImportBatch, stagedList: StagedQuestion[]): void {
    const insertBatch = this.db.prepare(`
      INSERT INTO import_batches (
        id, source_name, format, source_type, total_count, pending_count,
        approved_count, rejected_count, committed_count, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertStaged = this.db.prepare(`
      INSERT INTO staged_questions (
        id, question_code, batch_id, index_in_batch, source_type, exam_year, exam_round,
        question_number, parent_question_id, concept_id, subject, category, sub_category,
        type, question_text, code_snippet, language, options_json,
        ground_truth_answer, official_explanation, ai_explanation,
        ai_variation_notes, difficulty, keywords_json, structural_fingerprint,
        duplicate_status, duplicate_question_id, duplicate_similarity,
        validation_issues_json, review_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const tx = this.db.transaction(() => {
      insertBatch.run(
        batch.id,
        batch.sourceName,
        batch.format,
        batch.sourceType,
        batch.totalCount,
        batch.pendingCount,
        batch.approvedCount,
        batch.rejectedCount,
        batch.committedCount,
        batch.status,
        batch.createdAt,
      );

      for (const s of stagedList) {
        const questionCode =
          s.questionCode ||
          this.questionRepo.generateNextCode(
            s.sourceType,
            s.examYear,
            s.examRound,
            s.questionNumber,
          );

        insertStaged.run(
          s.id,
          questionCode,
          s.batchId,
          s.indexInBatch,
          s.sourceType,
          s.examYear ?? null,
          s.examRound ?? null,
          s.questionNumber ?? null,
          s.parentQuestionId ?? null,
          s.conceptId ?? null,
          s.subject,
          s.category,
          s.subCategory ?? null,
          s.type,
          s.questionText,
          s.codeSnippet ?? null,
          s.language ?? null,
          s.options ? JSON.stringify(s.options) : null,
          JSON.stringify(s.groundTruthAnswer),
          s.officialExplanation ?? null,
          s.aiExplanation ?? null,
          s.aiVariationNotes ?? null,
          s.difficulty,
          JSON.stringify(s.keywords || []),
          s.structuralFingerprint,
          s.duplicateStatus,
          s.duplicateQuestionId ?? null,
          s.duplicateSimilarity ?? 0,
          JSON.stringify(s.validationIssues || []),
          s.reviewStatus,
          s.createdAt,
        );
      }
    });

    tx();
  }

  public findBatchById(
    batchId: string,
  ): { batch: ImportBatch; stagedQuestions: StagedQuestion[] } | null {
    const bRow = this.db
      .prepare("SELECT * FROM import_batches WHERE id = ?")
      .get(batchId) as BatchRow | undefined;
    if (!bRow) return null;

    const qRows = this.db
      .prepare(
        "SELECT * FROM staged_questions WHERE batch_id = ? ORDER BY index_in_batch ASC",
      )
      .all(batchId) as StagedRow[];

    return {
      batch: mapRowToBatch(bRow),
      stagedQuestions: qRows.map(mapRowToStaged),
    };
  }

  public findAllBatches(): ImportBatch[] {
    const rows = this.db
      .prepare("SELECT * FROM import_batches ORDER BY created_at DESC")
      .all() as BatchRow[];
    return rows.map(mapRowToBatch);
  }

  public findStagedById(stagedId: string): StagedQuestion | null {
    const row = this.db
      .prepare("SELECT * FROM staged_questions WHERE id = ?")
      .get(stagedId) as StagedRow | undefined;
    return row ? mapRowToStaged(row) : null;
  }

  public findStagedQuestions(filter?: {
    batchId?: string;
    sourceType?: string;
    reviewStatus?: StagedReviewStatus;
    limit?: number;
    offset?: number;
  }): { items: StagedQuestion[]; total: number } {
    const conditions: string[] = [];
    const params: any[] = [];

    if (filter?.batchId) {
      conditions.push("batch_id = ?");
      params.push(filter.batchId);
    }
    if (filter?.sourceType) {
      conditions.push("source_type = ?");
      params.push(filter.sourceType);
    }
    if (filter?.reviewStatus) {
      conditions.push("review_status = ?");
      params.push(filter.reviewStatus);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const countRow = this.db
      .prepare(`SELECT COUNT(*) as total FROM staged_questions ${whereClause}`)
      .get(...params) as { total: number };

    const limit = filter?.limit ?? 100;
    const offset = filter?.offset ?? 0;

    const rows = this.db
      .prepare(
        `SELECT * FROM staged_questions ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as StagedRow[];

    return {
      items: rows.map(mapRowToStaged),
      total: countRow.total,
    };
  }

  public commitSingleApprovedQuestion(stagedId: string): Question {
    const staged = this.findStagedById(stagedId);
    if (!staged) {
      throw new Error(`Staged 문항 ID '${stagedId}'를 찾을 수 없습니다.`);
    }

    if (staged.reviewStatus === "COMMITTED" && staged.committedQuestionId) {
      const existing = this.questionRepo.findById(staged.committedQuestionId);
      if (existing) return existing;
    }

    const hasError = (staged.validationIssues || []).some(
      (issue) => issue.severity === "ERROR",
    );
    if (hasError) {
      throw new Error("검증 오류(ERROR)가 있는 문항은 승인/커밋할 수 없습니다.");
    }

    const now = new Date().toISOString();
    const liveQuestionId =
      staged.sourceType === "AI_GENERATED"
        ? `q_ai_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
        : staged.examYear && staged.examRound && staged.questionNumber
        ? `q_${staged.examYear}_0${staged.examRound}_${String(staged.questionNumber).padStart(2, "0")}`
        : `q_imp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const questionCode =
      staged.questionCode ||
      this.questionRepo.generateNextCode(
        staged.sourceType,
        staged.examYear,
        staged.examRound,
        staged.questionNumber,
      );

    const question: Question = {
      id: liveQuestionId,
      questionCode,
      sourceType: staged.sourceType,
      examYear: staged.examYear,
      examRound: staged.examRound,
      questionNumber: staged.questionNumber,
      parentQuestionId: staged.parentQuestionId,
      conceptId: staged.conceptId,
      subject: staged.subject,
      category: staged.category,
      subCategory: staged.subCategory,
      type: staged.type,
      question: staged.questionText,
      code: staged.codeSnippet,
      language: staged.language,
      options: staged.options,
      groundTruthAnswer: staged.groundTruthAnswer,
      officialExplanation: staged.officialExplanation,
      aiExplanation: staged.aiExplanation,
      aiVariationNotes: staged.aiVariationNotes,
      difficulty: staged.difficulty,
      keywords: staged.keywords,
      structuralFingerprint: staged.structuralFingerprint,
      createdAt: now,
    };

    const tx = this.db.transaction(() => {
      this.questionRepo.create(question);
      this.db
        .prepare(
          `UPDATE staged_questions SET
            review_status = 'COMMITTED', committed_question_id = ?,
            reviewed_at = ?, updated_at = ?
          WHERE id = ?`,
        )
        .run(liveQuestionId, now, now, stagedId);

      this.syncBatchCounts(staged.batchId);
    });

    tx();
    return question;
  }

  public updateStagedQuestion(
    stagedId: string,
    updates: Partial<StagedQuestion>,
  ): StagedQuestion | null {
    const current = this.findStagedById(stagedId);
    if (!current) return null;

    const merged = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.db
      .prepare(
        `UPDATE staged_questions SET
          question_code = ?,
          source_type = ?, exam_year = ?, exam_round = ?, question_number = ?,
          parent_question_id = ?, concept_id = ?, subject = ?, category = ?, sub_category = ?,
          type = ?, question_text = ?, code_snippet = ?, language = ?,
          options_json = ?, ground_truth_answer = ?, official_explanation = ?,
          ai_explanation = ?, ai_variation_notes = ?, difficulty = ?,
          keywords_json = ?, validation_issues_json = ?, reviewer_notes = ?, updated_at = ?
        WHERE id = ?`,
      )
      .run(
        merged.questionCode ?? null,
        merged.sourceType,
        merged.examYear ?? null,
        merged.examRound ?? null,
        merged.questionNumber ?? null,
        merged.parentQuestionId ?? null,
        merged.conceptId ?? null,
        merged.subject,
        merged.category,
        merged.subCategory ?? null,
        merged.type,
        merged.questionText,
        merged.codeSnippet ?? null,
        merged.language ?? null,
        merged.options ? JSON.stringify(merged.options) : null,
        JSON.stringify(merged.groundTruthAnswer),
        merged.officialExplanation ?? null,
        merged.aiExplanation ?? null,
        merged.aiVariationNotes ?? null,
        merged.difficulty,
        JSON.stringify(merged.keywords),
        JSON.stringify(merged.validationIssues || []),
        merged.reviewerNotes ?? null,
        merged.updatedAt,
        stagedId,
      );

    return this.findStagedById(stagedId);
  }

  public setStagedReviewStatus(
    stagedId: string,
    reviewStatus: StagedReviewStatus,
    reviewerNotes?: string,
  ): StagedQuestion | null {
    const staged = this.findStagedById(stagedId);
    if (!staged) return null;

    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE staged_questions SET
          review_status = ?, reviewer_notes = COALESCE(?, reviewer_notes),
          reviewed_at = ?, updated_at = ?
        WHERE id = ?`,
      )
      .run(reviewStatus, reviewerNotes ?? null, now, now, stagedId);

    // Refresh batch counts
    this.syncBatchCounts(staged.batchId);

    return this.findStagedById(stagedId);
  }

  public approveQuestionsWithoutErrors(batchId: string): number {
    const batch = this.findBatchById(batchId);
    if (!batch) return 0;

    let approved = 0;
    for (const staged of batch.stagedQuestions) {
      if (staged.reviewStatus === "COMMITTED") continue;
      const hasError = (staged.validationIssues || []).some(
        (issue) => issue.severity === "ERROR",
      );
      if (hasError) continue;
      this.setStagedReviewStatus(staged.id, "APPROVED");
      approved += 1;
    }
    return approved;
  }

  public bulkSetReviewStatus(
    batchId: string,
    targetStatus: StagedReviewStatus,
  ): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE staged_questions SET
          review_status = ?, reviewed_at = ?, updated_at = ?
        WHERE batch_id = ? AND review_status != 'COMMITTED'`,
      )
      .run(targetStatus, now, now, batchId);

    this.syncBatchCounts(batchId);
  }

  public syncBatchCounts(batchId: string): void {
    const counts = this.db
      .prepare(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN review_status = 'PENDING' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN review_status = 'APPROVED' THEN 1 ELSE 0 END) as approved,
          SUM(CASE WHEN review_status = 'REJECTED' THEN 1 ELSE 0 END) as rejected,
          SUM(CASE WHEN review_status = 'COMMITTED' THEN 1 ELSE 0 END) as committed
        FROM staged_questions WHERE batch_id = ?`,
      )
      .get(batchId) as {
      total: number;
      pending: number;
      approved: number;
      rejected: number;
      committed: number;
    };

    let status: ImportBatchStatus = "PENDING_REVIEW";
    if (counts.committed > 0 && counts.pending === 0 && counts.approved === 0) {
      status = "COMMITTED";
    } else if (counts.committed === counts.total && counts.total > 0) {
      status = "COMMITTED";
    } else if (counts.approved === counts.total && counts.total > 0) {
      status = "APPROVED";
    } else if (counts.approved > 0 || counts.committed > 0) {
      status = "PARTIALLY_APPROVED";
    } else if (counts.rejected === counts.total && counts.total > 0) {
      status = "REJECTED";
    }

    this.db
      .prepare(
        `UPDATE import_batches SET
          pending_count = ?, approved_count = ?, rejected_count = ?,
          committed_count = ?, status = ?
        WHERE id = ?`,
      )
      .run(
        counts.pending,
        counts.approved,
        counts.rejected,
        counts.committed,
        status,
        batchId,
      );
  }

  /**
   * APPROVED 상태의 문항들만 실 서비스 questions 테이블로 원자적 Commit
   */
  public commitApprovedQuestions(batchId: string): {
    committedCount: number;
    committedQuestionIds: string[];
  } {
    const batchInfo = this.findBatchById(batchId);
    if (!batchInfo) {
      throw new Error(`배치 ID '${batchId}'를 찾을 수 없습니다.`);
    }

    const approvedList = batchInfo.stagedQuestions.filter(
      (s) =>
        s.reviewStatus === "APPROVED" &&
        !(s.validationIssues || []).some((issue) => issue.severity === "ERROR"),
    );

    if (approvedList.length === 0) {
      throw new Error(
        "승인(APPROVED)된 문항이 없습니다. 검수 후 승인된 문항만 커밋할 수 있습니다.",
      );
    }

    const committedQuestionIds: string[] = [];
    const now = new Date().toISOString();

    const tx = this.db.transaction(() => {
      for (const staged of approvedList) {
        // 실제 Question 엔티티 생성
        const liveQuestionId =
          staged.examYear && staged.examRound && staged.questionNumber
            ? `q_${staged.examYear}_0${staged.examRound}_${String(staged.questionNumber).padStart(2, "0")}`
            : `q_imp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

        const questionCode =
          staged.questionCode ||
          this.questionRepo.generateNextCode(
            staged.sourceType,
            staged.examYear,
            staged.examRound,
            staged.questionNumber,
          );

        const question: Question = {
          id: liveQuestionId,
          questionCode,
          sourceType: staged.sourceType,
          examYear: staged.examYear,
          examRound: staged.examRound,
          questionNumber: staged.questionNumber,
          parentQuestionId: staged.parentQuestionId,
          conceptId: staged.conceptId,
          subject: staged.subject,
          category: staged.category,
          subCategory: staged.subCategory,
          type: staged.type,
          question: staged.questionText,
          code: staged.codeSnippet,
          language: staged.language,
          options: staged.options,
          groundTruthAnswer: staged.groundTruthAnswer,
          officialExplanation: staged.officialExplanation,
          aiExplanation: staged.aiExplanation,
          aiVariationNotes: staged.aiVariationNotes,
          difficulty: staged.difficulty,
          keywords: staged.keywords,
          structuralFingerprint: staged.structuralFingerprint,
          createdAt: now,
        };

        // Live Question DB에 저장
        this.questionRepo.create(question);
        committedQuestionIds.push(liveQuestionId);

        // Staged 상태를 COMMITTED로 업데이트
        this.db
          .prepare(
            `UPDATE staged_questions SET
              review_status = 'COMMITTED', committed_question_id = ?,
              updated_at = ?
            WHERE id = ?`,
          )
          .run(liveQuestionId, now, staged.id);
      }

      // 배치 상태 갱신
      this.syncBatchCounts(batchId);
      this.db
        .prepare("UPDATE import_batches SET committed_at = ? WHERE id = ?")
        .run(now, batchId);
    });

    tx();

    return {
      committedCount: committedQuestionIds.length,
      committedQuestionIds,
    };
  }

  public deleteBatch(batchId: string): void {
    this.db.prepare("DELETE FROM import_batches WHERE id = ?").run(batchId);
  }
}
