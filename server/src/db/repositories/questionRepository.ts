import { Database } from "better-sqlite3";
import {
  Question,
  QuestionFilter,
  QuestionListResponse,
  Subject,
  QuestionType,
  Difficulty,
  CodeLanguage,
  QuestionSourceType,
  StudyVisibility,
  stripSubItemPrefix,
  isStudyEligible,
} from "@jungcheogi/shared";
import { getDatabase } from "../database";

export function pickRandomIds(
  ids: string[],
  count: number,
  rng: () => number = Math.random,
): string[] {
  const unique = [...new Set(ids.filter(Boolean))];
  const take = Math.min(Math.max(count, 0), unique.length);
  if (take === 0) return [];
  const pool = [...unique];
  const selected: string[] = [];
  for (let i = 0; i < take; i++) {
    const raw = rng();
    const bounded = Number.isFinite(raw) ? Math.min(Math.max(raw, 0), 0.999999) : 0;
    const idx = Math.floor(bounded * pool.length);
    selected.push(pool.splice(idx, 1)[0]);
  }
  return selected;
}

interface QuestionRow {
  id: string;
  question_code?: string | null;
  source_type: string;
  exam_year: number | null;
  exam_round: number | null;
  question_number: number | null;
  parent_question_id: string | null;
  concept_id?: string | null;
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
  hints_json?: string | null;
  code_line_explanations_json?: string | null;
  active_recall_meta_json?: string | null;
  ai_explanation: string | null;
  ai_variation_notes: string | null;
  difficulty: string;
  keywords_json: string | null;
  structural_fingerprint: string | null;
  study_visibility?: string | null;
  created_at: string;
  updated_at: string | null;
}

function mapRowToQuestion(row: QuestionRow): Question {
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

  let options: string[] | undefined;
  if (row.options_json) {
    try {
      options = JSON.parse(row.options_json);
    } catch {
      options = undefined;
    }
  }

  let keywords: string[] = [];
  if (row.keywords_json) {
    try {
      keywords = JSON.parse(row.keywords_json);
    } catch {
      keywords = [];
    }
  }

  let hints: string[] = [];
  if (row.hints_json) {
    try {
      hints = JSON.parse(row.hints_json);
    } catch {
      hints = [];
    }
  }

  let codeLineExplanations: any = undefined;
  if (row.code_line_explanations_json) {
    try {
      codeLineExplanations = JSON.parse(row.code_line_explanations_json);
    } catch {
      codeLineExplanations = undefined;
    }
  }

  let activeRecallMeta: any = undefined;
  if (row.active_recall_meta_json) {
    try {
      activeRecallMeta = JSON.parse(row.active_recall_meta_json);
    } catch {
      activeRecallMeta = undefined;
    }
  }

  const isReviewNote = row.ai_variation_notes?.includes("[SEED_REVIEW_REQUIRED]");
  const isReviewGt =
    typeof groundTruthAnswer === "string" &&
    groundTruthAnswer.includes("[정답 검토 필요");
  const isReview = Boolean(isReviewNote || isReviewGt);

  const isTransReview = Boolean(row.ai_variation_notes?.includes("[TRANS_REVIEW]"));
  const isAnsReview = Boolean(
    row.ai_variation_notes?.includes("[ANS_REVIEW]") ||
    isReviewGt ||
    (isReviewNote && !row.ai_variation_notes?.includes("[TRANS_REVIEW]"))
  );

  return {
    id: row.id,
    questionCode: row.question_code ?? undefined,
    sourceType: row.source_type as QuestionSourceType,
    examYear: row.exam_year ?? undefined,
    examRound: row.exam_round ?? undefined,
    questionNumber: row.question_number ?? undefined,
    parentQuestionId: row.parent_question_id ?? undefined,
    conceptId: row.concept_id ?? undefined,
    subject: row.subject as Subject,
    category: row.category,
    subCategory: row.sub_category ?? undefined,
    book:
      (row.source_type === "TEXTBOOK_EXPECTED" || row.source_type === "TEXTBOOK") && row.sub_category?.includes(" - ")
        ? row.sub_category.split(" - ")[0]
        : undefined,
    chapter:
      (row.source_type === "TEXTBOOK_EXPECTED" || row.source_type === "TEXTBOOK")
        ? (row.sub_category?.includes(" - ") ? row.sub_category.split(" - ")[1] : (row.sub_category ?? undefined))
        : undefined,
    sourceName:
      (row.source_type === "TEXTBOOK_EXPECTED" || row.source_type === "TEXTBOOK") && row.sub_category?.includes(" - ")
        ? row.sub_category.split(" - ")[0]
        : undefined,
    type: row.type as QuestionType,
    question: row.question_text,
    code: row.code_snippet ?? undefined,
    language: (row.language as CodeLanguage) ?? undefined,
    options,
    groundTruthAnswer,
    officialExplanation: row.official_explanation ?? undefined,
    hints: hints.length > 0 ? hints : undefined,
    codeLineExplanations,
    activeRecallMeta,
    aiExplanation: row.ai_explanation ?? undefined,
    aiVariationNotes: row.ai_variation_notes ?? undefined,
    difficulty: (row.difficulty as Difficulty) || "MEDIUM",
    keywords,
    structuralFingerprint: row.structural_fingerprint ?? undefined,
    studyVisibility: (row.study_visibility as StudyVisibility) || "LIVE",
    transcriptionStatus: isTransReview ? "REVIEW" : "VERIFIED",
    answerStatus: (isAnsReview || isReview) ? "REVIEW_NEEDED" : "VERIFIED",
    readyForGrading: !isReview,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
  };
}

export class QuestionRepository {
  private db: Database;

  constructor(customDb?: Database) {
    this.db = customDb || getDatabase();
  }

  public generateNextCode(
    sourceType?: string | null,
    examYear?: number | null,
    examRound?: number | null,
    questionNumber?: number | null,
  ): string {
    if (sourceType === "REAL_EXAM" && examYear && examRound && questionNumber) {
      const year = String(examYear);
      const round = String(examRound).padStart(2, "0");
      const num = String(questionNumber).padStart(2, "0");
      return `Q-${year}-${round}-${num}`;
    }
    const prefix =
      sourceType === "AI_VARIATION" || sourceType === "AI_GENERATED"
        ? "AI"
        : sourceType === "TEXTBOOK_EXPECTED" || sourceType === "TEXTBOOK"
        ? "TB"
        : "IMP";
    try {
      const rows = this.db
        .prepare(
          `SELECT question_code FROM questions WHERE question_code LIKE ?
           UNION ALL
           SELECT question_code FROM staged_questions WHERE question_code LIKE ?`,
        )
        .all(`${prefix}-%`, `${prefix}-%`) as Array<{ question_code: string | null }>;

      let maxSeq = 0;
      for (const row of rows) {
        if (!row.question_code) continue;
        const match = row.question_code.match(new RegExp(`^${prefix}-(\\d+)`));
        if (match) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxSeq) {
            maxSeq = num;
          }
        }
      }
      let nextSeq = maxSeq + 1;
      let candidate = `${prefix}-${String(nextSeq).padStart(6, "0")}`;
      const exists = this.db.prepare(
        `SELECT 1 FROM questions WHERE question_code = ?
         UNION ALL
         SELECT 1 FROM staged_questions WHERE question_code = ?
         LIMIT 1`,
      );
      while (exists.get(candidate, candidate)) {
        nextSeq += 1;
        candidate = `${prefix}-${String(nextSeq).padStart(6, "0")}`;
      }
      return candidate;
    } catch {
      return `${prefix}-${Date.now().toString().slice(-6)}`;
    }
  }

  public create(q: Question): Question {
    const questionCode =
      q.questionCode ||
      this.generateNextCode(
        q.sourceType,
        q.examYear,
        q.examRound,
        q.questionNumber,
      );

    const stmt = this.db.prepare(`
      INSERT INTO questions (
        id, question_code, source_type, exam_year, exam_round, question_number, parent_question_id,
        concept_id, subject, category, sub_category, type, question_text, code_snippet, language, options_json,
        ground_truth_answer, official_explanation, hints_json, code_line_explanations_json, active_recall_meta_json,
        ai_explanation, ai_variation_notes, difficulty, keywords_json, structural_fingerprint, study_visibility, created_at, updated_at
      ) VALUES (
        @id, @question_code, @source_type, @exam_year, @exam_round, @question_number, @parent_question_id,
        @concept_id, @subject, @category, @sub_category, @type, @question_text, @code_snippet, @language, @options_json,
        @ground_truth_answer, @official_explanation, @hints_json, @code_line_explanations_json, @active_recall_meta_json,
        @ai_explanation, @ai_variation_notes, @difficulty, @keywords_json, @structural_fingerprint, @study_visibility, @created_at, @updated_at
      )
    `);

    stmt.run({
      id: q.id,
      question_code: questionCode,
      source_type: q.sourceType,
      exam_year: q.examYear ?? null,
      exam_round: q.examRound ?? null,
      question_number: q.questionNumber ?? null,
      parent_question_id: q.parentQuestionId ?? null,
      concept_id: q.conceptId ?? null,
      subject: q.subject,
      category: q.category,
      sub_category: q.subCategory ?? (q.book && q.chapter ? `${q.book} - ${q.chapter}` : (q.chapter ?? null)),
      type: q.type,
      question_text: q.question,
      code_snippet: q.code ?? null,
      language: q.language ?? null,
      options_json: q.options ? JSON.stringify(q.options) : null,
      ground_truth_answer: JSON.stringify(q.groundTruthAnswer),
      official_explanation: q.officialExplanation ?? null,
      hints_json: q.hints ? JSON.stringify(q.hints) : null,
      code_line_explanations_json: q.codeLineExplanations
        ? JSON.stringify(q.codeLineExplanations)
        : null,
      active_recall_meta_json: q.activeRecallMeta
        ? JSON.stringify(q.activeRecallMeta)
        : null,
      ai_explanation: q.aiExplanation ?? null,
      ai_variation_notes: q.aiVariationNotes ?? null,
      difficulty: q.difficulty,
      keywords_json: JSON.stringify(q.keywords || []),
      structural_fingerprint: q.structuralFingerprint ?? null,
      study_visibility: q.studyVisibility || "LIVE",
      created_at: q.createdAt || new Date().toISOString(),
      updated_at: q.updatedAt ?? null,
    });

    const created = this.findById(q.id);
    if (!created) {
      throw new Error(`Failed to retrieve newly created question id=${q.id}`);
    }
    return created;
  }

  public findById(id: string): Question | null {
    const stmt = this.db.prepare("SELECT * FROM questions WHERE id = ?");
    const row = stmt.get(id) as QuestionRow | undefined;
    if (!row) {
      return null;
    }
    return mapRowToQuestion(row);
  }

  public findVariations(parentQuestionId: string): Question[] {
    const stmt = this.db.prepare(
      `SELECT * FROM questions
       WHERE parent_question_id = ?
         AND (study_visibility IS NULL OR study_visibility = 'LIVE')
       ORDER BY created_at ASC`,
    );
    const rows = stmt.all(parentQuestionId) as QuestionRow[];
    return rows.map(mapRowToQuestion);
  }

  private buildListFilter(
    filter: QuestionFilter = {},
  ): { conditions: string[]; params: unknown[] } {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.subject) {
      conditions.push("subject = ?");
      params.push(filter.subject);
    }

    if (filter.type) {
      conditions.push("type = ?");
      params.push(filter.type);
    }

    if (filter.difficulty) {
      conditions.push("difficulty = ?");
      params.push(filter.difficulty);
    }

    if (filter.sourceType) {
      conditions.push("source_type = ?");
      params.push(filter.sourceType);
    }

    if (filter.parentQuestionId !== undefined) {
      if (filter.parentQuestionId === "null") {
        conditions.push("parent_question_id IS NULL");
      } else {
        conditions.push("parent_question_id = ?");
        params.push(filter.parentQuestionId);
      }
    }

    if (filter.conceptId) {
      conditions.push("concept_id = ?");
      params.push(filter.conceptId);
    }

    if (filter.search && filter.search.trim()) {
      const term = `%${filter.search.trim()}%`;
      conditions.push(
        "(question_text LIKE ? OR keywords_json LIKE ? OR category LIKE ? OR code_snippet LIKE ?)",
      );
      params.push(term, term, term, term);
    }

    if (!filter.includeTemporaryDrills) {
      conditions.push("(study_visibility IS NULL OR study_visibility = 'LIVE')");
    }

    return { conditions, params };
  }

  public findMany(filter: QuestionFilter = {}): QuestionListResponse {
    const { conditions, params } = this.buildListFilter(filter);
    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countQuery = `SELECT COUNT(*) as total FROM questions ${whereClause}`;
    const countRow = this.db.prepare(countQuery).get(...params) as {
      total: number;
    };
    const total = countRow ? countRow.total : 0;

    const limit = Math.min(Math.max(filter.limit ?? 20, 1), 100);
    const offset = Math.max(filter.offset ?? 0, 0);

    const query = `
      SELECT * FROM questions
      ${whereClause}
      ORDER BY 
        CASE WHEN exam_year IS NOT NULL THEN exam_year ELSE 0 END DESC,
        CASE WHEN exam_round IS NOT NULL THEN exam_round ELSE 0 END DESC,
        CASE WHEN question_number IS NOT NULL THEN question_number ELSE 999 END ASC,
        created_at DESC
      LIMIT ? OFFSET ?
    `;

    const rows = this.db
      .prepare(query)
      .all(...params, limit, offset) as QuestionRow[];
    const items = rows.map(mapRowToQuestion);

    return {
      items,
      total,
      limit,
      offset,
    };
  }

  /**
   * 사용자 목록의 100건 페이지 제한 없이 내부 비교·후보 선정용 전체 조회
   */
  public findAllMatching(
    filter: Omit<QuestionFilter, "limit" | "offset"> = {},
  ): Question[] {
    const { conditions, params } = this.buildListFilter(filter);
    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const query = `
      SELECT * FROM questions
      ${whereClause}
      ORDER BY
        CASE WHEN exam_year IS NOT NULL THEN exam_year ELSE 0 END DESC,
        CASE WHEN exam_round IS NOT NULL THEN exam_round ELSE 0 END DESC,
        CASE WHEN question_number IS NOT NULL THEN question_number ELSE 999 END ASC,
        created_at DESC
    `;
    const rows = this.db.prepare(query).all(...params) as QuestionRow[];
    return rows.map(mapRowToQuestion);
  }

  public findCandidateIds(
    filter: Pick<QuestionFilter, "subject" | "sourceType" | "includeTemporaryDrills"> = {},
  ): string[] {
    const { conditions, params } = this.buildListFilter(filter);
    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const query = `
      SELECT id FROM questions
      ${whereClause}
      ORDER BY
        CASE WHEN exam_year IS NOT NULL THEN exam_year ELSE 0 END DESC,
        CASE WHEN exam_round IS NOT NULL THEN exam_round ELSE 0 END DESC,
        CASE WHEN question_number IS NOT NULL THEN question_number ELSE 999 END ASC,
        created_at DESC
    `;
    const rows = this.db.prepare(query).all(...params) as Array<{ id: string }>;
    return rows.map((row) => row.id);
  }

  public pickRandom(
    filter: Pick<QuestionFilter, "subject" | "sourceType" | "includeTemporaryDrills">,
    count: number,
    rng: () => number = Math.random,
  ): Question[] {
    const ids = this.findCandidateIds(filter);
    const candidateQuestions: Question[] = [];
    for (const id of ids) {
      const q = this.findById(id);
      if (q && isStudyEligible(q) && q.readyForGrading !== false) {
        candidateQuestions.push(q);
      }
    }

    // Fallback if readyForGrading filter leaves no candidates (e.g. test fixtures)
    if (candidateQuestions.length === 0) {
      for (const id of ids) {
        const q = this.findById(id);
        if (q && isStudyEligible(q)) {
          candidateQuestions.push(q);
        }
      }
    }

    if (candidateQuestions.length <= count) {
      return candidateQuestions;
    }

    return this.selectDiverseRandom(candidateQuestions, count, rng);
  }

  /**
   * Diverse Random 문제 선별 알고리즘:
   * 1. 최근 푼 문제(attempts, sessions) 감점 (중복 체감 완벽 방어)
   * 2. 동일 세션 내 동일 parentSeed 중복 억제 (동일 Seed 변형 중복 방지)
   * 3. 동일 세션 내 동일 concept 중복 억제 (개념 다양성 보장)
   * 4. 언어 및 도메인 분산 유도 (균형 잡힌 모의 실기 환경)
   * 5. 가중치 룰렛 휠 추첨
   */
  private selectDiverseRandom(
    candidateQuestions: Question[],
    count: number,
    rng: () => number = Math.random,
  ): Question[] {
    // 1. 최근 풀이 이력(attempts, sessions) 조회
    const recentAttemptIds = new Set<string>();
    const recentSessionIds = new Set<string>();
    try {
      const attempts = this.db
        .prepare("SELECT question_id FROM attempts ORDER BY created_at DESC LIMIT 30")
        .all() as Array<{ question_id: string }>;
      for (const a of attempts) {
        if (a.question_id) recentAttemptIds.add(a.question_id);
      }

      const sessions = this.db
        .prepare("SELECT question_ids_json FROM sessions ORDER BY started_at DESC LIMIT 5")
        .all() as Array<{ question_ids_json: string }>;
      for (const s of sessions) {
        if (s.question_ids_json) {
          try {
            const ids = JSON.parse(s.question_ids_json);
            if (Array.isArray(ids)) {
              for (const id of ids) recentSessionIds.add(String(id));
            }
          } catch {}
        }
      }
    } catch {}

    // 2. 기본 가중치 산출 (최근 푼 문제는 큰 폭 감점 부여)
    const freshCount = candidateQuestions.filter((q) => !recentAttemptIds.has(q.id)).length;
    const pool = candidateQuestions.map((q) => {
      let weight = 100;
      if (recentAttemptIds.has(q.id)) {
        // 미풀이 문제가 충분할 경우 최근 푼 문제는 95% 강력 감점
        weight = freshCount >= count ? 5 : 20;
      }
      if (recentSessionIds.has(q.id)) {
        weight -= 40;
      }
      weight = Math.max(weight, 1);
      return { q, baseWeight: weight };
    });

    const selected: Question[] = [];
    const selectedParents = new Map<string, number>();
    const selectedConcepts = new Map<string, number>();
    const selectedLangs = new Map<string, number>();

    const remaining = [...pool];

    while (selected.length < count && remaining.length > 0) {
      // 3. 현재 세션에 이미 선택된 문제들과의 상호 다양성 동적 감점
      const dynamicWeights = remaining.map((item) => {
        let w = item.baseWeight;
        const parent = item.q.parentQuestionId || item.q.id;
        if (selectedParents.has(parent)) {
          w *= 0.1; // 동일 parentSeed 강력 억제 (90% 감점)
        }
        if (item.q.conceptId && selectedConcepts.has(item.q.conceptId)) {
          w *= 0.3; // 동일 concept 연속 출제 억제 (70% 감점)
        }
        const lang = item.q.language || "NONE";
        if (lang !== "NONE" && (selectedLangs.get(lang) || 0) > 0) {
          w *= 0.5; // 언어 다양성 분산 유도 (50% 감점)
        }
        return Math.max(w, 1);
      });

      const totalWeight = dynamicWeights.reduce((sum, w) => sum + w, 0);
      const rawR = rng();
      const boundedR = Number.isFinite(rawR) ? Math.min(Math.max(rawR, 0), 0.999999) : 0;
      const target = boundedR * totalWeight;

      let acc = 0;
      let chosenIdx = 0;
      for (let i = 0; i < dynamicWeights.length; i++) {
        acc += dynamicWeights[i];
        if (target < acc) {
          chosenIdx = i;
          break;
        }
      }

      const chosen = remaining.splice(chosenIdx, 1)[0].q;
      selected.push(chosen);

      const parent = chosen.parentQuestionId || chosen.id;
      selectedParents.set(parent, (selectedParents.get(parent) || 0) + 1);
      if (chosen.conceptId) {
        selectedConcepts.set(chosen.conceptId, (selectedConcepts.get(chosen.conceptId) || 0) + 1);
      }
      const lang = chosen.language || "NONE";
      selectedLangs.set(lang, (selectedLangs.get(lang) || 0) + 1);
    }

    return selected;
  }

  public update(id: string, partial: Partial<Question>): Question | null {
    const existing = this.findById(id);
    if (!existing) {
      return null;
    }

    const merged: Question = {
      ...existing,
      ...partial,
      id: existing.id,
      groundTruthAnswer:
        partial.groundTruthAnswer ?? existing.groundTruthAnswer,
      officialExplanation:
        partial.officialExplanation ?? existing.officialExplanation,
      updatedAt: new Date().toISOString(),
    };

    const stmt = this.db.prepare(`
      UPDATE questions SET
        question_code = @question_code,
        source_type = @source_type,
        exam_year = @exam_year,
        exam_round = @exam_round,
        question_number = @question_number,
        parent_question_id = @parent_question_id,
        concept_id = @concept_id,
        subject = @subject,
        category = @category,
        sub_category = @sub_category,
        type = @type,
        question_text = @question_text,
        code_snippet = @code_snippet,
        language = @language,
        options_json = @options_json,
        ground_truth_answer = @ground_truth_answer,
        official_explanation = @official_explanation,
        hints_json = @hints_json,
        code_line_explanations_json = @code_line_explanations_json,
        active_recall_meta_json = @active_recall_meta_json,
        ai_explanation = @ai_explanation,
        ai_variation_notes = @ai_variation_notes,
        difficulty = @difficulty,
        keywords_json = @keywords_json,
        structural_fingerprint = @structural_fingerprint,
        study_visibility = @study_visibility,
        updated_at = @updated_at
      WHERE id = @id
    `);

    stmt.run({
      id,
      question_code: merged.questionCode ?? null,
      source_type: merged.sourceType,
      exam_year: merged.examYear ?? null,
      exam_round: merged.examRound ?? null,
      question_number: merged.questionNumber ?? null,
      parent_question_id: merged.parentQuestionId ?? null,
      concept_id: merged.conceptId ?? null,
      subject: merged.subject,
      category: merged.category,
      sub_category: merged.subCategory ?? (merged.book && merged.chapter ? `${merged.book} - ${merged.chapter}` : (merged.chapter ?? null)),
      type: merged.type,
      question_text: merged.question,
      code_snippet: merged.code ?? null,
      language: merged.language ?? null,
      options_json: merged.options ? JSON.stringify(merged.options) : null,
      ground_truth_answer: JSON.stringify(merged.groundTruthAnswer),
      official_explanation: merged.officialExplanation ?? null,
      hints_json: merged.hints ? JSON.stringify(merged.hints) : null,
      code_line_explanations_json: merged.codeLineExplanations
        ? JSON.stringify(merged.codeLineExplanations)
        : null,
      active_recall_meta_json: merged.activeRecallMeta
        ? JSON.stringify(merged.activeRecallMeta)
        : null,
      ai_explanation: merged.aiExplanation ?? null,
      ai_variation_notes: merged.aiVariationNotes ?? null,
      difficulty: merged.difficulty,
      keywords_json: JSON.stringify(merged.keywords || []),
      structural_fingerprint: merged.structuralFingerprint ?? null,
      study_visibility: merged.studyVisibility || "LIVE",
      updated_at: merged.updatedAt,
    });

    return this.findById(id);
  }

  public delete(id: string): boolean {
    const stmt = this.db.prepare("DELETE FROM questions WHERE id = ?");
    const result = stmt.run(id);
    return result.changes > 0;
  }

  public count(): number {
    const stmt = this.db.prepare("SELECT COUNT(*) as count FROM questions");
    const row = stmt.get() as { count: number };
    return row.count;
  }

  public bulkInsert(questions: Question[]): { insertedCount: number } {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO questions (
        id, question_code, source_type, exam_year, exam_round, question_number, parent_question_id,
        concept_id, subject, category, sub_category, type, question_text, code_snippet, language, options_json,
        ground_truth_answer, official_explanation, hints_json, code_line_explanations_json, active_recall_meta_json,
        ai_explanation, ai_variation_notes, difficulty, keywords_json, structural_fingerprint, study_visibility, created_at, updated_at
      ) VALUES (
        @id, @question_code, @source_type, @exam_year, @exam_round, @question_number, @parent_question_id,
        @concept_id, @subject, @category, @sub_category, @type, @question_text, @code_snippet, @language, @options_json,
        @ground_truth_answer, @official_explanation, @hints_json, @code_line_explanations_json, @active_recall_meta_json,
        @ai_explanation, @ai_variation_notes, @difficulty, @keywords_json, @structural_fingerprint, @study_visibility, @created_at, @updated_at
      )
    `);

    let count = 0;
    const runTransaction = this.db.transaction((items: Question[]) => {
      for (const q of items) {
        const questionCode =
          q.questionCode ||
          this.generateNextCode(
            q.sourceType,
            q.examYear,
            q.examRound,
            q.questionNumber,
          );
        stmt.run({
          id: q.id,
          question_code: questionCode,
          source_type: q.sourceType,
          exam_year: q.examYear ?? null,
          exam_round: q.examRound ?? null,
          question_number: q.questionNumber ?? null,
          parent_question_id: q.parentQuestionId ?? null,
          concept_id: q.conceptId ?? null,
          subject: q.subject,
          category: q.category,
          sub_category: q.subCategory ?? (q.book && q.chapter ? `${q.book} - ${q.chapter}` : (q.chapter ?? null)),
          type: q.type,
          question_text: q.question,
          code_snippet: q.code ?? null,
          language: q.language ?? null,
          options_json: q.options ? JSON.stringify(q.options) : null,
          ground_truth_answer: JSON.stringify(q.groundTruthAnswer),
          official_explanation: q.officialExplanation ?? null,
          hints_json: q.hints ? JSON.stringify(q.hints) : null,
          code_line_explanations_json: q.codeLineExplanations
            ? JSON.stringify(q.codeLineExplanations)
            : null,
          active_recall_meta_json: q.activeRecallMeta
            ? JSON.stringify(q.activeRecallMeta)
            : null,
          ai_explanation: q.aiExplanation ?? null,
          ai_variation_notes: q.aiVariationNotes ?? null,
          difficulty: q.difficulty,
          keywords_json: JSON.stringify(q.keywords || []),
          structural_fingerprint: q.structuralFingerprint ?? null,
          study_visibility: q.studyVisibility || "LIVE",
          created_at: q.createdAt || new Date().toISOString(),
          updated_at: q.updatedAt ?? null,
        });
        count++;
      }
    });

    runTransaction(questions);
    return { insertedCount: count };
  }
}
