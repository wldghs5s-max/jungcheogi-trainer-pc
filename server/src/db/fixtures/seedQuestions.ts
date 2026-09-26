import { Question } from '@jungcheogi/shared';

/**
 * Phase 2 검증용 테스트 Fixture 데이터 (총 12문항)
 * 
 * [목적]:
 * 실제 시험 전체 DB 적재가 아닌, Question 도메인 모델, 필터링 API,
 * Ground Truth vs AI 분리, parentQuestionId 계층 관계를 검증하기 위한 데이터셋.
 * 
 * [포함 유형]:
 * 1. 주관식 단답형 (Single Keyword)
 * 2. 복수 키워드 문제 (Multiple Blanks/Keywords)
 * 3. 코드 문제 (C / Java / Python 실행 흐름 및 출력 예측)
 * 4. SQL 문제
 * 5. 설명/서술형 문제 (Descriptive)
 * 6. 실제 기출에서 파생된 AI 변형 문제 (AI_VARIATION, parentQuestionId 연동)
 */
export const SEED_QUESTIONS: Question[] = [
  // 1. [실제 기출] 주관식 단답형 - 디자인 패턴 (소프트웨어설계)
  {
    id: 'q_2020_01_01',
    sourceType: 'REAL_EXAM',
    examYear: 2020,
    examRound: 1,
    questionNumber: 1,
    subject: '소프트웨어설계',
    category: '디자인 패턴',
    subCategory: '생성 패턴',
    type: 'SHORT_ANSWER',
    question:
      '객체 생성에 관련된 디자인 패턴 중 하나로, 복잡한 인스턴스를 조립하여 만드는 구조이며, 생성과 표현을 분리하여 동일한 생성 절차에서 서로 다른 표현 결과를 만들 수 있는 패턴은 무엇인가?',
    groundTruthAnswer: '빌더',
    officialExplanation:
      'GoF 디자인 패턴 중 생성 패턴에 해당하는 빌더(Builder) 패턴은 복합 객체의 생성 과정과 표현 방법을 분리하여 동일한 생성 절차에서 서로 다른 표현을 생성할 수 있게 해준다.',
    aiExplanation:
      '빌더 패턴은 많은 인자를 가진 생성자 호출의 가독성을 높이고 불변 객체를 생성할 때 널리 쓰입니다.',
    difficulty: 'MEDIUM',
    keywords: ['빌더', 'Builder', '생성 패턴', 'GoF', '인스턴스 조립'],
    createdAt: '2026-09-26T06:00:00.000Z',
  },

  // 2. [실제 기출] 복수 키워드가 필요한 문제 - 트랜잭션 ACID (데이터베이스구축)
  {
    id: 'q_2020_02_02',
    sourceType: 'REAL_EXAM',
    examYear: 2020,
    examRound: 2,
    questionNumber: 2,
    subject: '데이터베이스구축',
    category: '트랜잭션',
    subCategory: 'ACID 특성',
    type: 'SHORT_ANSWER',
    question:
      '트랜잭션이 안전하게 수행되기 위해 보장해야 하는 4가지 특성(ACID) 중 다음 설명에 해당하는 용어를 각각 순서대로 작성하시오.\n\n(1) 트랜잭션의 연산은 데이터베이스에 모두 반영되든지 아니면 전혀 반영되지 않아야 한다 (All or Nothing).\n(2) 성공적으로 완료된 트랜잭션의 결과는 시스템에 오류가 발생하더라도 영구적으로 보존되어야 한다.',
    groundTruthAnswer: ['원자성', '영속성'],
    officialExplanation:
      '(1)은 완전히 수행되거나 전혀 수행되지 않아야 함을 의미하는 원자성(Atomicity)이고, (2)는 완료된 트랜잭션의 결과가 영구 보존되어야 함을 뜻하는 영속성(Durability)이다.',
    aiExplanation:
      'ACID의 A(Atomicity)와 D(Durability)에 대한 정의입니다. C는 일관성(Consistency), I는 고립성(Isolation)입니다.',
    difficulty: 'EASY',
    keywords: ['원자성', '영속성', 'Atomicity', 'Durability', 'ACID', '트랜잭션'],
    createdAt: '2026-09-26T06:01:00.000Z',
  },

  // 3. [실제 기출] 코드 문제 - C 언어 포인터와 1차원 배열 (프로그래밍언어활용)
  {
    id: 'q_2021_01_03',
    sourceType: 'REAL_EXAM',
    examYear: 2021,
    examRound: 1,
    questionNumber: 3,
    subject: '프로그래밍언어활용',
    category: 'C 프로그래밍',
    subCategory: '포인터와 배열',
    type: 'CODE_TRACE',
    question: '다음 C언어로 작성된 프로그램의 실행 결과를 작성하시오.',
    code: `#include <stdio.h>

int main() {
    int a[5] = {10, 20, 30, 40, 50};
    int *p = a + 2;
    printf("%d\\n", *(p + 1));
    return 0;
}`,
    language: 'C',
    groundTruthAnswer: '40',
    officialExplanation:
      '배열 이름 a는 시작 주소(&a[0])를 나타내므로 a + 2는 a[2](값 30)의 주소입니다. 포인터 p가 a[2]를 가리킬 때, *(p + 1)은 한 칸 뒤인 a[3]의 값인 40을 참조하여 출력합니다.',
    aiExplanation:
      '포인터 연산에서 p = a + 2이므로 p는 인덱스 2를 가리킵니다. *(p + 1)은 인덱스 2 + 1 = 3의 원소값 40입니다.',
    difficulty: 'MEDIUM',
    keywords: ['C언어', '포인터', '배열', '메모리 주소'],
    createdAt: '2026-09-26T06:02:00.000Z',
  },

  // 4. [실제 기출] 코드 문제 - Java 상속과 다형성 및 재귀 (프로그래밍언어활용)
  {
    id: 'q_2022_02_04',
    sourceType: 'REAL_EXAM',
    examYear: 2022,
    examRound: 2,
    questionNumber: 4,
    subject: '프로그래밍언어활용',
    category: 'Java 프로그래밍',
    subCategory: '상속과 다형성',
    type: 'CODE_TRACE',
    question: '다음 Java 프로그램의 실행 결과를 작성하시오.',
    code: `class Parent {
    int compute(int num) {
        if (num <= 1) return num;
        return compute(num - 1) + compute(num - 2);
    }
}

class Child extends Parent {
    int compute(int num) {
        if (num <= 1) return num;
        return compute(num - 1) + compute(num - 3);
    }
}

public class Main {
    public static void main(String[] args) {
        Parent p = new Child();
        System.out.print(p.compute(4));
    }
}`,
    language: 'JAVA',
    groundTruthAnswer: '3',
    officialExplanation:
      'Parent 타입 참조변수 p가 실제 Child 인스턴스를 참조하므로 가상 메서드 호출에 의해 Child 클래스의 compute 메서드가 실행됩니다. compute(4) = compute(3) + compute(1), compute(3) = compute(2) + compute(0)... 재귀 계산 결과 최종값은 3입니다.',
    aiExplanation:
      '동적 바인딩(Dynamic Binding)으로 인해 오버라이딩된 Child의 compute(4)가 호출되는 과정의 추적 문제입니다.',
    difficulty: 'HARD',
    keywords: ['Java', '다형성', '오버라이딩', '재귀함수', '동적 바인딩'],
    createdAt: '2026-09-26T06:03:00.000Z',
  },

  // 5. [실제 기출] 코드 문제 - Python 슬라이싱과 map/lambda (프로그래밍언어활용)
  {
    id: 'q_2023_01_05',
    sourceType: 'REAL_EXAM',
    examYear: 2023,
    examRound: 1,
    questionNumber: 5,
    subject: '프로그래밍언어활용',
    category: 'Python 프로그래밍',
    subCategory: '슬라이싱 및 내장함수',
    type: 'CODE_TRACE',
    question: '다음 Python 프로그램의 실행 결과를 작성하시오.',
    code: `data = [1, 2, 3, 4, 5]
result = list(map(lambda x: x * 2, data[1:4]))
print(sum(result))`,
    language: 'PYTHON',
    groundTruthAnswer: '18',
    officialExplanation:
      'data[1:4]는 인덱스 1부터 3까지인 [2, 3, 4]를 슬라이싱합니다. map과 람다 함수에 의해 각 원소에 2를 곱하면 [4, 6, 8]이 되고, sum([4, 6, 8])의 결과는 18이 출력됩니다.',
    aiExplanation:
      'Python 슬라이스의 [start:end] 범위는 end 직전까지 포함하므로 2, 3, 4가 대상이 됩니다.',
    difficulty: 'EASY',
    keywords: ['Python', '슬라이싱', 'map', 'lambda', 'sum'],
    createdAt: '2026-09-26T06:04:00.000Z',
  },

  // 6. [실제 기출] SQL 문제 - 집계 및 조건절 (데이터베이스구축)
  {
    id: 'q_2021_02_06',
    sourceType: 'REAL_EXAM',
    examYear: 2021,
    examRound: 2,
    questionNumber: 6,
    subject: '데이터베이스구축',
    category: 'SQL 응용',
    subCategory: '그룹화 및 집계함수',
    type: 'SQL',
    question:
      '사원(EMPLOYEE) 테이블에서 부서(DEPT)별 평균급여(SALARY)가 3000 이상인 부서명과 평균급여를 조회하는 SQL문이다. 빈칸 (1), (2)에 들어갈 표준 SQL 절(Clause) 키워드를 각각 작성하시오.',
    code: `SELECT DEPT, AVG(SALARY) 
FROM EMPLOYEE 
(  1  ) DEPT 
(  2  ) AVG(SALARY) >= 3000;`,
    language: 'SQL',
    groundTruthAnswer: ['GROUP BY', 'HAVING'],
    officialExplanation:
      '그룹화 기준을 지정하는 절은 (1) GROUP BY이고, 그룹화된 결과에 집계 조건을 적용하는 절은 (2) HAVING 절이다. WHERE 절은 개별 행 필터링에 쓰이므로 사용 불가.',
    difficulty: 'EASY',
    keywords: ['SQL', 'GROUP BY', 'HAVING', 'AVG', '집계함수'],
    createdAt: '2026-09-26T06:05:00.000Z',
  },

  // 7. [실제 기출] 설명/서술형 문제 - 응집도 (소프트웨어설계)
  {
    id: 'q_2020_03_07',
    sourceType: 'REAL_EXAM',
    examYear: 2020,
    examRound: 3,
    questionNumber: 7,
    subject: '소프트웨어설계',
    category: '모듈화 및 아키텍처',
    subCategory: '응집도 (Cohesion)',
    type: 'SHORT_ANSWER',
    question:
      '모듈의 독립성을 측정하는 지표 중 하나인 응집도(Cohesion)와 관련하여, 모듈 내 한 요소의 출력 데이터가 다음 요소의 입력 데이터로 순차적으로 사용되는 응집도의 명칭을 작성하시오.',
    groundTruthAnswer: '순차적 응집도',
    officialExplanation:
      '순차적 응집도(Sequential Cohesion)는 모듈 내 하나의 활동으로부터 나온 출력 데이터를 그 다음 활동의 입력 데이터로 사용할 때 갖는 응집도이다.',
    aiExplanation:
      '응집도 순서: 기능적 > 순차적 > 교환적 > 절차적 > 시간적 > 논리적 > 우연적 응집도.',
    difficulty: 'MEDIUM',
    keywords: ['응집도', '순차적 응집도', 'Cohesion', '모듈 독립성'],
    createdAt: '2026-09-26T06:06:00.000Z',
  },

  // 8. [실제 기출] 신기술/보안 단답형 - 소프트웨어 개발 보안
  {
    id: 'q_2022_01_08',
    sourceType: 'REAL_EXAM',
    examYear: 2022,
    examRound: 1,
    questionNumber: 8,
    subject: '신기술/보안',
    category: '소프트웨어 개발 보안',
    subCategory: '메모리 보안 취약점',
    type: 'SHORT_ANSWER',
    question:
      '메모리를 다루는 C/C++ 등의 프로그래밍 언어에서 할당된 버퍼의 크기를 초과하는 데이터를 입력하여 인접 메모리를 조작하거나 임의 코드를 실행시키는 공격 기법을 무엇이라 하는가?',
    groundTruthAnswer: '버퍼 오버플로우',
    officialExplanation:
      '버퍼 오버플로우(Buffer Overflow) 공격은 프로세스의 메모리 버퍼 경계를 벗어나 인접 메모리를 덮어씌워 프로그램의 비정상 종료나 악성 코드 실행을 유발하는 취약점이다.',
    difficulty: 'EASY',
    keywords: ['버퍼 오버플로우', 'Buffer Overflow', '스택 오버플로우', '메모리 취약점'],
    createdAt: '2026-09-26T06:07:00.000Z',
  },

  // 9. [실제 기출] 정보시스템구축관리 단답형 - 차세대 네트워크 기술
  {
    id: 'q_2023_02_09',
    sourceType: 'REAL_EXAM',
    examYear: 2023,
    examRound: 2,
    questionNumber: 9,
    subject: '정보시스템구축관리',
    category: '네트워크 아키텍처',
    subCategory: '소프트웨어 정의 기술',
    type: 'SHORT_ANSWER',
    question:
      '네트워크를 제어 평면(Control Plane)과 데이터 전송 평면(Data Plane)으로 분리하여 네트워크 트래픽을 중앙 집중식 소프트웨어로 제어하고 프로그래밍할 수 있는 기술의 영문 약어(3글자)를 작성하시오.',
    groundTruthAnswer: 'SDN',
    officialExplanation:
      'SDN(Software Defined Networking, 소프트웨어 정의 네트워크)은 네트워크 제어 기능을 하드웨어로부터 분리하여 중앙의 제어용 컨트롤러에서 소프트웨어로 일괄 프로그래밍하는 기술이다.',
    difficulty: 'MEDIUM',
    keywords: ['SDN', 'Software Defined Networking', '제어 평면', '데이터 평면'],
    createdAt: '2026-09-26T06:08:00.000Z',
  },

  // 10. [AI 변형 문제 1] C 언어 2차원 배열 포인터 변형 (Parent: q_2021_01_03)
  {
    id: 'q_var_c_2d_01',
    sourceType: 'AI_VARIATION',
    parentQuestionId: 'q_2021_01_03',
    subject: '프로그래밍언어활용',
    category: 'C 프로그래밍',
    subCategory: '포인터와 2차원 배열',
    type: 'CODE_TRACE',
    question:
      '[기출 변형] 다음 C언어 프로그램의 실행 결과를 작성하시오.\n(원본 기출 2021년 1회 3번 포인터 연산 규칙을 2차원 배열의 선형 메모리 배치 구조로 변형한 문제입니다)',
    code: `#include <stdio.h>

int main() {
    int a[2][3] = {{10, 20, 30}, {40, 50, 60}};
    int *p = &a[0][0];
    printf("%d\\n", *(p + 4));
    return 0;
}`,
    language: 'C',
    groundTruthAnswer: '50',
    officialExplanation: undefined, // 변형 문제이므로 원본 공식 해설은 없으며, AI Explanation 및 Variation Notes로 기술됨
    aiExplanation:
      '2차원 배열 a[2][3]은 메모리상에 연속으로 [10, 20, 30, 40, 50, 60] 순서로 배치됩니다. p가 0번째 원소(10)를 가리키므로 *(p + 4)는 4번째 인덱스 위치인 a[1][1]의 값 50을 참조합니다.',
    aiVariationNotes:
      '1차원 포인터 연산 원본 기출(a+2, *(p+1))의 핵심 원리인 포인터 산술 연산을 2차원 배열의 행 우선(Row-major) 선형 배치 개념과 융합하여 변형 출제함.',
    difficulty: 'HARD',
    keywords: ['C언어', '기출변형', '2차원 배열', '포인터 연산', '선형 메모리'],
    createdAt: '2026-09-26T06:09:00.000Z',
  },

  // 11. [AI 변형 문제 2] 트랜잭션 ACID의 다른 축 변형 (Parent: q_2020_02_02)
  {
    id: 'q_var_acid_02',
    sourceType: 'AI_VARIATION',
    parentQuestionId: 'q_2020_02_02',
    subject: '데이터베이스구축',
    category: '트랜잭션',
    subCategory: 'ACID 특성',
    type: 'SHORT_ANSWER',
    question:
      '[기출 변형] 트랜잭션의 4대 특성(ACID) 중 다음 설명에 해당하는 용어를 각각 순서대로 작성하시오.\n\n(1) 트랜잭션 실행 전후 데이터베이스는 항상 규정된 제약조건과 무결성을 유지해야 한다.\n(2) 둘 이상의 트랜잭션이 병행 실행될 때 어느 한 트랜잭션도 다른 트랜잭션의 연산에 끼어들거나 간섭할 수 없다.',
    groundTruthAnswer: ['일관성', '고립성'],
    officialExplanation: undefined,
    aiExplanation:
      '(1)은 데이터 무결성을 보장하는 일관성(Consistency)이고, (2)는 다른 트랜잭션의 간섭을 배제하는 고립성/격리성(Isolation)입니다.',
    aiVariationNotes:
      '2020년 2회 기출에서 출제된 원자성(A)/영속성(D)의 짝을 이루는 일관성(C)/고립성(I)을 능동적 회상하도록 보완 변형 출제함.',
    difficulty: 'EASY',
    keywords: ['일관성', '고립성', 'Consistency', 'Isolation', 'ACID', '기출변형'],
    createdAt: '2026-09-26T06:10:00.000Z',
  },

  // 12. [공인 교재/수험서] 결합도 문제 (소프트웨어설계)
  {
    id: 'q_tb_coupling_01',
    sourceType: 'TEXTBOOK',
    subject: '소프트웨어설계',
    category: '모듈화 및 아키텍처',
    subCategory: '결합도 (Coupling)',
    type: 'SHORT_ANSWER',
    question:
      '두 모듈이 매개변수(Parameter)로 데이터를 전달하는 것이 아니라, 전역 변수(Global Variable)와 같이 공유되는 데이터 영역을 함께 참조하거나 갱신할 때 발생하는 결합도의 명칭을 작성하시오.',
    groundTruthAnswer: '공통 결합도',
    officialExplanation:
      '공통 결합도(Common Coupling)는 여러 모듈이 공통 데이터 영역(전역 변수 등)을 함께 참조할 때 형성되는 결합도이다.',
    aiExplanation:
      '결합도 순서(약함->강함): 자료(Data) < 스탬프(Stamp) < 제어(Control) < 외부(External) < 공통(Common) < 내용(Content).',
    difficulty: 'MEDIUM',
    keywords: ['결합도', '공통 결합도', 'Common Coupling', '전역 변수', '모듈 독립성'],
    createdAt: '2026-09-26T06:11:00.000Z',
  },
];
