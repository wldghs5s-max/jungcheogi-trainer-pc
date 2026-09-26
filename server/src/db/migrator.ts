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

  const countStmt = db.prepare('SELECT COUNT(*) as count FROM schema_migrations');
  const total = (countStmt.get() as { count: number }).count;

  return { appliedCount, totalMigrations: total };
}
