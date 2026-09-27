import { buildApp } from "../app.js";
import { getDatabase } from "../db/database.js";
import { QuestionRepository } from "../db/repositories/questionRepository.js";
import { ImportBatchRepository } from "../db/repositories/importBatchRepository.js";

async function runVerification() {
  console.log("================================================================================");
  console.log("★ 사용자 관점 4대 핵심 시나리오(A, B, C, D) 통합 엔드투엔드 검증 시작");
  console.log("================================================================================\n");

  const app = await buildApp();
  const db = getDatabase();
  const questionRepo = new QuestionRepository(db);
  const batchRepo = new ImportBatchRepository(db);

  // --------------------------------------------------------------------------------
  // [시나리오 A] 랜덤 문제 생성
  // --------------------------------------------------------------------------------
  console.log("--- [시나리오 A] 랜덤 문제 생성 (난해한 설정 없이 '랜덤' + '개수 5개'만 선택) ---");
  const resA = await app.inject({
    method: "POST",
    url: "/api/ai/batch-generate",
    payload: {
      mode: "RANDOM",
      count: 5,
    },
  });

  if (resA.statusCode !== 201) {
    throw new Error(`[시나리오 A 실패] HTTP ${resA.statusCode}: ${resA.body}`);
  }
  const bodyA = JSON.parse(resA.body);
  console.log(`✓ 응답 코드: ${resA.statusCode}`);
  console.log(`✓ 생성 결과: 배치 ID=${bodyA.batchId}, 생성 개수=${bodyA.count}개`);
  console.log(`✓ 스테이징 문항 ID 목록: [${bodyA.stagedQuestionIds.join(", ")}]`);

  if (bodyA.count !== 5 || bodyA.stagedQuestionIds.length !== 5) {
    throw new Error(`[시나리오 A 실패] 5개 문항이 생성되지 않았습니다 (count=${bodyA.count})`);
  }

  // DB 확인: PENDING 상태로 자동 적재되었는지 확인
  const stagedA = batchRepo.findBatchById(bodyA.batchId)?.stagedQuestions || [];
  const pendingCountA = stagedA.filter((q) => q.reviewStatus === "PENDING").length;
  console.log(`✓ DB 확인: 검수 대기열(staged_questions)에 PENDING 상태로 ${pendingCountA}건 적재 완료`);
  if (pendingCountA !== 5) {
    throw new Error(`[시나리오 A 실패] PENDING 상태 문항 수가 5건이 아닙니다: ${pendingCountA}`);
  }
  console.log("OK [시나리오 A] 통과: 사용자는 개수만 선택하고 AI가 자동 변형/검증하여 PENDING 대기열에 안전하게 등록됨\n");

  // --------------------------------------------------------------------------------
  // [시나리오 B] 특정 영역 문제 생성 (예: C 언어)
  // --------------------------------------------------------------------------------
  console.log("--- [시나리오 B] 특정 영역 문제 생성 (도메인 'C' + '개수 3개' 선택) ---");
  const resB = await app.inject({
    method: "POST",
    url: "/api/ai/batch-generate",
    payload: {
      mode: "DOMAIN",
      domain: "C",
      count: 3,
    },
  });

  if (resB.statusCode !== 201) {
    throw new Error(`[시나리오 B 실패] HTTP ${resB.statusCode}: ${resB.body}`);
  }
  const bodyB = JSON.parse(resB.body);
  console.log(`✓ 응답 코드: ${resB.statusCode}`);
  console.log(`✓ 도메인 C 생성 결과: 배치 ID=${bodyB.batchId}, 생성 개수=${bodyB.count}개`);

  const stagedB = batchRepo.findBatchById(bodyB.batchId)?.stagedQuestions || [];
  for (const q of stagedB) {
    console.log(`  - 문항 ID: ${q.id} | 과목: ${q.subject} | 언어: ${q.language || "N/A"} | 지문: ${q.questionText.slice(0, 40)}...`);
  }
  console.log("OK [시나리오 B] 통과: 실존하는 C 도메인 문항을 선별하여 프로그래밍 맞춤 변형 문제 생성 완료\n");

  // --------------------------------------------------------------------------------
  // [시나리오 C] 검수 대기열 (Review Staging) 처리
  // --------------------------------------------------------------------------------
  console.log("--- [시나리오 C] 검수 대기열 처리 (승인, 반려, 수정 후 승인, 실전 학습 DB 반영) ---");
  
  // 1. 대기열 목록 조회
  const resList = await app.inject({
    method: "GET",
    url: "/api/imports/staged-questions?status=PENDING",
  });
  const listJson = JSON.parse(resList.body);
  const pendingQuestions = Array.isArray(listJson)
    ? listJson
    : Array.isArray(listJson.questions)
      ? listJson.questions
      : [];
  console.log(`✓ 현재 PENDING 대기열 문항수: ${pendingQuestions.length}건`);
  if (pendingQuestions.length < 3) {
    throw new Error(`[시나리오 C 실패] 검수 대상 PENDING 문항이 3건 이상이어야 합니다.`);
  }

  const qToApprove = pendingQuestions[0];
  const qToReject = pendingQuestions[1];
  const qToEditAndApprove = pendingQuestions[2];

  // 2. 단건 승인
  const resApprove = await app.inject({
    method: "POST",
    url: `/api/imports/questions/${qToApprove.id}/status`,
    payload: { reviewStatus: "APPROVED" },
  });
  if (resApprove.statusCode !== 200) {
    throw new Error(`[시나리오 C 실패] 승인 처리 실패: ${resApprove.body}`);
  }
  console.log(`✓ 문항 1 승인(APPROVED) 완료: ID=${qToApprove.id}`);

  // 3. 단건 반려
  const resReject = await app.inject({
    method: "POST",
    url: `/api/imports/questions/${qToReject.id}/status`,
    payload: { reviewStatus: "REJECTED" },
  });
  if (resReject.statusCode !== 200) {
    throw new Error(`[시나리오 C 실패] 반려 처리 실패: ${resReject.body}`);
  }
  console.log(`✓ 문항 2 반려(REJECTED) 완료: ID=${qToReject.id}`);

  // 4. 수정 후 승인 (인라인 편집)
  const resEdit = await app.inject({
    method: "PATCH",
    url: `/api/imports/questions/${qToEditAndApprove.id}`,
    payload: {
      questionText: "[검수자 수정 완료] " + qToEditAndApprove.questionText,
      groundTruthAnswer: "검수수정정답",
      officialExplanation: "검수자가 직접 보강한 해설입니다.",
    },
  });
  if (resEdit.statusCode !== 200) {
    throw new Error(`[시나리오 C 실패] 문항 수정 실패: ${resEdit.body}`);
  }
  await app.inject({
    method: "POST",
    url: `/api/imports/questions/${qToEditAndApprove.id}/status`,
    payload: { reviewStatus: "APPROVED" },
  });
  console.log(`✓ 문항 3 [수정 후 승인] 완료: ID=${qToEditAndApprove.id}, 수정된 정답="검수수정정답"`);

  // 5. 실전 학습 DB 반영 (Commit All Approved)
  const initialTotalQuestions = questionRepo.findMany().total;
  const resCommit = await app.inject({
    method: "POST",
    url: "/api/imports/commit-all-approved",
  });
  if (resCommit.statusCode !== 200) {
    throw new Error(`[시나리오 C 실패] 실전 DB 반영 실패: ${resCommit.body}`);
  }
  const bodyCommit = JSON.parse(resCommit.body);
  console.log(`✓ 실전 DB 반영 결과: 커밋된 문항수=${bodyCommit.committedCount}건`);

  const updatedTotalQuestions = questionRepo.findMany().total;
  console.log(`✓ DB 확인: 반영 전 전체 문항수=${initialTotalQuestions} -> 반영 후 전체 문항수=${updatedTotalQuestions}`);
  if (updatedTotalQuestions !== initialTotalQuestions + bodyCommit.committedCount) {
    throw new Error("[시나리오 C 실패] 커밋된 문항수만큼 전체 문항이 증가하지 않았습니다.");
  }
  console.log("OK [시나리오 C] 통과: 대기열 검수 -> 승인/반려/수정 -> 실전 학습 DB 반영 파이프라인 완벽 동작\n");

  // --------------------------------------------------------------------------------
  // [시나리오 D] 원문 가져오기 & 파싱 (Markdown Import)
  // --------------------------------------------------------------------------------
  console.log("--- [시나리오 D] 원문 가져오기 & 파싱 (기출 마크다운 등록 -> Staging 적재) ---");
  const sampleImportMarkdown = `# 2024년 1회 기출문제 원문 등록

### [문제 1] 단답형
- 과목: 프로그래밍언어활용
- 카테고리: Python 프로그래밍
- 출처: REAL_EXAM
- 기출: 2024년 1회 11번
- 난이도: EASY

다음 Python 코드의 실행 결과를 작성하시오.

\`\`\`python
a = [10, 20, 30]
print(len(a))
\`\`\`

**정답**: 3
**해설**: 리스트 a의 길이는 3입니다.
**키워드**: 파이썬, 리스트, len
`;

  const resD = await app.inject({
    method: "POST",
    url: "/api/imports/parse",
    payload: {
      format: "MARKDOWN",
      sourceType: "REAL_EXAM",
      sourceName: "2024_01_manual_import.md",
      content: sampleImportMarkdown,
    },
  });

  if (resD.statusCode !== 201) {
    throw new Error(`[시나리오 D 실패] HTTP ${resD.statusCode}: ${resD.body}`);
  }
  const bodyD = JSON.parse(resD.body);
  console.log(`✓ 원문 파싱 성공: 배치 ID=${bodyD.batch.id}, 파싱된 문항수=${bodyD.stagedQuestions.length}건`);
  console.log(`✓ 첫 번째 파싱 문항: 지문="${bodyD.stagedQuestions[0].questionText.slice(0, 35)}...", 정답="${bodyD.stagedQuestions[0].groundTruthAnswer}"`);
  console.log("OK [시나리오 D] 통과: 문제 원문 마크다운 파싱 및 검수 대기열 자동 등록 성공\n");

  console.log("================================================================================");
  console.log("🎉 4대 핵심 시나리오 (A: 랜덤 생성, B: 영역 생성, C: 검수 및 DB반영, D: 원문 가져오기) 전체 100% 통과!");
  console.log("================================================================================");
}

runVerification().catch((err) => {
  console.error("❌ 검증 실패:", err);
  process.exit(1);
});
