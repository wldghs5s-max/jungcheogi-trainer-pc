-- 011_code_explanations.sql: 문제 단위 전체 코드 줄별 해설 패키지 캐시 테이블
CREATE TABLE IF NOT EXISTS question_code_explanations (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  prompt_version INTEGER NOT NULL DEFAULT 1,
  model TEXT NOT NULL,
  status TEXT NOT NULL, -- 'READY', 'FAILED'
  explanation_payload TEXT NOT NULL, -- JSON string of { lines: AICodeLineResponse[] }
  generated_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(question_id, code_hash, prompt_version)
);

CREATE INDEX IF NOT EXISTS idx_code_exp_lookup 
  ON question_code_explanations(question_id, code_hash, prompt_version);

