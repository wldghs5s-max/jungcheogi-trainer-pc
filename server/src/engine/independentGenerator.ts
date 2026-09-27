import {
  Difficulty,
  GeneratedIndependentQuestion,
  IndependentGenerationContext,
  Question,
} from "@jungcheogi/shared";

/**
 * C 언어 정보처리기사 실기 핵심 출제 평가 요소
 */
export interface CSkillDefinition {
  concept: string;
  skill: string;
  difficulty: Difficulty;
  description: string;
  codePatternTip: string;
}

export const C_CORE_SKILLS: CSkillDefinition[] = [
  {
    concept: "포인터와 1차원 배열",
    skill: "배열명 포인터 변환 및 *(arr + i) 역참조 연산 순서 추적",
    difficulty: "MEDIUM",
    description: "배열의 특정 인덱스를 포인터 덧셈 및 역참조 연산자로 탐색하여 값을 누적하는 문제",
    codePatternTip: "int a[] = { ... }; int *p = a; *(p + 2) 등 포인터 연산 사용",
  },
  {
    concept: "포인터 증감 연산자",
    skill: "전위/후위 증감 연산자와 포인터 역참조 결합 우선순위 (*p++, (*p)++)",
    difficulty: "HARD",
    description: "*p++와 (*p)++의 명확한 차이를 이해하고 루프 종료 후 배열 및 포인터의 최종 상태 계산",
    codePatternTip: "while(*p) 루프 내에서 *p++ 또는 (*p)++를 적용하여 배열 값 갱신",
  },
  {
    concept: "함수와 포인터 (Call by Reference)",
    skill: "주소 전달을 통한 원본 변수 값 변경 및 매개변수 포인터 추적",
    difficulty: "MEDIUM",
    description: "함수에 변수의 주소(&)를 넘겨 내부에서 역참조(*)로 값을 스왑하거나 누적 계산",
    codePatternTip: "void update(int *a, int b); main에서 update(&x, y); 호출",
  },
  {
    concept: "문자열 포인터와 널문자",
    skill: "char* 포인터 이동과 '\\0' 판별 및 문자 코드 변환",
    difficulty: "MEDIUM",
    description: "문자열 포인터를 순회하며 대소문자 변환, 특정 문자 필터링 또는 역순 출력 계산",
    codePatternTip: "char *str = \"...\"; while(*str != '\\0') { ... str++; }",
  },
  {
    concept: "조건 분기형 재귀 함수",
    skill: "함수 호출 스택 깊이 추적 및 기저 조건(Base case) 반환값 누적",
    difficulty: "HARD",
    description: "재귀 호출 시 인자 감소/분기 및 반환 후 덧셈/곱셈의 연쇄적 계산 과정 추적",
    codePatternTip: "int solve(int n) { if (n <= 1) return 1; return n + solve(n - 2); }",
  },
  {
    concept: "구조체와 화살표(->) 연산자",
    skill: "구조체 포인터를 통한 멤버 접근 및 데이터 갱신",
    difficulty: "HARD",
    description: "구조체 포인터(struct Node *p)의 멤버 접근(p->val) 및 함수 주소 전달 연산",
    codePatternTip: "struct Data { int id; int score; }; struct Data items[3]; struct Data *p = items;",
  },
  {
    concept: "비트 연산자 (Bitwise)",
    skill: "비트 AND(&), OR(|), XOR(^), 시프트(<<, >>) 연산 결합",
    difficulty: "MEDIUM",
    description: "정수의 2진수 비트 마스크 및 시프트 연산을 통해 비트 단위 플래그 계산",
    codePatternTip: "int a = 25, b = 14; int c = (a & b) ^ (a >> 2);",
  },
  {
    concept: "정적 변수(static)와 스코프",
    skill: "함수 재호출 시 static 지역 변수의 값 유지 및 전역 변수와의 상호작용",
    difficulty: "MEDIUM",
    description: "반복문 내에서 함수를 여러 번 호출할 때 static 변수가 초기화되지 않고 값을 유지하는 특성 평가",
    codePatternTip: "int counter() { static int count = 0; count += 3; return count; }",
  },
];

/**
 * Mock 환경용 독립형 C 문제 마스터 풀
 */
export const MOCK_INDEPENDENT_C_QUESTIONS: GeneratedIndependentQuestion[] = [
  {
    questionText: "다음 C 언어로 구현된 프로그램을 분석하여 그 실행 결과를 쓰시오.",
    code: `#include <stdio.h>

int main(void) {
    int arr[] = { 10, 20, 30, 40, 50 };
    int *p = arr;
    int sum = 0;

    sum += *p++;
    sum += *(p + 2);
    sum += *++p;

    printf("%d", sum);
    return 0;
}`,
    language: "C",
    type: "CODE_TRACE",
    subject: "프로그래밍언어활용",
    category: "C 언어 포인터와 배열",
    groundTruthAnswer: "80",
    officialExplanation:
      "1. `int *p = arr;`: p는 arr[0](10)을 가리킵니다.\n" +
      "2. `sum += *p++;`: 후위 증감 연산자이므로 현재 p가 가리키는 arr[0]의 값 10을 sum에 더하고(sum=10), p는 arr[1]을 가리키도록 증가합니다.\n" +
      "3. `sum += *(p + 2);`: p가 arr[1]이므로 p+2는 arr[3]입니다. arr[3]의 값 40을 sum에 더하므로 sum = 10 + 40 = 50이 됩니다.\n" +
      "4. `sum += *++p;`: 전위 증감 연산자이므로 p를 먼저 arr[2]로 이동시킨 후 역참조하여 arr[2]의 값 30을 sum에 더합니다. sum = 50 + 30 = 80이 됩니다.\n" +
      "따라서 최종 출력값은 80입니다.",
    difficulty: "HARD",
    keywords: ["포인터", "배열", "증감연산자", "역참조"],
    designMetadata: {
      concept: "포인터 증감 및 역참조 우선순위",
      difficulty: "HARD",
      skill: "*p++와 *++p의 연산자 우선순위 및 위치 추적",
      questionDesign: "배열 포인터 순회 중 전위/후위 증감과 오프셋 덧셈을 결합하여 메모리 주소 이동 추적",
      stepByStepTrace: "초기 sum=0, p=&arr[0] -> 1단계 sum=10, p=&arr[1] -> 2단계 sum=50, p=&arr[1] -> 3단계 sum=80, p=&arr[2]",
    },
    generationMetadata: {
      model: "mock",
      generator: "MockAIService",
      generatedAt: new Date().toISOString(),
      strategy: "MOCK",
    },
  },
  {
    questionText: "다음 C 언어로 구현된 프로그램을 분석하여 그 실행 결과를 쓰시오.",
    code: `#include <stdio.h>

void process(int *a, int *b) {
    int temp = *a;
    *a = *a + *b;
    *b = temp * 2;
}

int main(void) {
    int x = 5, y = 3;
    process(&x, &y);
    printf("%d %d", x, y);
    return 0;
}`,
    language: "C",
    type: "CODE_TRACE",
    subject: "프로그래밍언어활용",
    category: "C 언어 함수와 포인터",
    groundTruthAnswer: "8 10",
    officialExplanation:
      "1. `main` 함수에서 `x = 5, y = 3`으로 초기화됩니다.\n" +
      "2. `process(&x, &y)`를 호출하여 x와 y의 메모리 주소를 전달합니다 (Call by Reference).\n" +
      "3. `process` 함수 내부:\n" +
      "   - `int temp = *a;`: temp에 x의 원래 값 5가 저장됩니다.\n" +
      "   - `*a = *a + *b;`: x의 주소가 가리키는 값을 5 + 3 = 8로 변경합니다.\n" +
      "   - `*b = temp * 2;`: y의 주소가 가리키는 값을 temp(5) * 2 = 10으로 변경합니다.\n" +
      "4. `printf(\"%d %d\", x, y);` 실행 시 x는 8, y는 10이므로 `8 10`이 출력됩니다.",
    difficulty: "MEDIUM",
    keywords: ["함수", "포인터", "Call by Reference", "주소 전달"],
    designMetadata: {
      concept: "함수 포인터 매개변수와 주소 참조",
      difficulty: "MEDIUM",
      skill: "포인터 매개변수를 통한 원본 변수 값 변조 추적",
      questionDesign: "주소를 전달받은 함수 내부에서 원래 변수 값을 계산 및 교체하는 전형적인 포인터 기출 유형",
      stepByStepTrace: "x=5, y=3 -> temp=5 -> *a(x)=8 -> *b(y)=10 -> 최종 x=8, y=10",
    },
    generationMetadata: {
      model: "mock",
      generator: "MockAIService",
      generatedAt: new Date().toISOString(),
      strategy: "MOCK",
    },
  },
];

/**
 * 텍스트 유사도 검사
 */
export function calculateTextSimilarity(textA: string, textB: string): number {
  if (!textA || !textB) return 0;
  const setA = new Set(
    textA.toLowerCase().replace(/[^a-z0-9가-힣]/g, " ").split(/\s+/).filter(Boolean),
  );
  const setB = new Set(
    textB.toLowerCase().replace(/[^a-z0-9가-힣]/g, " ").split(/\s+/).filter(Boolean),
  );
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersection++;
    }
  }
  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}

/**
 * 중복 및 유사도 검증
 */
export function isDuplicateOrTooSimilar(
  newQuestion: GeneratedIndependentQuestion,
  existingQuestions: Question[],
  threshold = 0.70,
): { isSimilar: boolean; matchedQuestionId?: string; similarityScore: number } {
  for (const eq of existingQuestions) {
    if (newQuestion.code && eq.code) {
      const codeSim = calculateTextSimilarity(newQuestion.code, eq.code);
      if (codeSim >= threshold) {
        return { isSimilar: true, matchedQuestionId: eq.id, similarityScore: codeSim };
      }
    }
    if (
      newQuestion.questionText.length > 25 &&
      eq.question.length > 25 &&
      !newQuestion.questionText.includes("프로그램을 분석하여")
    ) {
      const qSim = calculateTextSimilarity(newQuestion.questionText, eq.question);
      if (qSim >= threshold) {
        return { isSimilar: true, matchedQuestionId: eq.id, similarityScore: qSim };
      }
    }
  }
  return { isSimilar: false, similarityScore: 0 };
}
