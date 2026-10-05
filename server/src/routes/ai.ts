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
  StudySession,
  hasValidGroundTruth,
} from "@jungcheogi/shared";
import { QuestionRepository } from "../db/repositories/questionRepository.js";
import { ConceptRepository } from "../db/repositories/conceptRepository.js";
import { ImportBatchRepository } from "../db/repositories/importBatchRepository.js";
import { SessionRepository } from "../db/repositories/sessionRepository.js";
import { getDatabase } from "../db/database.js";
import { getAIService } from "../engine/aiService.js";
import { MockQuestionVariationGenerator } from "../engine/variationGenerator.js";
import { VariationValidator } from "../engine/variationValidator.js";
import { evaluateCodeOutput } from "../engine/codeExecutionEngine.js";
import { isDuplicateOrTooSimilar } from "../engine/independentGenerator.js";
import {
  verifyStepTraceMatch,
  verifyExplanationMatch,
  calculateCodeSimilarity,
  evaluateDualConsistency,
} from "../engine/evaluationValidator.js";
import {
  analyzeCodeStructure,
  isIndependentLanguage,
  normalizeLanguage,
  UnsupportedIndependentGenerationError,
} from "../engine/languageGeneration.js";

export async function aiRoutes(fastify: FastifyInstance): Promise<void> {
  const questionRepo = new QuestionRepository();
  const conceptRepo = new ConceptRepository();
  const sessionRepo = new SessionRepository();
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
        "SELECT DISTINCT language FROM questions WHERE language IS NOT NULL AND language != '' AND (study_visibility IS NULL OR study_visibility = 'LIVE')",
      )
      .all() as { language: string }[];
    const subjRows = db
      .prepare(
        "SELECT DISTINCT subject FROM questions WHERE subject IS NOT NULL AND subject != '' AND (study_visibility IS NULL OR study_visibility = 'LIVE')",
      )
      .all() as { subject: string }[];
    const catRows = db
      .prepare(
        "SELECT DISTINCT category FROM questions WHERE category IS NOT NULL AND category != '' AND (study_visibility IS NULL OR study_visibility = 'LIVE')",
      )
      .all() as { category: string }[];

    const response: LearningDomainsResponse = {
      languages: langRows.map((r) => r.language),
      subjects: subjRows.map((r) => r.subject),
      categories: catRows.map((r) => r.category),
      supportedIndependentLanguages: ["C", "JAVA", "PYTHON"],
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
      const requestedLang = normalizeLanguage(domain);
      const independentLang = isIndependentLanguage(requestedLang)
        ? requestedLang
        : null;

      const allQuestions: Question[] = questionRepo.findAllMatching();
      let candidatePool: Question[] = allQuestions.filter(
        (q: Question) => q.sourceType !== "AI_VARIATION",
      );

      if (mode === "DOMAIN" && domain) {
        const dTrim = domain.trim().toLowerCase();
        const matched = candidatePool.filter((q: Question) => {
          if (requestedLang && q.language === requestedLang) return true;
          const langMatch =
            q.language && q.language.toLowerCase() === dTrim;
          const subjMatch =
            q.subject && q.subject.toLowerCase().includes(dTrim);
          const catMatch =
            q.category && q.category.toLowerCase().includes(dTrim);
          return Boolean(langMatch || subjMatch || catMatch);
        });
        if (independentLang) {
          candidatePool = matched;
        } else if (requestedLang === "SQL") {
          if (matched.length === 0) {
            return reply.status(404).send({
              error: "Not Found",
              message:
                "SQL 독립 생성기는 지원하지 않습니다. 선택한 영역에 원본 SQL 문제가 없어 변형 생성도 할 수 없습니다.",
            });
          }
          candidatePool = matched;
        } else if (matched.length === 0) {
          return reply.status(404).send({
            error: "Not Found",
            message: `선택한 영역(${domain})에 해당하는 원본 문제가 없습니다. 다른 영역으로 대체하지 않습니다.`,
          });
        } else {
          candidatePool = matched;
        }
      }

      if (!independentLang && candidatePool.length === 0) {
        return reply.status(404).send({
          error: "Not Found",
          message: "선택한 조건에 부합하는 기준 원본 문제를 찾을 수 없습니다.",
        });
      }

      const shuffledCandidates = [...candidatePool].sort(
        () => Math.random() - 0.5,
      );

      const existingCodeSnippets = allQuestions
        .filter(
          (q) =>
            q.code &&
            q.code.length > 20 &&
            (!independentLang || q.language === independentLang),
        )
        .slice(0, 8)
        .map((q) => q.code as string);

      let targetBatchId: string | undefined = undefined;
      const stagedIds: string[] = [];
      let passCount = 0;
      let reviewCount = 0;
      const rejectedItems: Array<{ reason: string; details?: any }> = [];
      const batchGeneratedCodes: string[] = [];

      for (let i = 0; i < numQuestions; i++) {
        if (independentLang) {
          try {
            const indepQuestion = await aiService.generateIndependentQuestion({
              domain: independentLang,
              language: independentLang,
              difficulty: i % 2 === 0 ? "HARD" : "MEDIUM",
              avoidSnippets: existingCodeSnippets,
            });

            if (normalizeLanguage(indepQuestion.language) !== independentLang) {
              rejectedItems.push({
                reason: `요청 언어(${independentLang})와 다른 언어 응답`,
                details: { language: indepQuestion.language },
              });
              continue;
            }

            const codeStr = indepQuestion.code || "";
            const structure = analyzeCodeStructure(codeStr, independentLang);
            const hasSyntaxIssues = structure.hasSyntaxIssues;

            let cloneType: "NONE" | "IDENTICAL" | "MUTATION_CLONE" = "NONE";
            for (const eq of allQuestions) {
              if (eq.code) {
                const sim = calculateCodeSimilarity(codeStr, eq.code);
                if (sim.category === "IDENTICAL") {
                  cloneType = "IDENTICAL";
                  break;
                } else if (
                  sim.category === "MUTATION_CLONE" &&
                  cloneType === "NONE"
                ) {
                  cloneType = "MUTATION_CLONE";
                }
              }
            }
            if (cloneType === "NONE") {
              for (const prevCode of batchGeneratedCodes) {
                const sim = calculateCodeSimilarity(codeStr, prevCode);
                if (sim.category === "IDENTICAL") {
                  cloneType = "IDENTICAL";
                  break;
                } else if (sim.category === "MUTATION_CLONE") {
                  cloneType = "MUTATION_CLONE";
                }
              }
            }

            const stepTrace = indepQuestion.designMetadata?.stepByStepTrace || "";
            const ansStr = Array.isArray(indepQuestion.groundTruthAnswer)
              ? indepQuestion.groundTruthAnswer.join(" ")
              : String(indepQuestion.groundTruthAnswer ?? "").trim();
            const traceResult = verifyStepTraceMatch(stepTrace, ansStr);
            const explStr = indepQuestion.officialExplanation || "";
            const explResult = verifyExplanationMatch(explStr, ansStr);

            const dualResult = evaluateDualConsistency({
              stepTraceStatus: traceResult.status,
              explanationStatus: explResult.status,
              cloneType,
              actualCodeOutput: undefined,
              codeExecutionStatus: "UNAVAILABLE",
              expectedAnswer: ansStr,
              hasSyntaxIssues,
              selfCorrectionDetected: explResult.selfCorrectionDetected,
            });

            if (dualResult.finalDecision === "REJECT") {
              rejectedItems.push({
                reason:
                  dualResult.rejectionReasons.join("; ") ||
                  structure.reason ||
                  "정합성 또는 복제 결함",
                details: {
                  concept: indepQuestion.designMetadata?.concept,
                  answer: ansStr,
                  language: independentLang,
                  reasons: dualResult.rejectionReasons,
                },
              });
              continue;
            }

            if (dualResult.finalDecision === "PASS") {
              passCount++;
            } else {
              reviewCount++;
            }
            batchGeneratedCodes.push(codeStr);

            const stagedResult = await variationStager.stageIndependentQuestion(
              indepQuestion,
              targetBatchId,
              {
                decision: dualResult.finalDecision,
                rejectionReasons: dualResult.rejectionReasons,
                model: (indepQuestion as any).model,
              },
            );
            targetBatchId = stagedResult.batchId;
            stagedIds.push(stagedResult.stagedQuestion.id);
            continue;
          } catch (indepErr) {
            const message =
              indepErr instanceof Error ? indepErr.message : String(indepErr);
            rejectedItems.push({
              reason:
                indepErr instanceof UnsupportedIndependentGenerationError
                  ? message
                  : `독립 생성 실패(${independentLang}): ${message}`,
              details: { language: independentLang },
            });
            continue;
          }
        }

        if (shuffledCandidates.length === 0) {
          rejectedItems.push({
            reason: "변형 생성에 사용할 원본 문제가 없습니다.",
          });
          continue;
        }

        const baseQuestion = shuffledCandidates[i % shuffledCandidates.length];
        const concept = baseQuestion.conceptId
          ? conceptRepo.findById(baseQuestion.conceptId)
          : null;

        const isCodeQuestion = Boolean(
          baseQuestion.code ||
            baseQuestion.type === "CODE_TRACE" ||
            baseQuestion.type.includes("CODE") ||
            baseQuestion.language,
        );

        let chosenStrategy: VariationType;
        if (isCodeQuestion) {
          const codeStrategies: VariationType[] = [
            "CODE_VARIATION",
            "DIFFICULTY_VARIATION",
            "PARAMETER_VARIATION",
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

          variation.parentQuestionId =
            variation.parentQuestionId || baseQuestion.id;
          variation.conceptId = variation.conceptId || baseQuestion.conceptId;

          // 정적 스키마 및 도메인 검증
          const valResult = VariationValidator.validate(variation, baseQuestion);
          if (!valResult.isValid) {
            rejectedItems.push({
              reason:
                valResult.issues.map((i) => i.message).join("; ") ||
                "변형 문제 스키마/도메인 검증 실패",
              details: {
                baseQuestionId: baseQuestion.id,
                strategy: chosenStrategy,
                issues: valResult.issues,
              },
            });
            continue;
          }

          variation.aiVariationNotes = `${variation.aiVariationNotes || ""} (사람 검수 필요)`;
          const stagedResult = await variationStager.stageVariation(
            variation,
            targetBatchId,
          );
          targetBatchId = stagedResult.batchId;
          stagedIds.push(stagedResult.stagedQuestion.id);
          reviewCount++;
        } catch (err) {
          console.warn(
            `[BatchGenerate] variation failed for ${baseQuestion.id}:`,
            err instanceof Error ? err.message : err,
          );
        }
      }

      if (stagedIds.length === 0 && rejectedItems.length > 0) {
        return reply.status(200).send({
          success: false,
          batchId: targetBatchId || "",
          count: 0,
          stagedQuestionIds: [],
          passCount: 0,
          reviewCount: 0,
          rejectCount: rejectedItems.length,
          rejectedItems,
          message: `생성된 ${rejectedItems.length}개 문제가 검증기(Evaluator) 기준에 미달하여 자동 폐기(Reject)되었습니다.`,
        });
      }

      if (stagedIds.length === 0) {
        return reply.status(500).send({
          error: "Generation Failed",
          message: "변형 문제 생성에 실패했습니다. 잠시 후 다시 시도해주세요.",
        });
      }

      const response: AIBatchGenerateResponse = {
        success: true,
        batchId: targetBatchId || `batch_${Date.now()}`,
        count: stagedIds.length,
        stagedQuestionIds: stagedIds,
        passCount,
        reviewCount,
        rejectCount: rejectedItems.length,
        rejectedItems: rejectedItems.length > 0 ? rejectedItems : undefined,
        message: `${stagedIds.length}개 문제가 검증을 거쳐 검수 대기열에 등록되었습니다. (PASS: ${passCount}, REVIEW: ${reviewCount}, REJECT 폐기: ${rejectedItems.length})`,
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

      const optimalStrategy = selectOptimalVariationStrategy(parentQuestion);

      let variation: GeneratedVariation | null = null;
      let executionStatus: "SUCCESS" | "UNAVAILABLE" | "ERROR" = "UNAVAILABLE";
      let conflict = false;
      let attempts = 0;
      const strategiesToTry: VariationType[] = [
        optimalStrategy,
        optimalStrategy === "CODE_VARIATION"
          ? "PARAMETER_VARIATION"
          : "CODE_VARIATION",
        "CONCEPT_VARIATION",
      ];

      while (attempts < strategiesToTry.length && !variation) {
        const currentStrategy = strategiesToTry[attempts] || optimalStrategy;
        attempts++;

        try {
          const gen = await aiService.generateVariation({
            question: parentQuestion,
            concept,
            variationType: currentStrategy,
          });

          conflict = false;
          executionStatus = "UNAVAILABLE";

          if (gen.codeSnippet) {
            const evalResult = await evaluateCodeOutput(
              gen.codeSnippet,
              gen.language,
            );
            executionStatus =
              evalResult.status === "SUCCESS"
                ? "SUCCESS"
                : evalResult.status === "ERROR"
                  ? "ERROR"
                  : "UNAVAILABLE";
            const parentCode = parentQuestion.code || "";
            const codeChanged = Boolean(gen.codeSnippet !== parentCode);
            const parentGt = JSON.stringify(
              parentQuestion.groundTruthAnswer ?? "",
            );
            const genGt = JSON.stringify(gen.groundTruthAnswer ?? "");
            const inheritedOfficialAnswer = codeChanged && parentGt === genGt;

            if (
              evalResult.status === "SUCCESS" &&
              evalResult.output !== undefined
            ) {
              const calcOut = evalResult.output.trim();
              const gt = Array.isArray(gen.groundTruthAnswer)
                ? String(gen.groundTruthAnswer[0] ?? "")
                : String(gen.groundTruthAnswer ?? "");

              if (calcOut && gt && calcOut !== gt.trim()) {
                conflict = true;
                gen.aiVariationNotes = `${gen.aiVariationNotes || ""} (정답 충돌: 저장된 정답="${gt}", 실행 결과="${calcOut}". 공식 정답은 변경하지 않음)`;
                gen.aiExplanation =
                  `[정답 충돌] 저장된 정답="${gt}", 코드 실행 결과="${calcOut}". 공식 정답은 변경하지 않았습니다.\n` +
                  (gen.aiExplanation || "");
              }
            } else if (evalResult.status === "UNAVAILABLE") {
              gen.aiVariationNotes = `${gen.aiVariationNotes || ""} (실행 검증 불가)`;
              gen.aiExplanation =
                `[실행 검증 불가] ${evalResult.error || "격리된 실행 환경이 없어 코드를 검증하지 못했습니다."}\n` +
                (gen.aiExplanation || "");
              if (inheritedOfficialAnswer) {
                gen.groundTruthAnswer = "";
              }
            } else if (evalResult.status === "ERROR") {
              gen.aiVariationNotes = `${gen.aiVariationNotes || ""} (실행 실패)`;
              gen.aiExplanation =
                `[실행 실패] ${evalResult.error || "코드 실행에 실패했습니다."}\n` +
                (gen.aiExplanation || "");
              if (inheritedOfficialAnswer) {
                gen.groundTruthAnswer = "";
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
          error: "GENERATION_FAILED",
          failureReason: "GENERATION_FAILED",
          success: false,
          message:
            "변형 문제 생성에 실패했습니다. 다시 생성하거나 검수 흐름을 이용해주세요.",
        });
      }

      if (conflict) {
        return reply.status(422).send({
          error: "ANSWER_CONFLICT",
          failureReason: "ANSWER_CONFLICT",
          success: false,
          variation,
          executionStatus,
          message:
            "생성된 코드의 실행 결과와 제시 정답이 충돌합니다. 이 문제는 채점할 수 없습니다. 다시 생성하거나 검수 대기열로 보내세요.",
        });
      }

      if (!hasValidGroundTruth(variation.groundTruthAnswer)) {
        const reason =
          executionStatus === "UNAVAILABLE" || executionStatus === "ERROR"
            ? "EXECUTION_UNVERIFIED"
            : "MISSING_ANSWER";
        return reply.status(422).send({
          error: reason,
          failureReason: reason,
          success: false,
          variation,
          executionStatus,
          message:
            reason === "EXECUTION_UNVERIFIED"
              ? "실행 검증을 하지 못해 채점 가능한 정답을 확정하지 못했습니다. 다시 생성하거나 검수 대기열로 보내세요."
              : "유효한 정답이 없어 채점 가능한 문제로 제공할 수 없습니다.",
        });
      }

      // ★ P0 핵심 안전성 가드 (외부 감사 대응):
      // 실행 검증(executionStatus === 'SUCCESS')이 완료되지 않은 미검증 AI 생성 문제는
      // 절대로 학습 세션으로 즉시 열거나 사용자에게 직접 노출하지 않는다.
      // 검증되지 않은 즉석 문제는 검수 대기열(Staging)에 안전 격리 적재하고 안전 실패 응답(422)을 반환한다.
      if (executionStatus !== "SUCCESS") {
        const stagedResult = await variationStager.stageVariation(variation);
        return reply.status(422).send({
          error: "EXECUTION_UNVERIFIED",
          failureReason: "EXECUTION_UNVERIFIED",
          success: false,
          variation,
          executionStatus,
          stagedQuestionId: stagedResult.stagedQuestion.id,
          message:
            "현재 즉석 변형 문제는 자동 검증이 완료되지 않아 바로 제공할 수 없습니다. 안전을 위해 검수 대기열(Staging)에 등록되었습니다.",
        });
      }

      const answerSource = "EXECUTION_VERIFIED";

      const drillQuestion: Question = {
        id: `q_drill_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
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
        officialExplanation: undefined,
        aiExplanation: variation.aiExplanation,
        aiVariationNotes: variation.aiVariationNotes,
        difficulty: parentQuestion.difficulty,
        conceptId: variation.conceptId || parentQuestion.conceptId,
        keywords: parentQuestion.keywords || [],
        studyVisibility: "TEMPORARY_DRILL",
        answerVerificationStatus: "PROVISIONAL_DRAFT",
        answerSource,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const createdQuestion = questionRepo.create(drillQuestion);

      const drillSession: StudySession = sessionRepo.create({
        id: `sess_drill_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title: "AI 변형 드릴",
        subjectFilter: parentQuestion.subject,
        questionIds: [createdQuestion.id],
        currentIndex: 0,
        status: "ACTIVE",
        totalQuestions: 1,
        correctCount: 0,
        wrongCount: 0,
        unknownCount: 0,
        totalTimeSpentMs: 0,
        startedAt: new Date().toISOString(),
      });

      const response: AIVariationDrillResponse = {
        success: true,
        question: { ...createdQuestion, answerSource },
        variation,
        drillSession,
        executionStatus,
        answerSource,
        message:
          "실행 검증이 완료된 임시 AI 변형 드릴이 생성되었습니다. 검수 승인 전까지 일반 문제집에 들어가지 않습니다.",
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

