import { Database } from 'better-sqlite3';
import { QuestionRepository } from './repositories/questionRepository';
import { ConceptRepository } from './repositories/conceptRepository';
import { SEED_QUESTIONS } from './fixtures/seedQuestions';

export function seedFixtureQuestions(customDb?: Database): {
  insertedCount: number;
  totalCount: number;
} {
  // 1. Seed initial concepts first so foreign key references resolve
  const conceptRepo = new ConceptRepository(customDb);
  conceptRepo.seedInitialConcepts();

  // 2. Seed fixture questions
  const repo = new QuestionRepository(customDb);
  const result = repo.bulkInsert(SEED_QUESTIONS);
  const total = repo.count();

  return {
    insertedCount: result.insertedCount,
    totalCount: total,
  };
}
