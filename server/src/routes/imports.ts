import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  ParseImportRequest,
  UpdateStagedQuestionRequest,
  SetStagedStatusRequest,
  StagedReviewStatus,
} from '@jungcheogi/shared';
import { QuestionImportPipeline } from '../db/importers/importPipeline';
import { ImportBatchRepository } from '../db/repositories/importBatchRepository';
import { QuestionValidator } from '../db/importers/validator';

export async function importRoutes(fastify: FastifyInstance) {
  const pipeline = new QuestionImportPipeline();
  const batchRepo = new ImportBatchRepository();

  /**
   * 1. POST /api/imports/parse
   * 마크다운 또는 JSON 원본 데이터를 파싱하여 검증 및 중복 분석 후 Staging 배치 생성
   */
  fastify.post(
    '/api/imports/parse',
    async (
      request: FastifyRequest<{ Body: ParseImportRequest }>,
      reply: FastifyReply
    ) => {
      const { format, sourceName, sourceType, content } = request.body;

      if (!format || !content) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'format(MARKDOWN | JSON)과 content는 필수 입력 항목입니다.',
        });
      }

      try {
        const result = await pipeline.parseAndStage({
          format,
          sourceName: sourceName || `import_${Date.now()}`,
          sourceType,
          content,
        });

        return reply.status(201).send(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '파싱 실패';
        return reply.status(400).send({
          statusCode: 400,
          error: 'Parsing Error',
          message: msg,
        });
      }
    }
  );

  /**
   * 2. GET /api/imports/batches
   * 등록된 모든 Import 배치 목록 조회
   */
  fastify.get('/api/imports/batches', async (_request, reply) => {
    const batches = batchRepo.findAllBatches();
    return reply.status(200).send({ batches });
  });

  /**
   * 3. GET /api/imports/batches/:id
   * 특정 배치의 상세 정보 및 포함된 Staged 문항 목록 조회
   */
  fastify.get(
    '/api/imports/batches/:id',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;
      const batchData = batchRepo.findBatchById(id);

      if (!batchData) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `배치 ID '${id}'를 찾을 수 없습니다.`,
        });
      }

      return reply.status(200).send(batchData);
    }
  );

  /**
   * 4. PATCH /api/imports/questions/:stagedId
   * 검수자가 Staged 문항의 지문, 정답, 해설, 메타데이터 등을 직접 수정
   */
  fastify.patch(
    '/api/imports/questions/:stagedId',
    async (
      request: FastifyRequest<{
        Params: { stagedId: string };
        Body: UpdateStagedQuestionRequest;
      }>,
      reply: FastifyReply
    ) => {
      const { stagedId } = request.params;
      const current = batchRepo.findStagedById(stagedId);

      if (!current) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Staged 문항 '${stagedId}'를 찾을 수 없습니다.`,
        });
      }

      // 수정 필드 적용 및 재검증
      const updated = batchRepo.updateStagedQuestion(stagedId, request.body);
      if (!updated) {
        return reply.status(500).send({ message: '업데이트 실패' });
      }

      // 재검증 후 validationIssues 업데이트
      const valResult = QuestionValidator.validate({
        questionText: updated.questionText,
        extractedAnswer: updated.groundTruthAnswer,
        subject: updated.subject,
        type: updated.type,
        codeSnippet: updated.codeSnippet,
        sourceType: updated.sourceType,
        examYear: updated.examYear,
        examRound: updated.examRound,
        questionNumber: updated.questionNumber,
        parentQuestionId: updated.parentQuestionId,
      });

      const reValidated = batchRepo.updateStagedQuestion(stagedId, {
        validationIssues: valResult.issues,
      });

      return reply.status(200).send({ stagedQuestion: reValidated });
    }
  );

  /**
   * 5. POST /api/imports/questions/:stagedId/status
   * 개별 문항 검수 상태 변경 (APPROVED | REJECTED | PENDING)
   */
  fastify.post(
    '/api/imports/questions/:stagedId/status',
    async (
      request: FastifyRequest<{
        Params: { stagedId: string };
        Body: SetStagedStatusRequest;
      }>,
      reply: FastifyReply
    ) => {
      const { stagedId } = request.params;
      const { reviewStatus, reviewerNotes } = request.body;

      if (!['APPROVED', 'REJECTED', 'PENDING'].includes(reviewStatus)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: '유효한 상태는 APPROVED, REJECTED, PENDING 중 하나입니다.',
        });
      }

      const updated = batchRepo.setStagedReviewStatus(
        stagedId,
        reviewStatus as StagedReviewStatus,
        reviewerNotes
      );

      if (!updated) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Staged 문항 '${stagedId}'를 찾을 수 없습니다.`,
        });
      }

      const batchData = batchRepo.findBatchById(updated.batchId);

      return reply.status(200).send({
        stagedQuestion: updated,
        batch: batchData?.batch,
      });
    }
  );

  /**
   * 6. POST /api/imports/batches/:id/approve-all
   * 배치 내 에러가 없는 모든 문항 일괄 승인
   */
  fastify.post(
    '/api/imports/batches/:id/approve-all',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;
      const batchData = batchRepo.findBatchById(id);

      if (!batchData) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `배치 ID '${id}'를 찾을 수 없습니다.`,
        });
      }

      batchRepo.bulkSetReviewStatus(id, 'APPROVED');
      const refreshed = batchRepo.findBatchById(id);

      return reply.status(200).send(refreshed);
    }
  );

  /**
   * 7. POST /api/imports/batches/:id/commit
   * 승인(APPROVED)된 문항들을 실제 live questions DB로 원자적 Commit
   */
  fastify.post(
    '/api/imports/batches/:id/commit',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;

      try {
        const result = pipeline.commit(id);
        const batchData = batchRepo.findBatchById(id);

        return reply.status(200).send({
          ...result,
          batch: batchData?.batch,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : '커밋 실패';
        return reply.status(400).send({
          statusCode: 400,
          error: 'Commit Error',
          message: msg,
        });
      }
    }
  );

  /**
   * 8. DELETE /api/imports/batches/:id
   * 검수 배치 및 포함된 Staged 문항 삭제 (기존 questions 테이블 보존)
   */
  fastify.delete(
    '/api/imports/batches/:id',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;
      batchRepo.deleteBatch(id);
      return reply.status(200).send({ success: true, deletedBatchId: id });
    }
  );
}
