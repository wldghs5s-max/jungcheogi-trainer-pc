import { Database } from 'better-sqlite3';
import { StudySession, SessionStatus } from '@jungcheogi/shared';
import { getDatabase } from '../database';

interface SessionRow {
  id: string;
  title: string;
  subject_filter: string | null;
  question_ids_json: string;
  current_index: number;
  status: string;
  total_questions: number;
  correct_count: number;
  wrong_count: number;
  unknown_count: number;
  total_time_spent_ms: number;
  started_at: string;
  ended_at: string | null;
}

function mapRowToSession(row: SessionRow): StudySession {
  let questionIds: string[] = [];
  try {
    questionIds = JSON.parse(row.question_ids_json);
  } catch {
    questionIds = [];
  }

  return {
    id: row.id,
    title: row.title,
    subjectFilter: row.subject_filter ?? undefined,
    questionIds,
    currentIndex: row.current_index,
    status: row.status as SessionStatus,
    totalQuestions: row.total_questions,
    correctCount: row.correct_count,
    wrongCount: row.wrong_count,
    unknownCount: row.unknown_count,
    totalTimeSpentMs: row.total_time_spent_ms,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
  };
}

export class SessionRepository {
  private db: Database;

  constructor(customDb?: Database) {
    this.db = customDb || getDatabase();
  }

  public create(session: StudySession): StudySession {
    const stmt = this.db.prepare(`
      INSERT INTO sessions (
        id, title, subject_filter, question_ids_json, current_index,
        status, total_questions, correct_count, wrong_count, unknown_count,
        total_time_spent_ms, started_at, ended_at
      ) VALUES (
        @id, @title, @subject_filter, @question_ids_json, @current_index,
        @status, @total_questions, @correct_count, @wrong_count, @unknown_count,
        @total_time_spent_ms, @started_at, @ended_at
      )
    `);

    stmt.run({
      id: session.id,
      title: session.title,
      subject_filter: session.subjectFilter ?? null,
      question_ids_json: JSON.stringify(session.questionIds),
      current_index: session.currentIndex,
      status: session.status,
      total_questions: session.totalQuestions,
      correct_count: session.correctCount,
      wrong_count: session.wrongCount,
      unknown_count: session.unknownCount,
      total_time_spent_ms: session.totalTimeSpentMs,
      started_at: session.startedAt,
      ended_at: session.endedAt ?? null,
    });

    const created = this.findById(session.id);
    if (!created) {
      throw new Error(`Failed to retrieve newly created session id=${session.id}`);
    }
    return created;
  }

  public findById(id: string): StudySession | null {
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE id = ?');
    const row = stmt.get(id) as SessionRow | undefined;
    if (!row) return null;
    return mapRowToSession(row);
  }

  public update(id: string, partial: Partial<StudySession>): StudySession | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const merged: StudySession = {
      ...existing,
      ...partial,
      id: existing.id,
    };

    const stmt = this.db.prepare(`
      UPDATE sessions SET
        title = @title,
        subject_filter = @subject_filter,
        question_ids_json = @question_ids_json,
        current_index = @current_index,
        status = @status,
        total_questions = @total_questions,
        correct_count = @correct_count,
        wrong_count = @wrong_count,
        unknown_count = @unknown_count,
        total_time_spent_ms = @total_time_spent_ms,
        ended_at = @ended_at
      WHERE id = @id
    `);

    stmt.run({
      id,
      title: merged.title,
      subject_filter: merged.subjectFilter ?? null,
      question_ids_json: JSON.stringify(merged.questionIds),
      current_index: merged.currentIndex,
      status: merged.status,
      total_questions: merged.totalQuestions,
      correct_count: merged.correctCount,
      wrong_count: merged.wrongCount,
      unknown_count: merged.unknownCount,
      total_time_spent_ms: merged.totalTimeSpentMs,
      ended_at: merged.endedAt ?? null,
    });

    return this.findById(id);
  }

  public findRecent(limit = 10): StudySession[] {
    const stmt = this.db.prepare(
      'SELECT * FROM sessions ORDER BY started_at DESC LIMIT ?'
    );
    const rows = stmt.all(limit) as SessionRow[];
    return rows.map(mapRowToSession);
  }
}
