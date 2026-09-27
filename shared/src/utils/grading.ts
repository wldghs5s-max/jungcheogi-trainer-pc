import { CodeLanguage, QuestionType } from "../types/question.js";

/**
 * 정처기 실기 주관식 채점 및 문자열 정규화 모듈
 * (기존 검증된 모바일 앱 로직을 PC 도메인 구조에 맞게 이식 및 확장)
 *
 * [주의 사항 및 채점 원칙]:
 * 1. Levenshtein 퍼지 매칭(편집 거리 1 이하 허용)은 실제 자격증 시험의 공식 기준이 아니라,
 *    학습자가 사소한 오탈자로 인해 불필요한 좌절을 겪지 않도록 지원하는 "플랫폼 자동 채점 보조 규칙"입니다.
 * 2. 영문 약어(SDN, SAN, PK, FK, IP 등 3글자 이하)는 1글자 차이로 완전히 다른 기술 용어가 되므로
 *    퍼지 매칭을 엄격히 배제하고 정확 일치 또는 등록된 동의어만 인정합니다.
 * 3. SYNONYM_GROUPS 사전은 명시적으로 검증 등록된 정적 동의어만 취급하며, AI에 의한 자동 확장을 배제합니다.
 * 4. 자동 채점이 애매한 경우(예: 오탈자 허용 매칭)에는 needsReview: true 플래그를 제공하여
 *    사용자나 검수자가 재검토할 수 있도록 진단 정보를 함께 반환합니다.
 */

const CIRCLED_CHAR_MAP: Record<string, string> = {
  '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5',
  '⑥': '6', '⑦': '7', '⑧': '8', '⑨': '9', '⑩': '10',
  '⑪': '11', '⑫': '12', '⑬': '13', '⑭': '14', '⑮': '15',
  '⑯': '16', '⑰': '17', '⑱': '18', '⑲': '19', '⑳': '20',
  '⑴': '1', '⑵': '2', '⑶': '3', '⑷': '4', '⑸': '5',
  '⑹': '6', '⑺': '7', '⑻': '8', '⑼': '9', '⑽': '10',
  '⒈': '1', '⒉': '2', '⒊': '3', '⒋': '4', '⒌': '5',
  '⒍': '6', '⒎': '7', '⒏': '8', '⒐': '9', '⒑': '10',
  '１': '1', '２': '2', '３': '3', '４': '4', '５': '5',
  '６': '6', '７': '7', '８': '8', '９': '9', '０': '0',
  '㉠': 'ㄱ', '㉡': 'ㄴ', '㉢': 'ㄷ', '㉣': 'ㄹ', '㉤': 'ㅁ',
  '㉥': 'ㅂ', '㉦': 'ㅅ', '㉧': 'ㅇ', '㉨': 'ㅈ', '㉩': 'ㅊ',
  '㉪': 'ㅋ', '㉫': 'ㅌ', '㉬': 'ㅍ', '㉭': 'ㅎ',
  '㉮': '가', '㉯': '나', '㉰': '다', '㉱': '라', '㉲': '마',
  '㉳': '바', '㉴': '사', '㉵': '아', '㉶': '자', '㉷': '차',
  '㉸': '카', '㉹': '타', '㉺': '파', '㉻': '하',
  '㈀': 'ㄱ', '㈁': 'ㄴ', '㈂': 'ㄷ', '㈃': 'ㄹ', '㈄': 'ㅁ',
  '㈅': 'ㅂ', '㈆': 'ㅅ', '㈇': 'ㅇ', '㈈': 'ㅈ', '㈉': 'ㅊ',
  '㈊': 'ㅋ', '㈋': 'ㅌ', '㈌': 'ㅍ', '㈍': 'ㅎ',
  '㈎': '가', '㈏': '나', '㈐': '다', '㈑': '라', '㈒': '마',
  '㈓': '바', '㈔': '사', '㈕': '아', '㈖': '자', '㈗': '차',
  '㈘': '카', '㈙': '타', '㈚': '파', '㈛': '하',
};

/**
 * 사용자 답안 문자열을 비교하기 쉬운 정규형으로 변환합니다.
 * 1. 앞뒤 공백 제거
 * 2. 원문자(①, ㉠) 및 전각 숫자 등을 표준 ASCII/한글 문자로 치환
 * 3. 화살표(→, ⇒, ->) 및 나열 구분 기호 제거
 * 4. 괄호, 특수기호, 문장부호 제거
 * 5. 단어 사이 공백 제거
 * 6. 영문 대문자화
 */
export function normalizeAnswer(ans: string): string {
  if (!ans) return "";
  let text = ans.trim();

  // 1. 원문자/특수기호 매핑 치환 (① -> 1, ㉠ -> ㄱ 등)
  text = text.replace(
    /[①-⑳⑴-⑽⒈-⒑１-９０㉠-㉭㉮-㉻㈀-㈍㈎-㈛]/g,
    (ch) => CIRCLED_CHAR_MAP[ch] || "",
  );

  // 2. 화살표 및 나열 기호 제거
  text = text.replace(/[→⇒▶▷＞≫]/g, "");

  // 3. 괄호, 특수기호, 문장부호, 하이픈 제거
  return text
    .replace(/[()[\]{}.,·\-_/'":;?`~!@#$%^&*+=<>]/g, "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

/**
 * 3글자 이하의 영문/숫자 약어 여부를 판별합니다.
 * (예: SDN, SAN, PK, FK, IP, SQL, XSS, LAN, WAN 등)
 * 약어는 1글자만 달라져도 완전히 다른 기술이 되므로 퍼지 매칭을 금지합니다.
 */
export function isShortAcronym(word: string): boolean {
  if (!word) return false;
  return /^[A-Z0-9]{1,3}$/.test(word);
}

/**
 * 정처기 주요 용어 동의어/표기 변형 그룹
 * (한글 음차, 원어 영문 약어, 풀네임, 한자어 대칭)
 * ※ 명시적으로 사전 등록된 항목만 동의어로 취급합니다.
 */
export const SYNONYM_GROUPS: string[][] = [
  // 정규화 (Normalization)
  ["1정규형", "제1정규형", "1NF", "제일정규형"],
  ["2정규형", "제2정규형", "2NF", "제이정규형"],
  ["3정규형", "제3정규형", "3NF", "제삼정규형"],
  ["보이스코드정규형", "BCNF", "BC정규형", "보이스코드"],
  ["4정규형", "제4정규형", "4NF", "제사정규형"],
  ["5정규형", "제5정규형", "5NF", "제오정규형"],

  // SQL 및 DB
  ["GROUPBY", "그룹바이", "그룹별"],
  ["SELECT", "셀렉트", "셀렉"],
  ["INSERT", "인서트"],
  ["UPDATE", "업데이트", "갱신"],
  ["DELETE", "딜리트", "삭제"],
  ["HAVING", "해빙"],
  ["ORDERBY", "오더바이", "정렬"],
  ["PRIMARYKEY", "PK", "기본키", "프라이머리키"],
  ["FOREIGNKEY", "FK", "외래키"],
  ["CANDIDATEKEY", "후보키"],
  ["INNERJOIN", "내부조인", "이너조인", "EQUIJOIN", "등가조인"],
  ["INDEX", "인덱스", "색인"],
  ["VIEW", "뷰"],
  ["TRANSACTION", "트랜잭션"],
  ["NORMALIZATION", "정규화"],

  // 트랜잭션 ACID
  ["ATOMICITY", "원자성"],
  ["CONSISTENCY", "일관성"],
  ["ISOLATION", "고립성", "격리성"],
  ["DURABILITY", "지속성", "영속성"],
  ["INTEGRITY", "무결성", "완전성"],
  ["DEADLOCK", "교착상태", "데드락"],

  // 디자인 패턴
  ["BUILDER", "빌더", "빌더패턴"],
  ["SINGLETON", "싱글톤", "싱글톤패턴"],
  ["OBSERVER", "옵서버", "옵저버", "옵서버패턴"],
  ["STRATEGY", "전략", "전략패턴"],
  ["ADAPTER", "어댑터", "어댑터패턴"],
  ["FACTORYMETHOD", "팩토리메서드", "팩토리메소드", "공장메서드"],
  ["ABSTRACTFACTORY", "추상팩토리", "추상팩토리패턴", "KIT", "KIT패턴", "키트패턴"],

  // 모듈 독립성 (응집도 & 결합도)
  ["SEQUENTIALCOHESION", "순차적응집도", "순차응집도"],
  ["FUNCTIONALCOHESION", "기능적응집도", "기능응집도"],
  ["COMMUNICATIONALCOHESION", "교환적응집도", "통신적응집도"],
  ["COMMONCOUPLING", "공통결합도"],
  ["CONTENTCOUPLING", "내용결합도"],
  ["DATACOUPLING", "자료결합도"],
  ["1243", "기능적교환적시간적우연적", "기능교환시간우연", "기능적통신적시간적우연적"],

  // 보안 및 네트워크 신기술
  ["OSPF", "OPENSHORTESTPATHFIRST"],
  ["MCDC", "MC/DC", "수정조건결정커버리지", "수정조건/결정커버리지", "수정조건결정"],
  ["ROOTKIT", "루트킷", "루트키트"],
  ["APT", "ADVANCEDPERSISTENTTHREAT", "지능형지속위협", "지능형지속적위협"],
  ["변환된문자열NDSC1", "NDSC1"],
  [
    "BUFFER_OVERFLOW",
    "BUFFER_OVERFLOW",
    "버퍼오버플로우",
    "버퍼오버플로",
    "스택버퍼오버플로우",
  ],
  [
    "SDN",
    "SOFTWAREDEFINEDNETWORKING",
    "소프트웨어정의네트워크",
    "소프트웨어정의네트워킹",
  ],
  ["XSS", "크로스사이트스크립팅"],
  ["CSRF", "XSRF"],
  ["SQLINJECTION", "SQL인젝션", "SQLI"],
];

function expandForms(ans: string): string[] {
  const normalized = normalizeAnswer(ans);
  if (!normalized) return [];

  for (const group of SYNONYM_GROUPS) {
    const canonGroup = group.map(normalizeAnswer);
    if (canonGroup.includes(normalized)) {
      return canonGroup;
    }
  }
  return [normalized];
}

export function canonicalForm(ans: string): string {
  const forms = expandForms(ans);
  return forms.length > 0 ? forms[0] : normalizeAnswer(ans);
}

/**
 * 두 문자열 간의 레벤슈타인 편집 거리(Levenshtein Distance)를 계산합니다.
 */
export function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () =>
    Array(cols).fill(0),
  );

  for (let i = 0; i < rows; i++) dp[i][0] = i;
  for (let j = 0; j < cols; j++) dp[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[a.length][b.length];
}

/**
 * 3글자 이상 단어에 대해 1글자 오탈자(타이포)를 허용하는 퍼지 매칭
 * (단, 3글자 이하의 영문 약어는 제외)
 */
export function isFuzzyMatch(left: string, right: string): boolean {
  if (!left || !right) return false;
  if (left === right) return true;

  // 약어는 오탈자 허용 금지 (예: SDN != SAN, LAN != WAN, PK != FK)
  if (isShortAcronym(left) || isShortAcronym(right)) {
    return false;
  }

  // 숫자가 포함된 경우, 숫자가 서로 다르면 절대 오탈자로 인정하지 않음 (예: 제2정규형 != 제3정규형, 151 != 152)
  const digitsLeft = left.replace(/\D/g, "");
  const digitsRight = right.replace(/\D/g, "");
  if (digitsLeft !== digitsRight) {
    return false;
  }

  const minLen = Math.min(left.length, right.length);
  if (minLen < 4) return false;
  if (Math.abs(left.length - right.length) > 1) return false;

  return levenshtein(left, right) <= 1;
}

export type GradingMode = "TERM" | "NUMERIC_OUTPUT" | "CODE_OUTPUT";

export interface GradeContext {
  questionType?: QuestionType;
  language?: CodeLanguage;
  mode?: GradingMode;
}

const NUMERIC_TOKEN = "[+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)";
const NUMERIC_OUTPUT_RE = new RegExp(
  `^${NUMERIC_TOKEN}(?:\\s+${NUMERIC_TOKEN})*$`,
);

export function looksLikeNumericOutput(value: string): boolean {
  const compact = normalizeNumericOutput(value);
  return compact.length > 0 && NUMERIC_OUTPUT_RE.test(compact);
}

/**
 * 숫자/코드 출력 허용 차이: 앞뒤 공백·줄바꿈, CRLF→LF, 연속 가로 공백 1칸.
 * 부호(-), 소수점, 값 사이 공백(경계)은 보존한다.
 */
export function normalizeNumericOutput(value: string): string {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .replace(/[ \t]+/g, " ");
}

/**
 * 코드 표준출력 비교: 앞뒤 공백·줄바꿈만 제거하고 내부 공백/부호/소수점은 유지한다.
 */
export function normalizeCodeOutput(value: string): string {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

export function resolveGradingMode(
  groundTruthAnswer: string | string[],
  context?: GradeContext,
): GradingMode {
  if (context?.mode) return context.mode;
  if (context?.questionType === "CODE_TRACE" || context?.questionType === "SQL") {
    return "CODE_OUTPUT";
  }
  if (
    context?.language === "C" ||
    context?.language === "JAVA" ||
    context?.language === "PYTHON" ||
    context?.language === "SQL"
  ) {
    return "CODE_OUTPUT";
  }

  const samples = Array.isArray(groundTruthAnswer)
    ? groundTruthAnswer
    : [String(groundTruthAnswer ?? "")];
  if (samples.length > 0 && samples.every((item) => looksLikeNumericOutput(item))) {
    return "NUMERIC_OUTPUT";
  }
  return "TERM";
}

export type MatchType = "EXACT" | "SYNONYM" | "FUZZY_TYPO" | "NONE";

export interface SingleMatchDetail {
  isMatch: boolean;
  matchType: MatchType;
  needsReview: boolean;
  normalizedUser: string;
  matchedTarget?: string;
  feedback?: string;
}

/**
 * 단일 답안 일치 여부 및 매칭 세부 정보(정확/동의어/오탈자/불일치) 분석
 */
export function checkMatchDetails(
  user: string,
  correct: string,
  context?: GradeContext,
): SingleMatchDetail {
  const mode = resolveGradingMode(correct, context);
  if (mode === "NUMERIC_OUTPUT" || mode === "CODE_OUTPUT") {
    const normUser =
      mode === "NUMERIC_OUTPUT"
        ? normalizeNumericOutput(user)
        : normalizeCodeOutput(user);
    const normCorrect =
      mode === "NUMERIC_OUTPUT"
        ? normalizeNumericOutput(correct)
        : normalizeCodeOutput(correct);

    if (!normUser || !normCorrect) {
      return {
        isMatch: false,
        matchType: "NONE",
        needsReview: false,
        normalizedUser: normUser,
        feedback: "답안이 비어있습니다.",
      };
    }

    if (normUser === normCorrect) {
      return {
        isMatch: true,
        matchType: "EXACT",
        needsReview: false,
        normalizedUser: normUser,
        matchedTarget: normCorrect,
        feedback: "정답입니다!",
      };
    }

    return {
      isMatch: false,
      matchType: "NONE",
      needsReview: false,
      normalizedUser: normUser,
      feedback: "오답입니다.",
    };
  }

  const normUser = normalizeAnswer(user);
  const normCorrect = normalizeAnswer(correct);

  if (!normUser || !normCorrect) {
    return {
      isMatch: false,
      matchType: "NONE",
      needsReview: false,
      normalizedUser: normUser,
      feedback: "답안이 비어있습니다.",
    };
  }

  // 1. 단순 정규화 완벽 일치 (EXACT)
  if (normUser === normCorrect) {
    return {
      isMatch: true,
      matchType: "EXACT",
      needsReview: false,
      normalizedUser: normUser,
      matchedTarget: normCorrect,
      feedback: "정답입니다!",
    };
  }

  // 2. 동의어 사전 매칭 (SYNONYM)
  const userForms = expandForms(user);
  const correctForms = expandForms(correct);

  for (const uForm of userForms) {
    if (correctForms.includes(uForm)) {
      return {
        isMatch: true,
        matchType: "SYNONYM",
        needsReview: false,
        normalizedUser: normUser,
        matchedTarget: uForm,
        feedback: "동의어 사전 일치로 정답 처리되었습니다.",
      };
    }
  }

  // 3. 1글자 오탈자 허용 매칭 (FUZZY_TYPO)
  // (단, 약어 금지 및 최소 3글자 이상 충족 시)
  for (const cForm of correctForms) {
    if (isFuzzyMatch(normUser, cForm)) {
      return {
        isMatch: true,
        matchType: "FUZZY_TYPO",
        needsReview: true, // 자동 채점 보조 규칙이므로 검토 대상 권장
        normalizedUser: normUser,
        matchedTarget: cForm,
        feedback:
          "1글자 오탈자 허용 보조 규칙으로 정답 처리되었습니다 (수동 검토 권장).",
      };
    }
  }

  return {
    isMatch: false,
    matchType: "NONE",
    needsReview: false,
    normalizedUser: normUser,
    feedback: "오답입니다.",
  };
}

/**
 * 단일 답안 일치 여부 판정 (하위 호환성 유지)
 */
export function isCloseMatch(
  user: string,
  correct: string,
  context?: GradeContext,
): boolean {
  return checkMatchDetails(user, correct, context).isMatch;
}

export interface ItemMatchResult {
  expected: string;
  provided: string;
  isMatch: boolean;
  matchType?: MatchType;
  needsReview?: boolean;
}

export interface GradingResult {
  isCorrect: boolean;
  score: number; // 0.0 ~ 1.0 (부분 점수 지원)
  isUnknown: boolean;
  feedback: string;
  matchType?: MatchType;
  needsReview?: boolean;
  itemResults?: ItemMatchResult[];
}

/**
 * 단일/복수 답안 통합 스마트 채점기
 */
export function gradeAnswer(
  userAnswer: string | string[],
  groundTruthAnswer: string | string[],
  isUnknown = false,
  context?: GradeContext,
): GradingResult {
  // 1. "모르겠음" 선택 시 즉시 오답 처리 (당일 복습 대상 플래그)
  if (isUnknown) {
    return {
      isCorrect: false,
      score: 0,
      isUnknown: true,
      matchType: "NONE",
      needsReview: false,
      feedback: "모르는 문제로 표시되었습니다. 해설을 확인하고 복습하세요.",
    };
  }

  // 사용자 답안이 비어있는 경우
  if (
    userAnswer === undefined ||
    userAnswer === null ||
    (typeof userAnswer === "string" && !userAnswer.trim()) ||
    (Array.isArray(userAnswer) && userAnswer.every((a) => !a.trim()))
  ) {
    return {
      isCorrect: false,
      score: 0,
      isUnknown: false,
      matchType: "NONE",
      needsReview: false,
      feedback: "답안이 입력되지 않았습니다.",
    };
  }

  // 2. Ground Truth가 복수 정답 목록인 경우
  if (Array.isArray(groundTruthAnswer)) {
    // 2-A: 복수 키워드 문제 (사용자 답안도 배열로 들어오거나 쉼표로 구분된 경우)
    let userArr: string[];
    if (Array.isArray(userAnswer)) {
      userArr = userAnswer;
    } else {
      userArr = userAnswer
        .split(/[,/\n]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    }

    // 만약 사용자가 단일 문자열을 냈고 Ground Truth 후보 중 하나와 일치하면 (동의어 목록으로 제공된 경우)
    if (userArr.length === 1) {
      for (const cand of groundTruthAnswer) {
        const detail = checkMatchDetails(userArr[0], cand, context);
        if (detail.isMatch) {
          return {
            isCorrect: true,
            score: 1.0,
            isUnknown: false,
            matchType: detail.matchType,
            needsReview: detail.needsReview,
            feedback: detail.feedback || "정답입니다!",
          };
        }
      }
    }

    // 빈칸 순서형 또는 복수 키워드 목록 채점
    const itemResults: ItemMatchResult[] = [];
    let matchCount = 0;
    let hasReviewItem = false;

    for (let i = 0; i < groundTruthAnswer.length; i++) {
      const expected = groundTruthAnswer[i];
      const provided = userArr[i] || "";
      const detail = checkMatchDetails(provided, expected, context);

      itemResults.push({
        expected,
        provided,
        isMatch: detail.isMatch,
        matchType: detail.matchType,
        needsReview: detail.needsReview,
      });

      if (detail.isMatch) {
        matchCount++;
      }
      if (detail.needsReview) {
        hasReviewItem = true;
      }
    }

    const totalItems = groundTruthAnswer.length;
    const score = Number((matchCount / totalItems).toFixed(2));
    const isCorrect = matchCount === totalItems;

    return {
      isCorrect,
      score,
      isUnknown: false,
      needsReview: hasReviewItem,
      feedback: isCorrect
        ? hasReviewItem
          ? "모든 정답 키워드가 일치합니다 (일부 오탈자 허용 포함)."
          : "모든 정답 키워드가 일치합니다!"
        : matchCount > 0
          ? `부분 정답입니다 (${matchCount}/${totalItems}개 일치).`
          : "오답입니다.",
      itemResults,
    };
  }

  // 3. Ground Truth가 단일 정답인 경우
  const userStr = Array.isArray(userAnswer) ? userAnswer.join("") : userAnswer;
  const detail = checkMatchDetails(userStr, groundTruthAnswer, context);

  return {
    isCorrect: detail.isMatch,
    score: detail.isMatch ? 1.0 : 0.0,
    isUnknown: false,
    matchType: detail.matchType,
    needsReview: detail.needsReview,
    feedback:
      detail.feedback || (detail.isMatch ? "정답입니다!" : "오답입니다."),
  };
}

/**
 * 정답 문자열 표시용 변환 (배열인 경우 ' 또는 ' 또는 순서 기호로 포맷)
 */
export function formatAnswerDisplay(answer: string | string[]): string {
  if (Array.isArray(answer)) {
    return answer.map((ans, i) => `(${i + 1}) ${ans}`).join("  |  ");
  }
  return answer;
}
