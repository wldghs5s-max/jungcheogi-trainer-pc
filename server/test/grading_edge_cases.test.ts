import assert from "node:assert";
import {
  gradeAnswer,
  normalizeAnswer,
  checkMatchDetails,
  isCloseMatch,
  isFuzzyMatch,
  isShortAcronym,
  SYNONYM_GROUPS,
} from "@jungcheogi/shared";

function runGradingEdgeCasesTests() {
  console.log(
    "=== Phase 4: 채점 엔진 (grading.ts) 경계 조건 및 심층 테스트 시작 ===\n",
  );

  // 1. 단어 정규화 (Normalization) 경계 조건
  console.log("--- 1. 정규화 경계 조건 ---");
  assert.strictEqual(normalizeAnswer(""), "", "빈 문자열");
  assert.strictEqual(normalizeAnswer("   "), "", "공백 문자열");
  assert.strictEqual(
    normalizeAnswer(" ( Builder ) "),
    "BUILDER",
    "괄호 및 공백 제거 + 대문자",
  );
  assert.strictEqual(
    normalizeAnswer("INNER  JOIN  ON"),
    "INNERJOINON",
    "내부 공백 제거",
  );
  assert.strictEqual(
    normalizeAnswer("순차적·응집도!?"),
    "순차적응집도",
    "특수기호 및 문장부호 제거",
  );
  assert.strictEqual(normalizeAnswer("group_by"), "GROUPBY", "언더스코어 제거");
  console.log("OK   정규화 특수기호/공백/대소문자 처리 통과");

  // 2. 단축 영문 약어(Acronym) 오탈자 방지 규칙
  console.log("\n--- 2. 단축 영문 약어 퍼지 매칭 금지 규칙 ---");
  assert.strictEqual(isShortAcronym("SDN"), true, "SDN 약어 감지");
  assert.strictEqual(isShortAcronym("SAN"), true, "SAN 약어 감지");
  assert.strictEqual(isShortAcronym("PK"), true, "PK 약어 감지");
  assert.strictEqual(isShortAcronym("IP"), true, "IP 약어 감지");
  assert.strictEqual(isShortAcronym("BUILDER"), false, "일반 단어는 약어 아님");
  assert.strictEqual(
    isShortAcronym("순차응집도"),
    false,
    "한글 단어는 영문 약어 아님",
  );

  // 핵심: SDN과 SAN은 레벤슈타인 거리가 1이지만, 약어이므로 오답이어야 함!
  const sdnVsSan = checkMatchDetails("SAN", "SDN");
  assert.strictEqual(
    sdnVsSan.isMatch,
    false,
    "SDN과 SAN은 1글자 차이라도 약어이므로 오답이어야 함",
  );
  assert.strictEqual(sdnVsSan.matchType, "NONE");

  const lanVsWan = checkMatchDetails("LAN", "WAN");
  assert.strictEqual(lanVsWan.isMatch, false, "LAN과 WAN은 약어이므로 오답");

  const pkVsFk = checkMatchDetails("FK", "PK");
  assert.strictEqual(pkVsFk.isMatch, false, "PK와 FK는 약어이므로 오답");
  console.log(
    "OK   3글자 이하 단축 영문 약어 오탈자 방지(False Positive 차단) 통과",
  );

  // 3. 한글 및 일반 기술용어 1글자 오탈자(Typo) 허용 및 needsReview 검토 플래그
  console.log("\n--- 3. 1글자 오탈자 허용 및 검토 필요 플래그 ---");
  const typo1 = checkMatchDetails("옵서버패톤", "옵서버패턴");
  assert.strictEqual(
    typo1.isMatch,
    true,
    "옵서버패톤 <-> 옵서버패턴 오탈자 인정",
  );
  assert.strictEqual(typo1.matchType, "FUZZY_TYPO");
  assert.strictEqual(
    typo1.needsReview,
    true,
    "오탈자 매칭 시 needsReview: true 설정",
  );

  const gradeTypo = gradeAnswer("옵서버패톤", "옵서버패턴");
  assert.strictEqual(gradeTypo.isCorrect, true);
  assert.strictEqual(gradeTypo.needsReview, true);
  assert(gradeTypo.feedback.includes("검토"), "피드백에 검토 권장 메시지 포함");
  console.log("OK   명백한 오탈자 허용 및 needsReview 검토 플래그 검증 통과");

  // 4. 지나치게 짧은 정답 (1~2글자)
  console.log("\n--- 4. 지나치게 짧은 정답 (1~2글자 퍼지 배제) ---");
  // C 언어 정답 'C'에 대해 'D'를 제출한 경우
  const cVsD = checkMatchDetails("D", "C");
  assert.strictEqual(cVsD.isMatch, false, "1글자 단어는 퍼지 배제");

  // 'IP'에 대해 'TCP' 또는 'IF' 제출한 경우
  const ipVsIf = checkMatchDetails("IF", "IP");
  assert.strictEqual(ipVsIf.isMatch, false, "2글자 단어는 퍼지 배제");
  console.log("OK   1~2글자 단어 퍼지 배제 통과");

  // 5. 정적 동의어 사전 (SYNONYM_GROUPS) 엄격 매칭
  console.log("\n--- 5. 동의어 사전 매칭 (정적 등록된 항목만 인정) ---");
  const synBuilder = checkMatchDetails("Builder", "빌더");
  assert.strictEqual(synBuilder.isMatch, true);
  assert.strictEqual(synBuilder.matchType, "SYNONYM");
  assert.strictEqual(
    synBuilder.needsReview,
    false,
    "사전 등록 동의어는 검토 불필요",
  );

  const synGroupBy = checkMatchDetails("그룹바이", "GROUP BY");
  assert.strictEqual(synGroupBy.isMatch, true);
  assert.strictEqual(synGroupBy.matchType, "SYNONYM");

  const synCohesion = checkMatchDetails("순차응집도", "순차적 응집도");
  assert.strictEqual(synCohesion.isMatch, true);
  assert.strictEqual(synCohesion.matchType, "SYNONYM");

  // 사전에 없는 임의 유사어는 동의어로 인정되지 않음
  const unregSyn = checkMatchDetails("생성형패턴", "빌더");
  assert.strictEqual(
    unregSyn.isMatch,
    false,
    "사전에 미등록된 개념 유사어는 자동 동의어 불인정",
  );
  console.log("OK   정적 동의어 사전 명시적 일치 검증 통과");

  // 6. 복수 키워드 채점 및 부분 점수
  console.log("\n--- 6. 복수 키워드 부분 점수 및 순서 검증 ---");
  const acidTruth = ["원자성", "일관성", "고립성", "영속성"];

  // (1) 4개 모두 정답
  const gradeAll = gradeAnswer(
    ["원자성", "일관성", "고립성", "영속성"],
    acidTruth,
  );
  assert.strictEqual(gradeAll.isCorrect, true);
  assert.strictEqual(gradeAll.score, 1.0);

  // (2) 2개만 정답 (부분점수 0.50)
  const gradeHalf = gradeAnswer(
    ["원자성", "오답1", "고립성", "오답2"],
    acidTruth,
  );
  assert.strictEqual(gradeHalf.isCorrect, false);
  assert.strictEqual(gradeHalf.score, 0.5);
  assert.strictEqual(gradeHalf.itemResults?.filter((r) => r.isMatch).length, 2);

  // (3) 영문 동의어 혼용 복수 키워드
  const gradeMixed = gradeAnswer(
    ["Atomicity", "일관성", "Isolation", "Durability"],
    acidTruth,
  );
  assert.strictEqual(gradeMixed.isCorrect, true);
  assert.strictEqual(gradeMixed.score, 1.0);
  console.log("OK   복수 키워드 부분점수 및 한/영 동의어 혼용 통과");

  // 7. 빈 답안 및 모르겠음
  console.log("\n--- 7. 미입력, 빈 문자열, 모르겠음 검증 ---");
  const empty1 = gradeAnswer("", "빌더");
  assert.strictEqual(empty1.isCorrect, false);
  assert.strictEqual(empty1.score, 0);

  const empty2 = gradeAnswer(["   ", ""], ["원자성", "영속성"]);
  assert.strictEqual(empty2.isCorrect, false);
  assert.strictEqual(empty2.score, 0);

  const unknown = gradeAnswer("", "빌더", true);
  assert.strictEqual(unknown.isCorrect, false);
  assert.strictEqual(unknown.isUnknown, true);
  assert.strictEqual(unknown.score, 0);
  console.log("OK   미입력 및 모르겠음 분리 처리 통과");

  console.log("\n🎉 Phase 4 채점 엔진 경계 조건 및 심층 테스트 전체 통과!");
}

runGradingEdgeCasesTests();
