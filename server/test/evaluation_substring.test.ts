import assert from "node:assert";
import { isStudyEligible, hasValidGroundTruth } from "@jungcheogi/shared";
import {
  textContainsAnswerValue,
  verifyExplanationMatch,
  verifyStepTraceMatch,
} from "../src/engine/evaluationValidator.js";

console.log("=== 해설·추적표 부분 문자열 회귀 ===\n");

assert.strictEqual(textContainsAnswerValue("따라서 최종 정답은 15입니다.", "5"), false);
assert.strictEqual(textContainsAnswerValue("따라서 최종 정답은 15입니다.", "15"), true);
assert.strictEqual(textContainsAnswerValue("결과는 -5입니다.", "5"), false);
assert.strictEqual(textContainsAnswerValue("결과는 -5입니다.", "-5"), true);
assert.strictEqual(textContainsAnswerValue("값은 1.5입니다.", "15"), false);
assert.strictEqual(textContainsAnswerValue("값은 15입니다.", "1.5"), false);
assert.strictEqual(textContainsAnswerValue("출력 1 23", "12 3"), false);
assert.strictEqual(textContainsAnswerValue("출력 12 3", "1 23"), false);
assert.strictEqual(textContainsAnswerValue("출력 5 3", "3 5"), false);
assert.strictEqual(textContainsAnswerValue("출력 3 5", "3 5"), true);
assert.strictEqual(textContainsAnswerValue("최종 x=8, y=10", "8 10"), true);
console.log("OK   토큰 경계·순서 보존");

const fiveVsFifteen = verifyExplanationMatch("중간값은 5입니다. 따라서 최종 정답은 15입니다.", "5");
assert.strictEqual(fiveVsFifteen.status, "CONTRADICTION");
assert.strictEqual(fiveVsFifteen.conclusionMatches, false);

const matchingFifteen = verifyExplanationMatch("따라서 최종 정답은 15입니다.", "15");
assert.strictEqual(matchingFifteen.status, "MATCH");

const noConclusion = verifyExplanationMatch("루프를 돌며 값을 더한다. 중간 합은 5가 된다.", "5");
assert.strictEqual(noConclusion.status, "INSUFFICIENT");

const traceMidNotFinal = verifyStepTraceMatch(
  "1단계 합=5. 2단계 합=15. 최종 출력 결과는 15입니다.",
  "5",
);
assert.notStrictEqual(traceMidNotFinal.status, "MATCH");

const traceMatch = verifyStepTraceMatch(
  "1단계 합=5. 최종 출력 결과는 5입니다.",
  "5",
);
assert.strictEqual(traceMatch.status, "MATCH");

const traceNoConclusion = verifyStepTraceMatch(
  "배열의 첫 원소는 8로 변경되고 c=8, d=4이다.",
  "2 4 4 8 10",
);
assert.strictEqual(traceNoConclusion.status, "INSUFFICIENT");

const expl25vs15 = verifyExplanationMatch("결과적으로 정답은 25입니다.", "15");
assert.strictEqual(expl25vs15.status, "CONTRADICTION");

assert.strictEqual(hasValidGroundTruth(0), true);
assert.strictEqual(hasValidGroundTruth("0"), true);
assert.strictEqual(hasValidGroundTruth(""), false);
assert.strictEqual(hasValidGroundTruth("   "), false);
assert.strictEqual(hasValidGroundTruth([]), false);
assert.strictEqual(hasValidGroundTruth([""]), false);
assert.strictEqual(hasValidGroundTruth(["0"]), true);
assert.ok(!isStudyEligible({ studyVisibility: "TEMPORARY_DRILL", groundTruthAnswer: "1" }));
assert.ok(isStudyEligible({ studyVisibility: "LIVE", groundTruthAnswer: "0" }));

console.log("OK   5/15, -5/5, 1.5/15, 다중값 순서, 결론 부재, 0 정답");
console.log("\n부분 문자열 회귀 통과");
