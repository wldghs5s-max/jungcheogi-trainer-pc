import assert from "node:assert";
import { defaultExecutionEngine, evaluateCodeOutput } from "../src/engine/codeExecutionEngine.js";
import { MockQuestionVariationGenerator } from "../src/engine/variationGenerator.js";
import { Question } from "@jungcheogi/shared";
import { setupIsolatedTestDb } from "./helpers/testDb.js";

const JAVA_CHILD_COMPUTE = `class Parent {
  int compute(int num) {
    if (num <= 1) return num;
    return compute(num - 1) + compute(num - 2);
  }
}
class Child extends Parent {
  int compute(int num) {
    if (num <= 1) return 10;
    return compute(num - 1) + compute(num - 2);
  }
}
public class Main {
  public static void main(String[] args) {
    Child c = new Child();
    System.out.print(c.compute(2));
  }
}`;

async function testCodeExecution() {
  console.log("=== 코드 실행 엔진 안전성 및 Java 재귀 회귀 ===\n");
  const isolated = setupIsolatedTestDb({ seed: false });
  try {

  const blockedByDefault = await defaultExecutionEngine.execute({
    language: "C",
    code: `#include <stdio.h>\nint main() { printf("40"); return 0; }`,
  });
  assert.strictEqual(blockedByDefault.status, "UNAVAILABLE");
  assert.notStrictEqual(blockedByDefault.stdout.trim(), "40");
  console.log("OK   기본 경로에서 생성 코드 호스트 실행 차단");

  const javaGuess = await defaultExecutionEngine.execute({
    language: "JAVA",
    code: JAVA_CHILD_COMPUTE,
  });
  assert.strictEqual(javaGuess.status, "UNAVAILABLE");
  assert.notStrictEqual(javaGuess.stdout.trim(), "1");
  assert.notStrictEqual(javaGuess.status, "SUCCESS");
  console.log("OK   Java Parent/Child 재귀 추정값(1)을 실행 결과로 사용하지 않음");

  const evalDefault = await evaluateCodeOutput(JAVA_CHILD_COMPUTE, "JAVA");
  assert.strictEqual(evalDefault.status, "UNAVAILABLE");
  assert.notStrictEqual(evalDefault.output, "1");

  const official: Question = {
    id: "q_java_recursion_src",
    sourceType: "TEST_FIXTURE",
    subject: "프로그래밍언어활용",
    category: "Java",
    type: "CODE_TRACE",
    question: "c.compute(2)의 출력은?",
    code: JAVA_CHILD_COMPUTE,
    language: "JAVA",
    groundTruthAnswer: "20",
    officialExplanation: "공식 정답 20",
    difficulty: "MEDIUM",
    keywords: [],
    createdAt: new Date().toISOString(),
  };
  const variation = await new MockQuestionVariationGenerator().generateVariation(official, {
    variationType: "PARAMETER_VARIATION",
  });
  assert.notStrictEqual(String(variation.groundTruthAnswer), "1");
  if (variation.codeSnippet && variation.codeSnippet !== official.code) {
    assert.notStrictEqual(variation.groundTruthAnswer, official.groundTruthAnswer);
    assert.match(variation.aiVariationNotes || "", /검증 불가|실행 실패|실행 검증/);
  }
  assert.strictEqual(official.groundTruthAnswer, "20");
  console.log("OK   변형 문제에 추정값/원본 정답을 검증된 답처럼 저장하지 않음");

  const prevPath = process.env.PATH;
  process.env.PATH = "/tmp/jcg-no-compilers";
  try {
    const missing = await defaultExecutionEngine.execute({
      language: "PYTHON",
      code: "print(18)",
      allowHostExecution: true,
    });
    assert.strictEqual(missing.status, "UNAVAILABLE");
    console.log("OK   런타임 미설치(ENOENT) 시 UNAVAILABLE fallback");
  } finally {
    process.env.PATH = prevPath;
  }

  process.env.JCG_FAKE_SECRET = "fake-secret-value-not-a-real-key";
  try {
    const leak = await defaultExecutionEngine.execute({
      language: "PYTHON",
      code: "import os; print(os.environ.get('JCG_FAKE_SECRET', 'ABSENT'))",
      allowHostExecution: true,
    });
    if (leak.status === "SUCCESS") {
      assert.strictEqual(leak.stdout.trim(), "ABSENT");
      console.log("OK   옵트인 실행에도 가짜 환경변수가 전달되지 않음");
    } else {
      assert.strictEqual(leak.status, "UNAVAILABLE");
      console.log("OK   Python 런타임이 없어 실행 검증 불가(가짜 성공 아님)");
    }
  } finally {
    delete process.env.JCG_FAKE_SECRET;
  }

  const hostedJava = await defaultExecutionEngine.execute({
    language: "JAVA",
    code: JAVA_CHILD_COMPUTE,
    allowHostExecution: true,
  });
  if (hostedJava.status === "SUCCESS") {
    assert.strictEqual(hostedJava.stdout.trim(), "20");
    console.log("OK   옵트인 Java 실제 실행 결과 20");
  } else {
    assert.ok(
      hostedJava.status === "UNAVAILABLE" || hostedJava.status === "COMPILE_ERROR",
      `Java 옵트인 상태는 검증 불가/컴파일 실패여야 함: ${hostedJava.status}`,
    );
    console.log(`OK   Java 옵트인 실행 불가(${hostedJava.status}), 가짜 SUCCESS 없음`);
  }

  console.log("\n코드 실행 엔진 검증 통과");
  } finally {
    isolated.cleanup();
  }
}

testCodeExecution().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
