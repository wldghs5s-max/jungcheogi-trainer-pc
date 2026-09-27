/**
 * 오프라인 회귀 테스트 (Offline Regression Test)
 *
 * [검증 대상]
 * 1. self-correction 정규식 false positive 수정 검증 (배열/변수 수정 설명 허용, 실제 계산 정정만 탐지)
 * 2. Gemini C 코드 JSON escape 안정성 검증 (\0, \', \n, format string 무손실 파싱)
 * 3. 기존 핵심 8대 문항 회귀 검증 (EVAL-C-25, 02, 11, 17 -> REJECT / EVAL-C-03, 07, 15, 24 -> PASS)
 * 4. rejectionReasons 불변식 검증 (generationRejected === true <=> rejectionReasons.length >= 1)
 */

import fs from "fs";
import path from "path";
import assert from "assert";
import {
  verifyExplanationMatch,
  ensureRejectionInvariant,
} from "../src/engine/evaluationValidator.js";
import { cleanAndParseJson, repairJsonEscapes } from "../src/engine/aiService.js";

console.log("=================================================================");
console.log("🧪 C 언어 AI 문제 생성기 오프라인 종합 회귀 테스트 (No Gemini API)");
console.log("=================================================================\n");

let passedTests = 0;
let totalTests = 0;

function runTest(name: string, fn: () => void) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✅ [PASS] ${name}`);
  } catch (err: any) {
    console.error(`  ❌ [FAIL] ${name}:`, err.message);
    throw err;
  }
}

// -----------------------------------------------------------------------------
// 1. self-correction 정규식 false positive 수정 검증
// -----------------------------------------------------------------------------
console.log("[Test Suite 1] self-correction 정상 코드 설명 vs 실제 계산 정정 분리");

runTest("정상 코드 설명: '배열 값을 수정한다' -> selfCorrectionDetected = false", () => {
  const text = "루프를 순회하며 조건에 따라 배열 값을 수정한다. 최종적으로 25를 출력한다.";
  const res = verifyExplanationMatch(text, "25");
  assert.strictEqual(res.selfCorrectionDetected, false);
});

runTest("정상 코드 설명: '원본 데이터를 직접 수정한다' -> selfCorrectionDetected = false", () => {
  const text = "함수의 인자로 포인터를 전달하여 원본 데이터를 직접 수정한다. 결과는 66이다.";
  const res = verifyExplanationMatch(text, "66");
  assert.strictEqual(res.selfCorrectionDetected, false);
});

runTest("정상 코드 설명: '변수 값을 수정한다' -> selfCorrectionDetected = false", () => {
  const text = "포인터 역참조를 통해 변수 값을 수정한다. 최종 변수 값은 10이다.";
  const res = verifyExplanationMatch(text, "10");
  assert.strictEqual(res.selfCorrectionDetected, false);
});

runTest("정상 코드 설명: '문자열을 수정한다' -> selfCorrectionDetected = false", () => {
  const text = "널 문자를 만날 때까지 반복하며 문자열을 수정한다. 변환된 문자열은 Ab*#Z이다.";
  const res = verifyExplanationMatch(text, "Ab*#Z");
  assert.strictEqual(res.selfCorrectionDetected, false);
});

runTest("실제 계산 정정: '앞선 계산은 잘못되었다. 다시 계산하면...' -> selfCorrectionDetected = true", () => {
  const text = "앞선 계산은 잘못되었다. 다시 계산하면 최종 결과는 18이다.";
  const res = verifyExplanationMatch(text, "18");
  assert.strictEqual(res.selfCorrectionDetected, true);
});

runTest("실제 계산 정정: '위 계산에서 오류가 있었습니다. 정정하면...' -> selfCorrectionDetected = true", () => {
  const text = "위 계산에서 오류가 있었습니다. 정정하면 최종 정답은 30입니다.";
  const res = verifyExplanationMatch(text, "30");
  assert.strictEqual(res.selfCorrectionDetected, true);
});

runTest("EVAL-C-10 실제 해설 (자가 정정 혼선) -> selfCorrectionDetected = true", () => {
  const evalC10Expl =
    "반환값은 6이므로 sum에 더해져 최종 sum은 18이... 아닙니다. 단계별 재확인: 다시 계산: 총합 = 2 + 4 + 6 + 6 = 18. 정확한 추적 결과 최종 출력은 '18 2 5 5 8'입니다.";
  const res = verifyExplanationMatch(evalC10Expl, "19 2 5 7 8");
  assert.strictEqual(res.selfCorrectionDetected, true);
});

runTest("EVAL-C-30 실제 해설 (정상 해설 내 '수정' 사용) -> selfCorrectionDetected = false", () => {
  const evalC30Expl =
    "이 문제는 구조체 포인터 연산과 함수의 인자로 구조체 주소를 전달하여 원본 데이터를 직접 수정하는 Call by Reference 개념을 평가합니다. 최종 반환된 66이 printf를 통해 출력됩니다.";
  const res = verifyExplanationMatch(evalC30Expl, "66");
  assert.strictEqual(res.selfCorrectionDetected, false);
});

console.log();

// -----------------------------------------------------------------------------
// 2. Gemini C 코드 JSON escape 안정성 검증
// -----------------------------------------------------------------------------
console.log("[Test Suite 2] Gemini C 코드 JSON escape 및 무손실 파싱 안정성");

runTest("유효 JSON C 코드 파싱 (\\0, \\n, format string 무손실 보존)", () => {
  const validJson = JSON.stringify({
    code: '#include <stdio.h>\nint main(void) {\n char s[] = "A\\0B";\n printf("%s\\n", s);\n return 0;\n}',
  });
  const parsed = cleanAndParseJson<{ code: string }>(validJson);
  assert.ok(parsed.code.includes("\\0"), "C 언어 널문자 이스케이프가 온전히 보존되어야 함");
  assert.ok(parsed.code.includes('printf("%s\\n", s);'), "printf 서식 문자열이 보존되어야 함");
});

runTest("원시 미이스케이프 JSON 복구 (raw '\\0' 및 '\\'' 포함)", () => {
  // LLM이 JSON 문자열 내에 단일 백슬래시 \0, \'를 날것으로 출력한 상황 시뮬레이션
  const rawLlmJson = `{"code": "#include <stdio.h>\\nint main(void) {\\n char s[] = \\"A\\0B\\";\\n char c = \\'z\\';\\n printf(\\"%d %s\\\\n\\", 10, s);\\n return 0;\\n}"}`;

  // 표준 JSON.parse는 V8 'Bad escaped character' 에러 발생
  assert.throws(() => JSON.parse(rawLlmJson), /Bad escaped character/);

  // cleanAndParseJson은 무손실 복구 후 성공
  const parsed = cleanAndParseJson<{ code: string }>(rawLlmJson);
  assert.ok(parsed.code.includes("\\0"), "복구된 코드에 \\0이 온전히 존재해야 함");
  assert.ok(!parsed.code.includes('"A0B"'), "\\0이 '0'으로 왜곡 탈락되지 않아야 함");
  assert.ok(parsed.code.includes('printf("%d %s'), "format string이 유지되어야 함");
});

runTest("다양한 format string과 escaped character 동시 존재 검증", () => {
  const complexJson = `{"code": "printf(\\"%d, %s, %x, %c\\\\n\\", x, \\"str\\0\\", 0xFF, \\'A\\');"}`;
  const parsed = cleanAndParseJson<{ code: string }>(complexJson);
  assert.ok(parsed.code.includes("%d, %s, %x, %c"), "다중 포맷 서식이 정확히 유지되어야 함");
  assert.ok(parsed.code.includes("\\0"), "문자열 내 \\0이 유지되어야 함");
});

console.log();

// -----------------------------------------------------------------------------
// 3. 기존 핵심 8대 문항 회귀 검증 및 불변식 검증
// -----------------------------------------------------------------------------
console.log("[Test Suite 3] 기존 핵심 8대 문항 판정 회귀 및 불변식 검증");

const reportPath = path.join(
  process.cwd(),
  "evaluation/results/c_generation_30_re_evaluation_report.json",
);
assert.ok(fs.existsSync(reportPath), "기준 재평가 리포트 파일이 존재해야 합니다.");

const reportData = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const items: any[] = reportData.items || [];

const expectedDecisions: Record<string, "PASS" | "REJECT"> = {
  "EVAL-C-25": "REJECT",
  "EVAL-C-02": "REJECT",
  "EVAL-C-11": "REJECT",
  "EVAL-C-17": "REJECT",
  "EVAL-C-03": "PASS",
  "EVAL-C-07": "PASS",
  "EVAL-C-15": "PASS",
  "EVAL-C-24": "PASS",
};

for (const [evalId, expectedDecision] of Object.entries(expectedDecisions)) {
  runTest(`핵심 회귀 ${evalId} -> ${expectedDecision}`, () => {
    const item = items.find((i) => i.evaluationId === evalId);
    assert.ok(item, `${evalId} 문항이 리포트에 존재해야 함`);
    assert.strictEqual(item.decision, expectedDecision, `${evalId} 판정이 ${expectedDecision}이어야 함`);
  });
}

runTest("전체 30문항 rejectionReasons 불변식 검증", () => {
  for (const item of items) {
    ensureRejectionInvariant(item);
    if (item.decision === "REJECT" || item.generationRejected) {
      assert.strictEqual(item.generationRejected, true);
      assert.ok(
        item.rejectionReasons && item.rejectionReasons.length >= 1,
        `${item.evaluationId}: REJECT 상태 시 rejectionReasons가 최소 1개 이상이어야 함`,
      );
    } else {
      assert.strictEqual(item.generationRejected, false);
      assert.strictEqual(
        item.rejectionReasons.length,
        0,
        `${item.evaluationId}: PASS/REVIEW 상태 시 rejectionReasons가 0개여야 함`,
      );
    }
  }
});

console.log("\n=================================================================");
console.log(`🎉 모든 오프라인 회귀 테스트 통과! (${passedTests}/${totalTests} PASS)`);
console.log("=================================================================\n");
