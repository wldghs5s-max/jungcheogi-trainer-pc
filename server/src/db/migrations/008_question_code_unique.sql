-- 008_question_code_unique.sql
-- Live questions의 question_code 중복만 방지한다.
-- Staging은 동일 기출 재Import 중복 검수를 위해 같은 코드를 여러 행에 둘 수 있다.

CREATE UNIQUE INDEX IF NOT EXISTS idx_questions_question_code_unique
  ON questions(question_code)
  WHERE question_code IS NOT NULL AND question_code != '';
