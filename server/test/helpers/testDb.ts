import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeDatabase, setDatabasePathOverride } from "../../src/db/database";
import { runMigrations } from "../../src/db/migrator";
import { seedFixtureQuestions } from "../../src/db/seeder";

export function setupIsolatedTestDb(options?: { seed?: boolean }): {
  dir: string;
  dbPath: string;
  cleanup: () => void;
} {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jcg-test-"));
  const dbPath = path.join(dir, "test.db");
  setDatabasePathOverride(dbPath);
  runMigrations();
  if (options?.seed !== false) {
    seedFixtureQuestions();
  }
  return {
    dir,
    dbPath,
    cleanup() {
      closeDatabase();
      setDatabasePathOverride(null);
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
