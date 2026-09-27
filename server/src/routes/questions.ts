import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  Question,
  QuestionFilter,
  QuestionDetailResponse,
  Subject,
  QuestionType,
  Difficulty,
  QuestionSourceType,
} from '@jungcheogi/shared';
import { QuestionRepository } from '../db/repositories/questionRepository';

interface GetQuestionsQuery {
  subject?: Subject;
  type?: QuestionType;
  difficulty?: Difficulty;
  sourceType?: QuestionSourceType;
  parentQuestionId?: string;
  conceptId?: string;
  examYear?: string;
  examRound?: string;
  search?: string;
  limit?: string;
  offset?: string;
}

interface QuestionParams {
  id: string;
}

export async function questionRoutes(fastify: FastifyInstance): Promise<void> {
  const repo = new QuestionRepository();

  // 1. 목록 조회 (필터링, 검색, 페이지네이션)
  fastify.get('/api/questions', async (request: FastifyRequest<{ Querystring: GetQuestionsQuery }>, reply: FastifyReply) => {
    const q = request.query;

    const filter: QuestionFilter = {
      subject: q.subject,
      type: q.type,
      difficulty: q.difficulty,
      sourceType: q.sourceType,
      parentQuestionId: q.parentQuestionId,
      conceptId: q.conceptId,
      examYear: q.examYear ? parseInt(q.examYear, 10) : undefined,
      examRound: q.examRound ? parseInt(q.examRound, 10) : undefined,
      search: q.search,
      limit: q.limit ? parseInt(q.limit, 10) : 20,
      offset: q.offset ? parseInt(q.offset, 10) : 0,
    };

    const result = repo.findMany(filter);
    return reply.status(200).send(result);
  });

  // 2. 단건 상세 조회 (AI 변형 문제 및 원본 부모 문제 관계 포함)
  fastify.get('/api/questions/:id', async (request: FastifyRequest<{ Params: QuestionParams }>, reply: FastifyReply) => {
    const { id } = request.params;
    const question = repo.findById(id);

    if (!question) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `ID가 '${id}'인 문제를 찾을 수 없습니다.`,
      });
    }

    // 파생된 AI 변형 문제 목록 조회
    const variations = repo.findVariations(id);

    // 자신이 변형 문제인 경우 부모 원본 문제 요약 조회
    let parentQuestion: Question | null = null;
    if (question.parentQuestionId) {
      parentQuestion = repo.findById(question.parentQuestionId);
    }

    const response: QuestionDetailResponse = {
      question,
      variations,
      parentQuestion,
    };

    return reply.status(200).send(response);
  });

  // 3. 문제 신규 등록 (Ground Truth 및 필수 항목 검증)
  fastify.post('/api/questions', async (request: FastifyRequest<{ Body: Partial<Question> }>, reply: FastifyReply) => {
    const body = request.body;

    if (!body.question || !body.question.trim()) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: '문제 지문(question)은 필수입니다.',
      });
    }

    if (body.groundTruthAnswer === undefined || body.groundTruthAnswer === null) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: '공식 정답(groundTruthAnswer)은 필수입니다.',
      });
    }

    if (!body.subject) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: '과목(subject)은 필수입니다.',
      });
    }

    const id = body.id || `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const newQuestion: Question = {
      id,
      sourceType: body.sourceType || 'USER_IMPORTED',
      examYear: body.examYear,
      examRound: body.examRound,
      questionNumber: body.questionNumber,
      parentQuestionId: body.parentQuestionId,
      subject: body.subject,
      category: body.category || '기타',
      subCategory: body.subCategory,
      type: body.type || 'SHORT_ANSWER',
      question: body.question,
      code: body.code,
      language: body.language,
      options: body.options,
      groundTruthAnswer: body.groundTruthAnswer,
      officialExplanation: body.officialExplanation,
      aiExplanation: body.aiExplanation,
      aiVariationNotes: body.aiVariationNotes,
      difficulty: body.difficulty || 'MEDIUM',
      keywords: body.keywords || [],
      createdAt: new Date().toISOString(),
    };

    const created = repo.create(newQuestion);
    return reply.status(201).send(created);
  });

  // 4. 문제 수정 (Ground Truth 보호)
  fastify.put('/api/questions/:id', async (request: FastifyRequest<{ Params: QuestionParams; Body: Partial<Question> }>, reply: FastifyReply) => {
    const { id } = request.params;
    const body = request.body;

    const updated = repo.update(id, body);
    if (!updated) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `수정할 문제(ID: '${id}')가 존재하지 않습니다.`,
      });
    }

    return reply.status(200).send(updated);
  });

  // 5. 문제 삭제
  fastify.delete('/api/questions/:id', async (request: FastifyRequest<{ Params: QuestionParams }>, reply: FastifyReply) => {
    const { id } = request.params;
    const success = repo.delete(id);

    if (!success) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `삭제할 문제(ID: '${id}')가 존재하지 않습니다.`,
      });
    }

    return reply.status(200).send({ success: true, id });
  });

  // 6. 특정 문제의 AI 변형 문제 목록 조회
  fastify.get('/api/questions/:id/variations', async (request: FastifyRequest<{ Params: QuestionParams }>, reply: FastifyReply) => {
    const { id } = request.params;
    const variations = repo.findVariations(id);
    return reply.status(200).send({ parentQuestionId: id, variations, count: variations.length });
  });
}
