import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { runMigrations } from "../db/migrator.js";
import { ConceptRepository } from "../db/repositories/conceptRepository.js";
import { QuestionRepository } from "../db/repositories/questionRepository.js";
import {
  setDatabasePathOverride,
  closeDatabase,
  getDatabase,
} from "../db/database.js";
import { env } from "../config/env.js";
import { Question, QuestionType, CodeLanguage } from "@jungcheogi/shared";

export interface CleanIngestOptions {
  dbPath?: string;
  seedsPath?: string;
}

function resolveSeedsPath(subPath: string): string {
  const projectRoot = path.resolve(__dirname, "../../..");
  const candidate = path.resolve(projectRoot, subPath);
  if (fs.existsSync(candidate)) return candidate;
  const cwdCandidate = path.resolve(process.cwd(), subPath);
  if (fs.existsSync(cwdCandidate)) return cwdCandidate;
  return candidate;
}

const CONCEPT_MAP: Record<number, string> = {
  1: "concept_c_bitwise",
  2: "concept_net_ospf",
  3: "concept_db_normalization_3nf",
  4: "concept_sw_cohesion",
  5: "concept_dp_singleton",
  6: "concept_dp_abstract_factory",
  7: "concept_os_page_replacement",
  8: "concept_py_string_indexing",
  9: "concept_db_join_types",
  10: "concept_c_string_reverse",
  11: "concept_java_constructor_chain",
  12: "concept_sql_subquery_in",
  13: "concept_c_ctype_caesar",
  14: "concept_test_mcdc",
  15: "concept_sec_rootkit",
  16: "concept_sec_apt",
  17: "concept_sql_logic_precedence",
  18: "concept_java_polymorphism",
};

const METADATA_MAP: Record<
  number,
  {
    subject: any;
    category: string;
    type: QuestionType;
    language?: CodeLanguage;
    difficulty: "EASY" | "MEDIUM" | "HARD";
    hints: string[];
    keywords: string[];
  }
> = {
  1: {
    subject: "프로그래밍언어활용",
    category: "C 프로그래밍",
    type: "CODE_TRACE",
    language: "C",
    difficulty: "MEDIUM",
    hints: [
      "삼항 연산자 (v1 > v2 ? v2 : v1)의 결과를 먼저 계산해 보세요.",
      "C언어에서 0은 거짓(false)이며, 비트 시프트 연산 << 2는 4를 곱한 것과 같습니다.",
    ],
    keywords: ["C언어", "비트시프트", "삼항연산자", "조건문"],
  },
  2: {
    subject: "정보시스템구축관리",
    category: "네트워크 아키텍처",
    type: "SHORT_ANSWER",
    difficulty: "MEDIUM",
    hints: [
      "Dijkstra(다익스트라) 최단 경로 알고리즘을 사용하는 대표적인 링크 상태(Link State) 프로토콜입니다.",
      "영문 약어 4글자 대문자로 작성하세요.",
    ],
    keywords: ["OSPF", "Dijkstra", "링크상태", "라우팅", "IGP"],
  },
  3: {
    subject: "데이터베이스구축",
    category: "정규화",
    type: "SHORT_ANSWER",
    difficulty: "MEDIUM",
    hints: [
      "기본키는 주문번호이며, 주문번호 -> 고객번호 -> 주소 형태의 이행적 함수 종속이 존재합니다.",
      "이행적 함수 종속(A -> B, B -> C 일 때 A -> C)을 제거하는 정규형입니다.",
    ],
    keywords: ["정규화", "제3정규형", "3NF", "이행적함수종속", "함수종속"],
  },
  4: {
    subject: "소프트웨어설계",
    category: "모듈 설계",
    type: "SHORT_ANSWER",
    difficulty: "MEDIUM",
    hints: [
      "응집도가 가장 높은 것은 하나의 목적만을 명확히 수행하는 기능적 응집도입니다.",
      "응집도 순서: 기능적 > 교환적(통신적) > 시간적 > 우연적",
    ],
    keywords: [
      "응집도",
      "기능적응집도",
      "교환적응집도",
      "시간적응집도",
      "우연적응집도",
    ],
  },
  5: {
    subject: "소프트웨어설계",
    category: "디자인 패턴",
    type: "CODE_TRACE",
    language: "JAVA",
    difficulty: "MEDIUM",
    hints: [
      "get() 메서드는 싱글톤 패턴으로 구현되어 매번 동일한 static 인스턴스를 반환합니다.",
      "conn1, conn2, conn3에 대한 count() 호출은 모두 같은 인스턴스의 변수를 증가시킵니다.",
    ],
    keywords: ["Java", "싱글톤", "Singleton", "static", "인스턴스"],
  },
  6: {
    subject: "소프트웨어설계",
    category: "디자인 패턴",
    type: "SHORT_ANSWER",
    difficulty: "HARD",
    hints: [
      "연관되거나 의존적인 객체들의 패밀리(군)를 생성하기 위한 인터페이스를 제공하는 생성 패턴입니다.",
      "Kit 패턴이라고도 불리며 서브클래스를 묶어 통째로 교체할 수 있습니다.",
    ],
    keywords: ["Abstract Factory", "추상팩토리", "생성패턴", "GoF", "Kit"],
  },
  7: {
    subject: "정보시스템구축관리",
    category: "운영체제",
    type: "SHORT_ANSWER",
    difficulty: "HARD",
    hints: [
      "LRU는 가장 오랫동안 참조되지 않은 페이지를, LFU는 참조 횟수가 가장 적은 페이지를 교체합니다.",
      "두 알고리즘의 페이지 부재(Fault) 횟수는 각각 몇 회인지 숫자로 작성하세요.",
    ],
    keywords: ["페이지교체", "LRU", "LFU", "페이지부재", "가상기억장치"],
  },
  8: {
    subject: "프로그래밍언어활용",
    category: "Python 프로그래밍",
    type: "CODE_TRACE",
    language: "PYTHON",
    difficulty: "MEDIUM",
    hints: [
      "각 문자열 원소의 인덱스 1 위치(두 번째 글자)를 순서대로 추출하여 str01 뒤에 덧붙입니다.",
      "초깃값 'S'에 Seoul의 'e', Kyeonggi의 'y' 등이 이어붙여집니다.",
    ],
    keywords: ["Python", "문자열인덱싱", "for문", "문자열결합"],
  },
  9: {
    subject: "데이터베이스구축",
    category: "관계형 데이터베이스",
    type: "SHORT_ANSWER",
    difficulty: "MEDIUM",
    hints: [
      "①은 일반적인 비교 연산자를 갖는 조인, ②는 = 연산자만 사용하는 동등 조인입니다.",
      "③은 동등 조인 결과에서 중복 속성을 제거한 자연 조인입니다.",
    ],
    keywords: ["세타조인", "동등조인", "자연조인", "관계대수", "JOIN"],
  },
  10: {
    subject: "프로그래밍언어활용",
    category: "C 프로그래밍",
    type: "CODE_TRACE",
    language: "C",
    difficulty: "MEDIUM",
    hints: [
      "inverse 함수는 문자열의 양 끝 문자를 교환하여 전체를 뒤집습니다.",
      "뒤집힌 문자열에서 인덱스 1부터 2씩 증가하며 문자를 출력합니다.",
    ],
    keywords: ["C언어", "문자열뒤집기", "포인터", "문자열인덱스"],
  },
  11: {
    subject: "프로그래밍언어활용",
    category: "Java 프로그래밍",
    type: "SHORT_ANSWER",
    difficulty: "HARD",
    hints: [
      "프로그램 실행은 main(⑤)에서 시작하며, new Child(10)(⑥) 생성 시 상속 관계에 따라 super()가 먼저 실행됩니다.",
      "자식 생성자(③) -> 부모 생성자(①) -> 출력문(⑦) -> getX()(②) 순서로 실행됩니다.",
    ],
    keywords: ["Java", "생성자호출순서", "super", "상속", "메서드호출"],
  },
  12: {
    subject: "데이터베이스구축",
    category: "SQL 응용",
    type: "SQL",
    language: "SQL",
    difficulty: "MEDIUM",
    hints: [
      "서브쿼리 SELECT C FROM R2 WHERE D='k'의 결과 집합은 ('x', 'y')입니다.",
      "R1 테이블에서 C 값이 'x' 또는 'y'인 행의 속성 B 값을 조회합니다.",
    ],
    keywords: ["SQL", "서브쿼리", "IN연산자", "속성명", "관계형DB"],
  },
  13: {
    subject: "프로그래밍언어활용",
    category: "C 프로그래밍",
    type: "CODE_TRACE",
    language: "C",
    difficulty: "MEDIUM",
    hints: [
      "'It is 8'의 각 글자에 대해 대문자는 +5, 소문자는 +10, 숫자는 +3하여 알파벳/숫자 범위 내에서 순환합니다.",
      "출력문의 '변환된 문자열 : ' 서식을 준수하여 작성하세요.",
    ],
    keywords: ["C언어", "ctype", "시저암호", "문자변환", "모듈로연산"],
  },
  14: {
    subject: "소프트웨어설계",
    category: "애플리케이션 테스트",
    type: "SHORT_ANSWER",
    difficulty: "HARD",
    hints: [
      "개별 조건식이 다른 조건식과 독립적으로 전체 결과에 영향을 미치도록 설계하는 화이트박스 커버리지입니다.",
      "Modified Condition/Decision Coverage의 약어입니다.",
    ],
    keywords: [
      "MC/DC",
      "테스트커버리지",
      "화이트박스테스트",
      "조건결정커버리지",
    ],
  },
  15: {
    subject: "신기술/보안",
    category: "시스템 보안 위협",
    type: "SHORT_ANSWER",
    difficulty: "EASY",
    hints: [
      "시스템 침입 후 최고 관리자 권한을 획득하고 백도어를 설치하며, 프로세스와 명령어를 은폐하는 악성코드 모음입니다.",
      "루트(Root) 권한을 가로채는 도구 모음(Kit)이라는 의미의 용어입니다.",
    ],
    keywords: ["Rootkit", "루트킷", "은닉", "백도어", "관리자권한"],
  },
  16: {
    subject: "신기술/보안",
    category: "정보보안 공격 기법",
    type: "SHORT_ANSWER",
    difficulty: "EASY",
    hints: [
      "특정 대상을 명확히 목표로 정하고 은밀하게 지속적으로 침투하는 공격입니다.",
      "침투 -> 검색 -> 수집 -> 유출의 4단계를 거치는 지능형 지속 위협입니다.",
    ],
    keywords: ["APT", "지능형지속위협", "표적공격", "사이버보안"],
  },
  17: {
    subject: "데이터베이스구축",
    category: "SQL 응용",
    type: "SQL",
    language: "SQL",
    difficulty: "MEDIUM",
    hints: [
      "SQL 논리 연산자의 우선순위는 NOT > AND > OR 순서입니다.",
      "따라서 (EMPNO > 100 AND SAL >= 3000) OR EMPNO = 200 조건으로 묶여 평가됩니다.",
    ],
    keywords: ["SQL", "COUNT", "논리연산자우선순위", "AND", "OR"],
  },
  18: {
    subject: "프로그래밍언어활용",
    category: "Java 프로그래밍",
    type: "CODE_TRACE",
    language: "JAVA",
    difficulty: "MEDIUM",
    hints: [
      "st 객체의 실제 런타임 인스턴스는 secondArea 클래스입니다.",
      "다형성에 의해 자식 클래스에서 오버라이딩된 print() 메서드가 실행됩니다.",
    ],
    keywords: ["Java", "메서드오버라이딩", "다형성", "상속", "동적바인딩"],
  },
};

function formatQuestionText(q: any): string {
  let text = q.questionText.trim();

  // If there are tables, format and append
  if (q.tables && q.tables.length > 0) {
    for (const t of q.tables) {
      const header = `| ${t.columns.join(" | ")} |`;
      const sep = `| ${t.columns.map(() => "---").join(" | ")} |`;
      const rows = t.rows
        .map((r: string[]) => `| ${r.join(" | ")} |`)
        .join("\n");
      text += `\n\n[${t.name}]\n${header}\n${sep}\n${rows}`;
    }
  }

  // If there are options and options are not already in text:
  if (q.options && q.options.length > 0 && !text.includes(q.options[0])) {
    const isNumbered =
      q.options[0].startsWith("①") || q.options[0].startsWith("1.");
    const optionsText = isNumbered
      ? q.options.join("\n")
      : q.options.join(", ");
    text += `\n\n<보기>\n${optionsText}`;
  }

  return text;
}

function parseYearRound(filePath: string, data: any): { year: number; round: number } {
  const baseMatch = path.basename(filePath).match(/(\d{4})[_-](\d{1,2})/);
  if (baseMatch) {
    return { year: parseInt(baseMatch[1], 10), round: parseInt(baseMatch[2], 10) };
  }
  const dirMatch = path.dirname(filePath).match(/(\d{4})[_-](\d{1,2})/);
  if (dirMatch) {
    return { year: parseInt(dirMatch[1], 10), round: parseInt(dirMatch[2], 10) };
  }
  if (data?.examYear && data?.examRound) {
    return { year: Number(data.examYear), round: Number(data.examRound) };
  }
  if (Array.isArray(data?.questions) && data.questions[0]?.examYear && data.questions[0]?.examRound) {
    return { year: Number(data.questions[0].examYear), round: Number(data.questions[0].examRound) };
  }
  return { year: 2024, round: 1 };
}

function findTranscribedFiles(target?: string): string[] {
  if (target) {
    const resolved = resolveSeedsPath(target);
    if (fs.existsSync(resolved)) {
      if (fs.statSync(resolved).isDirectory()) {
        const files = fs.readdirSync(resolved).filter((f) => f.endsWith(".transcribed.json"));
        return files.map((f) => path.join(resolved, f));
      }
      return [resolved];
    }
    // Check if target is like "2024-02"
    const subCandidate = resolveSeedsPath(path.join("seeds/real-exams", target, `${target}.transcribed.json`));
    if (fs.existsSync(subCandidate)) {
      return [subCandidate];
    }
    const dirCandidate = resolveSeedsPath(path.join("seeds/real-exams", target));
    if (fs.existsSync(dirCandidate) && fs.statSync(dirCandidate).isDirectory()) {
      const files = fs.readdirSync(dirCandidate).filter((f) => f.endsWith(".transcribed.json"));
      return files.map((f) => path.join(dirCandidate, f));
    }
  }

  // Scan all seeds/real-exams subdirectories
  const baseDir = resolveSeedsPath("seeds/real-exams");
  if (!fs.existsSync(baseDir)) return [];

  const found: string[] = [];
  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const subDir = path.join(baseDir, entry.name);
      const subFiles = fs.readdirSync(subDir).filter((f) => f.endsWith(".transcribed.json"));
      for (const sf of subFiles) {
        found.push(path.join(subDir, sf));
      }
    } else if (entry.isFile() && entry.name.endsWith(".transcribed.json")) {
      found.push(path.join(baseDir, entry.name));
    }
  }
  return found.sort();
}

export function buildCleanQuestions(seedsPath: string): Question[] {
  if (!fs.existsSync(seedsPath)) {
    throw new Error(`Seeds file not found: ${seedsPath}`);
  }

  const raw = fs.readFileSync(seedsPath, "utf8");
  const data = JSON.parse(raw);
  const rawQuestions = data.questions;

  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
    throw new Error(
      `Expected non-empty questions array in seeds, found: ${rawQuestions?.length}`,
    );
  }

  const { year, round } = parseYearRound(seedsPath, data);
  const is2024_01 = year === 2024 && round === 1;
  const questions: Question[] = [];

  for (const q of rawQuestions) {
    const num = q.questionNumber;
    const meta = is2024_01 ? METADATA_MAP[num] : undefined;

    const padRound = String(round).padStart(2, "0");
    const padNum = String(num).padStart(2, "0");
    const id = q.id && q.id.startsWith("q_") ? q.id : `q_${year}_${padRound}_${padNum}`;
    const questionCode = q.questionCode || `Q-${year}-${padRound}-${padNum}`;

    let groundTruthAnswer: string | string[] = q.groundTruthAnswer || q.answer || "";
    if (is2024_01) {
      if (num === 7) {
        groundTruthAnswer = ["6", "6"];
      } else if (num === 9) {
        groundTruthAnswer = ["세타 조인", "동등 조인", "자연 조인"];
      } else if (num === 12) {
        groundTruthAnswer = ["B", "a", "b"];
      }
    }

    const questionText = formatQuestionText(q);

    const question: Question = {
      id,
      questionCode,
      sourceType: "REAL_EXAM",
      examYear: is2024_01 ? 2024 : (q.examYear || year),
      examRound: is2024_01 ? 1 : (q.examRound || round),
      questionNumber: num,
      parentQuestionId: undefined,
      conceptId: is2024_01 ? CONCEPT_MAP[num] : q.conceptId,
      subject: is2024_01 ? meta!.subject : (q.subject || "프로그래밍언어활용"),
      category: is2024_01 ? meta!.category : (q.category || (q.language ? `${q.language} 프로그래밍` : "기출이론")),
      type: is2024_01 ? meta!.type : (q.type || q.questionType || (q.code ? "CODE_TRACE" : (q.language === "SQL" ? "SQL" : "SHORT_ANSWER"))),
      question: questionText,
      code: q.code || q.codeSnippet || undefined,
      language: is2024_01 ? meta!.language : q.language,
      options: q.options && q.options.length > 0 ? q.options : undefined,
      groundTruthAnswer,
      officialExplanation: q.officialExplanation || q.explanation || undefined,
      hints: is2024_01 ? meta!.hints : (q.hints || []),
      difficulty: is2024_01 ? meta!.difficulty : (q.difficulty || "MEDIUM"),
      keywords: is2024_01 ? meta!.keywords : (q.keywords || q.relatedKeywords || []),
      studyVisibility: "LIVE",
      createdAt: is2024_01 ? "2024-05-01T00:00:00.000Z" : (q.createdAt || `${year}-05-01T00:00:00.000Z`),
      updatedAt: new Date().toISOString(),
    };

    questions.push(question);
  }

  return questions;
}

export const buildClean2024_01Questions = buildCleanQuestions;

export function ingestCleanDatabase(options: CleanIngestOptions = {}): {
  insertedCount: number;
  totalCount: number;
  dbPath: string;
} {
  const defaultDbPath = env.DATABASE_PATH;
  const dbPath = options.dbPath || defaultDbPath;

  console.log(`[Ingest] Target database: ${dbPath}`);

  // Set path override
  setDatabasePathOverride(dbPath);

  // 1. Run migrations
  console.log("[Ingest] Running migrations...");
  const migResult = runMigrations();
  console.log(
    `[Ingest] Migrations applied: ${migResult.appliedCount}/${migResult.totalMigrations}`,
  );

  // 2. Seed initial concepts
  console.log("[Ingest] Seeding concepts...");
  const customDb = getDatabase();
  const conceptRepo = new ConceptRepository(customDb);
  const conceptResult = conceptRepo.seedInitialConcepts();
  console.log(
    `[Ingest] Concepts seeded: ${conceptResult.inserted} inserted, total ${conceptResult.total}`,
  );

  // 3. Find files to process
  const filesToProcess = findTranscribedFiles(options.seedsPath);
  console.log(`[Ingest] Found ${filesToProcess.length} transcribed file(s) to process`);

  // 4. Insert into database
  const questionRepo = new QuestionRepository(customDb);
  let insertedCount = 0;

  for (const seedsPath of filesToProcess) {
    console.log(`[Ingest] Parsing transcribed questions: ${seedsPath}`);
    const questions = buildCleanQuestions(seedsPath);

    const tx = customDb.transaction(() => {
      for (const q of questions) {
        const existing = questionRepo.findById(q.id);
        if (existing) {
          questionRepo.update(q.id, q);
        } else {
          questionRepo.create(q);
        }
        insertedCount++;
      }
    });

    tx();
  }

  const totalCount = questionRepo.count();
  console.log(
    `[Ingest] Ingestion complete. Inserted/updated: ${insertedCount}, Total questions in DB: ${totalCount}`,
  );

  // Reset override only if custom dbPath was not specified
  if (!options.dbPath) {
    setDatabasePathOverride(null);
  }

  return {
    insertedCount,
    totalCount,
    dbPath,
  };
}

if (process.argv[1]?.includes("ingest2024_01_clean")) {
  try {
    const targetArg = process.argv.slice(2).find((arg) => !arg.startsWith("-"));
    const res = ingestCleanDatabase({ seedsPath: targetArg });
    console.log(`Finished successfully: ${JSON.stringify(res, null, 2)}`);
  } catch (err) {
    console.error("Ingest error:", err);
    process.exit(1);
  }
}
