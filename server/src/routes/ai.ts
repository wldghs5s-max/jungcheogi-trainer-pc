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
  AIVariationDrillRequest,
  AIVariationDrillResponse,
  AIStageDrillRequest,
  AIStageDrillResponse,
} from "@jungcheogi/shared";
import { QuestionRepository } from "../db/repositories/questionRepository.js";
import { ConceptRepository } from "../db/repositories/conceptRepository.js";
import { ImportBatchRepository } from "../db/repositories/importBatchRepository.js";
import { getDatabase } from "../db/database.js";
import { getAIService } from "../engine/aiService.js";
import { MockQuestionVariationGenerator } from "../engine/variationGenerator.js";
import { evaluateCodeOutput } from "../engine/codeExecutionEngine.js";

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
      const {
        questionId,
        questionData,
        userAnswer,
        isCorrect,
        isUnknown,
        deepAnalysis,
      } = request.body || {};

      let question: Question | null = null;
      if (questionData) {
        question = questionData;
      } else if (questionId) {
        question = questionRepo.findById(questionId);
      }

      if (!question) {
        return reply.status(questionId ? 404 : 400).send({
          error: questionId ? "Not Found" : "Bad Request",
          message: questionId
            ? `ID가 '${questionId}'인 문제를 찾을 수 없습니다.`
            : "questionId 또는 questionData는 필수입니다.",
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
      const { questionId, questionData, deepAnalysis } = request.body || {};

      let question: Question | null = null;
      if (questionData) {
        question = questionData;
      } else if (questionId) {
        question = questionRepo.findById(questionId);
      }

      if (!question) {
        return reply.status(questionId ? 404 : 400).send({
          error: questionId ? "Not Found" : "Bad Request",
          message: questionId
            ? `ID가 '${questionId}'인 문제를 찾을 수 없습니다.`
            : "questionId 또는 questionData는 필수입니다.",
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
      const { questionId, questionData, lineNumber, deepAnalysis } =
        request.body || {};

      if (!lineNumber) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "lineNumber는 필수 파라미터입니다.",
        });
      }

      let question: Question | null = null;
      if (questionData) {
        question = questionData;
      } else if (questionId) {
        question = questionRepo.findById(questionId);
      }

      if (!question) {
        return reply.status(questionId ? 404 : 400).send({
          error: questionId ? "Not Found" : "Bad Request",
          message: questionId
            ? `ID가 '${questionId}'인 문제를 찾을 수 없습니다.`
            : "questionId 또는 questionData는 필수입니다.",
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

  // 6. 학습용 AI 즉시 변형 문제 풀기 (No strategy selection, auto-analysis, Ground Truth validated)
  fastify.post(
    "/api/ai/variation-drill",
    async (
      request: FastifyRequest<{ Body: AIVariationDrillRequest }>,
      reply: FastifyReply,
    ) => {
      const { parentQuestionId } = request.body || {};

      if (!parentQuestionId) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "parentQuestionId는 필수 파라미터입니다.",
        });
      }

      const parentQuestion = questionRepo.findById(parentQuestionId);
      if (!parentQuestion) {
        return reply.status(404).send({
          error: "Not Found",
          message: `ID가 '${parentQuestionId}'인 원본 문제를 찾을 수 없습니다.`,
        });
      }

      const concept = parentQuestion.conceptId
        ? conceptRepo.findById(parentQuestion.conceptId)
        : null;

      // 1. AI가 문제 특성을 분석하여 최적의 변형 전략 자동 선택
      const optimalStrategy = selectOptimalVariationStrategy(parentQuestion);

      let variation: GeneratedVariation | null = null;
      let attempts = 0;
      const strategiesToTry: VariationType[] = [
        optimalStrategy,
        optimalStrategy === "CODE_VARIATION"
          ? "PARAMETER_VARIATION"
          : "CODE_VARIATION",
        "CONCEPT_VARIATION",
      ];

      while (attempts < 2 && !variation) {
        const currentStrategy = strategiesToTry[attempts] || optimalStrategy;
        attempts++;

        try {
          const gen = await aiService.generateVariation({
            question: parentQuestion,
            concept,
            variationType: currentStrategy,
          });

          // 2. Ground Truth 보존 및 코드 계산 검증
          if (gen.codeSnippet) {
            const evalResult = await evaluateCodeOutput(
              gen.codeSnippet,
              gen.language,
            );
            if (
              evalResult.status === "SUCCESS" &&
              evalResult.output !== undefined
            ) {
              const calcOut = evalResult.output.trim();
              const gt = Array.isArray(gen.groundTruthAnswer)
                ? gen.groundTruthAnswer[0]
                : String(gen.groundTruthAnswer);

              if (calcOut !== gt.trim()) {
                // 코드 실행 결과와 불일치 시 실제 연산값으로 동기화하여 문제의 정합성 보장
                gen.groundTruthAnswer = calcOut;
                gen.aiExplanation =
                  `[코드 실행 검증 완료] 실제 코드 실행 결과값은 "${calcOut}"입니다.\n` +
                  (gen.aiExplanation || "");
              }
            }
          }

          variation = gen;
        } catch (err: any) {
          console.warn(
            `[VariationDrill] Attempt ${attempts} failed:`,
            err?.message,
          );
        }
      }

      if (!variation) {
        return reply.status(500).send({
          error: "Generation Failed",
          message:
            "변형 문제 생성 및 검증에 실패했습니다. 잠시 후 다시 시도해주세요.",
        });
      }

      // Convert to temporary in-memory Question object (ready to be solved immediately)
      const drillQuestion: Question = {
        id: `drill_temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        parentQuestionId: parentQuestion.id,
        sourceType: "AI_VARIATION",
        subject: variation.subject,
        category: variation.category,
        subCategory: parentQuestion.subCategory,
        type: variation.questionType,
        question: variation.prompt,
        code: variation.codeSnippet,
        language: variation.language as any,
        options: variation.options,
        groundTruthAnswer: variation.groundTruthAnswer,
        aiExplanation: variation.aiExplanation,
        aiVariationNotes: variation.aiVariationNotes,
        difficulty: parentQuestion.difficulty,
        conceptId: variation.conceptId || parentQuestion.conceptId,
        keywords: parentQuestion.keywords || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const response: AIVariationDrillResponse = {
        success: true,
        question: drillQuestion,
        variation,
        message:
          "AI 변형 문제가 성공적으로 생성되었습니다. 바로 풀이를 시작하세요!",
      };

      return reply.status(200).send(response);
    },
  );

  // 7. 학습용 임시 변형 문제 Staging 저장 (선택적 영구화)
  fastify.post(
    "/api/ai/stage-drill-question",
    async (
      request: FastifyRequest<{ Body: AIStageDrillRequest }>,
      reply: FastifyReply,
    ) => {
      const { variation } = request.body || {};
      if (!variation) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "variation 객체는 필수입니다.",
        });
      }

      const stagedResult = await variationStager.stageVariation(variation);

      const response: AIStageDrillResponse = {
        success: true,
        stagedQuestionId: stagedResult.stagedQuestion.id,
        batchId: stagedResult.batchId,
        message: `변형 문제가 검수 대기열(Staging)에 등록되었습니다! (ID: ${stagedResult.stagedQuestion.id})`,
      };

      return reply.status(200).send(response);
    },
  );
}

/**
 * 문제의 성격(언어, 코드 특성, 과목, 난이도)에 맞춰 가장 적절한 변형 전략을 자동으로 선택
 */
export function selectOptimalVariationStrategy(
  question: Question,
): VariationType {
  const code = question.code || "";
  const lang = (question.language || "").toUpperCase();

  // 1. C language
  if (lang === "C" || /\b#include\b|\bprintf\b|\bscanf\b/i.test(code)) {
    // 포인터/메모리 연산: 코드 구조 변형
    if (/\*|->|&[a-zA-Z_]/i.test(code)) {
      return "CODE_VARIATION";
    }
    // 루프/분기: 제어 흐름 변형
    if (/\b(for|while)\b/i.test(code)) {
      return "CODE_VARIATION";
    }
    // 배열/단순 수치: 파라미터 변형
    if (/\[.*\]|\bstruct\b/i.test(code)) {
      return "PARAMETER_VARIATION";
    }
    return "CODE_VARIATION";
  }

  // 2. Java language
  if (lang === "JAVA" || /public\s+class|System\.out/i.test(code)) {
    // 상속/다형성/오버라이딩
    if (
      /\bextends\b|\bimplements\b|@Override|\bsuper\b|\babstract\b/i.test(code)
    ) {
      return "CODE_VARIATION";
    }
    // 재귀 호출
    if (/\bcompute\b|\breturn\b/i.test(code)) {
      return "CODE_VARIATION";
    }
    return "PARAMETER_VARIATION";
  }

  // 3. Python language
  if (lang === "PYTHON" || /def\s+|import\s+|print\s*\(/i.test(code)) {
    return "CODE_VARIATION";
  }

  // 4. SQL
  if (lang === "SQL" || /select\s+.*from/i.test(code)) {
    return "SCENARIO_VARIATION";
  }

  // 5. 이론/데이터베이스/보안
  if (
    question.category.includes("정규화") ||
    question.category.includes("데이터베이스")
  ) {
    return "CONCEPT_VARIATION";
  }

  if (
    question.subject === "신기술/보안" ||
    question.category.includes("보안")
  ) {
    return "SCENARIO_VARIATION";
  }

  if (question.difficulty === "HARD") {
    return "DIFFICULTY_VARIATION";
  }

  return "CONCEPT_VARIATION";
}

