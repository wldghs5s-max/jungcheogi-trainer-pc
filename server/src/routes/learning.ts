import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  Subject,
  DailySessionRequest,
  DrillSessionRequest,
  VariationType,
} from '@jungcheogi/shared';
import { ConceptRepository } from '../db/repositories/conceptRepository';
import { ReviewRepository } from '../db/repositories/reviewRepository';
import { QuestionRepository } from '../db/repositories/questionRepository';
import { AttemptRepository } from '../db/repositories/attemptRepository';
import { RecommendationEngine } from '../engine/recommendationEngine';
import { MockQuestionVariationGenerator } from '../engine/variationGenerator';

interface RecommendationsQuery {
  limit?: string;
  conceptId?: string;
  subject?: Subject;
  includeNew?: string;
  includeDue?: string;
  excludeTestFixtures?: string;
}

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
  const recommendationEngine = new RecommendationEngine();
  const variationGenerator = new MockQuestionVariationGenerator();

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

  // 7. 개인화 추천 문제 목록 조회 (설명 가능한 RecommendationScore & reasonCodes)
  fastify.get(
    '/api/learning/recommendations',
    async (
      request: FastifyRequest<{ Querystring: RecommendationsQuery }>,
      reply: FastifyReply
    ) => {
      const {
        limit,
        conceptId,
        subject,
        includeNew,
        includeDue,
        excludeTestFixtures,
      } = request.query;

      const items = recommendationEngine.getRecommendations({
        limit: limit ? Number(limit) : 10,
        conceptId: conceptId || undefined,
        subject: subject || undefined,
        includeNew: includeNew !== 'false',
        includeDue: includeDue !== 'false',
        excludeTestFixtures: excludeTestFixtures === 'true',
      });

      const questions = items.map((it) => ({
        questionId: it.question.id,
        recommendationScore: it.score.totalScore,
        reasonCodes: it.score.reasonCodes,
        conceptId: it.question.conceptId,
        reviewState: it.reviewState,
        sourceType: it.question.sourceType,
      }));

      return reply.status(200).send({
        items,
        questions,
        total: items.length,
      });
    }
  );

  // 8. 오늘의 학습 큐 요약 통계 (복습 예정, 취약 개념, 최근 오답, 신규 문항)
  fastify.get(
    '/api/learning/daily-queue',
    async (
      request: FastifyRequest<{ Querystring: { excludeTestFixtures?: string } }>,
      reply: FastifyReply
    ) => {
      const excludeFixtures = request.query.excludeTestFixtures === 'true';
      const summary = recommendationEngine.getDailyQueueSummary(excludeFixtures);
      return reply.status(200).send(summary);
    }
  );

  // 9. 오늘의 학습 자동 추천 세션 생성
  fastify.post(
    '/api/learning/daily-session',
    async (
      request: FastifyRequest<{ Body: DailySessionRequest }>,
      reply: FastifyReply
    ) => {
      try {
        const result = recommendationEngine.createDailySession(request.body || {});
        return reply.status(201).send(result);
      } catch (err: any) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: err.message || '오늘의 학습 세션 생성에 실패했습니다.',
        });
      }
    }
  );

  // 10. 취약 개념 집중 드릴 (Concept Drill) 세션 생성
  fastify.post(
    '/api/learning/drill',
    async (
      request: FastifyRequest<{ Body: DrillSessionRequest }>,
      reply: FastifyReply
    ) => {
      const { conceptId, count, title } = request.body || {};
      if (!conceptId) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: '드릴 세션을 생성할 conceptId가 필요합니다.',
        });
      }

      try {
        const result = recommendationEngine.createConceptDrillSession({
          conceptId,
          count: count ? Number(count) : 5,
          title,
        });
        return reply.status(201).send(result);
      } catch (err: any) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: err.message || '개념 드릴 세션 생성에 실패했습니다.',
        });
      }
    }
  );

  // 11. AI 변형 문제 Mock 생성 및 Staging 검수 등록 (Live DB 절대 직접 커밋 금지)
  fastify.post(
    '/api/learning/variations/generate-mock',
    async (
      request: FastifyRequest<{
        Body: {
          questionId: string;
          variationType?: VariationType;
          autoStage?: boolean;
        };
      }>,
      reply: FastifyReply
    ) => {
      const { questionId, variationType, autoStage = true } = request.body || {};
      if (!questionId) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: '변형 문제를 생성할 questionId가 필요합니다.',
        });
      }

      const question = questionRepo.findById(questionId);
      if (!question) {
        return reply.status(404).send({
          error: 'Not Found',
          message: `문제 '${questionId}'을(를) 찾을 수 없습니다.`,
        });
      }

      const variation = await variationGenerator.generateVariation(question, {
        variationType,
      });

      let stageResult: any = null;
      if (autoStage) {
        stageResult = await variationGenerator.stageVariation(variation);
      }

      return reply.status(201).send({
        variation,
        batchId: stageResult?.batchId,
        stagedQuestion: stageResult?.stagedQuestion,
      });
    }
  );
}
