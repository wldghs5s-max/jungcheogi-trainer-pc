-- 007_question_code.sql
-- 문항 사용자 식별용 코드 컬럼(question_code) 추가

ALTER TABLE questions ADD COLUMN question_code TEXT;
CREATE INDEX IF NOT EXISTS idx_questions_question_code ON questions(question_code);

ALTER TABLE staged_questions ADD COLUMN question_code TEXT;
CREATE INDEX IF NOT EXISTS idx_staged_questions_question_code ON staged_questions(question_code);
