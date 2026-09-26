import fs from 'fs';
import path from 'path';
import { getDatabase } from './database';

export function runMigrations(): { appliedCount: number; totalMigrations: number } {
  const db = getDatabase();

  // Ensure migrations tracking table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  // migrations directory resolution (works in src and dist)
  const candidates = [
    path.resolve(__dirname, 'migrations'),
    path.resolve(process.cwd(), 'src/db/migrations'),
    path.resolve(process.cwd(), 'server/src/db/migrations'),
  ];

  let migrationsDir = candidates[0];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) {
      migrationsDir = dir;
      break;
    }
  }

  if (!fs.existsSync(migrationsDir)) {
    return { appliedCount: 0, totalMigrations: 0 };
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const getAppliedStmt = db.prepare('SELECT name FROM schema_migrations');
  const appliedRows = getAppliedStmt.all() as Array<{ name: string }>;
  const appliedSet = new Set(appliedRows.map((r) => r.name));

  let appliedCount = 0;
  const insertMigrationStmt = db.prepare(
    'INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)'
  );

  for (const file of files) {
    if (appliedSet.has(file)) {
      continue;
    }

    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf-8');

    // Run each migration inside an atomic transaction
    const runTransaction = db.transaction(() => {
      db.exec(sql);
      insertMigrationStmt.run(file, new Date().toISOString());
    });

    runTransaction();
    appliedCount++;
  }

  // Post-migration safety check: synchronize created_at / answered_at in attempts table if present
  try {
    const attemptsInfo = db.prepare('PRAGMA table_info(attempts)').all() as Array<{ name: string }>;
    const colNames = new Set(attemptsInfo.map((c) => c.name));
    if (colNames.size > 0) {
      if (!colNames.has('created_at') && colNames.has('answered_at')) {
        db.exec('ALTER TABLE attempts ADD COLUMN created_at TEXT');
        db.exec('UPDATE attempts SET created_at = answered_at WHERE created_at IS NULL');
      }
      if (!colNames.has('answered_at') && colNames.has('created_at')) {
        db.exec('ALTER TABLE attempts ADD COLUMN answered_at TEXT');
        db.exec('UPDATE attempts SET answered_at = created_at WHERE answered_at IS NULL');
      }
    }
  } catch {
    // attempts table might not exist yet
  }

  // Post-migration safety check: synchronize review_states columns if needed
  try {
    const reviewInfo = db.prepare('PRAGMA table_info(review_states)').all() as Array<{ name: string }>;
    const reviewCols = new Set(reviewInfo.map((c) => c.name));
    if (reviewCols.size > 0) {
      if (!reviewCols.has('box_level')) {
        db.exec('ALTER TABLE review_states ADD COLUMN box_level INTEGER NOT NULL DEFAULT 1');
      }
      if (!reviewCols.has('repetitions')) {
        db.exec('ALTER TABLE review_states ADD COLUMN repetitions INTEGER NOT NULL DEFAULT 0');
        if (reviewCols.has('repetition_count')) {
          db.exec('UPDATE review_states SET repetitions = repetition_count WHERE repetitions = 0');
        }
      }
      if (!reviewCols.has('lapses')) {
        db.exec('ALTER TABLE review_states ADD COLUMN lapses INTEGER NOT NULL DEFAULT 0');
      }
      if (!reviewCols.has('last_studied_at')) {
        db.exec('ALTER TABLE review_states ADD COLUMN last_studied_at TEXT');
        if (reviewCols.has('last_reviewed_at')) {
          db.exec('UPDATE review_states SET last_studied_at = last_reviewed_at WHERE last_studied_at IS NULL');
        }
      }
      if (!reviewCols.has('next_review_at')) {
        db.exec('ALTER TABLE review_states ADD COLUMN next_review_at TEXT');
        if (reviewCols.has('due_date')) {
          db.exec('UPDATE review_states SET next_review_at = due_date WHERE next_review_at IS NULL');
        }
      }
    }
  } catch {
    // review_states table might not exist yet
  }

  // Post-migration safety check: synchronize staged_questions.concept_id if needed
  try {
    const stagedInfo = db.prepare('PRAGMA table_info(staged_questions)').all() as Array<{ name: string }>;
    const stagedCols = new Set(stagedInfo.map((c) => c.name));
    if (stagedCols.size > 0 && !stagedCols.has('concept_id')) {
      db.exec('ALTER TABLE staged_questions ADD COLUMN concept_id TEXT REFERENCES concepts(id) ON DELETE SET NULL');
    }
  } catch {
    // staged_questions table might not exist yet
  }

  const countStmt = db.prepare('SELECT COUNT(*) as count FROM schema_migrations');
  const total = (countStmt.get() as { count: number }).count;

  return { appliedCount, totalMigrations: total };
}
