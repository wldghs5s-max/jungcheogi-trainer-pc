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
    id: 'concept_c_pointer',
    subject: '프로그래밍언어활용',
    category: 'C 프로그래밍',
    title: 'C언어 포인터와 배열 주소 연산',
    definition:
      '포인터 변수는 메모리의 주소값을 저장하며, 포인터 덧셈/뺄셈 연산 시 가리키는 자료형의 크기 단위로 주소가 이동합니다. 배열 이름은 첫 번째 원소의 주소 상수를 나타냅니다.',
    coreAnalogy: '아파트 동호수 주소 적힌 쪽지(포인터)와 실제 집(역참조 값)',
    keyFacts: [
      '*p는 포인터 p가 가리키는 주소의 실제 값(역참조)입니다.',
      '배열 arr에서 arr + i는 &arr[i]와 같고, *(arr + i)는 arr[i]와 같습니다.',
      '포인터 증가 연산 p + 1은 단순 1바이트 증가가 아니라 sizeof(자료형) 바이트만큼 증가합니다.',
    ],
    importance: 3,
    mnemonic: {
      acronym: '주소역참조',
      catchphrase: '주소 담고(*p), 이동하고(+i), 꺼내본다(*)',
      items: [
        { letter: '&', name: '주소 연산자', desc: '변수의 메모리 시작 주소를 반환' },
        { letter: '*', name: '역참조 연산자', desc: '주소에 저장된 실제 값을 읽거나 쓰기' },
        { letter: '+', name: '오프셋 이동', desc: '자료형 단위로 메모리 주소 이동' },
      ],
    },
    relatedKeywords: ['포인터', '배열', '메모리 주소', '역참조', '오프셋'],
  },
  {
    id: 'concept_gof_builder',
    subject: '소프트웨어설계',
    category: '디자인 패턴',
    title: 'GoF 빌더(Builder) 패턴',
    definition:
      '복합 객체의 생성 과정과 표현 방법을 분리하여 동일한 생성 절차에서 서로 다른 표현 결과를 만들 수 있게 하는 생성 디자인 패턴입니다.',
    coreAnalogy: '수제 햄버거 주문서(번, 패티, 소스를 원하는 조합으로 조립)',
    keyFacts: [
      '생성(Creational) 디자인 패턴의 대표적인 유형입니다.',
      '인스턴스 생성 시 많은 파라미터가 필요한 경우 가독성과 안정성을 극대화합니다.',
      'Director(감독관)와 Builder(건축가) 구조로 조립 단계를 분리합니다.',
    ],
    importance: 3,
    relatedKeywords: ['빌더', 'Builder', '생성 패턴', 'GoF', '인스턴스 조립'],
  },
  {
    id: 'concept_db_acid',
    subject: '데이터베이스구축',
    category: '트랜잭션',
    title: '트랜잭션 4대 특성 (ACID)',
    definition:
      '데이터베이스에서 하나의 논리적 작업 단위를 신뢰성 있게 수행하기 위해 보장해야 하는 원자성, 일관성, 고립성, 영속성의 4가지 필수 특성입니다.',
    coreAnalogy: '은행 계좌 이체(출금과 입금이 둘 다 되거나 둘 다 취소되어야 함)',
    keyFacts: [
      'Atomicity(원자성): All or Nothing (전부 수행 또는 전부 취소)',
      'Consistency(일관성): 트랜잭션 전후 데이터 무결성 규칙 보존',
      'Isolation(고립성/격리성): 동시에 실행되는 트랜잭션 간 간섭 불가',
      'Durability(영속성): 성공 완료된 결과는 장애 발생 시에도 영구 보존',
    ],
    importance: 3,
    mnemonic: {
      acronym: 'ACID',
      catchphrase: '원일고영 (원자성, 일관성, 고립성, 영속성)',
      items: [
        { letter: 'A', name: 'Atomicity', desc: 'All or Nothing (회복 관리자)' },
        { letter: 'C', name: 'Consistency', desc: '일관된 무결성 상태 유지' },
        { letter: 'I', name: 'Isolation', desc: '트랜잭션 독립 실행 (동시성 제어)' },
        { letter: 'D', name: 'Durability', desc: '결과의 영구 보존 (로그 및 백업)' },
      ],
    },
    relatedKeywords: ['원자성', '일관성', '고립성', '영속성', 'ACID', '트랜잭션'],
  },
  {
    id: 'concept_java_inheritance',
    subject: '프로그래밍언어활용',
    category: 'Java 프로그래밍',
    title: 'Java 상속과 메서드 오버라이딩',
    definition:
      '부모 클래스의 멤버를 자식 클래스가 물려받아 재사용하고, 자식 클래스에서 부모의 메서드를 재정의(오버라이딩)하여 다형성을 실현하는 객체지향 핵심 개념입니다.',
    coreAnalogy: '부모님의 스마트폰 사용법을 물려받되, 나만의 스타일로 개조',
    keyFacts: [
      'extends 키워드로 단일 상속만 지원합니다.',
      'super() 키워드는 부모 클래스의 생성자나 메서드를 호출할 때 사용합니다.',
      '동적 바인딩(Dynamic Binding)에 의해 부모 타입 참조변수라도 자식의 오버라이딩 메서드가 우선 호출됩니다.',
    ],
    importance: 3,
    relatedKeywords: ['상속', '오버라이딩', '다형성', 'super', 'extends'],
  },
  {
    id: 'concept_py_slicing',
    subject: '프로그래밍언어활용',
    category: 'Python 프로그래밍',
    title: 'Python 리스트 슬라이싱과 음수 인덱스',
    definition:
      '시퀀스 자료형에서 [start:stop:step] 문법을 통해 원하는 부분 요소를 추출하는 문법으로, 음수 인덱스는 끝에서부터의 위치를 나타냅니다.',
    coreAnalogy: '빵 썰기(시작 지점부터 끝 직전 지점까지 지정한 간격으로 자르기)',
    keyFacts: [
      'stop 인덱스는 포함되지 않습니다 ([start, stop) 반열린 구간).',
      '음수 인덱스 -1은 가장 마지막 원소를 의미합니다.',
      'step이 음수이면 역방향으로 탐색합니다 (예: [::-1]은 문자열/리스트 뒤집기).',
    ],
    importance: 2,
    relatedKeywords: ['Python', '슬라이싱', '음수 인덱스', '리스트'],
  },
  {
    id: 'concept_sw_coupling',
    subject: '소프트웨어설계',
    category: '모듈 설계',
    title: '모듈 결합도와 응집도',
    definition:
      '바람직한 소프트웨어 모듈화를 위해 결합도(Coupling)는 낮추고(약결합), 응집도(Cohesion)는 높여야(고응집) 변경 용이성과 독립성을 확보할 수 있습니다.',
    coreAnalogy: '레고 블록(서로 규격화되어 쉽게 뗐다 붙였다 할 수 있는 낮은 결합도)',
    keyFacts: [
      '결합도 순서 (약함 -> 강함): 자료 < 스탬프 < 제어 < 외부 < 공통 < 내용',
      '응집도 순서 (약함 -> 강함): 우연적 < 논리적 < 시간적 < 절차적 < 통신적 < 순차적 < 기능적',
    ],
    importance: 3,
    relatedKeywords: ['결합도', '응집도', '모듈', '순차적응집도', '내용결합도'],
  },
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
