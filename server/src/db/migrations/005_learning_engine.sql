-- 005_learning_engine.sql
-- Phase 5: 학습 엔진 기반 - 개념(Concept) 도메인, 취약점 추적, 복습 상태 고도화

-- 1. 핵심 개념(Concept) 테이블 신설
CREATE TABLE IF NOT EXISTS concepts (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  definition TEXT NOT NULL,
  core_analogy TEXT,
  key_facts_json TEXT NOT NULL DEFAULT '[]',
  importance INTEGER NOT NULL DEFAULT 2,
  mnemonic_json TEXT,
  related_keywords_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_concepts_subject ON concepts(subject);
CREATE INDEX IF NOT EXISTS idx_concepts_category ON concepts(category);

-- 2. questions 테이블에 개념 ID, 힌트, 라인별 설명, 능동 회상 메타데이터 컬럼 추가
ALTER TABLE questions ADD COLUMN concept_id TEXT REFERENCES concepts(id) ON DELETE SET NULL;
ALTER TABLE questions ADD COLUMN hints_json TEXT DEFAULT '[]';
ALTER TABLE questions ADD COLUMN code_line_explanations_json TEXT;
ALTER TABLE questions ADD COLUMN active_recall_meta_json TEXT;

CREATE INDEX IF NOT EXISTS idx_questions_concept_id ON questions(concept_id);

-- 3. review_states 테이블에 행동 통계 및 취약도 컬럼 추가
ALTER TABLE review_states ADD COLUMN concept_id TEXT REFERENCES concepts(id) ON DELETE SET NULL;
ALTER TABLE review_states ADD COLUMN correct_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE review_states ADD COLUMN wrong_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE review_states ADD COLUMN unknown_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE review_states ADD COLUMN hint_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE review_states ADD COLUMN last_score REAL NOT NULL DEFAULT 0;
ALTER TABLE review_states ADD COLUMN weakness_score REAL NOT NULL DEFAULT 0;
ALTER TABLE review_states ADD COLUMN review_state TEXT NOT NULL DEFAULT 'NEW';

CREATE INDEX IF NOT EXISTS idx_review_states_concept_id ON review_states(concept_id);
CREATE INDEX IF NOT EXISTS idx_review_states_weakness ON review_states(weakness_score);
CREATE INDEX IF NOT EXISTS idx_review_states_state ON review_states(review_state);
