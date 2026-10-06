-- 012_syntax_terms.sql
-- 프로그래밍 문법 지식(Syntax Terms) 독립 학습 DB 스키마

CREATE TABLE IF NOT EXISTS syntax_terms (
  id TEXT PRIMARY KEY,
  language TEXT NOT NULL,
  canonical_key TEXT NOT NULL UNIQUE,
  term TEXT NOT NULL,
  display_token TEXT NOT NULL,
  term_type TEXT NOT NULL,
  short_description TEXT NOT NULL,
  syntax_pattern TEXT NOT NULL,
  how_it_works TEXT NOT NULL,
  example_code TEXT NOT NULL,
  detailed_explanation TEXT NOT NULL,
  common_mistakes TEXT NOT NULL,
  related_terms_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_syntax_terms_canonical_key ON syntax_terms(canonical_key);
CREATE INDEX IF NOT EXISTS idx_syntax_terms_language ON syntax_terms(language);

