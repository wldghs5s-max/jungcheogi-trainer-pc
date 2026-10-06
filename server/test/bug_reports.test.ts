import assert from "node:assert";
import fs from "fs";
import path from "path";
import os from "os";
import { buildApp } from "../src/app.js";
import { BugReportService } from "../src/services/bugReportService.js";
import { BugReportCreateRequest } from "@jungcheogi/shared";

async function runBugReportTests() {
  console.log("=== 버그 리포트 Inbox 기능 단위/통합 테스트 시작 ===\n");

  const app = await buildApp();
  const tempTestDir = fs.mkdtempSync(path.join(os.tmpdir(), "bug-reports-test-"));
  const testService = new BugReportService(tempTestDir);

  try {
    // ----------------------------------------------------
    // Test 1: POST /api/bug-reports 정상 등록 (201)
    // ----------------------------------------------------
    console.log("1. POST /api/bug-reports 정상 등록 및 파일 생성 검증");
    const payload: BugReportCreateRequest = {
      category: "AI_LINE_EXPLANATION",
      description: "2번째 줄 if문 조건식의 단락 평가 설명이 코드와 다릅니다.",
      expectedBehavior: "b 변수 증가가 생략된다고 나와야 함",
      actualBehavior: "b가 6으로 증가한다고 잘못 설명됨",
      questionContext: {
        questionId: "q_2025_01_07",
        questionCode: "Q-2025-01-07",
        sourceType: "REAL_EXAM",
        studyVisibility: "LIVE",
        questionType: "CODE_TRACE",
        language: "C",
        subject: "프로그래밍언어활용",
        category: "C 프로그래밍",
        conceptId: "concept_c_pointer",
        parentQuestionId: undefined,
        provenance: undefined,
        sessionId: "sess_test_123",
        clientTimestamp: new Date().toISOString(),
        appRoute: "/study",
        codeSnippet: "int a = 0, b = 5;\nif (a != 0 && ++b > 5) {}",
      },
    };

    const res = await app.inject({
      method: "POST",
      url: "/api/bug-reports",
      payload,
    });

    assert.strictEqual(res.statusCode, 201, "정상 생성 시 201 상태코드 반환");
    const body = JSON.parse(res.body);
    assert.strictEqual(body.success, true);
    assert(typeof body.bugReportId === "string" && body.bugReportId.startsWith("BR-"));
    console.log(`✓ POST /api/bug-reports 성공 (ID: ${body.bugReportId})`);

    // ----------------------------------------------------
    // Test 2: 실제 생성된 Markdown 파일 구조 및 내용 검증
    // ----------------------------------------------------
    console.log("\n2. Markdown 파일 구조 및 자동 첨부 context 검증");
    // testService로 직접 생성하여 tempTestDir 경로 확인
    const directResult = testService.createBugReport(payload, "127.0.0.1");
    assert(fs.existsSync(directResult.filePath), "파일이 open 디렉터리에 실존해야 함");

    const content = fs.readFileSync(directResult.filePath, "utf-8");
    assert(content.includes(`# Bug Report ${directResult.bugReportId}`));
    assert(content.includes("- status: OPEN"));
    assert(content.includes("- category: AI_LINE_EXPLANATION"));
    assert(content.includes("- questionId: q_2025_01_07"));
    assert(content.includes("- questionCode: Q-2025-01-07"));
    assert(content.includes("- language: C"));
    assert(content.includes("## 오류 내용"));
    assert(content.includes("단락 평가 설명이 코드와 다릅니다"));
    assert(content.includes("## 예상한 동작"));
    assert(content.includes("b 변수 증가가 생략된다고 나와야 함"));
    assert(content.includes("## 실제 동작"));
    assert(content.includes("b가 6으로 증가한다고 잘못 설명됨"));
    assert(content.includes("- sessionId: sess_test_123"));
    assert(content.includes("## 문제 코드 스니펫"));
    assert(content.includes("int a = 0, b = 5;"));
    console.log("✓ Markdown 파일 필드 및 구조 정상 검증 완료");

    // ----------------------------------------------------
    // Test 3: 유효성 검사 - description 누락 시 400
    // ----------------------------------------------------
    console.log("\n3. 필수 description 누락 시 400 반환 검증");
    const resNoDesc = await app.inject({
      method: "POST",
      url: "/api/bug-reports",
      payload: {
        category: "UI",
        description: "   ", // 공백만
      },
    });
    assert.strictEqual(resNoDesc.statusCode, 400);
    const bodyNoDesc = JSON.parse(resNoDesc.body);
    assert(bodyNoDesc.message.includes("필수 입력"));
    console.log("✓ description 누락 400 에러 반환 통과");

    // ----------------------------------------------------
    // Test 4: 유효성 검사 - 잘못된 category 거부
    // ----------------------------------------------------
    console.log("\n4. 지원하지 않는 category 거부 검증");
    const resInvalidCat = await app.inject({
      method: "POST",
      url: "/api/bug-reports",
      payload: {
        category: "UNKNOWN_CATEGORY" as any,
        description: "버그가 있습니다.",
      },
    });
    assert.strictEqual(resInvalidCat.statusCode, 400);
    const bodyInvalidCat = JSON.parse(resInvalidCat.body);
    assert(bodyInvalidCat.message.includes("올바르지 않은 신고"));
    console.log("✓ 미지원 category 400 에러 반환 통과");

    // ----------------------------------------------------
    // Test 5: 사용자 입력 길이 초과 방어 (3,000자 초과)
    // ----------------------------------------------------
    console.log("\n5. description 3,000자 초과 시 400 반환 검증");
    const resTooLong = await app.inject({
      method: "POST",
      url: "/api/bug-reports",
      payload: {
        category: "OTHER",
        description: "A".repeat(3001),
      },
    });
    assert.strictEqual(resTooLong.statusCode, 400);
    console.log("✓ 글자수 제한 초과 방어 통과");

    // ----------------------------------------------------
    // Test 6: Path Traversal 및 안전한 파일명 정책 검증
    // ----------------------------------------------------
    console.log("\n6. Path Traversal 차단 및 안전한 파일명 검증");
    // 파일명은 서버에서만 생성되므로 사용자 입력이 파일 경로에 개입할 수 없음
    const maliciousPayload: BugReportCreateRequest = {
      category: "UI",
      description: "../../../etc/passwd 탈취 시도",
      questionContext: {
        questionId: "../../boot.ini",
        questionCode: "..\\..\\windows\\system32",
      },
    };
    const traversalResult = testService.createBugReport(maliciousPayload, "127.0.0.1");
    assert(
      !traversalResult.filePath.includes("passwd") &&
        !traversalResult.filePath.includes("boot.ini") &&
        !traversalResult.filePath.includes("system32"),
      "사용자 입력이 파일명/경로로 사용되지 않아야 함",
    );
    assert(
      path.dirname(traversalResult.filePath) === testService.getOpenDir(),
      "파일은 반드시 open 디렉터리 내에만 저장되어야 함",
    );
    console.log("✓ Path Traversal 불가 및 파일명 서버 자동생성 격리 확인");

    // ----------------------------------------------------
    // Test 7: 동시/연속 요청 시 파일명 고유성 및 덮어쓰기 방지
    // ----------------------------------------------------
    console.log("\n7. 연속 생성 시 파일명 충돌 방지 검증");
    const rep1 = testService.createBugReport({ category: "UI", description: "Report 1" }, "127.0.0.1");
    const rep2 = testService.createBugReport({ category: "UI", description: "Report 2" }, "127.0.0.1");
    const rep3 = testService.createBugReport({ category: "UI", description: "Report 3" }, "127.0.0.1");

    assert.notStrictEqual(rep1.bugReportId, rep2.bugReportId);
    assert.notStrictEqual(rep2.bugReportId, rep3.bugReportId);
    assert(fs.existsSync(rep1.filePath));
    assert(fs.existsSync(rep2.filePath));
    assert(fs.existsSync(rep3.filePath));
    console.log("✓ 연속 생성 시 고유 파일 분리 생성 검증 통과");

    // ----------------------------------------------------
    // Test 8: AI 변형 문제 컨텍스트(parentQuestionId 등) 보존
    // ----------------------------------------------------
    console.log("\n8. AI 변형 문제 컨텍스트 보존 검증");
    const aiPayload: BugReportCreateRequest = {
      category: "AI_VARIATION",
      description: "변형된 코드의 루프 조건이 원본과 달라 답이 맞지 않습니다.",
      questionContext: {
        questionId: "staged_ai_var_999",
        questionCode: "AI-1024",
        sourceType: "AI_VARIATION",
        studyVisibility: "LIVE",
        parentQuestionId: "q_real_original_1",
        provenance: "AI_VARIATION_GENERATED",
        language: "JAVA",
      },
    };
    const aiResult = testService.createBugReport(aiPayload, "127.0.0.1");
    const aiFileContent = fs.readFileSync(aiResult.filePath, "utf-8");
    assert(aiFileContent.includes("- parentQuestionId: q_real_original_1"));
    assert(aiFileContent.includes("- provenance: AI_VARIATION_GENERATED"));
    assert(aiFileContent.includes("- sourceType: AI_VARIATION"));
    console.log("✓ AI 변형 문제의 parentQuestionId 및 provenance 보존 통과");

    console.log("\n==========================================");
    console.log("모든 버그 리포트 Inbox 단위/통합 테스트 통과!");
    console.log("==========================================");
  } finally {
    try {
      fs.rmSync(tempTestDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

runBugReportTests().catch((err) => {
  console.error("Bug report test failed:", err);
  process.exit(1);
});

