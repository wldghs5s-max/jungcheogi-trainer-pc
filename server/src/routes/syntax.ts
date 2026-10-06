import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { SyntaxTermRepository } from "../db/repositories/syntaxTermRepository.js";

export const syntaxRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const repo = new SyntaxTermRepository();

  // 1. 단일 문법 지식 상세 조회 (canonicalKey 기준, AI 0회 호출)
  app.get<{ Params: { canonicalKey: string } }>(
    "/api/syntax-terms/:canonicalKey",
    async (request, reply) => {
      const { canonicalKey } = request.params;
      if (!canonicalKey) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "canonicalKey 파라미터가 필요합니다.",
        });
      }

      const term = repo.findByCanonicalKey(canonicalKey);
      if (!term) {
        return reply.status(404).send({
          error: "Not Found",
          message: `문법 식별자 '${canonicalKey}'에 해당하는 지식을 찾을 수 없습니다.`,
        });
      }

      return reply.status(200).send(term);
    }
  );

  // 2. 언어별/전체 문법 지식 목록 조회 (AI 0회 호출)
  app.get<{ Querystring: { language?: string } }>(
    "/api/syntax-terms",
    async (request, reply) => {
      const { language } = request.query;
      if (language) {
        const terms = repo.findByLanguage(language);
        return reply.status(200).send(terms);
      }
      const allTerms = repo.findAll();
      return reply.status(200).send(allTerms);
    }
  );
};
