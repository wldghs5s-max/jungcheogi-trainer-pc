-- 004_import_staging.sql
-- 문제 데이터 검수 및 Import 파이프라인 Staging 스키마

CREATE TABLE IF NOT EXISTS import_batches (
  id TEXT PRIMARY KEY,
  source_name TEXT NOT NULL,
  format TEXT NOT NULL,
  source_type TEXT NOT NULL,
  total_count INTEGER NOT NULL DEFAULT 0,
  pending_count INTEGER NOT NULL DEFAULT 0,
  approved_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  committed_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
  created_at TEXT NOT NULL,
  committed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_import_batches_status ON import_batches(status);
CREATE INDEX IF NOT EXISTS idx_import_batches_created_at ON import_batches(created_at);

CREATE TABLE IF NOT EXISTS staged_questions (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  index_in_batch INTEGER NOT NULL,
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
  duplicate_status TEXT NOT NULL DEFAULT 'NEW',
  duplicate_question_id TEXT,
  duplicate_similarity REAL DEFAULT 0,
  validation_issues_json TEXT NOT NULL DEFAULT '[]',
  review_status TEXT NOT NULL DEFAULT 'PENDING',
  reviewer_notes TEXT,
  reviewed_at TEXT,
  committed_question_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  FOREIGN KEY (batch_id) REFERENCES import_batches (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_staged_questions_batch_id ON staged_questions(batch_id);
CREATE INDEX IF NOT EXISTS idx_staged_questions_review_status ON staged_questions(review_status);
CREATE INDEX IF NOT EXISTS idx_staged_questions_fingerprint ON staged_questions(structural_fingerprint);
