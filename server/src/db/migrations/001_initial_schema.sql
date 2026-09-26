-- 001_initial_schema.sql
-- 정처기 실기 PC 집중학습 플랫폼 초기 스키마

CREATE TABLE IF NOT EXISTS questions (
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
  FOREIGN KEY (parent_question_id) REFERENCES questions (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_questions_subject ON questions(subject);
CREATE INDEX IF NOT EXISTS idx_questions_source_type ON questions(source_type);
CREATE INDEX IF NOT EXISTS idx_questions_type ON questions(type);
CREATE INDEX IF NOT EXISTS idx_questions_difficulty ON questions(difficulty);
CREATE INDEX IF NOT EXISTS idx_questions_parent_id ON questions(parent_question_id);

CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL,
  session_id TEXT,
  user_answer TEXT NOT NULL,
  is_correct INTEGER NOT NULL,
  score REAL DEFAULT 0,
  time_spent_ms INTEGER NOT NULL DEFAULT 0,
  ai_feedback TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (question_id) REFERENCES questions (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_attempts_question_id ON attempts(question_id);
CREATE INDEX IF NOT EXISTS idx_attempts_created_at ON attempts(created_at);

CREATE TABLE IF NOT EXISTS review_states (
  question_id TEXT PRIMARY KEY,
  box_level INTEGER NOT NULL DEFAULT 1,
  ease_factor REAL NOT NULL DEFAULT 2.5,
  interval_days INTEGER NOT NULL DEFAULT 1,
  repetitions INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  last_studied_at TEXT,
  next_review_at TEXT NOT NULL,
  FOREIGN KEY (question_id) REFERENCES questions (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_review_states_next_review ON review_states(next_review_at);

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
