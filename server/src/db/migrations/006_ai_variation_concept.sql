-- 006_ai_variation_concept.sql
-- Phase 6: AI 변형 문제 및 Staging 문항에 concept_id 컬럼 추가

ALTER TABLE staged_questions ADD COLUMN concept_id TEXT REFERENCES concepts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_staged_questions_concept_id ON staged_questions(concept_id);
