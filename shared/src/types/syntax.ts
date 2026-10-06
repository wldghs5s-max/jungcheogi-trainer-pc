export interface SyntaxTerm {
  id: string;
  language: string;             // 'C' | 'JAVA' | 'PYTHON' | 'SQL' | 'COMMON'
  canonicalKey: string;         // e.g. 'c.logical_and', 'c.pointer', 'c.ternary'
  term: string;                 // e.g. '논리 AND 연산자', '포인터 선언 및 역참조'
  displayToken: string;         // e.g. '&&', '*', '->'
  termType: string;             // 'OPERATOR' | 'KEYWORD' | 'CONTROL_FLOW' | 'DATA_TYPE' | 'OOP' | 'BUILTIN'
  shortDescription: string;     // ① 무엇인가? (핵심 개념 정의)
  syntaxPattern: string;        // ② 기본 문법 형태
  howItWorks: string;           // ③ 어떻게 동작하는가? (규칙 및 조건)
  exampleCode: string;          // ④ 간단한 예제 코드
  detailedExplanation: string;  // 심층 설명
  commonMistakes: string;       // ⑤ 시험에서 자주 헷갈리는 점 / 출제 함정
  relatedTerms?: string[];      // 관련 문법 canonicalKey 목록
  createdAt: string;
  updatedAt: string;
}

export interface SyntaxTermSummary {
  canonicalKey: string;
  language: string;
  term: string;
  displayToken: string;
  termType: string;
  shortDescription: string;
}
