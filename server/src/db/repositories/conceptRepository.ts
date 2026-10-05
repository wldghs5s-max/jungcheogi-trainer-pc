import { Database } from 'better-sqlite3';
import { Concept, Subject, WeakConceptSummary } from '@jungcheogi/shared';
import { getDatabase } from '../database';

interface ConceptRow {
  id: string;
  subject: string;
  category: string;
  title: string;
  definition: string;
  core_analogy: string | null;
  key_facts_json: string;
  importance: number;
  mnemonic_json: string | null;
  related_keywords_json: string;
  created_at: string;
  updated_at: string | null;
}

function mapRowToConcept(row: ConceptRow): Concept {
  let keyFacts: string[] = [];
  try {
    keyFacts = JSON.parse(row.key_facts_json);
  } catch {
    keyFacts = [];
  }

  let relatedKeywords: string[] = [];
  try {
    relatedKeywords = JSON.parse(row.related_keywords_json);
  } catch {
    relatedKeywords = [];
  }

  let mnemonic: any = undefined;
  if (row.mnemonic_json) {
    try {
      mnemonic = JSON.parse(row.mnemonic_json);
    } catch {
      mnemonic = undefined;
    }
  }

  return {
    id: row.id,
    subject: row.subject as Subject,
    category: row.category,
    title: row.title,
    definition: row.definition,
    coreAnalogy: row.core_analogy ?? undefined,
    keyFacts,
    importance: (row.importance as 1 | 2 | 3) || 2,
    mnemonic,
    relatedKeywords,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
  };
}

export const INITIAL_CONCEPTS: Concept[] = [
  {
    "id": "concept_c_pointer",
    "subject": "프로그래밍언어활용",
    "category": "C 프로그래밍",
    "title": "C언어 포인터와 배열 주소 연산",
    "definition": "포인터 변수는 메모리의 주소값을 저장하며, 포인터 덧셈/뺄셈 연산 시 가리키는 자료형의 크기 단위로 주소가 이동합니다. 배열 이름은 첫 번째 원소의 주소 상수를 나타냅니다.",
    "coreAnalogy": "아파트 동호수 주소 적힌 쪽지(포인터)와 실제 집(역참조 값)",
    "keyFacts": [
      "*p는 포인터 p가 가리키는 주소의 실제 값(역참조)입니다.",
      "배열 arr에서 arr + i는 &arr[i]와 같고, *(arr + i)는 arr[i]와 같습니다.",
      "포인터 증가 연산 p + 1은 단순 1바이트 증가가 아니라 sizeof(자료형) 바이트만큼 증가합니다."
    ],
    "importance": 3,
    "mnemonic": {
      "acronym": "주소역참조",
      "catchphrase": "주소 담고(*p), 이동하고(+i), 꺼내본다(*)",
      "items": [
        {
          "letter": "&",
          "name": "주소 연산자",
          "desc": "변수의 메모리 시작 주소를 반환"
        },
        {
          "letter": "*",
          "name": "역참조 연산자",
          "desc": "주소에 저장된 실제 값을 읽거나 쓰기"
        },
        {
          "letter": "+",
          "name": "오프셋 이동",
          "desc": "자료형 단위로 메모리 주소 이동"
        }
      ]
    },
    "relatedKeywords": [
      "포인터",
      "배열",
      "메모리 주소",
      "역참조",
      "오프셋"
    ]
  },
  {
    "id": "concept_gof_builder",
    "subject": "소프트웨어설계",
    "category": "디자인 패턴",
    "title": "GoF 빌더(Builder) 패턴",
    "definition": "복합 객체의 생성 과정과 표현 방법을 분리하여 동일한 생성 절차에서 서로 다른 표현 결과를 만들 수 있게 하는 생성 디자인 패턴입니다.",
    "coreAnalogy": "수제 햄버거 주문서(번, 패티, 소스를 원하는 조합으로 조립)",
    "keyFacts": [
      "생성(Creational) 디자인 패턴의 대표적인 유형입니다.",
      "인스턴스 생성 시 많은 파라미터가 필요한 경우 가독성과 안정성을 극대화합니다.",
      "Director(감독관)와 Builder(건축가) 구조로 조립 단계를 분리합니다."
    ],
    "importance": 3,
    "relatedKeywords": [
      "빌더",
      "Builder",
      "생성 패턴",
      "GoF",
      "인스턴스 조립"
    ]
  },
  {
    "id": "concept_db_acid",
    "subject": "데이터베이스구축",
    "category": "트랜잭션",
    "title": "트랜잭션 4대 특성 (ACID)",
    "definition": "데이터베이스에서 하나의 논리적 작업 단위를 신뢰성 있게 수행하기 위해 보장해야 하는 원자성, 일관성, 고립성, 영속성의 4가지 필수 특성입니다.",
    "coreAnalogy": "은행 계좌 이체(출금과 입금이 둘 다 되거나 둘 다 취소되어야 함)",
    "keyFacts": [
      "Atomicity(원자성): All or Nothing (전부 수행 또는 전부 취소)",
      "Consistency(일관성): 트랜잭션 전후 데이터 무결성 규칙 보존",
      "Isolation(고립성/격리성): 동시에 실행되는 트랜잭션 간 간섭 불가",
      "Durability(영속성): 성공 완료된 결과는 장애 발생 시에도 영구 보존"
    ],
    "importance": 3,
    "mnemonic": {
      "acronym": "ACID",
      "catchphrase": "원일고영 (원자성, 일관성, 고립성, 영속성)",
      "items": [
        {
          "letter": "A",
          "name": "Atomicity",
          "desc": "All or Nothing (회복 관리자)"
        },
        {
          "letter": "C",
          "name": "Consistency",
          "desc": "일관된 무결성 상태 유지"
        },
        {
          "letter": "I",
          "name": "Isolation",
          "desc": "트랜잭션 독립 실행 (동시성 제어)"
        },
        {
          "letter": "D",
          "name": "Durability",
          "desc": "결과의 영구 보존 (로그 및 백업)"
        }
      ]
    },
    "relatedKeywords": [
      "원자성",
      "일관성",
      "고립성",
      "영속성",
      "ACID",
      "트랜잭션"
    ]
  },
  {
    "id": "concept_java_inheritance",
    "subject": "프로그래밍언어활용",
    "category": "Java 프로그래밍",
    "title": "Java 상속과 메서드 오버라이딩",
    "definition": "부모 클래스의 멤버를 자식 클래스가 물려받아 재사용하고, 자식 클래스에서 부모의 메서드를 재정의(오버라이딩)하여 다형성을 실현하는 객체지향 핵심 개념입니다.",
    "coreAnalogy": "부모님의 스마트폰 사용법을 물려받되, 나만의 스타일로 개조",
    "keyFacts": [
      "extends 키워드로 단일 상속만 지원합니다.",
      "super() 키워드는 부모 클래스의 생성자나 메서드를 호출할 때 사용합니다.",
      "동적 바인딩(Dynamic Binding)에 의해 부모 타입 참조변수라도 자식의 오버라이딩 메서드가 우선 호출됩니다."
    ],
    "importance": 3,
    "relatedKeywords": [
      "상속",
      "오버라이딩",
      "다형성",
      "super",
      "extends"
    ]
  },
  {
    "id": "concept_py_slicing",
    "subject": "프로그래밍언어활용",
    "category": "Python 프로그래밍",
    "title": "Python 리스트 슬라이싱과 음수 인덱스",
    "definition": "시퀀스 자료형에서 [start:stop:step] 문법을 통해 원하는 부분 요소를 추출하는 문법으로, 음수 인덱스는 끝에서부터의 위치를 나타냅니다.",
    "coreAnalogy": "빵 썰기(시작 지점부터 끝 직전 지점까지 지정한 간격으로 자르기)",
    "keyFacts": [
      "stop 인덱스는 포함되지 않습니다 ([start, stop) 반열린 구간).",
      "음수 인덱스 -1은 가장 마지막 원소를 의미합니다.",
      "step이 음수이면 역방향으로 탐색합니다 (예: [::-1]은 문자열/리스트 뒤집기)."
    ],
    "importance": 2,
    "relatedKeywords": [
      "Python",
      "슬라이싱",
      "음수 인덱스",
      "리스트"
    ]
  },
  {
    "id": "concept_sw_coupling",
    "subject": "소프트웨어설계",
    "category": "모듈 설계",
    "title": "모듈 결합도와 응집도",
    "definition": "바람직한 소프트웨어 모듈화를 위해 결합도(Coupling)는 낮추고(약결합), 응집도(Cohesion)는 높여야(고응집) 변경 용이성과 독립성을 확보할 수 있습니다.",
    "coreAnalogy": "레고 블록(서로 규격화되어 쉽게 뗐다 붙였다 할 수 있는 낮은 결합도)",
    "keyFacts": [
      "결합도 순서 (약함 -> 강함): 자료 < 스탬프 < 제어 < 외부 < 공통 < 내용",
      "응집도 순서 (약함 -> 강함): 우연적 < 논리적 < 시간적 < 절차적 < 통신적 < 순차적 < 기능적"
    ],
    "importance": 3,
    "relatedKeywords": [
      "결합도",
      "응집도",
      "모듈",
      "순차적응집도",
      "내용결합도"
    ]
  },
  {
    "id": "concept_c_bitwise",
    "subject": "프로그래밍언어활용",
    "category": "C 프로그래밍",
    "title": "C언어 비트 연산자와 삼항 조건 연산자",
    "definition": "비트 단위 시프트(<<, >>) 및 논리 연산과 (조건 ? 참 : 거짓) 형태의 삼항 조건 연산자를 활용한 분기 및 비트 조작 연산입니다.",
    "coreAnalogy": "표지판 조건에 따라 두 갈래 길 중 하나를 선택하고, 2진수 비트를 좌우로 밀어 곱셈/나눗셈을 수행하는 작업",
    "keyFacts": [
      "x << n 은 x * (2^n)과 같고, x >> n 은 x / (2^n)과 같습니다.",
      "C언어 조건문에서 0은 거짓(false), 0이 아닌 모든 값은 참(true)으로 취급됩니다.",
      "삼항 조건 연산자는 조건식이 참이면 앞의 식, 거짓이면 뒤의 식을 평가하여 반환합니다."
    ],
    "importance": 2,
    "relatedKeywords": [
      "C언어",
      "비트연산자",
      "시프트연산",
      "삼항연산자"
    ]
  },
  {
    "id": "concept_net_ospf",
    "subject": "정보시스템구축관리",
    "category": "네트워크 아키텍처",
    "title": "OSPF 라우팅 프로토콜",
    "definition": "다익스트라(Dijkstra) 알고리즘 기반의 최단 경로 우선(Open Shortest Path First) 내부 라우팅 프로토콜(IGP)이자 링크 상태(Link State) 프로토콜입니다.",
    "coreAnalogy": "실시간 내비게이션(전체 도로망 상태를 파악하여 가장 빠른 최단 경로를 직접 계산)",
    "keyFacts": [
      "링크 상태(Link State) 라우팅 알고리즘(다익스트라 SPF 알고리즘)을 사용합니다.",
      "RIP의 15홉 한계를 극복하여 대규모 자치 시스템(AS) 내부에 적합하며 홉 수 제한이 없습니다.",
      "네트워크 변화 발생 시에만 플러딩(Flooding) 방식으로 상태를 갱신합니다."
    ],
    "importance": 3,
    "mnemonic": {
      "acronym": "OSPF",
      "catchphrase": "링크상태 다익스트라 최단경로 대규모",
      "items": [
        {
          "letter": "O",
          "name": "Open",
          "desc": "개방형 표준 프로토콜"
        },
        {
          "letter": "S",
          "name": "Shortest",
          "desc": "최단 경로 우선 산출 (다익스트라)"
        },
        {
          "letter": "P",
          "name": "Path",
          "desc": "링크 상태 기반 경로 계산"
        },
        {
          "letter": "F",
          "name": "First",
          "desc": "IGP 대표 프로토콜"
        }
      ]
    },
    "relatedKeywords": [
      "OSPF",
      "Dijkstra",
      "링크상태",
      "IGP",
      "최단경로"
    ]
  },
  {
    "id": "concept_db_normalization_3nf",
    "subject": "데이터베이스구축",
    "category": "데이터베이스 설계",
    "title": "제3정규형(3NF)과 이행적 함수 종속",
    "definition": "제2정규형을 만족하고, 기본키가 아닌 일반 속성들 간의 이행적 함수 종속(A → B, B → C 이므로 A → C)을 제거하는 정규화 과정입니다.",
    "coreAnalogy": "다리 건너 알게 되는 관계 끊기(A를 알면 B를 알고 B를 알면 C를 아는 다리 형태의 종속을 별도 표로 분리)",
    "keyFacts": [
      "정규화 순서: 원부이결다조 (1NF: 원자값, 2NF: 부분함수종속 제거, 3NF: 이행함수종속 제거, BCNF: 결정자이면서 후보키 아닌 함수종속 제거).",
      "X → Y이고 Y → Z일 때 X → Z가 성립하는 관계를 이행적 함수 종속이라 합니다.",
      "무손실 분해를 통해 테이블을 나누어 삽입/삭제/갱신 이상 현상을 방지합니다."
    ],
    "importance": 3,
    "mnemonic": {
      "acronym": "원부이결다조",
      "catchphrase": "원자값(1), 부분(2), 이행(3), 결정자(BCNF), 다치(4), 조인(5)",
      "items": [
        {
          "letter": "1",
          "name": "제1정규형",
          "desc": "도메인이 원자값만으로 구성"
        },
        {
          "letter": "2",
          "name": "제2정규형",
          "desc": "부분 함수 종속 제거 (완전 함수 종속)"
        },
        {
          "letter": "3",
          "name": "제3정규형",
          "desc": "이행적 함수 종속 제거"
        }
      ]
    },
    "relatedKeywords": [
      "정규화",
      "3NF",
      "제3정규형",
      "이행적함수종속",
      "원부이결다조"
    ]
  },
  {
    "id": "concept_sw_cohesion",
    "subject": "소프트웨어설계",
    "category": "모듈화 및 아키텍처",
    "title": "모듈 응집도(Cohesion)와 품질",
    "definition": "모듈 내부의 구성 요소들이 하나의 단일 목적을 위해 얼마나 밀접하게 관련되어 있는지를 나타내는 척도로, 높을수록(강할수록) 독립성이 높고 바람직합니다.",
    "coreAnalogy": "하나의 공구함에 꼭 필요한 전용 공구만 모아둔 상태(높은 응집도)",
    "keyFacts": [
      "응집도 강함 순서: 기능적(Functional) > 순차적(Sequential) > 통신적/교환적(Communication) > 절차적(Procedural) > 시간적(Temporal) > 논리적(Logical) > 우연적(Coincidental).",
      "암기 팁: \"기순교절시논우\" (가장 강한 기능적부터 가장 약한 우연적까지).",
      "소프트웨어 설계 원칙: 높은 응집도(High Cohesion)와 낮은 결합도(Low Coupling)."
    ],
    "importance": 3,
    "mnemonic": {
      "acronym": "기순교절시논우",
      "catchphrase": "기능-순차-교환-절차-시간-논리-우연",
      "items": [
        {
          "letter": "기",
          "name": "기능적 응집도",
          "desc": "단일 기능 수행 (가장 강함)"
        },
        {
          "letter": "순",
          "name": "순차적 응집도",
          "desc": "출력값이 다음 입력값으로 사용"
        },
        {
          "letter": "교",
          "name": "교환적/통신적",
          "desc": "동일한 입력 데이터로 서로 다른 작업"
        },
        {
          "letter": "우",
          "name": "우연적 응집도",
          "desc": "서로 아무 관련 없는 요소 (가장 약함)"
        }
      ]
    },
    "relatedKeywords": [
      "응집도",
      "기순교절시논우",
      "기능적응집도",
      "모듈화",
      "Cohesion"
    ]
  },
  {
    "id": "concept_dp_singleton",
    "subject": "프로그래밍언어활용",
    "category": "Java 프로그래밍",
    "title": "싱글톤 패턴(Singleton Pattern)",
    "definition": "애플리케이션 전역에서 특정 클래스의 인스턴스를 오직 하나만 생성하도록 제한하고, 어디서든 이 인스턴스에 접근할 수 있도록 전역적인 접근점을 제공하는 생성 디자인 패턴입니다.",
    "coreAnalogy": "국가의 유일한 대통령이나 컴퓨터의 단일 프린터 스풀러",
    "keyFacts": [
      "private 생성자를 사용하여 외부에서 new 키워드로 직접 객체를 생성하지 못하게 차단합니다.",
      "static 메서드(getInstance / get)를 제공하여 항상 동일한 정적 인스턴스를 반환합니다.",
      "공통 리소스(DB 커넥션 풀, 설정 관리자 등)의 공유 및 중복 생성 방지에 주로 활용됩니다."
    ],
    "importance": 3,
    "relatedKeywords": [
      "Singleton",
      "싱글톤",
      "생성패턴",
      "static",
      "getInstance"
    ]
  },
  {
    "id": "concept_dp_abstract_factory",
    "subject": "소프트웨어설계",
    "category": "디자인 패턴",
    "title": "추상 팩토리 패턴(Abstract Factory / Kit)",
    "definition": "구체적인 클래스를 명시하지 않고도 서로 연관되거나 의존적인 여러 객체의 군(Family)을 생성하기 위한 인터페이스를 제공하는 생성 디자인 패턴입니다 (Kit 패턴으로도 불림).",
    "coreAnalogy": "컴퓨터 부품 키트 조립(Intel 계열 부품 세트 전체를 교체하거나 AMD 계열 세트 전체로 일괄 교체)",
    "keyFacts": [
      "GoF 23대 패턴 중 생성 패턴에 속하며 별칭으로 Kit 패턴이라 불립니다.",
      "연관된 서브 클래스 제품군을 일관되게 한꺼번에 교체할 수 있습니다.",
      "단일 제품을 생성하는 팩토리 메서드(Factory Method) 패턴과 비교하여, 제품군(Family) 단위를 다룬다는 점이 다릅니다."
    ],
    "importance": 2,
    "relatedKeywords": [
      "Abstract Factory",
      "추상팩토리",
      "Kit패턴",
      "생성패턴",
      "GoF"
    ]
  },
  {
    "id": "concept_os_page_replacement",
    "subject": "정보시스템구축관리",
    "category": "운영체제",
    "title": "가상기억장치 페이지 교체 알고리즘 (LRU, LFU)",
    "definition": "페이지 부재(Page Fault) 발생 시 주기억장치의 모든 프레임이 가득 차 있을 때 어떤 페이지를 교체할지 결정하는 메모리 관리 알고리즘입니다.",
    "coreAnalogy": "책상 위 책 정리: 가장 오랫동안 안 본 책 치우기(LRU), 가장 적게 읽은 책 치우기(LFU)",
    "keyFacts": [
      "LRU(Least Recently Used): 가장 오랫동안 참조되지 않은 페이지를 교체 (시간 기준).",
      "LFU(Least Frequently Used): 참조 횟수가 가장 적은 페이지를 교체 (빈도 기준).",
      "FIFO(First In First Out): 가장 먼저 들어온 페이지를 가장 먼저 교체."
    ],
    "importance": 3,
    "relatedKeywords": [
      "페이지교체",
      "LRU",
      "LFU",
      "FIFO",
      "가상기억장치",
      "Page Fault"
    ]
  },
  {
    "id": "concept_py_string_indexing",
    "subject": "프로그래밍언어활용",
    "category": "Python 프로그래밍",
    "title": "Python 리스트와 문자열 인덱싱",
    "definition": "파이썬의 시퀀스 자료형(리스트, 문자열 등)에서 0부터 시작하는 인덱스를 통한 요소 접근 및 2차원 중첩 인덱싱 기법입니다.",
    "coreAnalogy": "아파트 동호수 찾기 (몇 번째 묶음의 몇 번째 글자)",
    "keyFacts": [
      "문자열이나 리스트는 0-indexed로 첫 번째 원소는 0, 마지막 원소는 -1입니다.",
      "리스트 내의 문자열 원소에 대해 list[i][j] 형식으로 특정 위치의 문자를 순차 접근할 수 있습니다.",
      "문자열 결합 연산(+=)을 통해 원하는 문자를 누적할 수 있습니다."
    ],
    "importance": 2,
    "relatedKeywords": [
      "Python",
      "문자열",
      "인덱싱",
      "리스트",
      "2차원접근"
    ]
  },
  {
    "id": "concept_db_join_types",
    "subject": "데이터베이스구축",
    "category": "관계대수",
    "title": "관계대수 조인 연산 (세타, 동등, 자연 조인)",
    "definition": "두 릴레이션에서 공통 속성을 바탕으로 튜플을 연결하는 관계대수 연산으로, 세타 조인, 동등 조인, 자연 조인이 있습니다.",
    "coreAnalogy": "두 개의 엑셀 표를 공통 키로 합치고 중복된 열은 하나로 합치기",
    "keyFacts": [
      "세타 조인(Theta Join): 비교 연산자(=, <, >, <=, >=, !=)를 사용하는 가장 일반적인 조인.",
      "동등 조인(Equi Join): 세타 조인 중 오직 동등 비교(=)만을 사용하는 조인.",
      "자연 조인(Natural Join): 동등 조인 결과에서 중복되는 속성을 제거하여 한 번만 표기하는 조인."
    ],
    "importance": 3,
    "relatedKeywords": [
      "관계대수",
      "세타조인",
      "동등조인",
      "자연조인",
      "순수관계연산자"
    ]
  },
  {
    "id": "concept_c_string_reverse",
    "subject": "프로그래밍언어활용",
    "category": "C 프로그래밍",
    "title": "C언어 문자열 조작과 투 포인터(Two-pointer) 역순 치환",
    "definition": "C언어에서 char 배열 문자열의 양 끝 인덱스를 마주 보며 이동시키면서 문자를 교환(Swap)하여 역순으로 뒤집거나 가공하는 알고리즘입니다.",
    "coreAnalogy": "양쪽 끝에서부터 마주 걸어오며 마주치는 짝끼리 자리를 맞바꾸기",
    "keyFacts": [
      "문자열 길이를 구한 뒤 start = 0, end = len - 1 포인터를 설정하여 start < end 동안 swap을 반복합니다.",
      "특정 간격(예: 짝수 인덱스 등)만 건너뛰거나 특정 문자를 치환하는 패턴이 자주 출제됩니다.",
      "널 문자(\\0)의 위치를 보존하는 것이 중요합니다."
    ],
    "importance": 2,
    "relatedKeywords": [
      "C언어",
      "문자열",
      "투포인터",
      "역순",
      "swap"
    ]
  },
  {
    "id": "concept_java_constructor_chain",
    "subject": "프로그래밍언어활용",
    "category": "Java 프로그래밍",
    "title": "Java 생성자 오버로딩과 생성자 체이닝 (this / super)",
    "definition": "클래스 내에서 매개변수를 달리하여 여러 생성자를 오버로딩하고, this()와 super()를 통해 생성자 호출 체인을 구성하는 메커니즘입니다.",
    "coreAnalogy": "도미노처럼 기본 생성자가 매개변수 생성자를 깨우고 차례대로 초기화를 완료하는 과정",
    "keyFacts": [
      "this()는 동일 클래스의 다른 생성자를 호출하며, 반드시 생성자의 첫 줄에 위치해야 합니다.",
      "super()는 부모 클래스의 생성자를 호출하며, 생략 시 컴파일러가 첫 줄에 super()를 자동 삽입합니다.",
      "생성자 호출 체인의 진입 순서와 실제 실행(출력) 순서가 역순(스택)으로 진행됨에 유의해야 합니다."
    ],
    "importance": 3,
    "relatedKeywords": [
      "Java",
      "생성자",
      "this",
      "super",
      "생성자체이닝",
      "오버로딩"
    ]
  },
  {
    "id": "concept_sql_subquery_in",
    "subject": "데이터베이스구축",
    "category": "SQL 응용",
    "title": "SQL 중첩 서브쿼리와 IN 다중 행 연산자",
    "definition": "WHERE 절 안에 또 다른 SELECT 문을 포함하는 중첩 서브쿼리와 서브쿼리 결과 목록 중 일치하는 값이 있는지 확인하는 IN 연산자의 결합입니다.",
    "coreAnalogy": "대상자 명단을 먼저 조회한 후, 그 명단에 포함된 레코드만 골라내기",
    "keyFacts": [
      "서브쿼리가 여러 개의 행을 반환할 때는 단일 행 비교 연산자 대신 IN, ANY, ALL 등의 다중 행 연산자를 사용합니다.",
      "안쪽 서브쿼리가 먼저 실행되어 결과 집합을 만들고, 바깥쪽 메인 쿼리가 그 결과를 조건으로 필터링합니다.",
      "ORDER BY 절을 통해 결과 행의 정렬 순서를 결정합니다."
    ],
    "importance": 3,
    "relatedKeywords": [
      "SQL",
      "서브쿼리",
      "IN연산자",
      "중첩쿼리",
      "다중행연산자"
    ]
  },
  {
    "id": "concept_c_ctype_caesar",
    "subject": "프로그래밍언어활용",
    "category": "C 프로그래밍",
    "title": "C언어 ctype 라이브러리와 시저 암호 문자 변환",
    "definition": "ctype.h 헤더의 문자 판별 함수를 사용하여 알파벳 여부를 확인하고, 고정된 거리만큼 아스키 코드를 이동시키는 암호화/치환 알고리즘입니다.",
    "coreAnalogy": "카이사르 암호(알파벳을 오른쪽으로 n칸씩 밀어 쓰는 비밀 편지)",
    "keyFacts": [
      "isalpha(c): 알파벳인지 확인 (참이면 0이 아닌 값 반환).",
      "isupper(c), islower(c): 대문자/소문자 판별 함수.",
      "알파벳 순환 이동 시 모듈러 연산((c - base + shift) % 26 + base)을 활용하여 Z를 넘어가면 A로 순환시킵니다."
    ],
    "importance": 2,
    "relatedKeywords": [
      "C언어",
      "ctype",
      "시저암호",
      "아스키코드",
      "문자열변환"
    ]
  },
  {
    "id": "concept_test_mcdc",
    "subject": "소프트웨어설계",
    "category": "애플리케이션 테스트",
    "title": "화이트박스 테스트 커버리지 (MC/DC)",
    "definition": "복합 조건식에서 각 개별 조건식이 다른 조건식들의 영향을 받지 않고 전체 조건식의 최종 결과(참/거짓)를 독립적으로 결정할 수 있음을 검증하는 조건/결정 커버리지의 개선된 기법입니다.",
    "coreAnalogy": "공동 심사위원 중 한 사람의 찬반 변경만으로 최종 합격/불합격 결과가 바뀌는 캐스팅보트 검증",
    "keyFacts": [
      "MC/DC(Modified Condition/Decision Coverage): n+1개의 테스트 케이스로 2^n 수준의 복합 조건을 효율적으로 검증합니다.",
      "항공, 원자력, 의료 등 최고 수준의 안전성이 요구되는 임베디드 시스템에 필수적인 커버리지 기준입니다.",
      "구문 < 결정 < 조건 < 조건/결정 < MC/DC < 다중조건 커버리지 순으로 엄격합니다."
    ],
    "importance": 3,
    "relatedKeywords": [
      "MC/DC",
      "화이트박스",
      "테스트커버리지",
      "수정조건결정커버리지"
    ]
  },
  {
    "id": "concept_sec_rootkit",
    "subject": "신기술/보안",
    "category": "시스템 보안 위협",
    "title": "루트킷(Rootkit) 악성코드와 시스템 은닉",
    "definition": "시스템의 최고 관리자 권한을 획득한 후, 자신의 존재(프로세스, 파일, 레지스트리 등)를 시스템 진단 도구로부터 완벽히 은닉하고 백도어를 유지하는 악성 프로그램입니다.",
    "coreAnalogy": "감시 카메라와 경비 장부를 조작해 침입자의 존재 자체를 지워버리는 투명망토 악성코드",
    "keyFacts": [
      "커널 모드 또는 시스템 API 후킹을 통해 프로세스 목록이나 파일 탐색기에서 감지되지 않도록 숨깁니다.",
      "공격자가 언제든 시스템에 재침투할 수 있도록 백도어를 설치하고 로그를 삭제합니다.",
      "일반 안티바이러스로는 탐지가 어렵고 전용 무결성 검증 도구가 필요합니다."
    ],
    "importance": 2,
    "relatedKeywords": [
      "Rootkit",
      "루트킷",
      "악성코드",
      "은닉",
      "관리자권한",
      "백도어"
    ]
  },
  {
    "id": "concept_sec_apt",
    "subject": "신기술/보안",
    "category": "정보보안 공격 기법",
    "title": "지능형 지속 위협(APT, Advanced Persistent Threat)",
    "definition": "특정 대상 조직을 명확히 타깃으로 설정하고, 다양한 고도화된 수단을 동원하여 오랜 기간 은밀하고 지속적으로 침투하여 기밀을 탈취하거나 파괴하는 공격 기법입니다.",
    "coreAnalogy": "스파이가 특정 기업에 위장 취업하여 장기간에 걸쳐 내부 기밀을 은밀히 빼돌리는 장기 공작",
    "keyFacts": [
      "4단계 공격 침투 주기: 침투(Infiltration) -> 검색(Search) -> 수집(Collection) -> 유출(Exfiltration).",
      "불특정 다수를 노리는 일반적인 악성코드와 달리 특정 표적을 겨냥하는 표적형(Targeted) 공격입니다.",
      "스피어 피싱, 워터링 홀 등의 사회공학적 기법을 초기 침투 경로로 애용합니다."
    ],
    "importance": 3,
    "mnemonic": {
      "acronym": "침검수유",
      "catchphrase": "침투하고, 검색하고, 수집하고, 유출한다",
      "items": [
        {
          "letter": "침",
          "name": "침투 (Infiltration)",
          "desc": "악성코드 유포 및 취약점 공격"
        },
        {
          "letter": "검",
          "name": "검색 (Search)",
          "desc": "네트워크 탐색 및 관리자 권한 획득"
        },
        {
          "letter": "수",
          "name": "수집 (Collection)",
          "desc": "기밀 데이터 및 인증 정보 수집"
        },
        {
          "letter": "유",
          "name": "유출 (Exfiltration)",
          "desc": "외부 서버로 은밀한 데이터 전송"
        }
      ]
    },
    "relatedKeywords": [
      "APT",
      "지능형지속위협",
      "표적공격",
      "스피어피싱",
      "침검수유"
    ]
  },
  {
    "id": "concept_sql_logic_precedence",
    "subject": "데이터베이스구축",
    "category": "SQL 응용",
    "title": "SQL 논리 연산자 우선순위 (NOT > AND > OR)",
    "definition": "SQL의 WHERE 절에서 여러 논리 조건이 결합될 때 적용되는 기본 평가 우선순위로, NOT이 가장 높고 그 다음 AND, 마지막으로 OR이 평가됩니다.",
    "coreAnalogy": "사칙연산에서 곱셈/나눗셈을 덧셈/뺄셈보다 먼저 계산하는 것과 동일한 원리 (AND가 곱셈, OR이 덧셈)",
    "keyFacts": [
      "논리 연산자 우선순위: NOT > AND > OR.",
      "WHERE A OR B AND C 는 WHERE A OR (B AND C) 로 처리됩니다.",
      "의도하지 않은 결과 행 추출을 방지하기 위해 복합 조건에서는 명시적으로 괄호 ()를 사용하는 것이 권장됩니다."
    ],
    "importance": 3,
    "relatedKeywords": [
      "SQL",
      "연산자우선순위",
      "AND",
      "OR",
      "NOT",
      "WHERE절"
    ]
  },
  {
    "id": "concept_java_polymorphism",
    "subject": "프로그래밍언어활용",
    "category": "Java 프로그래밍",
    "title": "Java 다형성과 동적 바인딩(Dynamic Binding)",
    "definition": "부모 클래스 타입의 참조 변수로 자식 클래스의 인스턴스를 참조할 수 있으며, 메서드 호출 시 런타임에 실제 참조하는 객체의 오버라이딩된 메서드가 호출되는 객체지향 핵심 특성입니다.",
    "coreAnalogy": "\"탈것\" 리모컨으로 \"스포츠카\"를 시동 걸면 스포츠카의 강력한 엔진 소리가 나는 것",
    "keyFacts": [
      "업캐스팅(Upcasting): 자식 객체를 부모 타입의 참조변수에 대입하는 것으로 자동 형변환됩니다.",
      "동적 바인딩(Dynamic Binding): 컴파일 시점의 타입이 아니라 실행(Run-time) 시점에 실제 메모리에 생성된 인스턴스의 오버라이딩 메서드가 실행됩니다.",
      "부모의 메서드가 오버라이딩되어 있다면 부모 타입 포인터로 호출해도 자식의 재정의 메서드가 동작합니다."
    ],
    "importance": 3,
    "relatedKeywords": [
      "Java",
      "다형성",
      "오버라이딩",
      "동적바인딩",
      "업캐스팅",
      "Polymorphism"
    ]
  }
];

export class ConceptRepository {
  private db: Database;

  constructor(customDb?: Database) {
    this.db = customDb || getDatabase();
  }

  public create(c: Concept): Concept {
    const stmt = this.db.prepare(`
      INSERT INTO concepts (
        id, subject, category, title, definition, core_analogy,
        key_facts_json, importance, mnemonic_json, related_keywords_json,
        created_at, updated_at
      ) VALUES (
        @id, @subject, @category, @title, @definition, @core_analogy,
        @key_facts_json, @importance, @mnemonic_json, @related_keywords_json,
        @created_at, @updated_at
      )
    `);

    stmt.run({
      id: c.id,
      subject: c.subject,
      category: c.category,
      title: c.title,
      definition: c.definition,
      core_analogy: c.coreAnalogy ?? null,
      key_facts_json: JSON.stringify(c.keyFacts || []),
      importance: c.importance,
      mnemonic_json: c.mnemonic ? JSON.stringify(c.mnemonic) : null,
      related_keywords_json: JSON.stringify(c.relatedKeywords || []),
      created_at: c.createdAt || new Date().toISOString(),
      updated_at: c.updatedAt ?? null,
    });

    const created = this.findById(c.id);
    if (!created) {
      throw new Error(`Failed to retrieve newly created concept id=${c.id}`);
    }
    return created;
  }

  public findById(id: string): Concept | null {
    const stmt = this.db.prepare('SELECT * FROM concepts WHERE id = ?');
    const row = stmt.get(id) as ConceptRow | undefined;
    return row ? mapRowToConcept(row) : null;
  }

  public findAll(): Concept[] {
    const stmt = this.db.prepare('SELECT * FROM concepts ORDER BY subject ASC, category ASC');
    const rows = stmt.all() as ConceptRow[];
    return rows.map(mapRowToConcept);
  }

  public findBySubject(subject: Subject): Concept[] {
    const stmt = this.db.prepare('SELECT * FROM concepts WHERE subject = ? ORDER BY category ASC');
    const rows = stmt.all(subject) as ConceptRow[];
    return rows.map(mapRowToConcept);
  }

  public seedInitialConcepts(): { inserted: number; total: number } {
    let inserted = 0;
    const tx = this.db.transaction(() => {
      for (const concept of INITIAL_CONCEPTS) {
        const existing = this.findById(concept.id);
        if (!existing) {
          this.create(concept);
          inserted++;
        }
      }
    });
    tx();

    const countRow = this.db.prepare('SELECT COUNT(*) as count FROM concepts').get() as {
      count: number;
    };
    return { inserted, total: countRow.count };
  }

  /**
   * Attempt 기록 기반 취약 개념(Weak Concepts) 종합 집계
   */
  public findWeakConcepts(limit = 10): WeakConceptSummary[] {
    const query = `
      SELECT 
        c.id as concept_id,
        c.title as concept_title,
        c.subject,
        c.category,
        COUNT(a.id) as total_attempts,
        SUM(CASE WHEN a.is_correct = 0 AND (a.is_unknown = 0 OR a.is_unknown IS NULL) THEN 1 ELSE 0 END) as wrong_count,
        SUM(CASE WHEN a.is_unknown = 1 THEN 1 ELSE 0 END) as unknown_count,
        SUM(CASE WHEN a.hint_used = 1 THEN 1 ELSE 0 END) as hint_count,
        AVG(COALESCE(a.score, 0)) as avg_score,
        GROUP_CONCAT(DISTINCT q.id) as question_ids_csv
      FROM concepts c
      INNER JOIN questions q ON q.concept_id = c.id
      INNER JOIN attempts a ON a.question_id = q.id
      WHERE (q.study_visibility IS NULL OR q.study_visibility = 'LIVE')
      GROUP BY c.id
      HAVING total_attempts > 0
      ORDER BY 
        (SUM(CASE WHEN a.is_correct = 0 THEN 1 ELSE 0 END) * 1.5 +
         SUM(CASE WHEN a.is_unknown = 1 THEN 1 ELSE 0 END) * 2.0 +
         SUM(CASE WHEN a.hint_used = 1 THEN 1 ELSE 0 END) * 0.5) DESC,
        avg_score ASC
      LIMIT ?
    `;

    const rows = this.db.prepare(query).all(limit) as Array<{
      concept_id: string;
      concept_title: string;
      subject: string;
      category: string;
      total_attempts: number;
      wrong_count: number;
      unknown_count: number;
      hint_count: number;
      avg_score: number;
      question_ids_csv: string | null;
    }>;

    return rows.map((r) => {
      const wrong = Number(r.wrong_count || 0);
      const unknown = Number(r.unknown_count || 0);
      const hint = Number(r.hint_count || 0);
      const total = Number(r.total_attempts || 1);
      const avg = Number(r.avg_score || 0);

      // 취약도 점수 계산 (0.0 ~ 1.0): 오답률, 모르겠음률, 힌트 의존도 반영
      const penalty = (wrong * 1.0 + unknown * 1.2 + hint * 0.4) / total;
      const weakness = Number(Math.min(1.0, Math.max(0.0, penalty * (1.1 - avg * 0.5))).toFixed(2));

      return {
        conceptId: r.concept_id,
        conceptTitle: r.concept_title,
        subject: r.subject as Subject,
        category: r.category,
        totalAttempts: total,
        wrongCount: wrong,
        unknownCount: unknown,
        hintCount: hint,
        avgScore: Number(avg.toFixed(2)),
        weaknessScore: weakness,
        relatedQuestionIds: r.question_ids_csv ? r.question_ids_csv.split(',') : [],
      };
    });
  }
}
