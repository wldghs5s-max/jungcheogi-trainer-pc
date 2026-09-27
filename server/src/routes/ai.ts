import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  AITutoringExplanationRequest,
  AITutoringExplanationResponse,
  AIProgressiveHintsRequest,
  AIProgressiveHintsResponse,
  AICodeLineRequest,
  AICodeLineResponse,
  AIGeminiVariationRequest,
  AIGeminiVariationResponse,
  AIBatchGenerateRequest,
  AIBatchGenerateResponse,
  LearningDomainsResponse,
  GeneratedVariation,
  VariationType,
  Question,
} from "@jungcheogi/shared";
import { QuestionRepository } from "../db/repositories/questionRepository.js";
import { ConceptRepository } from "../db/repositories/conceptRepository.js";
import { ImportBatchRepository } from "../db/repositories/importBatchRepository.js";
import { getDatabase } from "../db/database.js";
import { getAIService } from "../engine/aiService.js";
import { MockQuestionVariationGenerator } from "../engine/variationGenerator.js";

export async function aiRoutes(fastify: FastifyInstance): Promise<void> {
  const questionRepo = new QuestionRepository();
  const conceptRepo = new ConceptRepository();
  const aiService = getAIService();
  const variationStager = new MockQuestionVariationGenerator();

  // 1. 문제별 AI 맞춤 해설 생성
  fastify.post(
    "/api/ai/explanation",
    async (
      request: FastifyRequest<{ Body: AITutoringExplanationRequest }>,
      reply: FastifyReply,
    ) => {
      const { questionId, userAnswer, isCorrect, isUnknown, deepAnalysis } =
        request.body || {};

      if (!questionId) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "questionId는 필수 파라미터입니다.",
        });
      }

      const question = questionRepo.findById(questionId);
      if (!question) {
        return reply.status(404).send({
          error: "Not Found",
          message: `ID가 '${questionId}'인 문제를 찾을 수 없습니다.`,
        });
      }

      const concept = question.conceptId
        ? conceptRepo.findById(question.conceptId)
        : null;

      const result: AITutoringExplanationResponse =
        await aiService.generateExplanation({
          question,
          concept,
          userAnswer,
          isCorrect,
          isUnknown,
          deepAnalysis,
        });

      return reply.status(200).send(result);
    },
  );

  // 2. 3단계 점진적 AI 힌트 (Active Recall)
  fastify.post(
    "/api/ai/hints",
    async (
      request: FastifyRequest<{ Body: AIProgressiveHintsRequest }>,
      reply: FastifyReply,
    ) => {
      const { questionId, deepAnalysis } = request.body || {};

      if (!questionId) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "questionId는 필수 파라미터입니다.",
        });
      }

      const question = questionRepo.findById(questionId);
      if (!question) {
        return reply.status(404).send({
          error: "Not Found",
          message: `ID가 '${questionId}'인 문제를 찾을 수 없습니다.`,
        });
      }

      const concept = question.conceptId
        ? conceptRepo.findById(question.conceptId)
        : null;

      const result: AIProgressiveHintsResponse =
        await aiService.generateProgressiveHints({
          question,
          concept,
          deepAnalysis,
        });

      return reply.status(200).send(result);
    },
  );

  // 3. 코드 라인별 심층 해부 (Line-by-Line Anatomy)
  fastify.post(
    "/api/ai/code-line",
    async (
      request: FastifyRequest<{ Body: AICodeLineRequest }>,
      reply: FastifyReply,
    ) => {
      const { questionId, lineNumber, deepAnalysis } = request.body || {};

      if (!questionId || !lineNumber) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "questionId와 lineNumber는 필수 파라미터입니다.",
        });
      }

      const question = questionRepo.findById(questionId);
      if (!question) {
        return reply.status(404).send({
          error: "Not Found",
          message: `ID가 '${questionId}'인 문제를 찾을 수 없습니다.`,
        });
      }

      if (!question.code) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "해당 문제는 코드가 포함되어 있지 않습니다.",
        });
      }

      const concept = question.conceptId
        ? conceptRepo.findById(question.conceptId)
        : null;

      const result: AICodeLineResponse = await aiService.explainCodeLine({
        question,
        concept,
        lineNumber: Number(lineNumber),
        deepAnalysis,
      });

      return reply.status(200).send(result);
    },
  );

  // 4. AI 변형 문제 생성 및 Staging 등록
  fastify.post(
    "/api/ai/variation",
    async (
      request: FastifyRequest<{ Body: AIGeminiVariationRequest }>,
      reply: FastifyReply,
    ) => {
      const { parentQuestionId, variationType, instructions } =
        request.body || {};

      if (!parentQuestionId || !variationType) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "parentQuestionId와 variationType은 필수 파라미터입니다.",
        });
      }

      const question = questionRepo.findById(parentQuestionId);
      if (!question) {
        return reply.status(404).send({
          error: "Not Found",
          message: `ID가 '${parentQuestionId}'인 원본 문제를 찾을 수 없습니다.`,
        });
      }

      const concept = question.conceptId
        ? conceptRepo.findById(question.conceptId)
        : null;

      // 1. 변형 문제 생성
      const variation: GeneratedVariation = await aiService.generateVariation({
        question,
        concept,
        variationType,
        instructions,
      });

      // 2. Staging 검수 대기열(staged_questions)에 등록 (Live DB 직접 변경 금지)
      const stagedResult = await variationStager.stageVariation(variation);

      const response: AIGeminiVariationResponse = {
        batchId: stagedResult.batchId,
        stagedQuestionId: stagedResult.stagedQuestion.id,
        variation,
        source:
          variation.generationMetadata.generator === "GeminiAIService"
            ? "GEMINI"
            : "MOCK",
        modelUsed: variation.generationMetadata.model,
      };

      return reply.status(201).send(response);
    },
  );

  // 5. 학습 영역(도메인) 목록 조회 (실제 DB에 존재하는 언어, 과목, 카테고리 반환)
  fastify.get("/api/ai/domains", async (_request, reply) => {
    const db = getDatabase();
    const langRows = db
      .prepare(
        "SELECT DISTINCT language FROM questions WHERE language IS NOT NULL AND language != ''",
      )
      .all() as { language: string }[];
    const subjRows = db
      .prepare(
        "SELECT DISTINCT subject FROM questions WHERE subject IS NOT NULL AND subject != ''",
      )
      .all() as { subject: string }[];
    const catRows = db
      .prepare(
        "SELECT DISTINCT category FROM questions WHERE category IS NOT NULL AND category != ''",
      )
      .all() as { category: string }[];

    const response: LearningDomainsResponse = {
      languages: langRows.map((r) => r.language),
      subjects: subjRows.map((r) => r.subject),
      categories: catRows.map((r) => r.category),
    };
    return reply.status(200).send(response);
  });

  // 6. AI 문제 대량 생성 (랜덤 / 특정 영역 기반 자동 전략 결정 및 Staging 적재)
  fastify.post(
    "/api/ai/batch-generate",
    async (
      request: FastifyRequest<{ Body: AIBatchGenerateRequest }>,
      reply: FastifyReply,
    ) => {
      const { mode, domain, count = 5 } = request.body || {};
      const numQuestions = Math.min(Math.max(Number(count) || 5, 1), 20);

      // 1. 후보 문제 선정
      const allQuestions: Question[] = questionRepo.findMany({ limit: 200 }).items;
      let candidatePool: Question[] = allQuestions.filter(
        (q: Question) => q.sourceType !== "AI_VARIATION",
      );
      if (candidatePool.length === 0) {
        candidatePool = allQuestions;
      }

      if (mode === "DOMAIN" && domain) {
        const dTrim = domain.trim().toLowerCase();
        const matched = candidatePool.filter((q: Question) => {
          const langMatch =
            q.language && q.language.toLowerCase() === dTrim;
          const subjMatch =
            q.subject && q.subject.toLowerCase().includes(dTrim);
          const catMatch =
            q.category && q.category.toLowerCase().includes(dTrim);
          return langMatch || subjMatch || catMatch;
        });
        if (matched.length > 0) {
          candidatePool = matched;
        }
      }

      if (candidatePool.length === 0) {
        return reply.status(404).send({
          error: "Not Found",
          message: "선택한 조건에 부합하는 기준 원본 문제를 찾을 수 없습니다.",
        });
      }

      // 2. 문항별 변형 생성 및 스테이징
      let targetBatchId: string | undefined = undefined;
      const stagedIds: string[] = [];

      for (let i = 0; i < numQuestions; i++) {
        const baseQuestion = candidatePool[i % candidatePool.length];
        const concept = baseQuestion.conceptId
          ? conceptRepo.findById(baseQuestion.conceptId)
          : null;

        // AI 내부 자동 전략 교차 적용: 코드는 PARAMETER -> CODE -> DIFFICULTY, 이론은 CONCEPT -> SCENARIO
        let chosenStrategy: VariationType;
        if (baseQuestion.type === "CODE_TRACE") {
          const codeStrategies: VariationType[] = [
            "PARAMETER_VARIATION",
            "CODE_VARIATION",
            "DIFFICULTY_VARIATION",
          ];
          chosenStrategy = codeStrategies[i % codeStrategies.length];
        } else {
          const theoryStrategies: VariationType[] = [
            "CONCEPT_VARIATION",
            "SCENARIO_VARIATION",
            "PARAMETER_VARIATION",
          ];
          chosenStrategy = theoryStrategies[i % theoryStrategies.length];
        }

        try {
          const variation = await aiService.generateVariation({
            question: baseQuestion,
            concept,
            variationType: chosenStrategy,
          });

          const stagedResult = await variationStager.stageVariation(
            variation,
            targetBatchId,
          );
          targetBatchId = stagedResult.batchId;
          stagedIds.push(stagedResult.stagedQuestion.id);
        } catch {
          // AI 실패 시 기본 변형 fallback
          const fallbackVar: GeneratedVariation = {
            parentQuestionId: baseQuestion.id,
            sourceQuestionId: baseQuestion.id,
            variationType: chosenStrategy,
            conceptId: baseQuestion.conceptId,
            subject: baseQuestion.subject,
            category: baseQuestion.category,
            questionType: baseQuestion.type,
            prompt: `[연습 변형 ${i + 1}] ` + baseQuestion.question,
            codeSnippet: baseQuestion.code,
            language: baseQuestion.language,
            options: baseQuestion.options,
            groundTruthAnswer: baseQuestion.groundTruthAnswer,
            aiExplanation:
              baseQuestion.aiExplanation || "기본 기출 변형 문제입니다.",
            aiVariationNotes: `기본 변형 전략 (${chosenStrategy}) 적용`,
            generationMetadata: {
              generator: "MockQuestionVariationGenerator",
              model: "local-fallback",
              generatedAt: new Date().toISOString(),
            },
          };
          const stagedResult = await variationStager.stageVariation(
            fallbackVar,
            targetBatchId,
          );
          targetBatchId = stagedResult.batchId;
          stagedIds.push(stagedResult.stagedQuestion.id);
        }
      }

      const response: AIBatchGenerateResponse = {
        success: true,
        batchId: targetBatchId || `batch_${Date.now()}`,
        count: stagedIds.length,
        stagedQuestionIds: stagedIds,
        message: `${stagedIds.length}개 문제가 생성되어 검수 대기열에 등록되었습니다.`,
      };
      return reply.status(201).send(response);
    },
  );
}
