import assert from "node:assert";
import { Question } from "@jungcheogi/shared";
import { buildApp } from "../src/app.js";
import { QuestionRepository } from "../src/db/repositories/questionRepository.js";
import { SessionRepository } from "../src/db/repositories/sessionRepository.js";
import { QuestionImportPipeline } from "../src/db/importers/importPipeline.js";
import { generateStructuralFingerprint } from "../src/db/importers/fingerprint.js";
import { setupIsolatedTestDb } from "./helpers/testDb.js";

function liveQuestion(partial: Partial<Question> & { id: string; question: string }): Question {
  return {
    sourceType: "USER_IMPORTED",
    subject: "프로그래밍언어활용",
    category: "테스트",
    type: "SHORT_ANSWER",
    groundTruthAnswer: "1",
    difficulty: "EASY",
    keywords: [],
    createdAt: new Date().toISOString(),
    studyVisibility: "LIVE",
    ...partial,
  };
}

async function run() {
  console.log("=== 드릴 저장·완료 세션·100건 초과 중복·영역 API ===\n");
  const isolated = setupIsolatedTestDb({ seed: true });
  try {
    const app = buildApp();
    const qRepo = new QuestionRepository();
    const sRepo = new SessionRepository();

    const domains = await app.inject({ method: "GET", url: "/api/ai/domains" });
    assert.strictEqual(domains.statusCode, 200);
    const domainBody = domains.json();
    assert.deepStrictEqual(domainBody.supportedIndependentLanguages, ["C", "JAVA", "PYTHON"]);
    console.log("OK   /api/ai/domains 학습 영역 조회");

    const missing = await app.inject({ method: "GET", url: "/api/ai/learning-domains" });
    assert.strictEqual(missing.statusCode, 404);
    console.log("OK   잘못된 영역 주소는 404");

    const zeroQ = qRepo.create(
      liveQuestion({
        id: "q_zero_answer",
        question: "출력은?",
        groundTruthAnswer: "0",
        type: "CODE_TRACE",
        language: "C",
        code: "int main(){printf(\"0\");}",
      }),
    );
    const emptyQ = qRepo.create(
      liveQuestion({
        id: "q_empty_answer",
        question: "정답 없는 문항",
        groundTruthAnswer: "",
      }),
    );

    const okSession = await app.inject({
      method: "POST",
      url: "/api/sessions",
      payload: { title: "0점 정답", questionIds: [zeroQ.id], count: 1 },
    });
    assert.strictEqual(okSession.statusCode, 201);
    const zeroSubmit = await app.inject({
      method: "POST",
      url: `/api/sessions/${okSession.json().session.id}/submit`,
      payload: { questionId: zeroQ.id, userAnswer: "0", timeSpentMs: 1000 },
    });
    assert.strictEqual(zeroSubmit.statusCode, 200);
    assert.strictEqual(zeroSubmit.json().isCorrect, true);
    console.log("OK   정답 0은 채점 가능");

    const emptySession = sRepo.create({
      id: "sess_empty_gt",
      title: "빈 정답",
      questionIds: [emptyQ.id],
      currentIndex: 0,
      status: "ACTIVE",
      totalQuestions: 1,
      correctCount: 0,
      wrongCount: 0,
      unknownCount: 0,
      totalTimeSpentMs: 0,
      startedAt: new Date().toISOString(),
    });
    const emptySubmit = await app.inject({
      method: "POST",
      url: `/api/sessions/${emptySession.id}/submit`,
      payload: { questionId: emptyQ.id, userAnswer: "anything", timeSpentMs: 1000 },
    });
    assert.strictEqual(emptySubmit.statusCode, 422);
    assert.strictEqual(emptySubmit.json().failureReason, "MISSING_ANSWER");
    console.log("OK   빈 정답 문항 채점 차단");

    const parent = qRepo.findMany({ limit: 20 }).items.find((q) => q.type === "SHORT_ANSWER");
    assert.ok(parent);

    const oneQSession = await app.inject({
      method: "POST",
      url: "/api/sessions",
      payload: { title: "마지막 문항 세션", questionIds: [parent!.id], count: 1 },
    });
    assert.strictEqual(oneQSession.statusCode, 201);
    const originalId = oneQSession.json().session.id;
    const lastSubmit = await app.inject({
      method: "POST",
      url: `/api/sessions/${originalId}/submit`,
      payload: {
        questionId: parent!.id,
        userAnswer: parent!.groundTruthAnswer,
        timeSpentMs: 1000,
      },
    });
    assert.strictEqual(lastSubmit.statusCode, 200);
    assert.strictEqual(lastSubmit.json().isSessionCompleted, true);
    assert.strictEqual(sRepo.findById(originalId)?.status, "COMPLETED");
    const originalSnapshot = sRepo.findById(originalId)!;

    const drillRes = await app.inject({
      method: "POST",
      url: "/api/ai/variation-drill",
      payload: { parentQuestionId: parent!.id },
    });
    assert.ok(
      drillRes.statusCode === 200 || drillRes.statusCode === 422,
      `드릴 생성 상태 ${drillRes.statusCode}`,
    );

    if (drillRes.statusCode === 422) {
      assert.ok(drillRes.json().failureReason);
      const recordOnly = await app.inject({
        method: "POST",
        url: `/api/sessions/${originalId}/submit`,
        payload: {
          questionId: parent!.id,
          userAnswer: "x",
          timeSpentMs: 1000,
          recordOnly: true,
        },
      });
      assert.strictEqual(recordOnly.statusCode, 400);
      console.log("OK   정답 없는 드릴은 학습 DB 채점 문제로 제공하지 않음");
    } else {
      const drillBody = drillRes.json();
      assert.strictEqual(drillBody.success, true);
      assert.ok(drillBody.drillSession?.id);
      assert.strictEqual(drillBody.question.studyVisibility, "TEMPORARY_DRILL");
      const listed = qRepo.findMany({ limit: 100 }).items.map((q) => q.id);
      assert.ok(!listed.includes(drillBody.question.id), "임시 드릴은 일반 목록에서 제외");

      const drillSubmit = await app.inject({
        method: "POST",
        url: `/api/sessions/${drillBody.drillSession.id}/submit`,
        payload: {
          questionId: drillBody.question.id,
          userAnswer: drillBody.question.groundTruthAnswer,
          timeSpentMs: 1000,
        },
      });
      assert.strictEqual(drillSubmit.statusCode, 200);

      const unknownRes = await app.inject({
        method: "POST",
        url: "/api/ai/variation-drill",
        payload: { parentQuestionId: parent!.id },
      });
      if (unknownRes.statusCode === 200) {
        const unknownSubmit = await app.inject({
          method: "POST",
          url: `/api/sessions/${unknownRes.json().drillSession.id}/unknown`,
          payload: { questionId: unknownRes.json().question.id, timeSpentMs: 500 },
        });
        assert.strictEqual(unknownSubmit.statusCode, 200);
      }

      const after = sRepo.findById(originalId)!;
      assert.strictEqual(after.status, "COMPLETED");
      assert.strictEqual(after.totalQuestions, originalSnapshot.totalQuestions);
      assert.strictEqual(after.correctCount, originalSnapshot.correctCount);

      const completedSubmit = await app.inject({
        method: "POST",
        url: `/api/sessions/${originalId}/submit`,
        payload: {
          questionId: parent!.id,
          userAnswer: "x",
          timeSpentMs: 1000,
          recordOnly: true,
        },
      });
      assert.strictEqual(completedSubmit.statusCode, 400);
      console.log("OK   마지막 문항 뒤 드릴은 별도 세션으로 기록, 원본 세션은 유지");
    }

    const extra: Question[] = [];
    for (let i = 0; i < 104; i++) {
      extra.push(
        liveQuestion({
          id: `q_bulk_${i}`,
          question: `고유 대량 문항 ${i}번 지문 내용입니다 식별자${i}`,
          groundTruthAnswer: String(i),
          structuralFingerprint: generateStructuralFingerprint(
            `고유 대량 문항 ${i}번 지문 내용입니다 식별자${i}`,
            undefined,
            "프로그래밍언어활용",
          ),
        }),
      );
    }
    qRepo.bulkInsert(extra);
    const allLive = qRepo.findAllMatching();
    assert.ok(allLive.length >= 104, `전체 조회 ${allLive.length}`);
    const page = qRepo.findMany({ limit: 100 });
    assert.strictEqual(page.items.length, 100);
    assert.ok(page.total > 100);

    const target = extra[103];
    const pipeline = new QuestionImportPipeline();
    const staged = await pipeline.parseAndStage({
      format: "JSON",
      sourceName: "104번 재수입",
      sourceType: "USER_IMPORTED",
      content: JSON.stringify([
        {
          questionText: target.question,
          extractedAnswer: target.groundTruthAnswer,
          subject: target.subject,
          category: target.category,
          type: target.type,
        },
        {
          questionText: target.question,
          extractedAnswer: target.groundTruthAnswer,
          subject: target.subject,
          category: target.category,
          type: target.type,
        },
      ]),
    });
    assert.notStrictEqual(staged.stagedQuestions[0].duplicateStatus, "NEW");
    assert.notStrictEqual(staged.stagedQuestions[1].duplicateStatus, "NEW");
    console.log("OK   100개 이후 문항 재수입은 NEW가 아님, 배치 내부 중복도 탐지");

    const javaGen = await app.inject({
      method: "POST",
      url: "/api/ai/batch-generate",
      payload: { mode: "DOMAIN", domain: "Java", count: 1 },
    });
    assert.ok(
      javaGen.statusCode === 201 || javaGen.statusCode === 200,
      `Java 생성 상태 ${javaGen.statusCode} ${javaGen.body}`,
    );
    if (javaGen.statusCode === 201) {
      const stagedList = await app.inject({
        method: "GET",
        url: `/api/staging/questions?batchId=${encodeURIComponent(javaGen.json().batchId)}`,
      });
      assert.strictEqual(stagedList.statusCode, 200);
      const rows = stagedList.json().items || [];
      if (rows[0]) {
        assert.notStrictEqual(String(rows[0].language || "").toUpperCase(), "C");
      }
    }

    const sqlGen = await app.inject({
      method: "POST",
      url: "/api/ai/batch-generate",
      payload: { mode: "DOMAIN", domain: "SQL", count: 1 },
    });
    assert.ok(sqlGen.statusCode === 201 || sqlGen.statusCode === 404 || sqlGen.statusCode === 200);
    if (sqlGen.statusCode === 404) {
      assert.match(sqlGen.json().message || "", /SQL/);
    }
    console.log("OK   Java 독립 생성은 C fallback 없음, SQL은 명확히 처리");
  } finally {
    isolated.cleanup();
  }
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
