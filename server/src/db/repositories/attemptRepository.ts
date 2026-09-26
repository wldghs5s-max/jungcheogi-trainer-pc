import { Database } from 'better-sqlite3';
import { QuizAttempt, MissType } from '@jungcheogi/shared';
import { getDatabase } from '../database';

interface AttemptRow {
  id: string;
  session_id: string | null;
  question_id: string;
  user_answer: string;
  is_correct: number;
  score: number;
  miss_type: string | null;
  time_spent_ms: number;
  is_unknown: number;
  hint_used: number;
  solution_revealed: number;
  feedback: string | null;
  created_at?: string;
  answered_at?: string;
}

function mapRowToAttempt(row: AttemptRow): QuizAttempt {
  let userAnswer: string | string[];
  try {
    userAnswer = JSON.parse(row.user_answer);
  } catch {
    userAnswer = row.user_answer;
  }

  return {
    id: row.id,
    questionId: row.question_id,
    sessionId: row.session_id ?? undefined,
    userAnswer,
    isCorrect: Boolean(row.is_correct),
    score: row.score ?? (row.is_correct ? 1.0 : 0.0),
    missType: (row.miss_type as MissType) ?? undefined,
    timeSpentMs: row.time_spent_ms ?? 0,
    isUnknown: Boolean(row.is_unknown),
    hintUsed: Boolean(row.hint_used),
    solutionRevealed: Boolean(row.solution_revealed),
    feedback: row.feedback ?? undefined,
    createdAt: row.answered_at || row.created_at || new Date().toISOString(),
  };
}

export class AttemptRepository {
  private db: Database;
  private timestampCol: string = 'created_at';

  constructor(customDb?: Database) {
    this.db = customDb || getDatabase();
    try {
      const info = this.db.pragma('table_info(attempts)') as Array<{ name: string }>;
      const cols = new Set(info.map((c) => c.name));
      if (!cols.has('created_at') && cols.has('answered_at')) {
        this.timestampCol = 'answered_at';
      }
    } catch {
      // Table may not exist during early bootstrap
    }
  }

  public create(attempt: QuizAttempt): QuizAttempt {
    const timestamp = attempt.createdAt || new Date().toISOString();
    const info = this.db.pragma('table_info(attempts)') as Array<{ name: string }>;
    const cols = new Set(info.map((c) => c.name));

    const insertCols = [
      'id', 'session_id', 'question_id', 'user_answer', 'is_correct', 'score',
      'miss_type', 'time_spent_ms', 'is_unknown', 'hint_used', 'solution_revealed', 'feedback'
    ];
    if (cols.has('created_at')) insertCols.push('created_at');
    if (cols.has('answered_at')) insertCols.push('answered_at');

    const colNames = insertCols.join(', ');
    const placeholders = insertCols.map((c) => `@${c}`).join(', ');

    const stmt = this.db.prepare(`
      INSERT INTO attempts (${colNames}) VALUES (${placeholders})
    `);

    stmt.run({
      id: attempt.id,
      session_id: attempt.sessionId ?? null,
      question_id: attempt.questionId,
      user_answer: JSON.stringify(attempt.userAnswer),
      is_correct: attempt.isCorrect ? 1 : 0,
      score: attempt.score,
      miss_type: attempt.missType ?? null,
      time_spent_ms: attempt.timeSpentMs,
      is_unknown: attempt.isUnknown ? 1 : 0,
      hint_used: attempt.hintUsed ? 1 : 0,
      solution_revealed: attempt.solutionRevealed ? 1 : 0,
      feedback: attempt.feedback ?? null,
      created_at: timestamp,
      answered_at: timestamp,
    });

    const created = this.findById(attempt.id);
    if (!created) {
      throw new Error(`Failed to retrieve newly created attempt id=${attempt.id}`);
    }
    return created;
  }

  public findById(id: string): QuizAttempt | null {
    const stmt = this.db.prepare('SELECT * FROM attempts WHERE id = ?');
    const row = stmt.get(id) as AttemptRow | undefined;
    if (!row) return null;
    return mapRowToAttempt(row);
  }

  public findBySessionId(sessionId: string): QuizAttempt[] {
    const stmt = this.db.prepare(
      `SELECT * FROM attempts WHERE session_id = ? ORDER BY ${this.timestampCol} ASC, rowid ASC`
    );
    const rows = stmt.all(sessionId) as AttemptRow[];
    return rows.map(mapRowToAttempt);
  }

  public findByQuestionId(questionId: string): QuizAttempt[] {
    const stmt = this.db.prepare(
      `SELECT * FROM attempts WHERE question_id = ? ORDER BY ${this.timestampCol} DESC`
    );
    const rows = stmt.all(questionId) as AttemptRow[];
    return rows.map(mapRowToAttempt);
  }

  public getRecentAttempts(limit = 20): QuizAttempt[] {
    const stmt = this.db.prepare(
      `SELECT * FROM attempts ORDER BY ${this.timestampCol} DESC LIMIT ?`
    );
    const rows = stmt.all(limit) as AttemptRow[];
    return rows.map(mapRowToAttempt);
  }

  public count(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM attempts');
    const row = stmt.get() as { count: number };
    return row.count;
  }
}
