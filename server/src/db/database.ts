import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { env } from '../config/env';

let dbInstance: Database.Database | null = null;
let pathOverride: string | null = null;

export function setDatabasePathOverride(dbPath: string | null): void {
  closeDatabase();
  pathOverride = dbPath;
}

export function getDatabase(): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }

  const rawPath = pathOverride || env.DATABASE_PATH;
  const dbPath = path.isAbsolute(rawPath)
    ? rawPath
    : path.resolve(process.cwd(), rawPath);

  // Ensure database directory exists
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  dbInstance = new Database(dbPath);

  // Configure SQLite for high-reliability local PC desktop execution
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');
  dbInstance.pragma('synchronous = NORMAL');

  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
