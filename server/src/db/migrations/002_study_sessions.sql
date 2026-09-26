-- 002_study_sessions.sql
-- 학습 세션(StudySession) 관리 및 풀이 시도(Attempt) 세분화 필드 추가

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subject_filter TEXT,
  question_ids_json TEXT NOT NULL,
  current_index INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  total_questions INTEGER NOT NULL,
  correct_count INTEGER NOT NULL DEFAULT 0,
  wrong_count INTEGER NOT NULL DEFAULT 0,
  unknown_count INTEGER NOT NULL DEFAULT 0,
  total_time_spent_ms INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  ended_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);

-- Attempt 세부 행동 추적 컬럼 추가
ALTER TABLE attempts ADD COLUMN score REAL DEFAULT 0;
ALTER TABLE attempts ADD COLUMN time_spent_ms INTEGER DEFAULT 0;
ALTER TABLE attempts ADD COLUMN is_unknown INTEGER DEFAULT 0;
ALTER TABLE attempts ADD COLUMN hint_used INTEGER DEFAULT 0;
ALTER TABLE attempts ADD COLUMN solution_revealed INTEGER DEFAULT 0;
ALTER TABLE attempts ADD COLUMN feedback TEXT;
