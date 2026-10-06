import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  BugReportCreateRequest,
  BugReportCreateResponse,
} from "@jungcheogi/shared";
import { getBugReportService } from "../services/bugReportService.js";

export async function bugReportRoutes(fastify: FastifyInstance): Promise<void> {
  const service = getBugReportService();

  fastify.post(
    "/api/bug-reports",
    async (
      request: FastifyRequest<{ Body: BugReportCreateRequest }>,
      reply: FastifyReply,
    ) => {
      const body = request.body;
      if (!body) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "신고 데이터가 전송되지 않았습니다.",
        });
      }

      try {
        const clientIp =
          request.ip || request.socket.remoteAddress || "127.0.0.1";
        const result = service.createBugReport(body, clientIp);

        const response: BugReportCreateResponse = {
          success: true,
          bugReportId: result.bugReportId,
          message: "문제 신고가 성공적으로 접수되었습니다.",
        };

        return reply.status(201).send(response);
      } catch (err: any) {
        const message =
          err?.message || "버그 리포트 저장 중 오류가 발생했습니다.";
        const isClientError =
          message.includes("필수 입력") ||
          message.includes("올바르지 않은 신고") ||
          message.includes("최대") ||
          message.includes("Rate limit");

        return reply.status(isClientError ? 400 : 500).send({
          error: isClientError ? "Bad Request" : "Internal Server Error",
          message,
        });
      }
    },
  );
}

