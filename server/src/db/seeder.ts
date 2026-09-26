import { Database } from 'better-sqlite3';
import { QuestionRepository } from './repositories/questionRepository';
import { SEED_QUESTIONS } from './fixtures/seedQuestions';

export function seedFixtureQuestions(customDb?: Database): {
  insertedCount: number;
  totalCount: number;
} {
  const repo = new QuestionRepository(customDb);
  const result = repo.bulkInsert(SEED_QUESTIONS);
  const total = repo.count();

  return {
    insertedCount: result.insertedCount,
    totalCount: total,
  };
}
