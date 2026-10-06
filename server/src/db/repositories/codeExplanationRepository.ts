import { getDatabase } from '../database.js';
import { AICodeLineResponse } from '@jungcheogi/shared';

export interface StoredCodeExplanation {
  id: string;
  questionId: string;
  codeHash: string;
  promptVersion: number;
  model: string;
  status: 'READY' | 'FAILED';
  explanationPayload: {
    lines: AICodeLineResponse[];
  };
  generatedAt: string;
  updatedAt: string;
  retryCount: number;
}

export interface UpsertCodeExplanationInput {
  questionId: string;
  codeHash: string;
  promptVersion?: number;
  model: string;
  status: 'READY' | 'FAILED';
  lines: AICodeLineResponse[];
  generatedAt?: string;
}

export class CodeExplanationRepository {
  public findByQuestionAndHash(
    questionId: string,
    codeHash: string,
    promptVersion: number = 1
  ): StoredCodeExplanation | null {
    const db = getDatabase();
    const row = db
      .prepare(
        `SELECT id, question_id, code_hash, prompt_version, model, status, explanation_payload, generated_at, updated_at, retry_count
         FROM question_code_explanations
         WHERE question_id = ? AND code_hash = ? AND prompt_version = ?`
      )
      .get(questionId, codeHash, promptVersion) as any;

    if (!row) return null;

    try {
      return {
        id: row.id,
        questionId: row.question_id,
        codeHash: row.code_hash,
        promptVersion: row.prompt_version,
        model: row.model,
        status: row.status,
        explanationPayload: JSON.parse(row.explanation_payload),
        generatedAt: row.generated_at,
        updatedAt: row.updated_at,
        retryCount: row.retry_count || 0,
      };
    } catch {
      return null;
    }
  }

  public upsertExplanation(input: UpsertCodeExplanationInput): StoredCodeExplanation {
    const db = getDatabase();
    const promptVersion = input.promptVersion || 1;
    const now = input.generatedAt || new Date().toISOString();
    const id = `exp_${input.questionId}_${input.codeHash.slice(0, 8)}_${promptVersion}`;
    const payloadStr = JSON.stringify({ lines: input.lines });

    db.prepare(
      `INSERT INTO question_code_explanations 
         (id, question_id, code_hash, prompt_version, model, status, explanation_payload, generated_at, updated_at, retry_count)
       VALUES 
         (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT(question_id, code_hash, prompt_version) DO UPDATE SET
         model = excluded.model,
         status = excluded.status,
         explanation_payload = excluded.explanation_payload,
         updated_at = excluded.updated_at,
         retry_count = question_code_explanations.retry_count + 1`
    ).run(
      id,
      input.questionId,
      input.codeHash,
      promptVersion,
      input.model,
      input.status,
      payloadStr,
      now,
      now
    );

    return {
      id,
      questionId: input.questionId,
      codeHash: input.codeHash,
      promptVersion,
      model: input.model,
      status: input.status,
      explanationPayload: { lines: input.lines },
      generatedAt: now,
      updatedAt: now,
      retryCount: 0,
    };
  }

  public incrementRetryCount(
    questionId: string,
    codeHash: string,
    promptVersion: number = 1
  ): void {
    const db = getDatabase();
    db.prepare(
      `UPDATE question_code_explanations 
       SET retry_count = retry_count + 1, updated_at = ?
       WHERE question_id = ? AND code_hash = ? AND prompt_version = ?`
    ).run(new Date().toISOString(), questionId, codeHash, promptVersion);
  }
}

export const codeExplanationRepo = new CodeExplanationRepository();

