import assert from "node:assert";
import { setupIsolatedTestDb } from "./helpers/testDb.js";
import { buildApp } from "../src/app.js";
import { SyntaxTermRepository } from "../src/db/repositories/syntaxTermRepository.js";
import { QuestionRepository } from "../src/db/repositories/questionRepository.js";
import { Question, AICodeExplanationsResponse } from "@jungcheogi/shared";
import { setAIServiceOverride, IAIService } from "../src/engine/aiService.js";

async function runSyntaxTests() {
  console.log("=== Syntax Knowledge DB 및 줄별 교육 해설 테스트 시작 ===\n");
  const isolated = setupIsolatedTestDb({ seed: true });
  const app = await buildApp();
  const syntaxRepo = new SyntaxTermRepository();
  const qRepo = new QuestionRepository();

  let explainAllCalls = 0;

  const mockAIService: IAIService = {
    async explainCodeAllLines(context) {
      explainAllCalls++;
      return {
        questionId: context.question.id,
        codeHash: "hash123",
        status: "READY",
        lines: [
          {
            lineNumber: 1,
            code: "int a = 0, b = 5;",
            lineRole: "정수형 변수 a와 b를 선언하고 각각 0과 5로 초기화합니다.",
            runtimeBehavior: "스택 메모리에 변수 a=0, b=5가 할당됩니다.",
            flowContext: "이후 조건문 및 연산에서 이 변수들을 사용합니다.",
            syntaxTerms: [],
            source: "MOCK",
            modelUsed: "mock-engine",
          },
          {
            lineNumber: 2,
            code: "if (a != 0 && ++b > 5) {",
            lineRole: "변수 a가 0이 아니고 b의 증가값이 5 초과인지 검사합니다.",
            runtimeBehavior: "a가 0이므로 좌변(a != 0)이 거짓(0)으로 평가되어, 단락 평가에 의해 우변(++b > 5)은 실행되지 않고 b는 5로 유지됩니다.",
            flowContext: "Line 1의 a=0 상태를 받아 조건문을 평가하며 if 블록 진입을 차단합니다.",
            caution: "단락 평가(Short-circuit)로 인해 ++b가 실행되지 않는다는 점에 주의하세요.",
            problemHint: "b의 최종값을 물어볼 때 6이 아니라 5가 됩니다.",
            syntaxTerms: [
              { canonicalKey: "c.logical_and", display: "&&" },
              { canonicalKey: "c.if", display: "if" },
              { canonicalKey: "c.increment", display: "++" },
            ],
            source: "MOCK",
            modelUsed: "mock-engine",
          },
          {
            lineNumber: 3,
            code: "    printf(\"%d\", b);",
            lineRole: "변수 b의 값을 화면에 출력합니다.",
            runtimeBehavior: "콘솔 버퍼에 b의 현재 값을 출력합니다.",
            flowContext: "조건문 결과에 따라 실행 여부가 결정됩니다.",
            syntaxTerms: [],
            source: "MOCK",
            modelUsed: "mock-engine",
          },
          {
            lineNumber: 4,
            code: "}",
            lineRole: "if 조건 블록을 닫습니다.",
            runtimeBehavior: "블록 범위를 벗어납니다.",
            flowContext: "main 함수 종료로 진행합니다.",
            syntaxTerms: [],
            source: "MOCK",
            modelUsed: "mock-engine",
          },
        ],
        generatedAt: new Date().toISOString(),
        source: "MOCK",
        modelUsed: "mock-engine",
        retryCount: 0,
      };
    },
    async explainCodeLine() {
      throw new Error("explainCodeLine should not be called directly");
    },
    async generateTutoringExplanation() {
      throw new Error("not used in this test");
    },
    async generateProgressiveHints() {
      throw new Error("not used in this test");
    },
    async generateVariation() {
      throw new Error("not used in this test");
    },
  };

  setAIServiceOverride(mockAIService);

  try {
    // ---------------------------------------------------------
    // Test 1: Syntax DB migration and seeding verification
    // ---------------------------------------------------------
    console.log("--- 1. syntax_terms DB 마이그레이션 및 시드 검증 ---");
    const allTerms = syntaxRepo.findAll();
    assert(allTerms.length >= 15, `초기 문법 지식이 최소 15개 이상 적재되어야 함 (현재: ${allTerms.length})`);
    
    const andTerm = syntaxRepo.findByCanonicalKey("c.logical_and");
    assert.ok(andTerm, "c.logical_and 문법 항목이 존재해야 함");
    assert.strictEqual(andTerm.displayToken, "&&");
    assert.strictEqual(andTerm.termType, "OPERATOR");
    assert.ok(andTerm.howItWorks.includes("단락 평가"), "howItWorks에 단락 평가 원리가 포함되어야 함");
    assert.ok(andTerm.exampleCode.length > 5, "exampleCode 예제 코드가 존재해야 함");
    assert.ok(andTerm.commonMistakes.length > 5, "commonMistakes 주의점이 존재해야 함");
    console.log("OK   Test 1 PASS: syntax_terms DB 및 고품질 문법 지식 시드 확인");

    // ---------------------------------------------------------
    // Test 2: Uniqueness and Conflict Protection on canonicalKey
    // ---------------------------------------------------------
    console.log("\n--- 2. canonicalKey 고유성 및 덮어쓰기 무결성 검증 ---");
    syntaxRepo.upsert({
      id: "st_custom_test",
      language: "C",
      canonicalKey: "c.logical_and",
      term: "수정된 논리 AND 연산자",
      displayToken: "&&",
      termType: "OPERATOR",
      shortDescription: "테스트 설명",
      syntaxPattern: "a && b",
      howItWorks: "동작 설명",
      exampleCode: "int x;",
      detailedExplanation: "상세",
      commonMistakes: "주의",
      relatedTerms: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const updatedAndTerm = syntaxRepo.findByCanonicalKey("c.logical_and");
    assert.strictEqual(updatedAndTerm?.term, "수정된 논리 AND 연산자", "canonicalKey 기준으로 안전하게 업서트되어야 함");
    console.log("OK   Test 2 PASS: canonicalKey 기반 중복 방지 및 업서트 동작 확인");

    // ---------------------------------------------------------
    // Test 3: API Endpoint GET /api/syntax-terms/:canonicalKey (0 AI calls)
    // ---------------------------------------------------------
    console.log("\n--- 3. GET /api/syntax-terms/:canonicalKey API 조회 (AI 0회 호출) ---");
    const resKey = await app.inject({
      method: "GET",
      url: "/api/syntax-terms/c.pointer",
    });
    assert.strictEqual(resKey.statusCode, 200);
    const pointerData = JSON.parse(resKey.body);
    assert.strictEqual(pointerData.canonicalKey, "c.pointer");
    assert.strictEqual(pointerData.displayToken, "*");
    assert.ok(pointerData.howItWorks.includes("역참조"));
    assert.strictEqual(explainAllCalls, 0, "문법 지식 조회 시 AI 서비스 호출이 전혀 없어야 함");
    console.log("OK   Test 3 PASS: 문법 요소 상세 조회 성공 및 AI API 0회 호출 확인");

    // ---------------------------------------------------------
    // Test 4: API Endpoint GET /api/syntax-terms?language=C
    // ---------------------------------------------------------
    console.log("\n--- 4. GET /api/syntax-terms?language=C 언어별 필터링 조회 ---");
    const resLang = await app.inject({
      method: "GET",
      url: "/api/syntax-terms?language=C",
    });
    assert.strictEqual(resLang.statusCode, 200);
    const cTerms = JSON.parse(resLang.body);
    assert(Array.isArray(cTerms));
    assert(cTerms.some((t: any) => t.canonicalKey === "c.struct"), "C 구조체 문법 포함");
    assert(cTerms.some((t: any) => t.canonicalKey === "c.modulo"), "C 모듈러 연산자 포함");
    console.log("OK   Test 4 PASS: 언어별 문법 목록 정상 반환");

    // ---------------------------------------------------------
    // Test 5: AI 전체 줄 해설에서 구조화된 syntaxTerms 및 교육 필드 반환 검증
    // ---------------------------------------------------------
    console.log("\n--- 5. AI 라인 해설의 구조화된 syntaxTerms 및 교육 필드 검증 ---");
    const testQuestion: Question = {
      id: "q_syntax_test_01",
      type: "CODE_TRACE",
      subject: "SW_DEVELOPMENT",
      category: "C",
      prompt: "다음 C 코드의 출력 결과를 쓰시오.",
      question: "다음 C 코드의 출력 결과를 쓰시오.",
      sourceType: "TEXTBOOK_EXPECTED",
      codeSnippet: "int a = 0, b = 5;\nif (a != 0 && ++b > 5) {\n    printf(\"%d\", b);\n}",
      code: "int a = 0, b = 5;\nif (a != 0 && ++b > 5) {\n    printf(\"%d\", b);\n}",
      language: "C",
      groundTruthAnswer: "5",
      difficulty: 3,
      studyVisibility: "LIVE",
      answerVerificationStatus: "VERIFIED",
      answerSource: "MANUAL_VERIFIED",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    qRepo.create(testQuestion);

    const resExpl = await app.inject({
      method: "POST",
      url: "/api/ai/code-explanations",
      payload: {
        questionId: testQuestion.id,
        codeSnippet: testQuestion.code,
        language: "C",
      },
    });

    assert.strictEqual(resExpl.statusCode, 200);
    const explData: AICodeExplanationsResponse = JSON.parse(resExpl.body);
    assert.strictEqual(explData.status, "READY");
    assert.strictEqual(explData.lines.length, 4);

    const line2 = explData.lines[1];
    assert.strictEqual(line2.lineNumber, 2);
    assert.ok(line2.lineRole, "lineRole 필드가 존재해야 함");
    assert.ok(line2.runtimeBehavior, "runtimeBehavior 필드가 존재해야 함");
    assert.ok(line2.flowContext, "flowContext 필드가 존재해야 함");
    assert.ok(line2.caution, "caution 필드가 존재해야 함");
    assert.ok(Array.isArray(line2.syntaxTerms), "syntaxTerms 배열이 존재해야 함");
    assert.strictEqual(line2.syntaxTerms?.length, 3);
    assert.strictEqual(line2.syntaxTerms?.[0].canonicalKey, "c.logical_and");
    assert.strictEqual(line2.syntaxTerms?.[0].display, "&&");
    console.log("OK   Test 5 PASS: 구조화된 lineRole, runtimeBehavior, flowContext, syntaxTerms 검증 성공");

    // ---------------------------------------------------------
    // Test 6: syntaxTerms에 반환된 키를 사용해 Syntax DB 즉시 조회 (연계 흐름)
    // ---------------------------------------------------------
    console.log("\n--- 6. syntaxTerms의 canonicalKey로 Syntax DB 즉시 조회 연계 검증 ---");
    const termKeyToQuery = line2.syntaxTerms![0].canonicalKey;
    const termQueryResult = syntaxRepo.findByCanonicalKey(termKeyToQuery);
    assert.ok(termQueryResult, `syntax_terms DB에 ${termKeyToQuery}가 존재해야 함`);
    assert.strictEqual(termQueryResult.displayToken, "&&");
    console.log("OK   Test 6 PASS: AI 해설 -> Syntax DB 연계 흐름 무결성 확인");

    console.log("\n🎉 [COMPLETE] Syntax Knowledge DB 및 줄별 교육 해설 테스트 전항 통과!\n");
  } finally {
    setAIServiceOverride(null);
    await app.close();
    isolated.cleanup();
  }
}

runSyntaxTests().catch((err) => {
  console.error("테스트 실패:", err);
  process.exit(1);
});
