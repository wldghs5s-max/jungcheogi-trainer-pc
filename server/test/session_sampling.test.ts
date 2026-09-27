import assert from "node:assert";
import { Question } from "@jungcheogi/shared";
import { QuestionRepository, pickRandomIds } from "../src/db/repositories/questionRepository.js";
import { buildApp } from "../src/app.js";
import { setupIsolatedTestDb } from "./helpers/testDb.js";

function makeQuestion(id: string, questionNumber: number): Question {
  return {
    id,
    sourceType: "TEST_FIXTURE",
    examYear: 2024,
    examRound: 1,
    questionNumber,
    subject: "소프트웨어설계",
    category: "샘플링",
    type: "SHORT_ANSWER",
    question: `문항 ${id}`,
    groundTruthAnswer: id,
    difficulty: "EASY",
    keywords: [],
    createdAt: new Date().toISOString(),
  };
}

async function testSessionSampling() {
  console.log("=== 세션 문제 무작위 선택 ===\n");

  const ids = Array.from({ length: 20 }, (_, i) => `id_${String(i).padStart(2, "0")}`);
  const alwaysTail = () => 0.999999;
  const pickedTail = pickRandomIds(ids, 3, alwaysTail);
  assert.deepStrictEqual(pickedTail, ["id_19", "id_18", "id_17"]);
  assert.strictEqual(new Set(pickedTail).size, 3);
  console.log("OK   결정적 RNG로 목록 앞부분 밖 항목 선택");

  const fewer = pickRandomIds(["a", "b"], 5, alwaysTail);
  assert.deepStrictEqual(fewer.sort(), ["a", "b"]);
  console.log("OK   요청 수보다 후보가 적으면 가능한 만큼만 반환");

  const isolated = setupIsolatedTestDb({ seed: false });
  const app = buildApp();
  try {
    const repo = new QuestionRepository();
    for (let i = 0; i < 15; i++) {
      repo.create(makeQuestion(`q_sample_${String(i).padStart(2, "0")}`, i + 1));
    }

    const head = repo.findMany({ limit: 3 }).items.map((q) => q.id);
    const selected = repo.pickRandom({}, 3, alwaysTail).map((q) => q.id);
    assert.strictEqual(selected.length, 3);
    assert.strictEqual(new Set(selected).size, 3);
    assert.ok(
      selected.every((id) => !head.includes(id)),
      `앞부분(${head.join(",")}) 밖의 문제가 선택되어야 함: ${selected.join(",")}`,
    );
    console.log("OK   findMany 앞 3건 밖의 문제 선택 확인");

    const explicit = ["q_sample_01", "q_sample_07", "q_sample_07"];
    const created = await app.inject({
      method: "POST",
      url: "/api/sessions",
      payload: { title: "지정 문항", questionIds: explicit, count: 2 },
    });
    assert.strictEqual(created.statusCode, 201);
    const session = JSON.parse(created.body).session;
    assert.deepStrictEqual(session.questionIds, ["q_sample_01", "q_sample_07"]);
    console.log("OK   questionIds 지정 시 기존 동작(중복 제거 후 순서 유지) 보존");
  } finally {
    await app.close();
    isolated.cleanup();
  }

  console.log("\n세션 무작위 선택 검증 통과");
}

testSessionSampling().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
