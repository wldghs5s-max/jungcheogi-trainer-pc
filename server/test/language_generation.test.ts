import assert from "node:assert";
import { MockAIService } from "../src/engine/aiService.js";
import {
  analyzeCodeStructure,
  normalizeLanguage,
  UnsupportedIndependentGenerationError,
} from "../src/engine/languageGeneration.js";

async function testLanguageGeneration() {
  console.log("=== C·Java·Python 언어별 생성·검증 ===\n");

  assert.strictEqual(normalizeLanguage("c언어"), "C");
  assert.strictEqual(normalizeLanguage("자바"), "JAVA");
  assert.strictEqual(normalizeLanguage("파이썬"), "PYTHON");
  assert.strictEqual(normalizeLanguage("SQL"), "SQL");

  const pyOk = analyzeCodeStructure("print(42)", "PYTHON");
  assert.strictEqual(pyOk.hasSyntaxIssues, false, "Python print(42)는 main을 요구하지 않음");

  const pyStringParen = analyzeCodeStructure('print("hello (world)")', "PYTHON");
  assert.strictEqual(pyStringParen.hasSyntaxIssues, false, "문자열 속 괄호는 구조로 세지 않음");

  const cNoMain = analyzeCodeStructure("int x = 1;", "C");
  assert.strictEqual(cNoMain.hasRequiredEntry, false);

  const javaMain = analyzeCodeStructure(
    "public class Main { public static void main(String[] args) { System.out.print(1); } }",
    "JAVA",
  );
  assert.strictEqual(javaMain.hasRequiredEntry, true);
  assert.strictEqual(javaMain.hasSyntaxIssues, false);

  const mock = new MockAIService();
  const javaQ = await mock.generateIndependentQuestion({ language: "JAVA" });
  assert.strictEqual(javaQ.language, "JAVA");
  assert.doesNotMatch(javaQ.code || "", /#include/);
  assert.match(javaQ.code || "", /public static void main/);

  const pyQ = await mock.generateIndependentQuestion({ language: "PYTHON" });
  assert.strictEqual(pyQ.language, "PYTHON");
  assert.doesNotMatch(pyQ.code || "", /int\s+main/);
  assert.match(pyQ.code || "", /def acc|print\(/);

  const cQ = await mock.generateIndependentQuestion({ language: "C" });
  assert.strictEqual(cQ.language, "C");
  assert.match(cQ.code || "", /int\s+main/);

  await assert.rejects(
    () => mock.generateIndependentQuestion({ language: "SQL" }),
    (err: unknown) => err instanceof UnsupportedIndependentGenerationError,
  );

  console.log("OK   언어 정규화, Python/Java 구조 검사, Mock 언어 분리, SQL 거부");
  console.log("\n언어별 생성 검증 통과");
}

testLanguageGeneration().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
