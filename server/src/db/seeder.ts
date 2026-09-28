import { Database } from 'better-sqlite3';
import { QuestionRepository } from './repositories/questionRepository';
import { ConceptRepository } from './repositories/conceptRepository';
import { SEED_QUESTIONS } from './fixtures/seedQuestions';

/** 테스트 DB 전용. 학습용 서버 시작 경로에서는 호출하지 않는다. */
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
