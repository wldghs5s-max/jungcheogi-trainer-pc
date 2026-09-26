-- 003_allow_test_fixture.sql
-- Allow TEST_FIXTURE and future flexible source_types by removing restrictive CHECK constraint

PRAGMA foreign_keys=OFF;

CREATE TABLE IF NOT EXISTS questions_v3 (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  exam_year INTEGER,
  exam_round INTEGER,
  question_number INTEGER,
  parent_question_id TEXT,
  subject TEXT NOT NULL,
  category TEXT NOT NULL,
  sub_category TEXT,
  type TEXT NOT NULL,
  question_text TEXT NOT NULL,
  code_snippet TEXT,
  language TEXT,
  options_json TEXT,
  ground_truth_answer TEXT NOT NULL,
  official_explanation TEXT,
  ai_explanation TEXT,
  ai_variation_notes TEXT,
  difficulty TEXT NOT NULL DEFAULT 'MEDIUM',
  keywords_json TEXT NOT NULL DEFAULT '[]',
  structural_fingerprint TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  FOREIGN KEY (parent_question_id) REFERENCES questions_v3 (id) ON DELETE SET NULL
);

INSERT OR IGNORE INTO questions_v3 SELECT 
  id, source_type, exam_year, exam_round, question_number, parent_question_id,
  subject, category, sub_category, type, question_text, code_snippet, language,
  options_json, ground_truth_answer, official_explanation, ai_explanation,
  ai_variation_notes, difficulty, keywords_json, structural_fingerprint,
  created_at, updated_at
FROM questions;

DROP TABLE questions;

ALTER TABLE questions_v3 RENAME TO questions;

CREATE INDEX IF NOT EXISTS idx_questions_subject ON questions(subject);
CREATE INDEX IF NOT EXISTS idx_questions_source_type ON questions(source_type);
CREATE INDEX IF NOT EXISTS idx_questions_type ON questions(type);
CREATE INDEX IF NOT EXISTS idx_questions_difficulty ON questions(difficulty);
CREATE INDEX IF NOT EXISTS idx_questions_parent_id ON questions(parent_question_id);

PRAGMA foreign_keys=ON;
