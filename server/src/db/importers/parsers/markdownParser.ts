import { RawImportQuestion } from "../types";
import { QuestionSourceType } from "@jungcheogi/shared";

/**
 * 정형화된 마크다운 텍스트로부터 문제 목록을 추출하는 파서
 *
 * [예시 마크다운 구조]:
 * ```markdown
 * ### [문제 1] 단답형
 * - 과목: 소프트웨어설계
 * - 카테고리: 디자인 패턴
 * - 기출: 2024년 1회 1번
 * - 난이도: MEDIUM
 *
 * 복합 객체의 생성 과정과 표현 방법을 분리하여... 패턴은 무엇인가?
 *
 * **정답**: 빌더
 * **해설**: GoF 생성 패턴 중 하나입니다.
 * **키워드**: 빌더, Builder, 디자인패턴
 * ```
 */
export function parseMarkdownQuestions(
  markdownContent: string,
  defaultSourceType: QuestionSourceType = "USER_IMPORTED",
): RawImportQuestion[] {
  if (!markdownContent || !markdownContent.trim()) {
    throw new Error("마크다운 내용이 비어있습니다.");
  }

  // 문항 단위 분할: '---' 또는 '### [문제' 또는 '### 문제' 또는 '## 문제'
  const rawSections = markdownContent
    .split(/\n(?=(?:---|\#{2,3}\s*\[?문제|\#{2,3}\s*Q\d+))/i)
    .map((s) => s.trim())
    .filter(Boolean);

  const results: RawImportQuestion[] = [];

  for (let i = 0; i < rawSections.length; i++) {
    const section = rawSections[i];
    // 제목 라인이나 분리선만 있는 경우 스킵
    if (section === "---" || /^#[^#\n]+$/.test(section)) {
      continue;
    }

    const item = parseSingleMarkdownSection(section, defaultSourceType);
    if (item.questionText || item.extractedAnswer) {
      results.push(item);
    }
  }

  if (results.length === 0) {
    // 단일 문제 전체 파싱 시도
    const single = parseSingleMarkdownSection(
      markdownContent,
      defaultSourceType,
    );
    if (single.questionText || single.extractedAnswer) {
      results.push(single);
    }
  }

  return results;
}

function parseSingleMarkdownSection(
  section: string,
  defaultSourceType: QuestionSourceType,
): RawImportQuestion {
  const lines = section.split("\n");
  let subject: string | undefined;
  let category: string | undefined;
  let subCategory: string | undefined;
  let difficulty: string = "MEDIUM";
  let type: string = "SHORT_ANSWER";
  let sourceType: QuestionSourceType = defaultSourceType;
  let examYear: number | undefined;
  let examRound: number | undefined;
  let questionNumber: number | undefined;
  let parentQuestionId: string | undefined;
  let conceptId: string | undefined;

  let extractedAnswer: string | string[] = "";
  let extractedExplanation: string | undefined;
  let aiExplanation: string | undefined;
  let aiVariationNotes: string | undefined;
  let keywords: string[] = [];

  let codeSnippet: string | undefined;
  let codeLanguage: string | undefined;

  // 1. 코드 블록 추출 (```lang ... ```)
  const codeRegex = /```(\w+)?\r?\n([\s\S]*?)```/g;
  let codeMatch = codeRegex.exec(section);
  if (codeMatch) {
    codeLanguage = (codeMatch[1] || "CODE").toUpperCase();
    codeSnippet = codeMatch[2].trimEnd();
  }

  // 코드 블록을 임시 치환하여 지문 파싱 간섭 방지
  const textWithoutCode = section.replace(codeRegex, "[[CODE_BLOCK]]");

  const contentLines: string[] = [];

  for (const line of textWithoutCode.split("\n")) {
    const trimmed = line.trim();

    // 헤더/분리선 스킵
    if (
      trimmed.startsWith("---") ||
      trimmed.startsWith("###") ||
      trimmed.startsWith("##")
    ) {
      // 헤더에서 유형 힌트 추출: e.g. "### [문제 1] 단답형"
      if (/코드|CODE/i.test(trimmed)) type = "CODE_TRACE";
      else if (/SQL/i.test(trimmed)) type = "SQL";
      else if (/단답|서술/i.test(trimmed)) type = "SHORT_ANSWER";
      continue;
    }

    // 메타데이터 행 처리
    const metaMatch = trimmed.match(
      /^[-*•]?\s*([가-힣a-zA-Z\s]+)[:：]\s*(.*)$/,
    );
    if (metaMatch) {
      const key = metaMatch[1].replace(/\s+/g, "");
      const val = metaMatch[2].trim();

      if (/과목|subject/i.test(key)) {
        subject = val;
        continue;
      }
      if (/카테고리|단원|category/i.test(key)) {
        category = val;
        continue;
      }
      if (/소분류|subCategory/i.test(key)) {
        subCategory = val;
        continue;
      }
      if (/난이도|difficulty/i.test(key)) {
        const upper = val.toUpperCase();
        if (upper.includes("상") || upper.includes("HARD")) difficulty = "HARD";
        else if (upper.includes("하") || upper.includes("EASY"))
          difficulty = "EASY";
        else difficulty = "MEDIUM";
        continue;
      }
      if (/유형|type/i.test(key)) {
        if (/코드/i.test(val)) type = "CODE_TRACE";
        else if (/SQL/i.test(val)) type = "SQL";
        else type = "SHORT_ANSWER";
        continue;
      }
      if (/출처|source/i.test(key)) {
        const up = val.toUpperCase();
        if (up.includes("REAL") || up.includes("기출"))
          sourceType = "REAL_EXAM";
        else if (up.includes("FIXTURE") || up.includes("테스트"))
          sourceType = "TEST_FIXTURE";
        else if (up.includes("TEXTBOOK") || up.includes("교재"))
          sourceType = "TEXTBOOK";
        else if (up.includes("VARIATION") || up.includes("변형"))
          sourceType = "AI_VARIATION";
        else sourceType = "USER_IMPORTED";
        continue;
      }
      if (/기출|회차/i.test(key)) {
        const yearM = val.match(/(\d{4})년?/);
        const roundM = val.match(/(\d+)회/);
        const numM = val.match(/(\d+)번/);
        if (yearM) examYear = Number(yearM[1]);
        if (roundM) examRound = Number(roundM[1]);
        if (numM) questionNumber = Number(numM[1]);
        continue;
      }
      if (/부모문항|원문항|parentQuestionId/i.test(key)) {
        parentQuestionId = val;
        sourceType = "AI_VARIATION";
        continue;
      }
      if (/개념|concept/i.test(key)) {
        conceptId = val;
        continue;
      }
    }

    // 정답 행 처리 (**정답**: ...)
    const ansMatch = trimmed.match(
      /^\*{0,2}\[?(?:정답|답안|GroundTruth)\]?\*{0,2}[:：]\s*(.*)$/i,
    );
    if (ansMatch) {
      const rawAns = ansMatch[1].replace(/^\*{0,2}|\*{0,2}$/g, "").trim();
      // 복수 키워드 여부 (쉼표 또는 1), 2) 구분)
      if (
        rawAns.includes(";") ||
        (rawAns.includes(",") && !rawAns.includes("("))
      ) {
        extractedAnswer = rawAns
          .split(/[,;]+/)
          .map((s) => s.trim())
          .filter(Boolean);
      } else if (/\(1\)|①|1\)/.test(rawAns)) {
        extractedAnswer = rawAns
          .split(/(?:\(\d+\)|[①-⑩]|\d+\))\s*/)
          .map((s) => s.trim())
          .filter(Boolean);
      } else {
        extractedAnswer = rawAns;
      }
      continue;
    }

    // 해설 행 처리 (**해설**: ...)
    const expMatch = trimmed.match(
      /^\*{0,2}\[?(?:공식해설|해설|설명)\]?\*{0,2}[:：]\s*(.*)$/i,
    );
    if (expMatch) {
      extractedExplanation = expMatch[1]
        .replace(/^\*{0,2}|\*{0,2}$/g, "")
        .trim();
      continue;
    }

    // AI 보조 해설
    const aiExpMatch = trimmed.match(
      /^\*{0,2}\[?(?:AI해설|AI보조해설)\]?\*{0,2}[:：]\s*(.*)$/i,
    );
    if (aiExpMatch) {
      aiExplanation = aiExpMatch[1].replace(/^\*{0,2}|\*{0,2}$/g, "").trim();
      continue;
    }

    // 변형 메모
    const varNotesMatch = trimmed.match(
      /^\*{0,2}\[?(?:변형메모|출제포인트)\]?\*{0,2}[:：]\s*(.*)$/i,
    );
    if (varNotesMatch) {
      aiVariationNotes = varNotesMatch[1]
        .replace(/^\*{0,2}|\*{0,2}$/g, "")
        .trim();
      continue;
    }

    // 키워드 (**키워드**: ...)
    const kwMatch = trimmed.match(
      /^\*{0,2}\[?(?:키워드|태그)\]?\*{0,2}[:：]\s*(.*)$/i,
    );
    if (kwMatch) {
      keywords = kwMatch[1]
        .split(/[,#\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      continue;
    }

    // 일반 지문 라인
    contentLines.push(line);
  }

  // questionText 재구성
  let questionText = contentLines.join("\n").trim();
  // [[CODE_BLOCK]] 마커 제거 (지문 텍스트 내 잔존 방지)
  questionText = questionText.replace("[[CODE_BLOCK]]", "").trim();

  // 지문이 없고 코드만 있을 경우 기본 텍스트
  if (!questionText && codeSnippet) {
    questionText = "다음 프로그램의 실행 결과를 작성하시오.";
  }

  return {
    sourceType,
    examYear,
    examRound,
    questionNumber,
    parentQuestionId,
    conceptId,
    subject: subject || "소프트웨어설계",
    category: category || "일반",
    subCategory,
    type: (type as any) || (codeSnippet ? "CODE_TRACE" : "SHORT_ANSWER"),
    questionText,
    codeSnippet,
    codeLanguage,
    extractedAnswer,
    extractedExplanation,
    aiExplanation,
    aiVariationNotes,
    difficulty,
    keywords,
  };
}
