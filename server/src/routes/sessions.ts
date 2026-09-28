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
  CodeLanguage,
  QuestionType,
  hasValidGroundTruth,
} from '@jungcheogi/shared';
import { SessionRepository } from '../db/repositories/sessionRepository';
import { AttemptRepository } from '../db/repositories/attemptRepository';
import { QuestionRepository } from '../db/repositories/questionRepository';
import { ReviewRepository } from '../db/repositories/reviewRepository';

interface SessionParams {
  id: string;
}

interface GradeBody {
  userAnswer: string | string[];
  groundTruthAnswer: string | string[];
  isUnknown?: boolean;
  questionType?: QuestionType;
  type?: QuestionType;
  language?: CodeLanguage;
  mode?: 'TERM' | 'NUMERIC_OUTPUT' | 'CODE_OUTPUT';
}

export async function sessionRoutes(fastify: FastifyInstance): Promise<void> {
  const sessionRepo = new SessionRepository();
  const attemptRepo = new AttemptRepository();
  const questionRepo = new QuestionRepository();
  const reviewRepo = new ReviewRepository();

  // 1. 학습 세션 생성 (지정된 과목/문항 수에 맞춘 문제 선별)
  fastify.post(
    '/api/sessions',
    async (request: FastifyRequest<{ Body: CreateSessionRequest }>, reply: FastifyReply) => {
      const { title, subject, count = 5, sourceType, questionIds: requestedIds } = request.body || {};

      let selected: Question[] = [];

      if (Array.isArray(requestedIds) && requestedIds.length > 0) {
        const uniqueIds = [...new Set(requestedIds.filter(Boolean))];
        for (const qId of uniqueIds) {
          const q = questionRepo.findById(qId);
          if (q) selected.push(q);
        }
      } else {
        selected = questionRepo.pickRandom(
          {
            subject: subject && subject !== 'ALL' ? (subject as any) : undefined,
            sourceType: sourceType ? (sourceType as any) : undefined,
          },
          Math.min(Math.max(count, 1), 30),
        );
      }

      if (selected.length === 0) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: '조건에 해당하는 문제가 없어 학습 세션을 생성할 수 없습니다.',
        });
      }

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

  const processSessionSubmission = (sessionId: string, body: SessionSubmitRequest) => {
    const {
      questionId,
      userAnswer,
      timeSpentMs = 0,
      isUnknown = false,
      hintUsed = false,
      solutionRevealed = false,
      recordOnly = false,
    } = body || {};

    const session = sessionRepo.findById(sessionId);
    if (!session) {
      return {
        status: 404,
        payload: {
          error: 'Not Found',
          message: `세션 '${sessionId}'을(를) 찾을 수 없습니다.`,
        },
      };
    }

    if (session.status !== 'ACTIVE') {
      return {
        status: 400,
        payload: {
          error: 'Bad Request',
          message: '이미 완료되었거나 중단된 학습 세션입니다.',
        },
      };
    }

    const question = questionRepo.findById(questionId);
    if (!question) {
      return {
        status: 404,
        payload: {
          error: 'Not Found',
          message: `문제 '${questionId}'을(를) 찾을 수 없습니다.`,
        },
      };
    }

    if (!hasValidGroundTruth(question.groundTruthAnswer)) {
      return {
        status: 422,
        payload: {
          error: 'UNGRADEABLE',
          failureReason: 'MISSING_ANSWER',
          message: '유효한 정답이 없어 채점할 수 없습니다. 다시 생성하거나 검수 대기열로 보내세요.',
        },
      };
    }

    if (!recordOnly) {
      const currentQuestionId = session.questionIds[session.currentIndex];
      if (questionId !== currentQuestionId) {
        return {
          status: 400,
          payload: {
            error: 'Bad Request',
            message: '현재 세션 진행 중인 문항만 제출할 수 있습니다.',
          },
        };
      }

      const alreadySubmitted = attemptRepo
        .findBySessionId(sessionId)
        .some((a) => a.questionId === questionId);
      if (alreadySubmitted) {
        return {
          status: 409,
          payload: {
            error: 'Conflict',
            message: '이미 제출한 문항입니다.',
          },
        };
      }
    }

    const grading = gradeAnswer(userAnswer, question.groundTruthAnswer, isUnknown, {
      questionType: question.type,
      language: question.language,
    });

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
    const reviewState = reviewRepo.recordAttempt(savedAttempt, question);

    const newCorrectCount = session.correctCount + (grading.isCorrect ? 1 : 0);
    const newUnknownCount = session.unknownCount + (isUnknown ? 1 : 0);
    const newWrongCount = session.wrongCount + (!grading.isCorrect && !isUnknown ? 1 : 0);
    const newTotalTimeMs = session.totalTimeSpentMs + timeSpentMs;

    let nextIndex = session.currentIndex;
    let isCompleted = false;
    let nextQuestionId: string | null = null;

    if (!recordOnly) {
      nextIndex = session.currentIndex + 1;
      isCompleted = nextIndex >= session.totalQuestions;
      nextQuestionId = isCompleted ? null : session.questionIds[nextIndex] || null;

      sessionRepo.update(sessionId, {
        currentIndex: nextIndex,
        correctCount: newCorrectCount,
        unknownCount: newUnknownCount,
        wrongCount: newWrongCount,
        totalTimeSpentMs: newTotalTimeMs,
        status: isCompleted ? 'COMPLETED' : 'ACTIVE',
        endedAt: isCompleted ? new Date().toISOString() : undefined,
      });
    }

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
      reviewState,
      sessionProgress: {
        currentIndex: recordOnly ? session.currentIndex : nextIndex,
        totalQuestions: session.totalQuestions,
        correctCount: recordOnly ? session.correctCount : newCorrectCount,
        wrongCount: recordOnly ? session.wrongCount : newWrongCount,
        unknownCount: recordOnly ? session.unknownCount : newUnknownCount,
      },
    };

    return { status: 200, payload: response };
  };

  // 3. 문제 답안 제출 및 스마트 채점
  fastify.post(
    '/api/sessions/:id/submit',
    async (
      request: FastifyRequest<{ Params: SessionParams; Body: SessionSubmitRequest }>,
      reply: FastifyReply
    ) => {
      const result = processSessionSubmission(request.params.id, request.body || {});
      return reply.status(result.status).send(result.payload);
    }
  );

  // 4. "모르겠음" 원클릭 포기 및 해설 열람
  fastify.post(
    '/api/sessions/:id/unknown',
    async (
      request: FastifyRequest<{
        Params: SessionParams;
        Body: { questionId: string; timeSpentMs?: number; hintUsed?: boolean; recordOnly?: boolean };
      }>,
      reply: FastifyReply
    ) => {
      const { questionId, timeSpentMs = 0, hintUsed = false, recordOnly = false } =
        request.body || {};
      const result = processSessionSubmission(request.params.id, {
        questionId,
        userAnswer: '(모름)',
        timeSpentMs,
        isUnknown: true,
        hintUsed,
        solutionRevealed: true,
        recordOnly,
      });
      return reply.status(result.status).send(result.payload);
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
      const {
        userAnswer,
        groundTruthAnswer,
        isUnknown = false,
        questionType,
        type,
        language,
        mode,
      } = request.body || {};

      if (!hasValidGroundTruth(groundTruthAnswer)) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: '유효한 기준 정답(groundTruthAnswer)이 없어 채점할 수 없습니다. 숫자 0은 허용됩니다.',
        });
      }

      const result = gradeAnswer(userAnswer, groundTruthAnswer, isUnknown, {
        questionType: questionType || type,
        language,
        mode,
      });
      return reply.status(200).send(result);
    }
  );
}
