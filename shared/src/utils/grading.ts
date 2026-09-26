/**
 * 정처기 실기 주관식 채점 및 문자열 정규화 모듈
 * (기존 검증된 모바일 앱 로직을 PC 도메인 구조에 맞게 이식 및 확장)
 */

/**
 * 사용자 답안 문자열을 비교하기 쉬운 정규형으로 변환합니다.
 * 1. 앞뒤 공백 제거
 * 2. 괄호, 특수기호, 문장부호 제거
 * 3. 단어 사이 공백 제거
 * 4. 영문 대문자화
 */
export function normalizeAnswer(ans: string): string {
  if (!ans) return '';
  return ans
    .trim()
    .replace(/[()[\]{}.,·\-_/'":;?`~!@#$%^&*+=<>]/g, '')
    .replace(/\s+/g, '')
    .toUpperCase();
}

/**
 * 정처기 주요 용어 동의어/표기 변형 그룹
 * (한글 음차, 원어 영문 약어, 풀네임, 한자어 대칭)
 */
export const SYNONYM_GROUPS: string[][] = [
  // SQL 및 DB
  ['GROUPBY', '그룹바이', '그룹별'],
  ['SELECT', '셀렉트', '셀렉'],
  ['INSERT', '인서트'],
  ['UPDATE', '업데이트', '갱신'],
  ['DELETE', '딜리트', '삭제'],
  ['HAVING', '해빙'],
  ['ORDERBY', '오더바이', '정렬'],
  ['PRIMARYKEY', 'PK', '기본키', '프라이머리키'],
  ['FOREIGNKEY', 'FK', '외래키'],
  ['CANDIDATEKEY', '후보키'],
  ['INNERJOIN', '내부조인', '이너조인', 'EQUIJOIN', '등가조인'],
  ['INDEX', '인덱스', '색인'],
  ['VIEW', '뷰'],
  ['TRANSACTION', '트랜잭션'],
  ['NORMALIZATION', '정규화'],

  // 트랜잭션 ACID
  ['ATOMICITY', '원자성'],
  ['CONSISTENCY', '일관성'],
  ['ISOLATION', '고립성', '격리성'],
  ['DURABILITY', '지속성', '영속성'],
  ['INTEGRITY', '무결성', '완전성'],
  ['DEADLOCK', '교착상태', '데드락'],

  // 디자인 패턴
  ['BUILDER', '빌더', '빌더패턴'],
  ['SINGLETON', '싱글톤', '싱글톤패턴'],
  ['OBSERVER', '옵서버', '옵저버', '옵서버패턴'],
  ['STRATEGY', '전략', '전략패턴'],
  ['ADAPTER', '어댑터', '어댑터패턴'],
  ['FACTORYMETHOD', '팩토리메서드', '팩토리메소드', '공장메서드'],

  // 모듈 독립성 (응집도 & 결합도)
  ['SEQUENTIALCOHESION', '순차적응집도', '순차응집도'],
  ['FUNCTIONALCOHESION', '기능적응집도', '기능응집도'],
  ['COMMUNICATIONALCOHESION', '교환적응집도', '통신적응집도'],
  ['COMMONCOUPLING', '공통결합도'],
  ['CONTENTCOUPLING', '내용결합도'],
  ['DATACOUPLING', '자료결합도'],

  // 보안 및 네트워크 신기술
  ['BUFFER_OVERFLOW', 'BUFFER_OVERFLOW', '버퍼오버플로우', '버퍼오버플로', '스택버퍼오버플로우'],
  ['SDN', 'SOFTWAREDEFINEDNETWORKING', '소프트웨어정의네트워크', '소프트웨어정의네트워킹'],
  ['XSS', '크로스사이트스크립팅'],
  ['CSRF', 'XSRF'],
  ['SQLINJECTION', 'SQL인젝션', 'SQLI'],
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
  const dp: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let i = 0; i < rows; i++) dp[i][0] = i;
  for (let j = 0; j < cols; j++) dp[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[a.length][b.length];
}

/**
 * 3글자 이상 단어에 대해 1글자 오탈자(타이포)를 허용하는 퍼지 매칭
 */
export function isFuzzyMatch(left: string, right: string): boolean {
  if (!left || !right) return false;
  if (left === right) return true;
  const minLen = Math.min(left.length, right.length);
  if (minLen < 3) return false;
  if (Math.abs(left.length - right.length) > 1) return false;
  return levenshtein(left, right) <= 1;
}

/**
 * 단일 답안 일치 여부 판정 (동의어 그룹 + 1글자 퍼지 매칭 지원)
 */
export function isCloseMatch(user: string, correct: string): boolean {
  if (!user || !correct) return false;

  const userForms = expandForms(user);
  const correctForms = expandForms(correct);

  // 1. 동의어 그룹 내 완벽 일치
  if (userForms.some((form) => correctForms.includes(form))) {
    return true;
  }

  // 2. 오탈자(레벤슈타인 1자 이내) 허용 매칭
  const typed = normalizeAnswer(user);
  return correctForms.some((form) => isFuzzyMatch(typed, form));
}

export interface ItemMatchResult {
  expected: string;
  provided: string;
  isMatch: boolean;
}

export interface GradingResult {
  isCorrect: boolean;
  score: number; // 0.0 ~ 1.0 (부분 점수 지원)
  isUnknown: boolean;
  feedback: string;
  itemResults?: ItemMatchResult[];
}

/**
 * 단일/복수 답안 통합 스마트 채점기
 */
export function gradeAnswer(
  userAnswer: string | string[],
  groundTruthAnswer: string | string[],
  isUnknown = false
): GradingResult {
  // 1. "모르겠음" 선택 시 즉시 오답 처리 (당일 복습 대상 플래그)
  if (isUnknown) {
    return {
      isCorrect: false,
      score: 0,
      isUnknown: true,
      feedback: '모르는 문제로 표시되었습니다. 해설을 확인하고 복습하세요.',
    };
  }

  // 사용자 답안이 비어있는 경우
  if (
    userAnswer === undefined ||
    userAnswer === null ||
    (typeof userAnswer === 'string' && !userAnswer.trim()) ||
    (Array.isArray(userAnswer) && userAnswer.every((a) => !a.trim()))
  ) {
    return {
      isCorrect: false,
      score: 0,
      isUnknown: false,
      feedback: '답안이 입력되지 않았습니다.',
    };
  }

  // 2. Ground Truth가 복수 정답 목록인 경우
  if (Array.isArray(groundTruthAnswer)) {
    // 2-A: 복수 키워드 문제 (사용자 답안도 배열로 들어오거나 쉼표로 구분된 경우)
    let userArr: string[];
    if (Array.isArray(userAnswer)) {
      userArr = userAnswer;
    } else {
      userArr = userAnswer.split(/[,/\n]+/).map((s) => s.trim()).filter(Boolean);
    }

    // 만약 사용자가 단일 문자열을 냈고 Ground Truth 후보 중 하나와 일치하면 (동의어 목록으로 제공된 경우)
    if (userArr.length === 1 && groundTruthAnswer.some((cand) => isCloseMatch(userArr[0], cand))) {
      return {
        isCorrect: true,
        score: 1.0,
        isUnknown: false,
        feedback: '정답입니다!',
      };
    }

    // 빈칸 순서형 또는 복수 키워드 목록 채점
    const itemResults: ItemMatchResult[] = [];
    let matchCount = 0;

    for (let i = 0; i < groundTruthAnswer.length; i++) {
      const expected = groundTruthAnswer[i];
      const provided = userArr[i] || '';
      const isMatch = isCloseMatch(provided, expected);

      itemResults.push({
        expected,
        provided,
        isMatch,
      });

      if (isMatch) {
        matchCount++;
      }
    }

    const totalItems = groundTruthAnswer.length;
    const score = Number((matchCount / totalItems).toFixed(2));
    const isCorrect = matchCount === totalItems;

    return {
      isCorrect,
      score,
      isUnknown: false,
      feedback: isCorrect
        ? '모든 정답 키워드가 일치합니다!'
        : matchCount > 0
        ? `부분 정답입니다 (${matchCount}/${totalItems}개 일치).`
        : '오답입니다.',
      itemResults,
    };
  }

  // 3. Ground Truth가 단일 정답인 경우
  const userStr = Array.isArray(userAnswer) ? userAnswer.join('') : userAnswer;
  const isMatch = isCloseMatch(userStr, groundTruthAnswer);

  return {
    isCorrect: isMatch,
    score: isMatch ? 1.0 : 0.0,
    isUnknown: false,
    feedback: isMatch ? '정답입니다!' : '오답입니다.',
  };
}

/**
 * 정답 문자열 표시용 변환 (배열인 경우 ' 또는 ' 또는 순서 기호로 포맷)
 */
export function formatAnswerDisplay(answer: string | string[]): string {
  if (Array.isArray(answer)) {
    return answer.map((ans, i) => `(${i + 1}) ${ans}`).join('  |  ');
  }
  return answer;
}
