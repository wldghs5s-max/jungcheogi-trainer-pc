import assert from "node:assert";
import { runMigrations } from "../src/db/migrator";
import { getDatabase } from "../src/db/database";
import { buildApp } from "../src/app";
import { seedFixtureQuestions } from "../src/db/seeder";
import { QuestionRepository } from "../src/db/repositories/questionRepository";
import { ImportBatchRepository } from "../src/db/repositories/importBatchRepository";
import { SEED_QUESTIONS } from "../src/db/fixtures/seedQuestions";
import { setupIsolatedTestDb } from "./helpers/testDb";

async function testImportsPipelineAndReview() {
  console.log(
    "=== Phase 4: 문제 데이터 검수 및 Import 파이프라인 종합 테스트 시작 ===\n",
  );
  const isolated = setupIsolatedTestDb({ seed: false });

  // 1. DB 초기화 및 시딩
  runMigrations();
  const db = getDatabase();
  // 이전 테스트 실행 잔여 데이터 정리 (테스트 멱등성 보장)
  db.prepare(
    `DELETE FROM questions WHERE id NOT IN (${SEED_QUESTIONS.map((q) => `'${q.id}'`).join(",")})`,
  ).run();
  db.prepare(`DELETE FROM staged_questions`).run();
  db.prepare(`DELETE FROM import_batches`).run();

  const seedResult = seedFixtureQuestions(db);
  const initialTotalQuestions = seedResult.totalCount;
  console.log(`[DB 준비] 기존 시드 문항: ${initialTotalQuestions}건 확인`);

  const app = buildApp();
  const qRepo = new QuestionRepository(db);

  // 2. Markdown 데이터 파싱 및 Staging 생성 (API 테스트)
  console.log("\n--- 1. Markdown 파싱 및 중복 검출 테스트 ---");
  const sampleMarkdown = `
# 2024년 1회 기출문제 검수 대상

### [문제 1] 단답형
- 과목: 소프트웨어설계
- 카테고리: 디자인 패턴
- 출처: REAL_EXAM
- 기출: 2024년 1회 1번
- 난이도: MEDIUM

객체 생성에 관련된 디자인 패턴 중 하나로, 복잡한 인스턴스를 조립하여 만드는 구조이며, 생성과 표현을 분리하여 동일한 생성 절차에서 서로 다른 표현 결과를 만들 수 있는 패턴은 무엇인가?

**정답**: 빌더
**해설**: GoF 디자인 패턴 중 생성 패턴에 해당하는 빌더(Builder) 패턴 설명입니다.
**키워드**: 빌더, Builder, 생성패턴

---

### [문제 2] C 언어 포인터 신규 문항
- 과목: 프로그래밍언어활용
- 카테고리: C 프로그래밍
- 출처: REAL_EXAM
- 기출: 2024년 1회 2번
- 난이도: HARD

다음 C언어로 작성된 프로그램의 실행 결과를 작성하시오.

\`\`\`c
#include <stdio.h>
int main() {
    int arr[3] = {100, 200, 300};
    int *ptr = arr;
    printf("%d\\n", *(ptr + 2));
    return 0;
}
\`\`\`

**정답**: 300
**해설**: ptr은 arr[0]을 가리키며, *(ptr + 2)는 arr[2]의 값 300을 참조합니다.
**키워드**: C언어, 포인터, 배열

---

### [문제 3] 오류 검증용 결함 문항
- 과목: 잘못된과목명
- 난이도: MEDIUM

문제 지문만 있고 정답이 누락된 불완전한 문항입니다.
`;

  const resParseMd = await app.inject({
    method: "POST",
    url: "/api/imports/parse",
    payload: {
      format: "MARKDOWN",
      sourceName: "2024_01_exam_draft.md",
      sourceType: "REAL_EXAM",
      content: sampleMarkdown,
    },
  });

  assert.strictEqual(resParseMd.statusCode, 201);
  const parseData = JSON.parse(resParseMd.body);
  const batch = parseData.batch;
  const staged = parseData.stagedQuestions;

  assert.strictEqual(batch.totalCount, 3);
  assert.strictEqual(batch.pendingCount, 3);
  assert.strictEqual(batch.status, "PENDING_REVIEW");
  console.log(
    `OK   [POST /api/imports/parse] 마크다운 파싱 성공 (배치 ID: ${batch.id}, 총 ${staged.length}건)`,
  );

  // (1) 1번 문항 중복 검출 확인: 기존 q_2020_01_01과 동일 지문
  const q1 = staged[0];
  assert.strictEqual(
    q1.duplicateStatus,
    "DUPLICATE_WARNING",
    "기존 빌더 패턴 문항과 중복 경고 발생 확인",
  );
  assert(q1.duplicateSimilarity >= 0.85, "높은 유사도 확인");
  console.log(
    `OK   [중복 감지] 1번 문항 중복 경고 (${q1.duplicateStatus}, 유사도: ${q1.duplicateSimilarity})`,
  );

  // (2) 2번 문항 신규 감지 확인
  const q2 = staged[1];
  assert.strictEqual(q2.duplicateStatus, "NEW", "신규 C 포인터 문항 NEW 판별");
  assert.strictEqual(q2.groundTruthAnswer, "300");
  console.log("OK   [신규 감지] 2번 문항 신규 문항(NEW) 정상 분류");

  // (3) 3번 결함 문항 Validation 오류 확인
  const q3 = staged[2];
  const hasAnswerError = q3.validationIssues.some(
    (i: any) => i.field === "groundTruthAnswer" && i.severity === "ERROR",
  );
  assert(hasAnswerError, "정답 누락에 대한 ERROR validation 이슈 감지");
  console.log("OK   [Validation 검증] 3번 결함 문항 필수 정답 누락 ERROR 감지");

  // 3. Staging 배치 조회 및 개별 문항 검수 (Review Lifecycle)
  console.log("\n--- 2. 검수 라이프사이클 (Review Lifecycle) API 테스트 ---");

  // (1) GET /api/imports/batches/:id
  const resGetBatch = await app.inject({
    method: "GET",
    url: `/api/imports/batches/${batch.id}`,
  });
  assert.strictEqual(resGetBatch.statusCode, 200);
  const fetchedBatch = JSON.parse(resGetBatch.body);
  assert.strictEqual(fetchedBatch.batch.id, batch.id);

  // (2) PATCH /api/imports/questions/:stagedId: 3번 문항의 결함 수정 (정답 입력 및 과목 보정)
  const resPatch = await app.inject({
    method: "PATCH",
    url: `/api/imports/questions/${q3.id}`,
    payload: {
      subject: "소프트웨어설계",
      category: "요구사항 확인",
      groundTruthAnswer: "보정된정답",
      officialExplanation: "검수자가 직접 수동 보정한 공식 해설입니다.",
      reviewerNotes: "결함 수정 완료",
    },
  });
  assert.strictEqual(resPatch.statusCode, 200);
  const patchedQ3 = JSON.parse(resPatch.body).stagedQuestion;
  assert.strictEqual(patchedQ3.groundTruthAnswer, "보정된정답");
  assert.strictEqual(patchedQ3.subject, "소프트웨어설계");
  // 재검증 후 ERROR 이슈가 해결되었는지 확인
  const remainingErrors = patchedQ3.validationIssues.filter(
    (i: any) => i.severity === "ERROR",
  );
  assert.strictEqual(remainingErrors.length, 0, "수정 후 ERROR 이슈 소멸 확인");
  console.log("OK   [PATCH Staged] 결함 문항 필드 수정 및 재검증 통과");

  // (3) 상태 변경: 1번 문항 중복이므로 반려(REJECTED), 2번 문항 승인(APPROVED), 3번 문항 승인(APPROVED)
  const resReject1 = await app.inject({
    method: "POST",
    url: `/api/imports/questions/${q1.id}/status`,
    payload: {
      reviewStatus: "REJECTED",
      reviewerNotes: "기존 빌더 문제와 중복되어 반려함",
    },
  });
  assert.strictEqual(resReject1.statusCode, 200);

  const resApprove2 = await app.inject({
    method: "POST",
    url: `/api/imports/questions/${q2.id}/status`,
    payload: {
      reviewStatus: "APPROVED",
      reviewerNotes: "2024년 1회 기출 대조 검수 완료",
    },
  });
  assert.strictEqual(resApprove2.statusCode, 200);

  const resApprove3 = await app.inject({
    method: "POST",
    url: `/api/imports/questions/${q3.id}/status`,
    payload: { reviewStatus: "APPROVED", reviewerNotes: "수동 검수 승인" },
  });
  assert.strictEqual(resApprove3.statusCode, 200);

  // 배치 카운트 동기화 확인
  const resBatchCounts = await app.inject({
    method: "GET",
    url: `/api/imports/batches/${batch.id}`,
  });
  const updatedBatch = JSON.parse(resBatchCounts.body).batch;
  assert.strictEqual(updatedBatch.approvedCount, 2);
  assert.strictEqual(updatedBatch.rejectedCount, 1);
  assert.strictEqual(updatedBatch.pendingCount, 0);
  console.log(
    `OK   [검수 상태 갱신] 승인: ${updatedBatch.approvedCount}건, 반려: ${updatedBatch.rejectedCount}건 확인`,
  );

  // 4. 원자적 Live DB Commit 테스트
  console.log("\n--- 3. 승인 문항 원자적 Live DB Commit 테스트 ---");
  const resCommit = await app.inject({
    method: "POST",
    url: `/api/imports/batches/${batch.id}/commit`,
  });
  assert.strictEqual(resCommit.statusCode, 200);
  const commitResult = JSON.parse(resCommit.body);

  assert.strictEqual(
    commitResult.committedCount,
    2,
    "승인된 2건만 커밋되어야 함 (반려 문항 제외)",
  );
  assert.strictEqual(commitResult.batch.status, "COMMITTED");

  // 실제 questions 테이블에 2건이 신규 반영되었는지 검증
  const totalAfter = qRepo.findMany({ limit: 100 }).total;
  assert.strictEqual(
    totalAfter,
    initialTotalQuestions + 2,
    "Live DB에 정확히 2건 추가",
  );

  // 커밋된 2번 문항 조회 검증
  const newCQuestion = qRepo.findMany({ search: "ptr + 2" }).items[0];
  assert(newCQuestion, "커밋된 C 포인터 문제 조회 확인");
  assert.strictEqual(newCQuestion.groundTruthAnswer, "300");
  assert.strictEqual(newCQuestion.sourceType, "REAL_EXAM");

  // 기존 12개 검증용 Fixture 중 TEST_FIXTURE가 안전하게 보존되었는지 검증
  const fixtures = qRepo.findMany({ sourceType: "TEST_FIXTURE" }).items;
  assert.strictEqual(fixtures.length, 9, "기존 TEST_FIXTURE 9문항 보존");
  console.log(
    "OK   [Live Commit] 승인된 문항만 선별 적재 및 기존 TEST_FIXTURE 보존 확인",
  );

  // 5. JSON 포맷 파이프라인 검증
  console.log("\n--- 4. JSON 포맷 Import 파이프라인 검증 ---");
  const sampleJson = JSON.stringify([
    {
      subject: "데이터베이스구축",
      category: "SQL 응용",
      type: "SQL",
      sourceType: "TEXTBOOK",
      question:
        "테이블에서 특정 컬럼의 중복 값을 제거하고 고유한 값만 조회하는 SQL 키워드를 작성하시오.",
      groundTruthAnswer: "DISTINCT",
      officialExplanation:
        "DISTINCT 키워드는 SELECT 절에서 중복된 결과 튜플을 제거합니다.",
      difficulty: "EASY",
      keywords: ["SQL", "DISTINCT", "중복제거"],
    },
  ]);

  const resJson = await app.inject({
    method: "POST",
    url: "/api/imports/parse",
    payload: {
      format: "JSON",
      sourceName: "textbook_sql_sample.json",
      sourceType: "TEXTBOOK",
      content: sampleJson,
    },
  });
  assert.strictEqual(resJson.statusCode, 201);
  const jsonBatch = JSON.parse(resJson.body).batch;
  assert.strictEqual(jsonBatch.totalCount, 1);
  assert.strictEqual(jsonBatch.sourceType, "TEXTBOOK");
  console.log("OK   [JSON Import] JSON 포맷 파싱 및 Staging 등록 완료");

  console.log(
    "\n🎉 Phase 4: Import 파이프라인, 검수 라이프사이클, 중복 감지, DB Commit 테스트 전체 통과!",
  );
  isolated.cleanup();
}

testImportsPipelineAndReview();
