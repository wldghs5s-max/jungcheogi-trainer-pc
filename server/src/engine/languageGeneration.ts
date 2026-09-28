import {
  CodeLanguage,
  Difficulty,
  GeneratedIndependentQuestion,
  IndependentGenerationContext,
} from "@jungcheogi/shared";

export type IndependentLanguage = "C" | "JAVA" | "PYTHON";

export class UnsupportedIndependentGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedIndependentGenerationError";
  }
}

export function normalizeLanguage(input?: string | null): CodeLanguage | null {
  if (input === undefined || input === null) return null;
  const s = String(input).trim().toLowerCase();
  if (!s) return null;
  if (
    s === "c" ||
    s === "c언어" ||
    s === "c 언어" ||
    s === "clang" ||
    s === "c language"
  ) {
    return "C";
  }
  if (s === "java" || s === "자바") return "JAVA";
  if (s === "python" || s === "파이썬" || s === "py") return "PYTHON";
  if (
    s === "sql" ||
    s === "sqll" ||
    s.includes("sql")
  ) {
    return "SQL";
  }
  return null;
}

export function isIndependentLanguage(
  lang: CodeLanguage | null,
): lang is IndependentLanguage {
  return lang === "C" || lang === "JAVA" || lang === "PYTHON";
}

export interface StructureCheckResult {
  isBalanced: boolean;
  hasRequiredEntry: boolean;
  hasSyntaxIssues: boolean;
  reason?: string;
}

function stripQuotedAndBlockComments(
  code: string,
  options: { blockComments: boolean; hashes: boolean },
): string {
  let out = "";
  let i = 0;
  const n = code.length;
  while (i < n) {
    const ch = code[i];
    const next = i + 1 < n ? code[i + 1] : "";

    if (options.blockComments && ch === "/" && next === "*") {
      i += 2;
      while (i + 1 < n && !(code[i] === "*" && code[i + 1] === "/")) i++;
      i += 2;
      out += " ";
      continue;
    }
    if (ch === "/" && next === "/") {
      while (i < n && code[i] !== "\n") i++;
      continue;
    }
    if (options.hashes && ch === "#") {
      while (i < n && code[i] !== "\n") i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      i++;
      while (i < n) {
        if (code[i] === "\\") {
          i += 2;
          continue;
        }
        if (code[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      out += " ";
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

function stripPythonStringsAndComments(code: string): string {
  let out = "";
  let i = 0;
  const n = code.length;
  while (i < n) {
    if (code[i] === "#") {
      while (i < n && code[i] !== "\n") i++;
      continue;
    }
    const triple = code.slice(i, i + 3);
    if (triple === '"""' || triple === "'''") {
      const quote = triple;
      i += 3;
      while (i + 2 < n && code.slice(i, i + 3) !== quote) i++;
      i += 3;
      out += " ";
      continue;
    }
    if (code[i] === '"' || code[i] === "'") {
      const quote = code[i];
      i++;
      while (i < n) {
        if (code[i] === "\\") {
          i += 2;
          continue;
        }
        if (code[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      out += " ";
      continue;
    }
    out += code[i];
    i++;
  }
  return out;
}

function isBalancedDelimiters(stripped: string): boolean {
  let brace = 0;
  let paren = 0;
  let bracket = 0;
  for (const ch of stripped) {
    if (ch === "{") brace++;
    else if (ch === "}") brace--;
    else if (ch === "(") paren++;
    else if (ch === ")") paren--;
    else if (ch === "[") bracket++;
    else if (ch === "]") bracket--;
    if (brace < 0 || paren < 0 || bracket < 0) return false;
  }
  return brace === 0 && paren === 0 && bracket === 0;
}

export function analyzeCodeStructure(
  code: string,
  language: IndependentLanguage,
): StructureCheckResult {
  const raw = code || "";
  if (!raw.trim()) {
    return {
      isBalanced: false,
      hasRequiredEntry: false,
      hasSyntaxIssues: true,
      reason: "코드가 비어 있습니다",
    };
  }

  const stripped =
    language === "PYTHON"
      ? stripPythonStringsAndComments(raw)
      : stripQuotedAndBlockComments(raw, {
          blockComments: true,
          hashes: false,
        });

  const isBalanced = isBalancedDelimiters(stripped);
  let hasRequiredEntry = true;
  let reason: string | undefined;

  if (language === "C") {
    hasRequiredEntry = /int\s+main\s*\(/.test(stripped);
    if (!hasRequiredEntry) reason = "C 코드에 int main(...) 진입점이 없습니다";
  } else if (language === "JAVA") {
    hasRequiredEntry = /(?:public\s+)?static\s+void\s+main\s*\(/.test(stripped);
    if (!hasRequiredEntry) {
      reason = "Java 코드에 static void main(...) 진입점이 없습니다";
    }
  } else {
    hasRequiredEntry = true;
  }

  if (!isBalanced && !reason) {
    reason = "괄호/중괄호가 코드 구조상 불균형입니다";
  }

  return {
    isBalanced,
    hasRequiredEntry,
    hasSyntaxIssues: !isBalanced || !hasRequiredEntry,
    reason,
  };
}

const JAVA_CORE_SKILLS = [
  "- [클래스와 객체] (MEDIUM): 필드 초기화, 생성자, 인스턴스 메서드 호출 결과 추적",
  "- [상속과 오버라이딩] (HARD): Parent 타입 참조 + Child 실제 객체 동적 바인딩",
  "- [다형성] (HARD): 오버라이딩된 메서드가 재귀/배열과 결합된 출력 추적",
  "- [배열과 문자열] (MEDIUM): char/String, substring, 배열 인덱스 연산",
  "- [재귀] (HARD): 기저 조건과 반환값 누적",
];

const PYTHON_CORE_SKILLS = [
  "- [리스트와 슬라이싱] (MEDIUM): [start:end], 음수 인덱스, 스텝",
  "- [문자열] (MEDIUM): 슬라이싱, 결합, 대소문자, 길이",
  "- [반복문] (MEDIUM): for/while와 누적 변수",
  "- [함수와 재귀] (HARD): 기본 인자와 재귀 누적",
  "- [참조 관계] (HARD): 리스트 별칭 할당 후 원본 변경이 결과에 미치는 영향",
];

export function buildIndependentGenerationPrompt(
  language: IndependentLanguage,
  difficulty: Difficulty,
  context: IndependentGenerationContext,
): string {
  const skillCatalog =
    language === "C"
      ? undefined
      : language === "JAVA"
        ? JAVA_CORE_SKILLS.join("\n")
        : PYTHON_CORE_SKILLS.join("\n");

  const commonRules = `
[공통 출제 제약]
- 외부 입력(scanf/input/args), 파일, 네트워크, 난수, 현재 시간에 의존하지 않는 결정적(deterministic) 출력 문제만 출제하십시오.
- 정답은 콘솔에 실제로 출력되는 최종 결과만 적습니다. 따옴표나 불필요한 줄바꿈을 넣지 마십시오.
- 단계별 추적표(stepByStepTrace)의 최종 결론과 officialExplanation의 최종 결론, groundTruthAnswer가 일치해야 합니다.
- 정적 구문 검사만으로 컴파일/실행 성공을 단정하지 말고, 추적표로 값을 직접 계산하십시오.
`;

  if (language === "C") {
    return ""; // C prompt is assembled in aiService with C_CORE_SKILLS
  }

  if (language === "JAVA") {
    return `당신은 대한민국 '정보처리기사 실기 시험' 출제위원급 AI 전문가입니다.
기존 문제의 변형이 아니라, Java 실기 학습에 적합한 독립형 코드 추적 문제를 설계하십시오.

[출제 요구 조건]
1. 대상 언어: JAVA
2. 난이도: ${difficulty}
3. 핵심 평가 요소 (1~2개를 결합):
${skillCatalog}
4. 완결된 컴파일 가능한 Java 코드와 public class Main + public static void main(String[] args) 진입점을 포함하십시오.
5. 클래스·상속·오버라이딩·다형성·배열·문자열·재귀 중 실기 빈출 요소를 사용하십시오.
6. 미초기화 값, 예외로만 끝나는 코드, 비결정적 출력은 금지합니다.
${context.instructions ? `7. 사용자 지침: ${context.instructions}` : ""}
${
  context.avoidSnippets && context.avoidSnippets.length > 0
    ? `8. 피해야 할 기존 패턴:\n${context.avoidSnippets.slice(0, 3).join("\n---\n")}`
    : ""
}
${commonRules}

반드시 유효한 JSON 객체만 반환하세요:
{
  "designMetadata": {
    "concept": "핵심 출제 개념",
    "difficulty": "${difficulty}",
    "skill": "평가 스킬",
    "questionDesign": "설계 요약",
    "stepByStepTrace": "단계별 상태 변화. 마지막에 최종 출력 결론을 명시"
  },
  "questionText": "다음 Java 프로그램을 분석하여 실행 결과를 쓰시오.",
  "code": "class Parent { ... }\\npublic class Main {\\n    public static void main(String[] args) {\\n        ...\\n    }\\n}",
  "type": "CODE_TRACE",
  "subject": "프로그래밍언어활용",
  "category": "Java 프로그래밍",
  "groundTruthAnswer": "실제 System.out 출력 결과만",
  "officialExplanation": "단계별 해설. 마지막 문장에 최종 정답을 명시",
  "keywords": ["Java", "다형성"]
}`;
  }

  return `당신은 대한민국 '정보처리기사 실기 시험' 출제위원급 AI 전문가입니다.
기존 문제의 변형이 아니라, Python 실기 학습에 적합한 독립형 코드 추적 문제를 설계하십시오.

[출제 요구 조건]
1. 대상 언어: PYTHON
2. 난이도: ${difficulty}
3. 핵심 평가 요소 (1~2개를 결합):
${skillCatalog}
4. 들여쓰기와 개행을 JSON 문자열에서 \\n으로 보존하십시오. main 함수나 중괄호를 요구하지 않습니다.
5. 리스트·슬라이싱·문자열·반복문·함수·재귀·참조 관계 중 실기 빈출 요소를 사용하십시오.
6. input(), random, 파일, 현재 시간, 네트워크를 사용하지 마십시오.
${context.instructions ? `7. 사용자 지침: ${context.instructions}` : ""}
${
  context.avoidSnippets && context.avoidSnippets.length > 0
    ? `8. 피해야 할 기존 패턴:\n${context.avoidSnippets.slice(0, 3).join("\n---\n")}`
    : ""
}
${commonRules}

반드시 유효한 JSON 객체만 반환하세요:
{
  "designMetadata": {
    "concept": "핵심 출제 개념",
    "difficulty": "${difficulty}",
    "skill": "평가 스킬",
    "questionDesign": "설계 요약",
    "stepByStepTrace": "단계별 상태 변화. 마지막에 최종 출력 결론을 명시"
  },
  "questionText": "다음 Python 프로그램을 분석하여 실행 결과를 쓰시오.",
  "code": "data = [1, 2, 3]\\nprint(...)",
  "type": "CODE_TRACE",
  "subject": "프로그래밍언어활용",
  "category": "Python 프로그래밍",
  "groundTruthAnswer": "실제 print 출력 결과만",
  "officialExplanation": "단계별 해설. 마지막 문장에 최종 정답을 명시",
  "keywords": ["Python", "슬라이싱"]
}`;
}

export const MOCK_INDEPENDENT_JAVA_QUESTIONS: GeneratedIndependentQuestion[] = [
  {
    questionText: "다음 Java 프로그램을 분석하여 실행 결과를 쓰시오.",
    code: `class Parent {
    int calc(int n) {
        if (n <= 1) return n;
        return n + calc(n - 2);
    }
}

class Child extends Parent {
    int calc(int n) {
        if (n <= 1) return 1;
        return n + calc(n - 1);
    }
}

public class Main {
    public static void main(String[] args) {
        Parent p = new Child();
        System.out.print(p.calc(3));
    }
}`,
    language: "JAVA",
    type: "CODE_TRACE",
    subject: "프로그래밍언어활용",
    category: "Java 상속과 다형성",
    groundTruthAnswer: "6",
    officialExplanation:
      "Parent 타입 참조 p가 실제 Child 인스턴스를 가리키므로 calc(3)은 Child에서 실행됩니다. calc(3)=3+calc(2), calc(2)=2+calc(1), calc(1)=1이므로 3+2+1=6입니다. 따라서 최종 출력은 6입니다.",
    difficulty: "HARD",
    keywords: ["Java", "상속", "오버라이딩", "다형성", "재귀"],
    designMetadata: {
      concept: "동적 바인딩과 재귀 누적",
      difficulty: "HARD",
      skill: "오버라이딩된 calc 호출 스택 추적",
      questionDesign: "부모 타입 참조로 자식 재귀 메서드를 호출하는 출력 추적",
      stepByStepTrace:
        "p.calc(3) -> Child.calc(3)=3+calc(2) -> calc(2)=2+calc(1) -> calc(1)=1 -> 최종 출력 결과는 6입니다.",
    },
    generationMetadata: {
      model: "mock",
      generator: "MockAIService",
      generatedAt: new Date().toISOString(),
      strategy: "MOCK",
    },
  },
];

export const MOCK_INDEPENDENT_PYTHON_QUESTIONS: GeneratedIndependentQuestion[] = [
  {
    questionText: "다음 Python 프로그램을 분석하여 실행 결과를 쓰시오.",
    code: `nums = [2, 4, 6, 8]
alias = nums
alias[1] = 10

def acc(a, n):
    if n == 0:
        return a
    return acc(a + nums[n - 1], n - 1)

print(acc(0, 3), nums[1:3])`,
    language: "PYTHON",
    type: "CODE_TRACE",
    subject: "프로그래밍언어활용",
    category: "Python 리스트 참조와 재귀",
    groundTruthAnswer: "18 [10, 6]",
    officialExplanation:
      "alias = nums는 같은 리스트를 가리키므로 alias[1]=10은 nums[1]도 10으로 바꿉니다. acc(0,3)은 nums[2]+nums[1]+nums[0] = 6+10+2 = 18입니다. nums[1:3]은 [10, 6]입니다. 따라서 최종 출력은 18 [10, 6]입니다.",
    difficulty: "HARD",
    keywords: ["Python", "리스트", "참조", "재귀", "슬라이싱"],
    designMetadata: {
      concept: "리스트 별칭과 재귀 누적",
      difficulty: "HARD",
      skill: "참조 공유 후 재귀 합과 슬라이스 출력 추적",
      questionDesign: "별칭 할당으로 원본을 바꾼 뒤 재귀 합과 슬라이스를 함께 출력",
      stepByStepTrace:
        "nums=[2,4,6,8] -> alias[1]=10으로 nums=[2,10,6,8] -> acc=6+10+2=18 -> 최종 출력 결과는 18 [10, 6]입니다.",
    },
    generationMetadata: {
      model: "mock",
      generator: "MockAIService",
      generatedAt: new Date().toISOString(),
      strategy: "MOCK",
    },
  },
];

export function pickMockIndependentQuestion(
  language: IndependentLanguage,
  context: IndependentGenerationContext,
  cQuestions: GeneratedIndependentQuestion[],
): GeneratedIndependentQuestion {
  const pool =
    language === "C"
      ? cQuestions
      : language === "JAVA"
        ? MOCK_INDEPENDENT_JAVA_QUESTIONS
        : MOCK_INDEPENDENT_PYTHON_QUESTIONS;
  const idx = Math.floor(Math.random() * pool.length);
  const chosen: GeneratedIndependentQuestion = JSON.parse(
    JSON.stringify(pool[idx]),
  );
  chosen.correlationId = context.correlationId || `mock_${Date.now()}`;
  chosen.language = language;
  chosen.generationMetadata = {
    model: "mock",
    generator: "MockAIService",
    generatedAt: new Date().toISOString(),
    strategy: "MOCK",
  };
  if (context.difficulty) {
    chosen.difficulty = context.difficulty;
    chosen.designMetadata.difficulty = context.difficulty;
  }
  return chosen;
}
