-- 010_study_visibility.sql
-- 임시 AI 드릴 문항을 일반 문제집·랜덤 학습·추천에서 제외하기 위한 가시성 컬럼

ALTER TABLE questions ADD COLUMN study_visibility TEXT NOT NULL DEFAULT 'LIVE';
CREATE INDEX IF NOT EXISTS idx_questions_study_visibility ON questions(study_visibility);
