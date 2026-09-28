-- 009_drop_staged_question_code_unique.sql
-- Staging 중복 검수(동일 question_code 재적재)를 막지 않도록 unique를 제거한다.

DROP INDEX IF EXISTS idx_staged_questions_question_code_unique;
