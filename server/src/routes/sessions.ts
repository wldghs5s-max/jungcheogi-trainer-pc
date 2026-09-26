import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  StudySession,
  QuizAttempt,
  CreateSessionRequest,
  SessionSubmitRequest,
  SessionSubmitResponse,
  SessionSummaryResponse,
  gradeAnswer,
  Question,
  MissType,
} from '@jungcheogi/shared';
import { SessionRepository } from '../db/repositories/sessionRepository';
import { AttemptRepository } from '../db/repositories/attemptRepository';
import { QuestionRepository } from '../db/repositories/questionRepository';

interface SessionParams {
  id: string;
}

interface GradeBody {
  userAnswer: string | string[];
  groundTruthAnswer: string | string[];
  isUnknown?: boolean;
}

export async function sessionRoutes(fastify: FastifyInstance): Promise<void> {
  const sessionRepo = new SessionRepository();
  const attemptRepo = new AttemptRepository();
  const questionRepo = new QuestionRepository();

  // 1. 학습 세션 생성 (지정된 과목/문항 수에 맞춘 문제 선별)
  fastify.post(
    '/api/sessions',
    async (request: FastifyRequest<{ Body: CreateSessionRequest }>, reply: FastifyReply) => {
      const { title, subject, count = 5, sourceType } = request.body || {};

      const filterResult = questionRepo.findMany({
        subject: subject && subject !== 'ALL' ? (subject as any) : undefined,
        sourceType: sourceType ? (sourceType as any) : undefined,
        limit: Math.min(Math.max(count, 1), 30),
      });

      if (filterResult.items.length === 0) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: '조건에 해당하는 문제가 없어 학습 세션을 생성할 수 없습니다.',
        });
      }

      // 무작위 셔플
      const shuffled = [...filterResult.items].sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, count);
      const questionIds = selected.map((q) => q.id);

      const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const sessionTitle =
        title || `${subject && subject !== 'ALL' ? subject : '전과목'} 집중 학습 세션 (${selected.length}제)`;

      const newSession: StudySession = {
        id: sessionId,
        title: sessionTitle,
        subjectFilter: subject || 'ALL',
        questionIds,
        currentIndex: 0,
        status: 'ACTIVE',
        totalQuestions: selected.length,
        correctCount: 0,
        wrongCount: 0,
        unknownCount: 0,
        totalTimeSpentMs: 0,
        startedAt: new Date().toISOString(),
      };

      const created = sessionRepo.create(newSession);
      const firstQuestion = selected[0];

      return reply.status(201).send({
        session: created,
        firstQuestion,
      });
    }
  );

  // 2. 학습 세션 상태 및 현재 진행 문제 조회
  fastify.get(
    '/api/sessions/:id',
    async (request: FastifyRequest<{ Params: SessionParams }>, reply: FastifyReply) => {
      const { id } = request.params;
      const session = sessionRepo.findById(id);

      if (!session) {
        return reply.status(404).send({
          error: 'Not Found',
          message: `세션 '${id}'을(를) 찾을 수 없습니다.`,
        });
      }

      let currentQuestion: Question | null = null;
      if (session.status === 'ACTIVE' && session.currentIndex < session.questionIds.length) {
        const qId = session.questionIds[session.currentIndex];
        currentQuestion = questionRepo.findById(qId);
      }

      const attempts = attemptRepo.findBySessionId(id);

      return reply.status(200).send({
        session,
        currentQuestion,
        attempts,
      });
    }
  );

  // 3. 문제 답안 제출 및 스마트 채점
  fastify.post(
    '/api/sessions/:id/submit',
    async (
      request: FastifyRequest<{ Params: SessionParams; Body: SessionSubmitRequest }>,
      reply: FastifyReply
    ) => {
      const { id: sessionId } = request.params;
      const {
        questionId,
        userAnswer,
        timeSpentMs = 0,
        isUnknown = false,
        hintUsed = false,
        solutionRevealed = false,
      } = request.body || {};

      const session = sessionRepo.findById(sessionId);
      if (!session) {
        return reply.status(404).send({
          error: 'Not Found',
          message: `세션 '${sessionId}'을(를) 찾을 수 없습니다.`,
        });
      }

      if (session.status !== 'ACTIVE') {
        return reply.status(400).send({
          error: 'Bad Request',
          message: '이미 완료되었거나 중단된 학습 세션입니다.',
        });
      }

      const question = questionRepo.findById(questionId);
      if (!question) {
        return reply.status(404).send({
          error: 'Not Found',
          message: `문제 '${questionId}'을(를) 찾을 수 없습니다.`,
        });
      }

      // 스마트 채점 수행 (모바일 검증 로직 기반 정규화 + 동의어 + 퍼지 매칭)
      const grading = gradeAnswer(userAnswer, question.groundTruthAnswer, isUnknown);

      let missType: MissType | undefined;
      if (!grading.isCorrect) {
        missType = isUnknown ? 'UNKNOWN' : 'WRONG';
      }

      const attemptId = `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const attempt: QuizAttempt = {
        id: attemptId,
        questionId,
        sessionId,
        userAnswer,
        isCorrect: grading.isCorrect,
        score: grading.score,
        missType,
        timeSpentMs,
        isUnknown: Boolean(isUnknown),
        hintUsed: Boolean(hintUsed),
        solutionRevealed: Boolean(solutionRevealed),
        feedback: grading.feedback,
        createdAt: new Date().toISOString(),
      };

      const savedAttempt = attemptRepo.create(attempt);

      // 세션 상태 및 카운터 업데이트
      const nextIndex = session.currentIndex + 1;
      const isCompleted = nextIndex >= session.totalQuestions;

      const newCorrectCount = session.correctCount + (grading.isCorrect ? 1 : 0);
      const newUnknownCount = session.unknownCount + (isUnknown ? 1 : 0);
      const newWrongCount = session.wrongCount + (!grading.isCorrect && !isUnknown ? 1 : 0);
      const newTotalTimeMs = session.totalTimeSpentMs + timeSpentMs;

      sessionRepo.update(sessionId, {
        currentIndex: nextIndex,
        correctCount: newCorrectCount,
        unknownCount: newUnknownCount,
        wrongCount: newWrongCount,
        totalTimeSpentMs: newTotalTimeMs,
        status: isCompleted ? 'COMPLETED' : 'ACTIVE',
        endedAt: isCompleted ? new Date().toISOString() : undefined,
      });

      const nextQuestionId = isCompleted ? null : session.questionIds[nextIndex] || null;

      const response: SessionSubmitResponse = {
        attempt: savedAttempt,
        isCorrect: grading.isCorrect,
        score: grading.score,
        feedback: grading.feedback,
        groundTruthAnswer: question.groundTruthAnswer,
        officialExplanation: question.officialExplanation,
        aiExplanation: question.aiExplanation,
        aiVariationNotes: question.aiVariationNotes,
        isSessionCompleted: isCompleted,
        nextQuestionId,
        sessionProgress: {
          currentIndex: nextIndex,
          totalQuestions: session.totalQuestions,
          correctCount: newCorrectCount,
          wrongCount: newWrongCount,
          unknownCount: newUnknownCount,
        },
      };

      return reply.status(200).send(response);
    }
  );

  // 4. "모르겠음" 원클릭 포기 및 해설 열람
  fastify.post(
    '/api/sessions/:id/unknown',
    async (
      request: FastifyRequest<{
        Params: SessionParams;
        Body: { questionId: string; timeSpentMs?: number; hintUsed?: boolean };
      }>,
      reply: FastifyReply
    ) => {
      const { id: sessionId } = request.params;
      const { questionId, timeSpentMs = 0, hintUsed = false } = request.body || {};

      // 3번 submit 로직을 isUnknown=true로 호출
      const submitReq: SessionSubmitRequest = {
        questionId,
        userAnswer: '(모름)',
        timeSpentMs,
        isUnknown: true,
        hintUsed,
        solutionRevealed: true,
      };

      // 내부 재호출
      return fastify.inject({
        method: 'POST',
        url: `/api/sessions/${sessionId}/submit`,
        payload: submitReq,
      }).then((res) => {
        return reply.status(res.statusCode).send(JSON.parse(res.body));
      });
    }
  );

  // 5. 학습 세션 완료 결과 요약 리포트
  fastify.get(
    '/api/sessions/:id/summary',
    async (request: FastifyRequest<{ Params: SessionParams }>, reply: FastifyReply) => {
      const { id } = request.params;
      const session = sessionRepo.findById(id);

      if (!session) {
        return reply.status(404).send({
          error: 'Not Found',
          message: `세션 '${id}'을(를) 찾을 수 없습니다.`,
        });
      }

      const attempts = attemptRepo.findBySessionId(id);
      const questions: Question[] = [];
      for (const qId of session.questionIds) {
        const q = questionRepo.findById(qId);
        if (q) questions.push(q);
      }

      const accuracyRate =
        session.totalQuestions > 0
          ? Math.round((session.correctCount / session.totalQuestions) * 100)
          : 0;

      const averageTimeSpentSeconds =
        session.totalQuestions > 0
          ? Math.round(session.totalTimeSpentMs / session.totalQuestions / 1000)
          : 0;

      const summary: SessionSummaryResponse = {
        session,
        attempts,
        questions,
        accuracyRate,
        averageTimeSpentSeconds,
      };

      return reply.status(200).send(summary);
    }
  );

  // 6. 독립 채점 API (단위 테스트 및 실시간 프론트엔드 프리뷰 지원)
  fastify.post(
    '/api/grade',
    async (request: FastifyRequest<{ Body: GradeBody }>, reply: FastifyReply) => {
      const { userAnswer, groundTruthAnswer, isUnknown = false } = request.body || {};

      if (groundTruthAnswer === undefined || groundTruthAnswer === null) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: '기준 정답(groundTruthAnswer)은 필수입니다.',
        });
      }

      const result = gradeAnswer(userAnswer, groundTruthAnswer, isUnknown);
      return reply.status(200).send(result);
    }
  );
}
