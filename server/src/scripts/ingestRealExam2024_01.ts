import fs from 'fs';
import path from 'path';
import { getDatabase } from '../db/database.js';

export function ingestRealExam2024_01() {
  const db = getDatabase();
  const jsonPath = path.resolve(process.cwd(), 'data/real_exam_2024_01.json');

  if (!fs.existsSync(jsonPath)) {
    console.error(`File not found: ${jsonPath}`);
    return;
  }

  const raw = fs.readFileSync(jsonPath, 'utf8');
  const questions = JSON.parse(raw);

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO questions (
      id, source_type, exam_year, exam_round, question_number,
      parent_question_id, concept_id, subject, category, sub_category,
      type, question_text, code_snippet, language, options_json,
      ground_truth_answer_json, official_explanation, ai_explanation,
      ai_variation_notes, difficulty, keywords_json, structural_fingerprint,
      is_verified, created_at, updated_at
    ) VALUES (
      @id, @source_type, @exam_year, @exam_round, @question_number,
      @parent_question_id, @concept_id, @subject, @category, @sub_category,
      @type, @question_text, @code_snippet, @language, @options_json,
      @ground_truth_answer_json, @official_explanation, @ai_explanation,
      @ai_variation_notes, @difficulty, @keywords_json, @structural_fingerprint,
      @is_verified, @created_at, @updated_at
    )
  `);

  const tx = db.transaction(() => {
    for (const q of questions) {
      insertStmt.run({
        id: q.id,
        source_type: q.source || 'REAL_EXAM',
        exam_year: q.examYear || 2024,
        exam_round: q.examRound || 1,
        question_number: q.questionNumber,
        parent_question_id: null,
        concept_id: q.conceptId || null,
        subject: q.subject,
        category: q.category,
        sub_category: null,
        type: q.questionType || 'SHORT_ANSWER',
        question_text: q.questionText,
        code_snippet: q.codeSnippet || null,
        language: q.language || (q.codeSnippet ? (q.codeSnippet.includes('#include') ? 'C' : q.codeSnippet.includes('System.out') ? 'JAVA' : 'PYTHON') : null),
        options_json: JSON.stringify(q.options || []),
        ground_truth_answer_json: JSON.stringify(q.answer),
        official_explanation: q.officialExplanation || q.extractedExplanation || null,
        ai_explanation: q.aiExplanation || null,
        ai_variation_notes: null,
        difficulty: q.difficulty || 'MEDIUM',
        keywords_json: JSON.stringify(q.relatedKeywords || []),
        structural_fingerprint: null,
        is_verified: q.isVerified ? 1 : 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  });

  tx();
  console.log(`Successfully ingested ${questions.length} questions from 2024-01 into questions table.`);
}

if (process.argv[1]?.includes('ingestRealExam2024_01')) {
  ingestRealExam2024_01();
}
