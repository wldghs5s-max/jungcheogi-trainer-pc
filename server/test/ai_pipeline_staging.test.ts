import assert from "node:assert";
import Database from "better-sqlite3";
import { QuestionRepository } from "../src/db/repositories/questionRepository";
import { ImportBatchRepository } from "../src/db/repositories/importBatchRepository";
import { MockQuestionVariationGenerator } from "../src/engine/variationGenerator";
import {
  evaluateDualConsistency,
  verifyStepTraceMatch,
  verifyExplanationMatch,
} from "../src/engine/evaluationValidator";
import { resolveGeneratedGroundTruth } from "../src/engine/aiService";
import { GeneratedIndependentQuestion, StagedQuestion } from "@jungcheogi/shared";

function setupTestDb() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE questions (
      id TEXT PRIMARY KEY,
      question_code TEXT,
      source_type TEXT NOT NULL,
      exam_year INTEGER,
      exam_round INTEGER,
      question_number INTEGER,
      parent_question_id TEXT,
      concept_id TEXT,
      subject TEXT NOT NULL,
      category TEXT NOT NULL,
      sub_category TEXT,
      type TEXT NOT NULL,
      question_text TEXT NOT NULL,
      code_snippet TEXT,
      language TEXT,
      options_json TEXT,
      ground_truth_answer TEXT NOT NULL,
      official_explanation TEXT,
      hints_json TEXT,
      code_line_explanations_json TEXT,
      active_recall_meta_json TEXT,
      ai_explanation TEXT,
      ai_variation_notes TEXT,
      difficulty TEXT NOT NULL DEFAULT 'MEDIUM',
      keywords_json TEXT NOT NULL DEFAULT '[]',
      structural_fingerprint TEXT,
      study_visibility TEXT NOT NULL DEFAULT 'LIVE',
      created_at TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE TABLE import_batches (
      id TEXT PRIMARY KEY,
      source_name TEXT NOT NULL,
      format TEXT NOT NULL,
      source_type TEXT NOT NULL,
      total_count INTEGER NOT NULL DEFAULT 0,
      pending_count INTEGER NOT NULL DEFAULT 0,
      approved_count INTEGER NOT NULL DEFAULT 0,
      rejected_count INTEGER NOT NULL DEFAULT 0,
      committed_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
      created_at TEXT NOT NULL,
      committed_at TEXT
    );

    CREATE TABLE staged_questions (
      id TEXT PRIMARY KEY,
      question_code TEXT,
      batch_id TEXT NOT NULL,
      index_in_batch INTEGER NOT NULL,
      source_type TEXT NOT NULL,
      exam_year INTEGER,
      exam_round INTEGER,
      question_number INTEGER,
      parent_question_id TEXT,
      concept_id TEXT,
      subject TEXT NOT NULL,
      category TEXT NOT NULL,
      sub_category TEXT,
      type TEXT NOT NULL,
      question_text TEXT NOT NULL,
      code_snippet TEXT,
      language TEXT,
      options_json TEXT,
      ground_truth_answer TEXT NOT NULL,
      official_explanation TEXT,
      ai_explanation TEXT,
      ai_variation_notes TEXT,
      difficulty TEXT NOT NULL DEFAULT 'MEDIUM',
      keywords_json TEXT NOT NULL DEFAULT '[]',
      structural_fingerprint TEXT,
      duplicate_status TEXT NOT NULL DEFAULT 'NEW',
      duplicate_question_id TEXT,
      duplicate_similarity REAL,
      validation_issues_json TEXT NOT NULL DEFAULT '[]',
      review_status TEXT NOT NULL DEFAULT 'PENDING',
      reviewer_notes TEXT,
      reviewed_at TEXT,
      committed_question_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      FOREIGN KEY (batch_id) REFERENCES import_batches(id) ON DELETE CASCADE
    );
  `);

  return db;
}

async function runTests() {
  console.log("=== AI Pipeline & Staging Integration Tests ===");

  const db = setupTestDb();
  const questionRepo = new QuestionRepository(db);
  const batchRepo = new ImportBatchRepository(db);
  const variationStager = new MockQuestionVariationGenerator(db);

  // 1. Test questionCode monotonic MAX+1 generation
  console.log("Test 1: Monotonic questionCode generation");
  const code1 = questionRepo.generateNextCode("AI_GENERATED");
  assert.strictEqual(code1, "AI-000001", "Initial AI code should be AI-000001");

  // Insert code into questions table
  db.prepare(`
    INSERT INTO questions (id, question_code, source_type, subject, category, type, question_text, ground_truth_answer, created_at)
    VALUES ('q1', 'AI-000010', 'AI_GENERATED', '소프트웨어설계', '일반', 'SHORT_ANSWER', 'Q1', 'A1', datetime('now'))
  `).run();

  const code2 = questionRepo.generateNextCode("AI_VARIATION");
  assert.strictEqual(code2, "AI-000011", "Next code after AI-000010 should be AI-000011");

  // Insert code into staged_questions table
  db.prepare(`
    INSERT INTO import_batches (id, source_name, format, source_type, created_at)
    VALUES ('b1', 'Batch 1', 'JSON', 'AI_GENERATED', datetime('now'))
  `).run();
  db.prepare(`
    INSERT INTO staged_questions (id, question_code, batch_id, index_in_batch, source_type, subject, category, type, question_text, ground_truth_answer, created_at)
    VALUES ('stg1', 'AI-000025', 'b1', 1, 'AI_GENERATED', '소프트웨어설계', '일반', 'SHORT_ANSWER', 'Qstg', 'Astg', datetime('now'))
  `).run();

  const code3 = questionRepo.generateNextCode("AI_GENERATED");
  assert.strictEqual(code3, "AI-000026", "Next code after staged AI-000025 should be AI-000026");
  console.log("  ✓ Monotonic questionCode generation passed");

  // 2. Test Staging of independent question with Evaluator metadata
  console.log("Test 2: Stage independent question with Evaluator metadata");
  const sampleIndepQuestion: GeneratedIndependentQuestion = {
    correlationId: "CORR-01",
    questionText: "다음 C 프로그램의 실행 결과를 쓰시오.",
    code: '#include <stdio.h>\nint main() {\n  int a[] = {10, 20, 30};\n  int *p = a;\n  printf("%d", *(p + 1));\n  return 0;\n}',
    groundTruthAnswer: "20",
    officialExplanation: "포인터 p는 a[0]을 가리키고 *(p + 1)은 a[1]의 값인 20을 출력합니다.",
    difficulty: "MEDIUM",
    keywords: ["포인터", "배열", "역참조"],
    subject: "프로그래밍언어활용",
    category: "C 언어 포인터",
    type: "CODE_TRACE",
    designMetadata: {
      concept: "포인터와 1차원 배열",
      difficulty: "MEDIUM",
      skill: "배열명 포인터 변환 및 *(arr + i) 역참조 연산 순서 추적",
      questionDesign: "배열 원소 오프셋 참조",
      stepByStepTrace: "1. a[] = {10, 20, 30} 초기화\n2. p = &a[0]\n3. p + 1 = &a[1]\n4. *(p + 1) = 20 출력",
    },
  };

  const stagedResult = await variationStager.stageIndependentQuestion(
    sampleIndepQuestion,
    undefined,
    {
      decision: "PASS",
      rejectionReasons: [],
      model: "gemini-3.8-flash",
    }
  );

  assert.ok(stagedResult.batchId, "Batch ID should be generated");
  assert.ok(stagedResult.stagedQuestion.questionCode, "questionCode should be assigned at staging");
  assert.strictEqual(stagedResult.stagedQuestion.reviewStatus, "PENDING", "Initial status must be PENDING");
  assert.ok(
    stagedResult.stagedQuestion.aiVariationNotes?.includes("코드 실행 상태: UNAVAILABLE"),
    "aiVariationNotes must state code execution is UNAVAILABLE"
  );
  assert.ok(
    stagedResult.stagedQuestion.aiVariationNotes?.includes("*(p + 1) = 20"),
    "aiVariationNotes must include stepByStepTrace"
  );
  assert.ok(
    !stagedResult.stagedQuestion.officialExplanation,
    "AI 독립형 문항은 officialExplanation을 비워야 함",
  );
  assert.ok(
    stagedResult.stagedQuestion.aiExplanation,
    "AI 해설은 aiExplanation에만 저장",
  );
  assert.ok(
    stagedResult.stagedQuestion.reviewerNotes?.includes("Evaluator PASS"),
    "reviewerNotes must record Evaluator decision",
  );
  console.log(`  ✓ Stage independent question passed (assigned: ${stagedResult.stagedQuestion.questionCode})`);

  // 3. Test Evaluator REJECT prevention
  console.log("Test 3: Evaluator REJECT detection");
  const badTrace = "배열의 첫 원소는 8로 변경되고 c=8, d=4이다.";
  const badAns = "2 4 4 8 10";
  const traceCheck = verifyStepTraceMatch(badTrace, badAns, "EVAL-C-25");
  const explCheck = verifyExplanationMatch("결과적으로 정답은 25입니다.", "15", "EVAL-C-13");

  const rejectDual = evaluateDualConsistency({
    stepTraceStatus: traceCheck.status,
    explanationStatus: explCheck.status,
    cloneType: "NONE",
    actualCodeOutput: undefined,
    codeExecutionStatus: "UNAVAILABLE",
    expectedAnswer: badAns,
  });

  assert.strictEqual(rejectDual.finalDecision, "REJECT", "Contradictory trace/explanation must be REJECTED");
  assert.ok(rejectDual.rejectionReasons.length > 0, "Must have rejection reasons");

  const unverifiedPass = evaluateDualConsistency({
    stepTraceStatus: "MATCH",
    explanationStatus: "MATCH",
    cloneType: "NONE",
    actualCodeOutput: undefined,
    codeExecutionStatus: "UNAVAILABLE",
    expectedAnswer: "20",
  });
  assert.strictEqual(
    unverifiedPass.finalDecision,
    "REVIEW",
    "코드 실행 UNAVAILABLE이면 PASS가 아니라 REVIEW",
  );
  console.log("  ✓ Evaluator REJECT detection passed");

  // 4. Test Staging -> Commit Single Question to Live DB
  console.log("Test 4: Commit single approved question to Live DB");
  const stagedId = stagedResult.stagedQuestion.id;
  const originalQuestionCode = stagedResult.stagedQuestion.questionCode!;

  let pendingCommitFailed = false;
  try {
    batchRepo.commitSingleApprovedQuestion(stagedId);
  } catch {
    pendingCommitFailed = true;
  }
  assert.ok(pendingCommitFailed, "PENDING 문항은 Live 커밋이 거부되어야 함");
  batchRepo.setStagedReviewStatus(stagedId, "APPROVED");
  const liveQuestion = batchRepo.commitSingleApprovedQuestion(stagedId);
  assert.ok(liveQuestion.id, "Live question must have ID");
  assert.strictEqual(
    liveQuestion.questionCode,
    originalQuestionCode,
    "questionCode must be strictly preserved across Staging -> Live DB"
  );

  // Verify in questions table
  const inLive = questionRepo.findById(liveQuestion.id);
  assert.ok(inLive, "Must exist in live questions table");
  assert.strictEqual(inLive.questionCode, originalQuestionCode, "questionCode in DB must match");

  // Verify staged status is updated to COMMITTED
  const stagedAfter = batchRepo.findStagedById(stagedId);
  assert.strictEqual(stagedAfter?.reviewStatus, "COMMITTED", "Staged status must be COMMITTED");
  assert.strictEqual(stagedAfter?.committedQuestionId, liveQuestion.id, "committedQuestionId must link to live question");
  console.log(`  ✓ Single question commit passed (Code preserved: ${originalQuestionCode})`);

  // 5. Test findStagedQuestions filtering
  console.log("Test 5: findStagedQuestions filter");
  const filterRes = batchRepo.findStagedQuestions({ sourceType: "AI_GENERATED" });
  assert.ok(filterRes.items.length >= 2, "Should find staged questions with AI_GENERATED filter");
  console.log("  ✓ findStagedQuestions filter passed");

  console.log("Test 6: REJECTED 문항은 일괄 승인에서 제외");
  batchRepo.setStagedReviewStatus("stg1", "REJECTED");
  batchRepo.approveQuestionsWithoutErrors("b1");
  assert.strictEqual(
    batchRepo.findStagedById("stg1")?.reviewStatus,
    "REJECTED",
    "반려 문항은 approve-all로 재승인되면 안 됨",
  );
  console.log("  ✓ REJECTED skip in approve-all passed");

  console.log("Test 7: 변형 정답은 코드가 바뀌면 원본 GT를 상속하지 않음");
  assert.strictEqual(
    resolveGeneratedGroundTruth(undefined, "20", "int x=2;", "int x=1;"),
    "",
  );
  assert.strictEqual(
    resolveGeneratedGroundTruth("8", "20", "int x=2;", "int x=1;"),
    "8",
  );
  assert.strictEqual(
    resolveGeneratedGroundTruth(undefined, "20", "same", "same"),
    "20",
  );
  console.log("  ✓ generated GT inheritance guard passed");

  console.log("\n All AI Pipeline & Staging Integration Tests PASSED successfully!");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
