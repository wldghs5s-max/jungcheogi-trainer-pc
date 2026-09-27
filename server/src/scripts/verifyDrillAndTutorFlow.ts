import { buildApp } from "../app.js";
import { runMigrations } from "../db/migrator.js";
import { getDatabase } from "../db/database.js";
import { seedFixtureQuestions } from "../db/seeder.js";
import { QuestionRepository } from "../db/repositories/questionRepository.js";

async function runVerification() {
  console.log("============================================================");
  console.log("드릴/복습 세션/Ground Truth 보호 검증");
  console.log("============================================================\n");

  runMigrations();
  const db = getDatabase();
  seedFixtureQuestions(db);
  const app = buildApp();
  const questionRepo = new QuestionRepository(db);
  const parent = questionRepo.findMany({ limit: 20 }).items.find((q) => q.id);

  if (!parent) {
    throw new Error("검증용 원본 문항이 없습니다.");
  }

  const sessionRes = await app.inject({
    method: "POST",
    url: "/api/sessions",
    payload: {
      title: "복습 큐 지정 세션",
      questionIds: [parent.id],
    },
  });
  if (sessionRes.statusCode !== 201) {
    throw new Error(`세션 생성 실패: ${sessionRes.statusCode} ${sessionRes.body}`);
  }
  const sessionBody = JSON.parse(sessionRes.body);
  if (sessionBody.session.questionIds[0] !== parent.id) {
    throw new Error("지정한 questionIds로 세션이 만들어지지 않았습니다.");
  }
  console.log("OK  지정 questionIds로 복습 세션 생성");

  const drillRes = await app.inject({
    method: "POST",
    url: "/api/ai/variation-drill",
    payload: { parentQuestionId: parent.id },
  });
  if (drillRes.statusCode !== 200) {
    throw new Error(`드릴 생성 실패: ${drillRes.statusCode} ${drillRes.body}`);
  }
  const drillBody = JSON.parse(drillRes.body);
  const drillQuestion = questionRepo.findById(drillBody.question.id);
  if (!drillQuestion) {
    throw new Error("드릴 문항이 DB에 저장되지 않았습니다.");
  }
  if (drillQuestion.officialExplanation) {
    throw new Error("AI 드릴 문항에 officialExplanation이 들어가면 안 됩니다.");
  }
  console.log(`OK  드릴 문항 DB 저장 (${drillQuestion.id})`);

  const beforeIndex = sessionBody.session.currentIndex;
  const submitRes = await app.inject({
    method: "POST",
    url: `/api/sessions/${sessionBody.session.id}/submit`,
    payload: {
      questionId: drillQuestion.id,
      userAnswer: drillQuestion.groundTruthAnswer,
      timeSpentMs: 1200,
      recordOnly: true,
    },
  });
  if (submitRes.statusCode !== 200) {
    throw new Error(`드릴 제출 실패: ${submitRes.statusCode} ${submitRes.body}`);
  }
  const submitBody = JSON.parse(submitRes.body);
  if (submitBody.sessionProgress.currentIndex !== beforeIndex) {
    throw new Error("recordOnly 제출이 세션 인덱스를 올렸습니다.");
  }
  console.log("OK  recordOnly 제출은 세션 진행을 유지");

  const wrongSubmit = await app.inject({
    method: "POST",
    url: `/api/sessions/${sessionBody.session.id}/submit`,
    payload: {
      questionId: drillQuestion.id,
      userAnswer: "다른문항제출",
      timeSpentMs: 800,
    },
  });
  if (wrongSubmit.statusCode !== 400) {
    throw new Error("세션 밖 문항 일반 제출이 차단되지 않았습니다.");
  }
  console.log("OK  현재 세션 문항이 아니면 일반 제출 거부");

  await app.close();
  console.log("\n검증 완료");
}

runVerification().catch((err) => {
  console.error(err);
  process.exit(1);
});
