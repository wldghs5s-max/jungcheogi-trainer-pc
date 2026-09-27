/**
 * 기존 Strict Live 30문항 결과 재평가 및 회귀 검증 스크립트
 *
 * [원칙]
 * 1. Gemini API 재호출 절대 금지 (기존 30문항 JSON 데이터 대상 오프라인 검증)
 * 2. 실제 모순(CONTRADICTION)은 자동 REJECT
 * 3. 단순 표현 차이 및 검증 불충분(INSUFFICIENT)은 REJECT와 분리하여 PASS 또는 REVIEW 판정
 * 4. 판정 체계: PASS | REVIEW | REJECT
 * 5. 불변식 보장: generationRejected === true <=> rejectionReasons.length >= 1
 */

import fs from "fs";
import path from "path";
import {
  calculateCodeSimilarity,
  ensureRejectionInvariant,
  verifyExplanationMatch,
  verifyStepTraceMatch,
  Decision,
  StepTraceStatus,
  ExplanationStatus,
  CloneType,
} from "../engine/evaluationValidator.js";

const targetFileName =
  "c_generation_30_strict_live_2026-09-27T15-57-40-076Z.json";
let jsonPath = path.resolve(process.cwd(), "evaluation/results", targetFileName);
if (!fs.existsSync(jsonPath)) {
  jsonPath = path.resolve(
    process.cwd(),
    "server/evaluation/results",
    targetFileName,
  );
}

if (!fs.existsSync(jsonPath)) {
  console.error("파일을 찾을 수 없습니다:", jsonPath);
  process.exit(1);
}

const originalReport = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const items: any[] = originalReport.items;

console.log("=================================================================");
console.log("🧪 Strict Live 30문항 판정 체계 정밀 재검증 (PASS / REVIEW / REJECT)");
console.log("=================================================================\n");

// 1. Peer Similarity & Clone 매트릭스 사전 계산
interface CloneInfo {
  cloneType: CloneType;
  clonedWith: Array<{ id: string; type: CloneType; rawSim: number; structSim: number }>;
}

const cloneMap = new Map<string, CloneInfo>();
for (const item of items) {
  cloneMap.set(item.evaluationId, { cloneType: "NONE", clonedWith: [] });
}

for (let i = 0; i < items.length; i++) {
  for (let j = i + 1; j < items.length; j++) {
    const itemA = items[i];
    const itemB = items[j];
    const detail = calculateCodeSimilarity(itemA.code, itemB.code);

    if (detail.category === "IDENTICAL") {
      const aInfo = cloneMap.get(itemA.evaluationId)!;
      const bInfo = cloneMap.get(itemB.evaluationId)!;
      aInfo.cloneType = "IDENTICAL";
      bInfo.cloneType = "IDENTICAL";
      aInfo.clonedWith.push({ id: itemB.evaluationId, type: "IDENTICAL", rawSim: detail.rawSimilarity, structSim: detail.structuralSimilarity });
      bInfo.clonedWith.push({ id: itemA.evaluationId, type: "IDENTICAL", rawSim: detail.rawSimilarity, structSim: detail.structuralSimilarity });
    } else if (detail.category === "MUTATION_CLONE") {
      const aInfo = cloneMap.get(itemA.evaluationId)!;
      const bInfo = cloneMap.get(itemB.evaluationId)!;
      if (aInfo.cloneType !== "IDENTICAL") aInfo.cloneType = "MUTATION_CLONE";
      if (bInfo.cloneType !== "IDENTICAL") bInfo.cloneType = "MUTATION_CLONE";
      aInfo.clonedWith.push({ id: itemB.evaluationId, type: "MUTATION_CLONE", rawSim: detail.rawSimilarity, structSim: detail.structuralSimilarity });
      bInfo.clonedWith.push({ id: itemA.evaluationId, type: "MUTATION_CLONE", rawSim: detail.rawSimilarity, structSim: detail.structuralSimilarity });
    }
  }
}

export interface ReEvalItemResult {
  evaluationId: string;
  targetConcept: string;
  answer: string;
  codeSnippet: string;

  // Decision
  decision: Decision;
  generationRejected: boolean;
  humanReviewRecommended: boolean;

  // Status breakdown
  stepTraceStatus: StepTraceStatus;
  stepTraceReason?: string;
  explanationStatus: ExplanationStatus;
  explanationReason?: string;
  selfCorrectionDetected: boolean;
  cloneType: CloneType;
  clonedWithPeers: string[];

  // Reasons
  rejectionReasons: string[];
  humanReviewReasons: string[];

  // Comparison
  oldDecision: "PASS" | "REJECT";
  oldRejectionReasons: string[];
}

const results: ReEvalItemResult[] = [];

// 2. 개별 문항 검증 및 판정
for (const item of items) {
  const ansStr = String(item.answer).trim();
  const explStr = item.explanation || "";
  const stepTrace = item.stepByStepTrace || "";

  // A. stepTrace 상태 검증
  const traceCheck = verifyStepTraceMatch(stepTrace, ansStr, item.evaluationId);

  // B. explanation 상태 검증
  const explCheck = verifyExplanationMatch(explStr, ansStr, item.evaluationId);

  // C. Clone 상태
  const cloneInfo = cloneMap.get(item.evaluationId)!;

  // D. Rejection 사유 및 Human Review 구성
  const rejectionReasons: string[] = [];
  const humanReviewReasons: string[] = [];

  if (cloneInfo.cloneType === "IDENTICAL") {
    const peers = cloneInfo.clonedWith.filter(c => c.type === "IDENTICAL").map(c => c.id).join(", ");
    rejectionReasons.push(`동일 배치 내 IDENTICAL 코드 중복 (${peers})`);
  } else if (cloneInfo.cloneType === "MUTATION_CLONE") {
    const peers = cloneInfo.clonedWith.filter(c => c.type === "MUTATION_CLONE").map(c => c.id).join(", ");
    rejectionReasons.push(`동일 배치 내 MUTATION_CLONE 변이 복제 (${peers})`);
  }

  if (explCheck.status === "CONTRADICTION") {
    rejectionReasons.push(explCheck.reason || "해설 최종 결론과 정답 불일치");
  }

  if (traceCheck.status === "CONTRADICTION") {
    rejectionReasons.push(traceCheck.reason || "추적표(stepTrace) 계산과 정답 모순");
  }

  if (!item.structuralPass && item.structuralIssues?.length > 0) {
    rejectionReasons.push(...item.structuralIssues);
  }

  if (item.codeSyntaxCheck && (!item.codeSyntaxCheck.balancedBraces || !item.codeSyntaxCheck.balancedParens)) {
    rejectionReasons.push("괄호 불균형");
  }

  // E. Decision 확정: PASS | REVIEW | REJECT
  let decision: Decision = "PASS";
  let generationRejected = false;
  let humanReviewRecommended = false;

  if (rejectionReasons.length > 0) {
    decision = "REJECT";
    generationRejected = true;
    humanReviewRecommended = true;
    humanReviewReasons.push(...rejectionReasons);
  } else if (traceCheck.status === "INSUFFICIENT" || explCheck.status === "INSUFFICIENT") {
    decision = "REVIEW";
    generationRejected = false;
    humanReviewRecommended = true;
    if (traceCheck.reason) humanReviewReasons.push(traceCheck.reason);
    if (explCheck.reason) humanReviewReasons.push(explCheck.reason);
  } else {
    decision = "PASS";
    generationRejected = false;
    humanReviewRecommended = false;
  }

  const resultItem: ReEvalItemResult = {
    evaluationId: item.evaluationId,
    targetConcept: item.targetConcept,
    answer: ansStr,
    codeSnippet: item.code.replace(/\s+/g, " ").slice(0, 60) + "...",
    decision,
    generationRejected,
    humanReviewRecommended,
    stepTraceStatus: traceCheck.status,
    stepTraceReason: traceCheck.reason,
    explanationStatus: explCheck.status,
    explanationReason: explCheck.reason,
    selfCorrectionDetected: explCheck.selfCorrectionDetected,
    cloneType: cloneInfo.cloneType,
    clonedWithPeers: cloneInfo.clonedWith.map(c => `${c.id}(${c.type})`),
    rejectionReasons,
    humanReviewReasons,
    oldDecision: item.generationRejected ? "REJECT" : "PASS",
    oldRejectionReasons: item.rejectionReasons || [],
  };

  // F. 불변식 강제
  ensureRejectionInvariant(resultItem);

  results.push(resultItem);
}

// 3. 통계 집계
let oldRejectCount = 0;
let newRejectCount = 0;
let newPassCount = 0;
let newReviewCount = 0;

let traceContradictionCount = 0;
let traceInsufficientCount = 0;

let explContradictionCount = 0;
let explInsufficientCount = 0;

let identicalCloneCount = 0;
let mutationCloneCount = 0;

let emptyRejectionReasonsCount = 0;
let invariantViolationsCount = 0;

for (const r of results) {
  if (r.oldDecision === "REJECT") oldRejectCount++;
  if (r.decision === "REJECT") newRejectCount++;
  if (r.decision === "PASS") newPassCount++;
  if (r.decision === "REVIEW") newReviewCount++;

  if (r.stepTraceStatus === "CONTRADICTION") traceContradictionCount++;
  if (r.stepTraceStatus === "INSUFFICIENT") traceInsufficientCount++;

  if (r.explanationStatus === "CONTRADICTION") explContradictionCount++;
  if (r.explanationStatus === "INSUFFICIENT") explInsufficientCount++;

  if (r.cloneType === "IDENTICAL") identicalCloneCount++;
  if (r.cloneType === "MUTATION_CLONE") mutationCloneCount++;

  // Invariant verification
  if (r.generationRejected && r.rejectionReasons.length === 0) {
    emptyRejectionReasonsCount++;
    invariantViolationsCount++;
  }
  if (!r.generationRejected && r.rejectionReasons.length > 0) {
    invariantViolationsCount++;
  }
}

// 4. 고정 회귀 테스트 항목 검증
console.log("=================================================================");
console.log("🎯 [회귀 테스트 1: 반드시 REJECT 유지되어야 하는 9문항]");
console.log("=================================================================");
const mustRejectList = [
  "EVAL-C-25", "EVAL-C-02", "EVAL-C-06", "EVAL-C-10",
  "EVAL-C-11", "EVAL-C-17", "EVAL-C-20", "EVAL-C-22", "EVAL-C-23"
];

for (const id of mustRejectList) {
  const item = results.find(r => r.evaluationId === id);
  const ok = item && item.decision === "REJECT";
  console.log(`- ${id}: ${ok ? "✅ REJECT 유지" : "❌ FAIL (REJECT 아님)"} | 사유: ${item?.rejectionReasons.join("; ")}`);
}

console.log("\n=================================================================");
console.log("🎯 [회귀 테스트 2: 단순 표현 차이로 잘못 Reject하지 않아야 하는 5문항]");
console.log("=================================================================");
const mustNotWronglyRejectList = [
  "EVAL-C-03", "EVAL-C-07", "EVAL-C-09", "EVAL-C-15", "EVAL-C-24"
];

for (const id of mustNotWronglyRejectList) {
  const item = results.find(r => r.evaluationId === id);
  const ok = item && item.decision !== "REJECT";
  console.log(`- ${id}: ${ok ? `✅ 정상 인정 (${item.decision})` : "❌ FAIL (REJECT됨)"} | Trace: ${item?.stepTraceStatus} | Expl: ${item?.explanationStatus}`);
}

console.log("\n=================================================================");
console.log("📊 [평가 하네스 집계 지표 (Section 9 요구사항)]");
console.log("=================================================================");
console.log(`기존 Reject 수:              ${oldRejectCount}건`);
console.log(`신규 Reject 수:              ${newRejectCount}건`);
console.log(`신규 PASS 수:                ${newPassCount}건`);
console.log(`신규 REVIEW 수:              ${newReviewCount}건`);
console.log(`TRACE_CONTRADICTION 수:      ${traceContradictionCount}건`);
console.log(`TRACE_INSUFFICIENT 수:        ${traceInsufficientCount}건`);
console.log(`EXPLANATION_CONTRADICTION 수: ${explContradictionCount}건`);
console.log(`EXPLANATION_INSUFFICIENT 수:  ${explInsufficientCount}건`);
console.log(`IDENTICAL 수:                ${identicalCloneCount}건`);
console.log(`MUTATION_CLONE 수:           ${mutationCloneCount}건`);
console.log(`empty rejectionReasons 수:   ${emptyRejectionReasonsCount}건 (목표: 0건)`);
console.log(`invariant violation 수:      ${invariantViolationsCount}건 (목표: 0건)`);

console.log("\n=================================================================");
console.log("📋 [전체 30문항 이전 vs 신규 판정 및 사유 비교]");
console.log("=================================================================");
console.log("| evaluationId | oldDecision | newDecision | stepTrace | explanation | cloneType | newReasons |");
console.log("|:---|:---:|:---:|:---:|:---:|:---:|:---|");
for (const r of results) {
  const reasonText = r.rejectionReasons.length > 0 ? r.rejectionReasons.join("; ") : (r.humanReviewReasons.join("; ") || "-");
  console.log(`| ${r.evaluationId} | ${r.oldDecision} | ${r.decision} | ${r.stepTraceStatus} | ${r.explanationStatus} | ${r.cloneType} | ${reasonText} |`);
}

// 5. 결과 파일 영구 보존
const outputReport = {
  originalEvaluatedAt: originalReport.summary?.evaluatedAt || originalReport.originalEvaluatedAt,
  reEvaluatedAt: new Date().toISOString(),
  targetCount: 30,
  summary: {
    oldRejectCount,
    newRejectCount,
    newPassCount,
    newReviewCount,
    traceContradictionCount,
    traceInsufficientCount,
    explContradictionCount,
    explInsufficientCount,
    identicalCloneCount,
    mutationCloneCount,
    emptyRejectionReasonsCount,
    invariantViolationsCount,
  },
  items: results,
};

let outDir = path.resolve(process.cwd(), "evaluation/results");
if (!fs.existsSync(outDir)) {
  outDir = path.resolve(process.cwd(), "server/evaluation/results");
}
const outPath = path.join(outDir, "c_generation_30_re_evaluation_report.json");
fs.writeFileSync(outPath, JSON.stringify(outputReport, null, 2), "utf8");
console.log(`\n💾 재검증 상세 결과 저장 완료: ${outPath}\n`);
