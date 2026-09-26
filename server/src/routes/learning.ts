import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Subject } from '@jungcheogi/shared';
import { ConceptRepository } from '../db/repositories/conceptRepository';
import { ReviewRepository } from '../db/repositories/reviewRepository';
import { QuestionRepository } from '../db/repositories/questionRepository';
import { AttemptRepository } from '../db/repositories/attemptRepository';

interface DueReviewQuery {
  subject?: Subject;
  limit?: string;
  excludeTestFixtures?: string;
}

interface ConceptsQuery {
  subject?: Subject;
}

interface ConceptParams {
  id: string;
}

interface QuestionParams {
  questionId: string;
}

export async function learningRoutes(fastify: FastifyInstance): Promise<void> {
  const conceptRepo = new ConceptRepository();
  const reviewRepo = new ReviewRepository();
  const questionRepo = new QuestionRepository();
  const attemptRepo = new AttemptRepository();

  // 1. 학습 대시보드 요약 (취약영역, 복습 큐, 숙련도 통계)
  fastify.get(
    '/api/learning/dashboard',
    async (
      request: FastifyRequest<{ Querystring: { excludeTestFixtures?: string } }>,
      reply: FastifyReply
    ) => {
      const excludeFixtures = request.query.excludeTestFixtures === 'true';
      const summary = reviewRepo.getDashboardSummary(excludeFixtures);
      return reply.status(200).send(summary);
    }
  );

  // 2. 취약 개념 목록 조회 (Weak Concepts)
  fastify.get(
    '/api/learning/weak-concepts',
    async (
      request: FastifyRequest<{ Querystring: { limit?: string } }>,
      reply: FastifyReply
    ) => {
      const limit = request.query.limit ? Number(request.query.limit) : 10;
      const weakConcepts = conceptRepo.findWeakConcepts(limit);
      return reply.status(200).send(weakConcepts);
    }
  );

  // 3. 전체 개념 목록 조회
  fastify.get(
    '/api/learning/concepts',
    async (
      request: FastifyRequest<{ Querystring: ConceptsQuery }>,
      reply: FastifyReply
    ) => {
      const { subject } = request.query;
      let concepts = subject
        ? conceptRepo.findBySubject(subject)
        : conceptRepo.findAll();

      if (concepts.length === 0) {
        conceptRepo.seedInitialConcepts();
        concepts = subject
          ? conceptRepo.findBySubject(subject)
          : conceptRepo.findAll();
      }

      return reply.status(200).send(concepts);
    }
  );

  // 4. 특정 개념 상세 및 소속 문제/이력 조회
  fastify.get(
    '/api/learning/concepts/:id',
    async (
      request: FastifyRequest<{ Params: ConceptParams }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;
      const concept = conceptRepo.findById(id);

      if (!concept) {
        return reply.status(404).send({
          error: 'Not Found',
          message: `개념 '${id}'을(를) 찾을 수 없습니다.`,
        });
      }

      const questions = questionRepo.findMany({ conceptId: id, limit: 50 }).items;
      return reply.status(200).send({
        concept,
        questions,
      });
    }
  );

  // 5. 오늘 복습 도래(Due) 문항 큐 조회
  fastify.get(
    '/api/learning/reviews/due',
    async (
      request: FastifyRequest<{ Querystring: DueReviewQuery }>,
      reply: FastifyReply
    ) => {
      const { subject, limit, excludeTestFixtures } = request.query;
      const items = reviewRepo.findDueReviews({
        subject,
        limit: limit ? Number(limit) : 20,
        excludeTestFixtures: excludeTestFixtures === 'true',
      });

      return reply.status(200).send({
        items,
        total: items.length,
      });
    }
  );

  // 6. 특정 문제의 복습 상태 및 과거 풀이 이력 조회
  fastify.get(
    '/api/learning/reviews/:questionId',
    async (
      request: FastifyRequest<{ Params: QuestionParams }>,
      reply: FastifyReply
    ) => {
      const { questionId } = request.params;
      const reviewState = reviewRepo.findByQuestionId(questionId);
      const attempts = attemptRepo.findByQuestionId(questionId);

      return reply.status(200).send({
        questionId,
        reviewState: reviewState || null,
        attempts,
      });
    }
  );
}
