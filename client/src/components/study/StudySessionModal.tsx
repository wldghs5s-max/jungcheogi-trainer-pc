import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Play,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  ArrowRight,
  RotateCcw,
  Trophy,
  Lightbulb,
  Sparkles,
  BookOpen,
  Award,
  Check,
  Copy,
  Flame,
  Brain,
  Code2,
  Cpu,
  Zap,
  RefreshCw,
} from "lucide-react";
import {
  Question,
  StudySession,
  SessionSubmitResponse,
  SessionSummaryResponse,
  Subject,
  SUBJECT_LIST,
  QUESTION_SOURCE_LABELS,
  AITutoringExplanationResponse,
  AICodeLineResponse,
  VariationType,
} from "@jungcheogi/shared";
import {
  createStudySession,
  submitSessionAnswer,
  submitSessionUnknown,
  fetchSessionSummary,
  fetchStudySession,
} from "../../api/sessions";
import {
  fetchAIExplanation,
  fetchAIProgressiveHints,
  fetchAICodeLine,
  generateAIVariation,
} from "../../api/ai";

interface StudySessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSubject?: Subject | "";
  initialSessionData?: {
    session: StudySession;
    firstQuestion: Question;
  } | null;
}

export const StudySessionModal: React.FC<StudySessionModalProps> = ({
  isOpen,
  onClose,
  initialSubject = "",
  initialSessionData = null,
}) => {
  // Session Lifecycle: 'CONFIG' | 'PRACTICE' | 'SUMMARY'
  const [phase, setPhase] = useState<"CONFIG" | "PRACTICE" | "SUMMARY">(
    "CONFIG",
  );

  // Config State
  const [selectedSubject, setSelectedSubject] = useState<Subject | "">(
    initialSubject,
  );
  const [questionCount, setQuestionCount] = useState<number>(5);
  const [sessionTitle, setSessionTitle] =
    useState<string>("실기 집중 학습 세션");
  const [isStarting, setIsStarting] = useState<boolean>(false);
  const [configError, setConfigError] = useState<string | null>(null);

  // Active Practice State
  const [session, setSession] = useState<StudySession | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [userInputs, setUserInputs] = useState<string[]>([""]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitResult, setSubmitResult] =
    useState<SessionSubmitResponse | null>(null);
  const [showHint, setShowHint] = useState<boolean>(false);
  const [hintLevel, setHintLevel] = useState<number>(0);
  const [codeCopied, setCodeCopied] = useState<boolean>(false);

  // Phase 8 AI Engine State
  const [aiHints, setAiHints] = useState<string[] | null>(null);
  const [loadingHints, setLoadingHints] = useState<boolean>(false);

  const [codeLineCache, setCodeLineCache] = useState<
    Record<number, AICodeLineResponse>
  >({});
  const [loadingLineNumber, setLoadingLineNumber] = useState<number | null>(
    null,
  );
  const [selectedLineNumber, setSelectedLineNumber] = useState<number | null>(
    null,
  );

  const [aiExplanationData, setAiExplanationData] =
    useState<AITutoringExplanationResponse | null>(null);
  const [loadingAIExplanation, setLoadingAIExplanation] =
    useState<boolean>(false);

  const [showVariationModal, setShowVariationModal] = useState<boolean>(false);
  const [selectedVariationType, setSelectedVariationType] =
    useState<VariationType>("PARAMETER_VARIATION");
  const [generatingVariation, setGeneratingVariation] =
    useState<boolean>(false);
  const [variationSuccessMsg, setVariationSuccessMsg] = useState<string | null>(
    null,
  );

  // Timer State
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Summary State
  const [summary, setSummary] = useState<SessionSummaryResponse | null>(null);
  const [loadingSummary, setLoadingSummary] = useState<boolean>(false);

  // Focus ref for inputs
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  // Reset or initialize on open
  useEffect(() => {
    if (isOpen) {
      if (initialSessionData) {
        setSession(initialSessionData.session);
        setCurrentQuestion(initialSessionData.firstQuestion);
        setPhase("PRACTICE");
      } else {
        setPhase("CONFIG");
        setSelectedSubject(initialSubject);
        setSession(null);
        setCurrentQuestion(null);
      }
      setSubmitResult(null);
      setSummary(null);
      setConfigError(null);
      setHintLevel(0);
      setAiHints(null);
      setCodeLineCache({});
      setSelectedLineNumber(null);
      setAiExplanationData(null);
      setShowVariationModal(false);
      setVariationSuccessMsg(null);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [isOpen, initialSubject, initialSessionData]);

  // Setup inputs whenever currentQuestion changes
  useEffect(() => {
    if (!currentQuestion) return;

    setShowHint(false);
    setHintLevel(0);
    setSubmitResult(null);
    setCodeCopied(false);
    setElapsedSeconds(0);
    setAiHints(null);
    setCodeLineCache({});
    setSelectedLineNumber(null);
    setAiExplanationData(null);
    setShowVariationModal(false);
    setVariationSuccessMsg(null);

    const isMulti = Array.isArray(currentQuestion.groundTruthAnswer);
    const count = isMulti ? currentQuestion.groundTruthAnswer.length : 1;
    setUserInputs(new Array(count).fill(""));

    // Start Question Timer
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    // Auto-focus first input
    setTimeout(() => {
      firstInputRef.current?.focus();
    }, 100);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentQuestion]);

  // Handle session start
  const handleStartSession = async () => {
    setIsStarting(true);
    setConfigError(null);

    const req = {
      title: sessionTitle || "실기 집중 학습 세션",
      subject: selectedSubject ? selectedSubject : undefined,
      count: questionCount,
    };

    const result = await createStudySession(req);
    setIsStarting(false);

    if (result.error || !result.data) {
      setConfigError(result.error || "세션을 생성하지 못했습니다.");
      return;
    }

    setSession(result.data.session);
    setCurrentQuestion(result.data.firstQuestion);
    setPhase("PRACTICE");
  };

  // Handle normal answer submit
  const handleSubmitAnswer = async () => {
    if (!session || !currentQuestion || isSubmitting) return;

    const isMulti = Array.isArray(currentQuestion.groundTruthAnswer);
    const finalAnswer = isMulti ? userInputs : userInputs[0] || "";

    // If multi, verify at least one keyword was entered
    if (isMulti && userInputs.every((val) => !val.trim())) {
      alert(
        "답안을 입력해주세요. 정답을 모를 경우 [모르겠음] 버튼을 눌러주세요.",
      );
      return;
    }
    if (!isMulti && !userInputs[0]?.trim()) {
      alert(
        "답안을 입력해주세요. 정답을 모를 경우 [모르겠음] 버튼을 눌러주세요.",
      );
      return;
    }

    if (timerRef.current) clearInterval(timerRef.current);
    setIsSubmitting(true);

    const timeSpentMs = Math.max(elapsedSeconds * 1000, 1000);
    const res = await submitSessionAnswer(session.id, {
      questionId: currentQuestion.id,
      userAnswer: finalAnswer,
      timeSpentMs,
      hintUsed: showHint || hintLevel > 0,
    });

    setIsSubmitting(false);

    if (res.error || !res.data) {
      alert(res.error || "답안 제출 중 오류가 발생했습니다.");
      return;
    }

    setSubmitResult(res.data);
    setSession((prev) =>
      prev ? { ...prev, ...res.data!.sessionProgress } : null,
    );
    handleLoadAIExplanation(res.data);
  };

  // Handle "모르겠음" quick action
  const handleUnknown = async () => {
    if (!session || !currentQuestion || isSubmitting) return;

    if (timerRef.current) clearInterval(timerRef.current);
    setIsSubmitting(true);

    const timeSpentMs = Math.max(elapsedSeconds * 1000, 1000);
    const res = await submitSessionUnknown(session.id, {
      questionId: currentQuestion.id,
      timeSpentMs,
      hintUsed: showHint || hintLevel > 0,
    });

    setIsSubmitting(false);

    if (res.error || !res.data) {
      alert(res.error || "모르겠음 처리 중 오류가 발생했습니다.");
      return;
    }

    setSubmitResult(res.data);
    setSession((prev) =>
      prev ? { ...prev, ...res.data!.sessionProgress } : null,
    );
    handleLoadAIExplanation(res.data);
  };

  // Phase 8: Progressive 3-step AI hints
  const activeHints =
    currentQuestion?.hints && currentQuestion.hints.length >= 3
      ? currentQuestion.hints
      : aiHints && aiHints.length >= 3
        ? aiHints
        : [];

  const handleRequestNextHint = async () => {
    if (!currentQuestion) return;
    setShowHint(true);

    if (currentQuestion.hints && currentQuestion.hints.length >= 3) {
      setHintLevel((prev) => Math.min(prev + 1, currentQuestion.hints!.length));
      return;
    }

    if (aiHints && aiHints.length >= 3) {
      setHintLevel((prev) => Math.min(prev + 1, aiHints.length));
      return;
    }

    setLoadingHints(true);
    const res = await fetchAIProgressiveHints({
      questionId: currentQuestion.id,
    });
    setLoadingHints(false);

    if (res.data && res.data.hints) {
      setAiHints(res.data.hints);
      setHintLevel(1);
    } else {
      setHintLevel((prev) => Math.max(prev + 1, 1));
    }
  };

  // Phase 8: Interactive Line-by-line Code Anatomy
  const handleSelectCodeLine = async (lineNum: number) => {
    if (!currentQuestion || !currentQuestion.code) return;
    if (selectedLineNumber === lineNum) {
      setSelectedLineNumber(null);
      return;
    }

    setSelectedLineNumber(lineNum);
    if (codeLineCache[lineNum]) return;

    setLoadingLineNumber(lineNum);
    const res = await fetchAICodeLine({
      questionId: currentQuestion.id,
      lineNumber: lineNum,
    });
    setLoadingLineNumber(null);

    if (res.data) {
      setCodeLineCache((prev) => ({ ...prev, [lineNum]: res.data! }));
    }
  };

  // Phase 8: AI Tutoring Explanation
  const handleLoadAIExplanation = async (
    overrideResult?: SessionSubmitResponse,
    deepAnalysis?: boolean,
  ) => {
    const result = overrideResult || submitResult;
    if (!currentQuestion || !result) return;
    if (aiExplanationData && !deepAnalysis) return;

    setLoadingAIExplanation(true);
    const res = await fetchAIExplanation({
      questionId: currentQuestion.id,
      userAnswer: result.attempt.userAnswer,
      isCorrect: result.isCorrect,
      isUnknown: result.attempt.isUnknown,
      deepAnalysis,
    });
    setLoadingAIExplanation(false);

    if (res.data) {
      setAiExplanationData(res.data);
    }
  };

  // Phase 8: AI Variation Generator
  const handleGenerateVariation = async () => {
    if (!currentQuestion) return;
    setGeneratingVariation(true);
    setVariationSuccessMsg(null);

    const res = await generateAIVariation({
      parentQuestionId: currentQuestion.id,
      variationType: selectedVariationType,
    });
    setGeneratingVariation(false);

    if (res.data) {
      setVariationSuccessMsg(
        `AI 변형 문제가 검수 대기열(Staging)에 안전하게 등록되었습니다! (ID: ${res.data.stagedQuestionId})\n[문제 데이터 등록 및 검수] 모달에서 검수 후 승인하시면 실전 문제로 출제됩니다.`,
      );
    } else {
      alert(res.error || "AI 변형 문제 생성 중 오류가 발생했습니다.");
    }
  };

  // Advance to next question or show summary
  const handleNextQuestion = async () => {
    if (!session) return;

    if (submitResult?.isSessionCompleted) {
      // Load session summary
      setPhase("SUMMARY");
      setLoadingSummary(true);
      const sumResult = await fetchSessionSummary(session.id);
      setLoadingSummary(false);
      if (sumResult.data) {
        setSummary(sumResult.data);
      }
      return;
    }

    // Fetch next question
    const sessionRes = await fetchStudySession(session.id);
    if (sessionRes.data && sessionRes.data.currentQuestion) {
      setSession(sessionRes.data.session);
      setCurrentQuestion(sessionRes.data.currentQuestion);
      setSubmitResult(null);
    } else {
      // If no next question, view summary
      setPhase("SUMMARY");
      setLoadingSummary(true);
      const sumResult = await fetchSessionSummary(session.id);
      setLoadingSummary(false);
      if (sumResult.data) {
        setSummary(sumResult.data);
      }
    }
  };

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen || phase !== "PRACTICE") return;

      if (submitResult) {
        // If feedback is showing, Enter advances to next question
        if (e.key === "Enter") {
          e.preventDefault();
          handleNextQuestion();
        }
      } else {
        // If single input and Enter pressed in non-submit mode
        if (e.key === "Enter" && !e.shiftKey) {
          const isMulti =
            currentQuestion && Array.isArray(currentQuestion.groundTruthAnswer);
          if (!isMulti) {
            e.preventDefault();
            handleSubmitAnswer();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, phase, submitResult, currentQuestion, userInputs]);

  // Copy code snippet helper
  const handleCopyCode = () => {
    if (currentQuestion?.code) {
      navigator.clipboard.writeText(currentQuestion.code);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        {/* TOP BAR */}
        <div style={styles.topBar}>
          <div style={styles.topBarLeft}>
            <span style={styles.sessionBadge}>
              <Flame size={15} color="#F59E0B" />
              <span>PC 집중 학습 모드</span>
            </span>
            <span style={styles.topBarTitle}>
              {session?.title || "실기 문제 풀이 & 스마트 채점"}
            </span>
          </div>

          <div style={styles.topBarRight}>
            {phase === "PRACTICE" && (
              <div style={styles.timerBadge}>
                <Clock size={15} color="#94A3B8" />
                <span>
                  {Math.floor(elapsedSeconds / 60)
                    .toString()
                    .padStart(2, "0")}
                  :{(elapsedSeconds % 60).toString().padStart(2, "0")}
                </span>
              </div>
            )}
            <button
              onClick={() => {
                if (phase === "PRACTICE" && !submitResult?.isSessionCompleted) {
                  if (
                    confirm(
                      "학습 세션을 종료하고 나가시겠습니까? 풀이 기록은 보존됩니다.",
                    )
                  ) {
                    onClose();
                  }
                } else {
                  onClose();
                }
              }}
              style={styles.closeBtn}
              title="닫기"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* PROGRESS BAR (Only in practice mode) */}
        {phase === "PRACTICE" && session && (
          <div style={styles.progressContainer}>
            <div style={styles.progressInfo}>
              <span style={styles.progressText}>
                문항{" "}
                <strong>
                  {Math.min(session.currentIndex + 1, session.totalQuestions)}
                </strong>{" "}
                / {session.totalQuestions}
              </span>
              <div style={styles.scoreTally}>
                <span style={{ color: "var(--color-success)" }}>
                  ✓ 정답 {session.correctCount}
                </span>
                <span style={{ color: "var(--color-danger)" }}>
                  ✕ 오답 {session.wrongCount}
                </span>
                <span style={{ color: "var(--color-warning)" }}>
                  ? 모르겠음 {session.unknownCount}
                </span>
              </div>
            </div>
            <div style={styles.progressBarTrack}>
              <div
                style={{
                  ...styles.progressBarFill,
                  width: `${(session.currentIndex / session.totalQuestions) * 100}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* BODY CONTENT */}
        <div style={styles.bodyContent}>
          {/* ============================================================== */}
          {/* PHASE 1: CONFIGURATION VIEW */}
          {/* ============================================================== */}
          {phase === "CONFIG" && (
            <div style={styles.configContainer}>
              <div style={styles.configHeader}>
                <h2 style={styles.configTitle}>학습 세션 설정</h2>
                <p style={styles.configSubtitle}>
                  집중할 과목과 문항수를 선택하고 스마트 채점 엔진으로 실기
                  문제를 풀이합니다.
                </p>
              </div>

              {configError && (
                <div style={styles.errorAlert}>{configError}</div>
              )}

              <div style={styles.configCard}>
                {/* 1. 세션 제목 */}
                <div style={styles.formGroup}>
                  <label style={styles.label}>세션 명칭</label>
                  <input
                    type="text"
                    value={sessionTitle}
                    onChange={(e) => setSessionTitle(e.target.value)}
                    style={styles.inputField}
                    placeholder="예: 프로그래밍언어 집중 풀이"
                  />
                </div>

                {/* 2. 과목 선택 */}
                <div style={styles.formGroup}>
                  <label style={styles.label}>대상 과목 선택</label>
                  <select
                    value={selectedSubject}
                    onChange={(e) =>
                      setSelectedSubject(e.target.value as Subject | "")
                    }
                    style={styles.selectField}
                  >
                    <option value="">전체 과목 종합 (모의 실기 모드)</option>
                    {SUBJECT_LIST.map((subj) => (
                      <option key={subj} value={subj}>
                        {subj}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 3. 문항수 선택 */}
                <div style={styles.formGroup}>
                  <label style={styles.label}>풀이 문항수</label>
                  <div style={styles.countBtnRow}>
                    {[3, 5, 10, 12].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setQuestionCount(num)}
                        style={{
                          ...styles.countBtn,
                          backgroundColor:
                            questionCount === num
                              ? "var(--color-primary)"
                              : "var(--color-surface)",
                          borderColor:
                            questionCount === num
                              ? "var(--color-primary)"
                              : "var(--color-border)",
                          color:
                            questionCount === num
                              ? "#FFF"
                              : "var(--color-text)",
                        }}
                      >
                        {num}문제
                      </button>
                    ))}
                  </div>
                </div>

                {/* 안내 박스 */}
                <div style={styles.infoCallout}>
                  <Lightbulb
                    size={18}
                    color="#3B82F6"
                    style={{ flexShrink: 0, marginTop: 2 }}
                  />
                  <div style={styles.infoCalloutText}>
                    <strong>학습 팁</strong>
                    <ul>
                      <li>
                        영문/한글 표기 및 공백 차이는 유연하게 자동 채점됩니다.
                      </li>
                      <li>
                        확실하지 않은 문제는 <strong>모르겠음</strong>을 눌러
                        취약 개념으로 집중 복습하세요.
                      </li>
                    </ul>
                  </div>
                </div>

                <div style={styles.configActionRow}>
                  <button
                    type="button"
                    onClick={onClose}
                    style={styles.cancelBtn}
                    disabled={isStarting}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={handleStartSession}
                    style={styles.startBtn}
                    disabled={isStarting}
                  >
                    <Play size={18} />
                    <span>
                      {isStarting ? "세션 생성 중..." : "학습 세션 시작하기"}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* PHASE 2: ACTIVE PRACTICE VIEW */}
          {/* ============================================================== */}
          {phase === "PRACTICE" && currentQuestion && (
            <div style={styles.practiceContainer}>
              {/* QUESTION HEADER BADGES */}
              <div style={styles.qMetaRow}>
                <span style={styles.qSubjectBadge}>
                  {currentQuestion.subject}
                </span>
                <span style={styles.qCategoryBadge}>
                  {currentQuestion.category}
                </span>
                <span style={styles.qTypeBadge}>{currentQuestion.type}</span>
                <span
                  style={{
                    ...styles.qDiffBadge,
                    color:
                      currentQuestion.difficulty === "HARD"
                        ? "var(--color-danger)"
                        : currentQuestion.difficulty === "MEDIUM"
                          ? "var(--color-warning)"
                          : "var(--color-success)",
                  }}
                >
                  난이도: {currentQuestion.difficulty}
                </span>
                <span style={styles.qSourceBadge}>
                  출처:{" "}
                  {QUESTION_SOURCE_LABELS[currentQuestion.sourceType] ||
                    currentQuestion.sourceType}
                </span>
              </div>

              {/* QUESTION STATEMENT */}
              <div style={styles.statementBox}>
                <div style={styles.qIndexIndicator}>
                  Q.{session ? session.currentIndex + 1 : 1}
                </div>
                <div style={styles.qText}>{currentQuestion.question}</div>
              </div>

              {/* CODE BLOCK IF PRESENT */}
              {/* CODE BLOCK IF PRESENT (Phase 8: Line-by-Line Interactive Anatomy) */}
              {currentQuestion.code && (
                <div style={styles.codeContainer}>
                  <div style={styles.codeHeader}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <Code2 size={16} color="#38BDF8" />
                      <span style={styles.codeLangBadge}>
                        {currentQuestion.language || "CODE"}
                      </span>
                      <span style={styles.codeHintText}>
                        • 줄 번호를 클릭하면 AI 메모리/실행 분석을 확인할 수
                        있습니다
                      </span>
                    </div>
                    <button onClick={handleCopyCode} style={styles.copyCodeBtn}>
                      {codeCopied ? (
                        <>
                          <Check size={14} color="#10B981" />
                          <span style={{ color: "#10B981" }}>복사됨</span>
                        </>
                      ) : (
                        <>
                          <Copy size={14} />
                          <span>코드 복사</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Interactive Code Lines */}
                  <div style={styles.codeLinesContainer}>
                    {currentQuestion.code.split("\n").map((lineText, idx) => {
                      const lineNum = idx + 1;
                      const isSelected = selectedLineNumber === lineNum;
                      const lineData = codeLineCache[lineNum];
                      const isLoadingThis = loadingLineNumber === lineNum;

                      return (
                        <React.Fragment key={idx}>
                          <div
                            onClick={() => handleSelectCodeLine(lineNum)}
                            style={{
                              ...styles.codeLineRow,
                              backgroundColor: isSelected
                                ? "rgba(56, 189, 248, 0.12)"
                                : "transparent",
                              cursor: "pointer",
                            }}
                            title={`Line ${lineNum} AI 심층 해부 확인`}
                          >
                            <span
                              style={{
                                ...styles.codeLineNumber,
                                color: isSelected ? "#38BDF8" : "#64748B",
                                fontWeight: isSelected ? 700 : 500,
                              }}
                            >
                              {lineNum}
                            </span>
                            <pre style={styles.codeLineContent}>
                              {lineText || " "}
                            </pre>
                            {isLoadingThis && (
                              <span style={styles.codeLineLoadingTag}>
                                분석 중...
                              </span>
                            )}
                          </div>

                          {/* Inline Anatomy Card */}
                          {isSelected && (
                            <div style={styles.inlineAnatomyCard}>
                              <div style={styles.inlineAnatomyHeader}>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px",
                                    flexWrap: "wrap",
                                  }}
                                >
                                  <Cpu size={15} color="#38BDF8" />
                                  <strong style={{ color: "#38BDF8" }}>
                                    Line {lineNum} AI 심층 해부
                                  </strong>
                                  <code style={styles.inlineLineSnippet}>
                                    {lineText.trim()}
                                  </code>
                                  {lineData?.promotionReason && (
                                    <span
                                      style={{
                                        fontSize: "11px",
                                        color: "#FACC15",
                                        backgroundColor:
                                          "rgba(234, 179, 8, 0.15)",
                                        padding: "1px 6px",
                                        borderRadius: "4px",
                                      }}
                                    >
                                      ⚡ 3.8 승격: {lineData.promotionReason}
                                    </span>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedLineNumber(null);
                                  }}
                                  style={styles.closeInlineBtn}
                                >
                                  ✕
                                </button>
                              </div>

                              {isLoadingThis ? (
                                <div style={styles.inlineLoadingText}>
                                  컴파일러 및 런타임 메모리 상태를 정밀 분석하고
                                  있습니다...
                                </div>
                              ) : lineData ? (
                                <div style={styles.inlineAnatomyBody}>
                                  <div style={styles.anatomyMeaning}>
                                    <strong style={{ color: "#F8FAFC" }}>
                                      ⚡ 런타임/메모리 동작:
                                    </strong>{" "}
                                    <span>{lineData.runtimeMeaning}</span>
                                  </div>
                                  {lineData.syntaxElements &&
                                    lineData.syntaxElements.length > 0 && (
                                      <div style={styles.anatomySyntaxRow}>
                                        <span style={styles.anatomyLabel}>
                                          문법 요소:
                                        </span>
                                        {lineData.syntaxElements.map(
                                          (el, eIdx) => (
                                            <span
                                              key={eIdx}
                                              style={styles.anatomyTag}
                                            >
                                              {el}
                                            </span>
                                          ),
                                        )}
                                      </div>
                                    )}
                                  {lineData.surroundingContext && (
                                    <div style={styles.anatomyContext}>
                                      <strong style={{ color: "#94A3B8" }}>
                                        연계 흐름:
                                      </strong>{" "}
                                      <span>{lineData.surroundingContext}</span>
                                    </div>
                                  )}
                                  {lineData.examTip && (
                                    <div style={styles.anatomyExamTip}>
                                      <strong style={{ color: "#F59E0B" }}>
                                        🎯 출제 함정 & 팁:
                                      </strong>{" "}
                                      <span>{lineData.examTip}</span>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div
                                  style={{ color: "#EF4444", fontSize: "13px" }}
                                >
                                  분석 정보를 불러오지 못했습니다.
                                </div>
                              )}
                            </div>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* PROGRESSIVE HINTS BOX (Phase 8 Active Recall) */}
              <div style={styles.hintContainer}>
                <div
                  style={{ display: "flex", gap: "8px", alignItems: "center" }}
                >
                  <button
                    type="button"
                    onClick={handleRequestNextHint}
                    style={styles.hintToggleBtn}
                    disabled={
                      loadingHints ||
                      (activeHints.length >= 3 && hintLevel >= 3)
                    }
                  >
                    <Lightbulb size={16} color="#F59E0B" />
                    <span>
                      {loadingHints
                        ? "AI 힌트 생성 중..."
                        : hintLevel === 0
                          ? "💡 3단계 점진적 AI 힌트 보기 (1단계)"
                          : hintLevel < 3
                            ? `💡 다음 힌트 추가 확인 (${hintLevel + 1}/3단계)`
                            : "💡 모든 힌트 확인 완료 (3/3단계)"}
                    </span>
                  </button>
                  {hintLevel > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowHint(!showHint)}
                      style={{
                        ...styles.hintToggleBtn,
                        backgroundColor: "transparent",
                        border: "none",
                      }}
                    >
                      <span>{showHint ? "접기" : "펼치기"}</span>
                    </button>
                  )}
                </div>

                {showHint && hintLevel > 0 && activeHints.length > 0 && (
                  <div style={styles.hintBox}>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      {activeHints.slice(0, hintLevel).map((h, i) => (
                        <div key={i} style={styles.progressiveHintItem}>
                          <span style={styles.hintBadge}>Level {i + 1}</span>
                          <span style={styles.hintContentText}>{h}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {showHint &&
                  currentQuestion.keywords &&
                  currentQuestion.keywords.length > 0 &&
                  activeHints.length === 0 && (
                    <div style={styles.hintBox}>
                      <span style={styles.hintLabel}>💡 힌트 키워드:</span>
                      <div style={styles.hintKeywords}>
                        {currentQuestion.keywords.slice(0, 3).map((kw, i) => (
                          <span key={i} style={styles.hintKeywordTag}>
                            #{kw}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
              </div>

              {/* ANSWER INPUT SECTION (When not submitted yet) */}
              {!submitResult && (
                <div style={styles.inputSection}>
                  <div style={styles.inputHeader}>
                    <label style={styles.inputLabel}>
                      {Array.isArray(currentQuestion.groundTruthAnswer)
                        ? `순서대로 정답 키워드 ${currentQuestion.groundTruthAnswer.length}개를 작성하세요`
                        : "정답 키워드 또는 용어를 작성하세요 (Enter 제출)"}
                    </label>
                  </div>

                  {/* Multi or Single Inputs */}
                  <div style={styles.inputsGrid}>
                    {userInputs.map((val, idx) => (
                      <div key={idx} style={styles.singleInputRow}>
                        {userInputs.length > 1 && (
                          <span style={styles.inputNumberBadge}>
                            ({idx + 1})
                          </span>
                        )}
                        <input
                          ref={idx === 0 ? firstInputRef : null}
                          type="text"
                          value={val}
                          onChange={(e) => {
                            const newInputs = [...userInputs];
                            newInputs[idx] = e.target.value;
                            setUserInputs(newInputs);
                          }}
                          placeholder={
                            userInputs.length > 1
                              ? `빈칸 (${idx + 1}) 정답 입력...`
                              : "정답을 입력하세요 (예: 빌더, Builder, GROUP BY 등)"
                          }
                          style={styles.textInput}
                          disabled={isSubmitting}
                          autoComplete="off"
                        />
                      </div>
                    ))}
                  </div>

                  {/* ACTION BUTTONS */}
                  <div style={styles.actionBtnRow}>
                    <button
                      type="button"
                      onClick={handleUnknown}
                      style={styles.unknownBtn}
                      disabled={isSubmitting}
                      title="문제를 전혀 모를 때 누르면 오답과 분리되어 해설을 확인하고 복습에 등록됩니다"
                    >
                      <HelpCircle size={18} />
                      <span>모르겠음</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSubmitAnswer}
                      style={styles.submitBtn}
                      disabled={isSubmitting}
                    >
                      <CheckCircle2 size={18} />
                      <span>
                        {isSubmitting ? "채점 중..." : "답안 제출 (Enter)"}
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {/* ======================================================== */}
              {/* FEEDBACK & GROUND TRUTH / AI EXPLANATIONS (After Submit) */}
              {/* ======================================================== */}
              {submitResult && (
                <div style={styles.feedbackSection}>
                  {/* STATUS BANNER */}
                  <div
                    style={{
                      ...styles.feedbackBanner,
                      backgroundColor: submitResult.attempt.isUnknown
                        ? "rgba(245, 158, 11, 0.15)"
                        : submitResult.isCorrect
                          ? "rgba(16, 185, 129, 0.15)"
                          : submitResult.score > 0
                            ? "rgba(59, 130, 246, 0.15)"
                            : "rgba(239, 68, 68, 0.15)",
                      borderColor: submitResult.attempt.isUnknown
                        ? "var(--color-warning)"
                        : submitResult.isCorrect
                          ? "var(--color-success)"
                          : submitResult.score > 0
                            ? "var(--color-primary)"
                            : "var(--color-danger)",
                    }}
                  >
                    <div style={styles.bannerIconBox}>
                      {submitResult.attempt.isUnknown ? (
                        <HelpCircle size={28} color="var(--color-warning)" />
                      ) : submitResult.isCorrect ? (
                        <CheckCircle2 size={28} color="var(--color-success)" />
                      ) : submitResult.score > 0 ? (
                        <Award size={28} color="var(--color-primary)" />
                      ) : (
                        <XCircle size={28} color="var(--color-danger)" />
                      )}
                    </div>
                    <div style={styles.bannerContent}>
                      <div
                        style={{
                          ...styles.bannerTitle,
                          color: submitResult.attempt.isUnknown
                            ? "var(--color-warning)"
                            : submitResult.isCorrect
                              ? "var(--color-success)"
                              : submitResult.score > 0
                                ? "var(--color-primary)"
                                : "var(--color-danger)",
                        }}
                      >
                        {submitResult.attempt.isUnknown
                          ? "모르겠음 (복습 우선순위 배정)"
                          : submitResult.isCorrect
                            ? "정답입니다! (+1.0점)"
                            : submitResult.score > 0
                              ? `부분 정답 (+${submitResult.score}점)`
                              : "오답입니다 (0점)"}
                      </div>
                      <div style={styles.bannerDesc}>
                        {submitResult.feedback || submitResult.attempt.feedback}
                      </div>
                    </div>
                  </div>

                  {/* USER ANSWER VS GROUND TRUTH COMPARISON */}
                  <div style={styles.compareContainer}>
                    <div style={styles.compareCard}>
                      <span style={styles.compareLabel}>나의 제출 답안</span>
                      <div style={styles.userAnswerVal}>
                        {Array.isArray(submitResult.attempt.userAnswer)
                          ? submitResult.attempt.userAnswer.join(", ") ||
                            "(미입력)"
                          : submitResult.attempt.userAnswer ||
                            "(모르겠음 선택)"}
                      </div>
                    </div>
                    <div
                      style={{
                        ...styles.compareCard,
                        borderColor: "var(--color-success)",
                      }}
                    >
                      <span
                        style={{
                          ...styles.compareLabel,
                          color: "var(--color-success)",
                        }}
                      >
                        기준 정답 (Ground Truth)
                      </span>
                      <div style={styles.groundTruthVal}>
                        {Array.isArray(submitResult.groundTruthAnswer)
                          ? submitResult.groundTruthAnswer.join(", ")
                          : submitResult.groundTruthAnswer}
                      </div>
                    </div>
                  </div>

                  {/* GROUND TRUTH OFFICIAL EXPLANATION (Green/Gold Border) */}
                  {submitResult.officialExplanation && (
                    <div style={styles.groundTruthBox}>
                      <div style={styles.boxTitleRow}>
                        <BookOpen size={18} color="var(--color-success)" />
                        <span style={styles.groundTruthTitle}>
                          공식 검증 해설 (Ground Truth)
                        </span>
                      </div>
                      <p style={styles.explanationText}>
                        {submitResult.officialExplanation}
                      </p>
                    </div>
                  )}

                  {/* AI TUTOR DEEP EXPLANATION (Phase 8) */}
                  <div style={styles.aiTutorContainer}>
                    <div style={styles.aiTutorHeader}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          flexWrap: "wrap",
                        }}
                      >
                        <Sparkles size={18} color="#A855F7" />
                        <span style={styles.aiTutorTitle}>
                          AI 튜터 맞춤 해설
                        </span>
                        {aiExplanationData && (
                          <span style={styles.aiSourceBadge}>
                            {aiExplanationData.modelUsed
                              ? `Gemini (${aiExplanationData.modelUsed})`
                              : aiExplanationData.source === "GEMINI"
                                ? "Gemini 튜터"
                                : "AI 학습 엔진"}
                          </span>
                        )}
                        {aiExplanationData?.promotionReason && (
                          <span
                            style={{
                              ...styles.aiSourceBadge,
                              backgroundColor: "rgba(234, 179, 8, 0.15)",
                              color: "#FACC15",
                              borderColor: "rgba(234, 179, 8, 0.3)",
                            }}
                          >
                            ⚡ 3.8 승격: {aiExplanationData.promotionReason}
                          </span>
                        )}
                      </div>
                      {!aiExplanationData && !loadingAIExplanation && (
                        <button
                          type="button"
                          onClick={() => handleLoadAIExplanation()}
                          style={styles.loadAIBtn}
                        >
                          <Sparkles size={14} />
                          <span>AI 해설 요청하기</span>
                        </button>
                      )}
                      {aiExplanationData &&
                        !aiExplanationData.promotionReason &&
                        !loadingAIExplanation && (
                          <button
                            type="button"
                            onClick={() =>
                              handleLoadAIExplanation(undefined, true)
                            }
                            style={{
                              ...styles.loadAIBtn,
                              backgroundColor: "rgba(234, 179, 8, 0.15)",
                              borderColor: "rgba(234, 179, 8, 0.4)",
                              color: "#FACC15",
                            }}
                            title="C 포인터, 복합 루프, 다형성 등 고난도 추론이 필요할 때 3.8 Flash 모델로 승격하여 심층 분석합니다"
                          >
                            <Sparkles size={14} />
                            <span>더 자세히 (3.8 심층 분석)</span>
                          </button>
                        )}
                    </div>

                    {loadingAIExplanation && (
                      <div style={styles.aiLoadingBox}>
                        <RefreshCw size={18} color="#A855F7" />
                        <span>
                          AI가 학생의 답안과 오답 원인을 정밀 분석하고
                          있습니다...
                        </span>
                      </div>
                    )}

                    {aiExplanationData && (
                      <div style={styles.aiTutorContent}>
                        {(aiExplanationData.conflictStatus === "CONFLICT" ||
                          aiExplanationData.conflictReport?.status === "CONFLICT") && (
                          <div style={styles.aiConflictBox}>
                            <strong
                              style={{
                                color: "#F59E0B",
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                                fontSize: "14px",
                              }}
                            >
                              ⚠️ Ground Truth & 코드 계산 결과 불일치 경고
                            </strong>
                            <p
                              style={{
                                margin: "6px 0 0 0",
                                color: "#FEF3C7",
                                fontSize: "13px",
                                lineHeight: "1.6",
                              }}
                            >
                              {aiExplanationData.conflictReport?.message ||
                                `저장된 정답(${aiExplanationData.conflictReport?.groundTruthAnswer || ""})과 코드 계산 결과(${aiExplanationData.conflictReport?.calculatedAnswer || ""})가 일치하지 않습니다. 현재 코드 기준 계산 결과는 ${aiExplanationData.conflictReport?.calculatedAnswer || ""}입니다. 원문 정답/해설을 확인해주세요.`}
                            </p>
                          </div>
                        )}

                        <div style={styles.aiSummaryBadge}>
                          📌 {aiExplanationData.summary}
                        </div>

                        {aiExplanationData.whyWrong && (
                          <div style={styles.aiWhyWrongBox}>
                            <strong style={{ color: "#F87171" }}>
                              🔍 오답 & 풀이 진단:
                            </strong>
                            <p style={styles.aiSectionText}>
                              {aiExplanationData.whyWrong}
                            </p>
                          </div>
                        )}

                        <div style={styles.aiKeyPointBox}>
                          <strong style={{ color: "#60A5FA" }}>
                            💡 핵심 개념 및 공식 정답 성립 원리:
                          </strong>
                          <p style={styles.aiSectionText}>
                            {aiExplanationData.keyPoint}
                          </p>
                        </div>

                        {aiExplanationData.codeTrace && (
                          <div style={styles.aiCodeTraceBox}>
                            <strong style={{ color: "#38BDF8" }}>
                              ⚙️ 코드 실행 및 변수 상태 추적:
                            </strong>
                            <pre style={styles.codeTracePre}>
                              {aiExplanationData.codeTrace}
                            </pre>
                          </div>
                        )}

                        {aiExplanationData.pitfalls && (
                          <div style={styles.aiPitfallsBox}>
                            <strong style={{ color: "#FBBF24" }}>
                              ⚠️ 시험장 함정 포인트 (Trap):
                            </strong>
                            <p style={styles.aiSectionText}>
                              {aiExplanationData.pitfalls}
                            </p>
                          </div>
                        )}

                        {aiExplanationData.studyTips && (
                          <div style={styles.aiStudyTipsBox}>
                            <strong style={{ color: "#34D399" }}>
                              📝 실기 시험 대비 핵심 암기 팁:
                            </strong>
                            <p style={styles.aiSectionText}>
                              {aiExplanationData.studyTips}
                            </p>
                          </div>
                        )}

                        {/* AI VARIATION TRIGGER BUTTON */}
                        <div style={styles.variationRow}>
                          <button
                            type="button"
                            onClick={() => setShowVariationModal(true)}
                            style={styles.variationBtn}
                          >
                            <Zap size={16} color="#F59E0B" />
                            <span>
                              이 문제의 AI 변형 문제 생성 (Staging 대기열)
                            </span>
                          </button>
                        </div>

                        {variationSuccessMsg && (
                          <div style={styles.variationSuccessAlert}>
                            <CheckCircle2 size={18} color="#10B981" />
                            <span style={{ whiteSpace: "pre-line" }}>
                              {variationSuccessMsg}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Fallback to simple aiExplanation if not yet loaded via deep tutor */}
                    {!aiExplanationData &&
                      !loadingAIExplanation &&
                      submitResult.aiExplanation && (
                        <div style={{ marginTop: "10px" }}>
                          <p style={styles.explanationText}>
                            {submitResult.aiExplanation}
                          </p>
                        </div>
                      )}

                    {/* Variation Notes if parent question exists */}
                    {currentQuestion.aiVariationNotes && (
                      <div style={styles.variationNoteBox}>
                        <strong>🌱 기출 변형 출제 포인트:</strong>{" "}
                        {currentQuestion.aiVariationNotes}
                      </div>
                    )}
                  </div>

                  {/* ACTIVE RECALL REVIEW STATE CARD (Phase 5) */}
                  {submitResult.reviewState && (
                    <div style={styles.reviewStateCard}>
                      <div style={styles.reviewStateHeader}>
                        <Brain size={18} color="#818CF8" />
                        <span style={styles.reviewStateTitle}>
                          복습 주기 업데이트
                        </span>
                        <span style={styles.reviewStateBadge}>
                          {submitResult.reviewState.reviewState}
                        </span>
                      </div>
                      <div style={styles.reviewStateGrid}>
                        <div style={styles.reviewStateItem}>
                          <span style={styles.reviewStateItemLabel}>
                            암기/숙련 단계
                          </span>
                          <span style={styles.reviewStateItemValue}>
                            {submitResult.reviewState.boxLevel}단계 (총 5단계)
                          </span>
                        </div>
                        <div style={styles.reviewStateItem}>
                          <span style={styles.reviewStateItemLabel}>
                            다음 권장 복습
                          </span>
                          <span style={styles.reviewStateItemValue}>
                            {submitResult.reviewState.intervalDays}일 뒤
                          </span>
                        </div>
                        <div style={styles.reviewStateItem}>
                          <span style={styles.reviewStateItemLabel}>
                            개념 취약도 지수
                          </span>
                          <span
                            style={{
                              ...styles.reviewStateItemValue,
                              color:
                                submitResult.reviewState.weaknessScore >= 0.7
                                  ? "#EF4444"
                                  : submitResult.reviewState.weaknessScore >=
                                      0.4
                                    ? "#F59E0B"
                                    : "#10B981",
                            }}
                          >
                            {Math.round(
                              submitResult.reviewState.weaknessScore * 100,
                            )}
                            %
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ADVANCE TO NEXT QUESTION BUTTON */}
                  <div style={styles.nextActionRow}>
                    <button onClick={handleNextQuestion} style={styles.nextBtn}>
                      <span>
                        {submitResult.isSessionCompleted
                          ? "세션 완료! 종합 결과 확인 🏆"
                          : "다음 문제로 이동 (Enter / Space) ➔"}
                      </span>
                      <ArrowRight size={18} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* PHASE 3: SESSION SUMMARY VIEW */}
          {/* ============================================================== */}
          {phase === "SUMMARY" && (
            <div style={styles.summaryContainer}>
              {loadingSummary ? (
                <div style={styles.loadingBox}>
                  <p>세션 학습 종합 데이터를 집계하고 있습니다...</p>
                </div>
              ) : summary ? (
                <div>
                  {/* RESULT HERO */}
                  <div style={styles.summaryHero}>
                    <div style={styles.trophyIconBox}>
                      <Trophy size={42} color="#F59E0B" />
                    </div>
                    <h2 style={styles.summaryTitle}>학습 세션 완료!</h2>
                    <p style={styles.summarySubtitle}>
                      총 {summary.session.totalQuestions}문항 중{" "}
                      {summary.session.correctCount}문항을 맞추셨습니다.
                    </p>
                    <div style={styles.accuracyCircle}>
                      <span style={styles.accuracyNumber}>
                        {summary.accuracyRate}%
                      </span>
                      <span style={styles.accuracyLabel}>최종 정답률</span>
                    </div>
                  </div>

                  {/* STATS 4-GRID */}
                  <div style={styles.summaryGrid}>
                    <div style={styles.summaryStatCard}>
                      <span style={styles.statLabel}>정답 문항</span>
                      <span
                        style={{
                          ...styles.statVal,
                          color: "var(--color-success)",
                        }}
                      >
                        {summary.session.correctCount}개
                      </span>
                    </div>
                    <div style={styles.summaryStatCard}>
                      <span style={styles.statLabel}>오답 문항</span>
                      <span
                        style={{
                          ...styles.statVal,
                          color: "var(--color-danger)",
                        }}
                      >
                        {summary.session.wrongCount}개
                      </span>
                    </div>
                    <div style={styles.summaryStatCard}>
                      <span style={styles.statLabel}>모르겠음 (복습 우선)</span>
                      <span
                        style={{
                          ...styles.statVal,
                          color: "var(--color-warning)",
                        }}
                      >
                        {summary.session.unknownCount}개
                      </span>
                    </div>
                    <div style={styles.summaryStatCard}>
                      <span style={styles.statLabel}>평균 풀이 시간</span>
                      <span style={styles.statVal}>
                        {summary.averageTimeSpentSeconds}초/문항
                      </span>
                    </div>
                  </div>

                  {/* QUESTION-BY-QUESTION REVIEW LIST */}
                  <div style={styles.reviewListSection}>
                    <h3 style={styles.reviewListTitle}>
                      세션 문항별 풀이 결과
                    </h3>
                    <div style={styles.reviewCards}>
                      {summary.attempts.map((item, idx) => {
                        const q = summary.questions.find(
                          (x) => x.id === item.questionId,
                        );
                        return (
                          <div
                            key={item.id}
                            style={{
                              ...styles.reviewCard,
                              borderLeftColor: item.isUnknown
                                ? "var(--color-warning)"
                                : item.isCorrect
                                  ? "var(--color-success)"
                                  : "var(--color-danger)",
                            }}
                          >
                            <div style={styles.reviewCardHeader}>
                              <span style={styles.reviewQIndex}>
                                Q.{idx + 1}
                              </span>
                              <span style={styles.reviewQSubj}>
                                {q?.subject || "과목"}
                              </span>
                              <span style={styles.reviewQCat}>
                                {q?.category || "카테고리"}
                              </span>
                              <div style={styles.reviewStatusBadge}>
                                {item.isUnknown ? (
                                  <span
                                    style={{ color: "var(--color-warning)" }}
                                  >
                                    ? 모르겠음
                                  </span>
                                ) : item.isCorrect ? (
                                  <span
                                    style={{ color: "var(--color-success)" }}
                                  >
                                    ✓ 정답
                                  </span>
                                ) : (
                                  <span
                                    style={{ color: "var(--color-danger)" }}
                                  >
                                    ✕ 오답
                                  </span>
                                )}
                              </div>
                            </div>

                            <div style={styles.reviewQText}>
                              {q?.question || "문항 정보"}
                            </div>

                            <div style={styles.reviewAnswersRow}>
                              <div style={styles.reviewAnswerItem}>
                                <span style={styles.reviewAnswerKey}>
                                  나의 답:
                                </span>
                                <span style={styles.reviewAnswerVal}>
                                  {Array.isArray(item.userAnswer)
                                    ? item.userAnswer.join(", ")
                                    : item.userAnswer || "(모르겠음)"}
                                </span>
                              </div>
                              <div style={styles.reviewAnswerItem}>
                                <span
                                  style={{
                                    ...styles.reviewAnswerKey,
                                    color: "var(--color-success)",
                                  }}
                                >
                                  기준 정답:
                                </span>
                                <strong
                                  style={{ color: "var(--color-success)" }}
                                >
                                  {q?.groundTruthAnswer
                                    ? Array.isArray(q.groundTruthAnswer)
                                      ? q.groundTruthAnswer.join(", ")
                                      : q.groundTruthAnswer
                                    : "(정보 없음)"}
                                </strong>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* SUMMARY ACTION BUTTONS */}
                  <div style={styles.summaryActionRow}>
                    <button
                      type="button"
                      onClick={() => setPhase("CONFIG")}
                      style={styles.newSessionBtn}
                    >
                      <RotateCcw size={18} />
                      <span>새 학습 세션 시작</span>
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      style={styles.doneBtn}
                    >
                      <span>문제 브라우저로 돌아가기</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div style={styles.errorAlert}>
                  세션 요약 정보를 불러오지 못했습니다.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Phase 8: AI VARIATION GENERATION MODAL */}
        {showVariationModal && (
          <div style={styles.variationModalOverlay}>
            <div style={styles.variationModalCard}>
              <div style={styles.variationModalHeader}>
                <div
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <Zap size={20} color="#F59E0B" />
                  <h3 style={styles.variationModalTitle}>AI 변형 문제 생성</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowVariationModal(false)}
                  style={styles.closeInlineBtn}
                >
                  ✕
                </button>
              </div>

              <p style={styles.variationModalDesc}>
                기출 문제(#{currentQuestion?.id})를 기반으로 원본의 핵심 개념을
                철저히 유지하면서 다양한 변형 문제를 생성하여 Staging 검수
                대기열에 등록합니다.
              </p>

              <div style={styles.variationTypeGrid}>
                {[
                  {
                    type: "PARAMETER_VARIATION" as VariationType,
                    title: "수치/초기값 변형",
                    desc: "배열 크기, 루프 시작/종료값, 포인터 오프셋 값 변형",
                  },
                  {
                    type: "CODE_VARIATION" as VariationType,
                    title: "코드/구조 변형",
                    desc: "for ↔ while 루프 전환, if 조건 부등호 및 탈출 조건 변경",
                  },
                  {
                    type: "CONCEPT_VARIATION" as VariationType,
                    title: "개념 확장/보완",
                    desc: "동일 범주의 심화 개념 (예: LRU ↔ LFU, 3NF ↔ BCNF)",
                  },
                  {
                    type: "SCENARIO_VARIATION" as VariationType,
                    title: "시나리오/상황 변형",
                    desc: "다른 비즈니스 도메인이나 테이블 스키마 상황으로 변형",
                  },
                  {
                    type: "DIFFICULTY_VARIATION" as VariationType,
                    title: "난이도 심화 변형",
                    desc: "다중 중첩 루프나 복합 포인터 등 심화 변형",
                  },
                ].map((item) => (
                  <div
                    key={item.type}
                    onClick={() => setSelectedVariationType(item.type)}
                    style={{
                      ...styles.variationOptionCard,
                      borderColor:
                        selectedVariationType === item.type
                          ? "#3B82F6"
                          : "#334155",
                      backgroundColor:
                        selectedVariationType === item.type
                          ? "rgba(59, 130, 246, 0.12)"
                          : "rgba(15, 23, 42, 0.6)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <strong
                        style={{
                          color:
                            selectedVariationType === item.type
                              ? "#60A5FA"
                              : "#F8FAFC",
                        }}
                      >
                        {item.title}
                      </strong>
                      <span style={{ fontSize: "11px", color: "#94A3B8" }}>
                        {item.type}
                      </span>
                    </div>
                    <p style={styles.variationOptionDesc}>{item.desc}</p>
                  </div>
                ))}
              </div>

              {variationSuccessMsg && (
                <div style={styles.variationSuccessAlert}>
                  <CheckCircle2 size={18} color="#10B981" />
                  <span style={{ whiteSpace: "pre-line" }}>
                    {variationSuccessMsg}
                  </span>
                </div>
              )}

              <div style={styles.variationModalActionRow}>
                <button
                  type="button"
                  onClick={() => setShowVariationModal(false)}
                  style={styles.cancelBtn}
                >
                  닫기
                </button>
                <button
                  type="button"
                  onClick={handleGenerateVariation}
                  disabled={generatingVariation}
                  style={styles.variationSubmitBtn}
                >
                  <Sparkles size={16} />
                  <span>
                    {generatingVariation
                      ? "변형 문제 생성 및 검증 중..."
                      : "변형 문제 생성 (Staging 등록)"}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// STYLES
// ============================================================================
const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(15, 23, 42, 0.85)",
    backdropFilter: "blur(6px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: "24px",
  },
  modal: {
    backgroundColor: "#0F172A",
    border: "1px solid #334155",
    borderRadius: "16px",
    width: "100%",
    maxWidth: "1000px",
    maxHeight: "92vh",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
    overflow: "hidden",
  },
  topBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 24px",
    backgroundColor: "#1E293B",
    borderBottom: "1px solid #334155",
  },
  topBarLeft: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  sessionBadge: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    color: "#F59E0B",
    fontSize: "12px",
    fontWeight: 600,
    padding: "4px 10px",
    borderRadius: "20px",
  },
  topBarTitle: {
    fontSize: "16px",
    fontWeight: 600,
    color: "#F8FAFC",
  },
  topBarRight: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
  },
  timerBadge: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "14px",
    fontFamily: "monospace",
    fontWeight: 700,
    color: "#E2E8F0",
    backgroundColor: "#0F172A",
    padding: "4px 12px",
    borderRadius: "6px",
    border: "1px solid #334155",
  },
  closeBtn: {
    color: "#94A3B8",
    cursor: "pointer",
    padding: "6px",
    borderRadius: "6px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  progressContainer: {
    padding: "12px 24px 8px 24px",
    backgroundColor: "#1E293B",
    borderBottom: "1px solid #334155",
  },
  progressInfo: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "8px",
    fontSize: "13px",
  },
  progressText: {
    color: "#CBD5E1",
  },
  scoreTally: {
    display: "flex",
    gap: "16px",
    fontSize: "12px",
    fontWeight: 600,
  },
  progressBarTrack: {
    width: "100%",
    height: "6px",
    backgroundColor: "#334155",
    borderRadius: "3px",
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#3B82F6",
    transition: "width 0.3s ease-in-out",
  },
  bodyContent: {
    padding: "28px",
    overflowY: "auto",
    flex: 1,
  },

  // CONFIG STYLES
  configContainer: {
    maxWidth: "650px",
    margin: "0 auto",
  },
  configHeader: {
    textAlign: "center",
    marginBottom: "28px",
  },
  configTitle: {
    fontSize: "24px",
    fontWeight: 700,
    color: "#F8FAFC",
    marginBottom: "8px",
  },
  configSubtitle: {
    fontSize: "14px",
    color: "#94A3B8",
  },
  configCard: {
    backgroundColor: "#1E293B",
    border: "1px solid #334155",
    borderRadius: "12px",
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  formGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  label: {
    fontSize: "13px",
    fontWeight: 600,
    color: "#CBD5E1",
  },
  inputField: {
    backgroundColor: "#0F172A",
    border: "1px solid #334155",
    borderRadius: "8px",
    padding: "10px 14px",
    color: "#F8FAFC",
    fontSize: "14px",
    outline: "none",
  },
  selectField: {
    backgroundColor: "#0F172A",
    border: "1px solid #334155",
    borderRadius: "8px",
    padding: "10px 14px",
    color: "#F8FAFC",
    fontSize: "14px",
    outline: "none",
  },
  countBtnRow: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "10px",
  },
  countBtn: {
    padding: "10px",
    borderRadius: "8px",
    border: "1px solid",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "center",
    transition: "all 0.15s ease",
  },
  infoCallout: {
    backgroundColor: "rgba(59, 130, 246, 0.08)",
    border: "1px solid rgba(59, 130, 246, 0.25)",
    borderRadius: "8px",
    padding: "14px",
    display: "flex",
    gap: "12px",
    fontSize: "13px",
    color: "#CBD5E1",
    lineHeight: "1.6",
  },
  infoCalloutText: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  configActionRow: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "12px",
    marginTop: "12px",
  },
  cancelBtn: {
    padding: "10px 20px",
    borderRadius: "8px",
    backgroundColor: "#334155",
    color: "#F8FAFC",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
  },
  startBtn: {
    padding: "10px 24px",
    borderRadius: "8px",
    backgroundColor: "#3B82F6",
    color: "#FFFFFF",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },

  // PRACTICE STYLES
  practiceContainer: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
    maxWidth: "900px",
    margin: "0 auto",
  },
  qMetaRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  qSubjectBadge: {
    backgroundColor: "rgba(59, 130, 246, 0.15)",
    color: "#3B82F6",
    fontSize: "12px",
    fontWeight: 600,
    padding: "4px 10px",
    borderRadius: "4px",
  },
  qCategoryBadge: {
    backgroundColor: "#334155",
    color: "#E2E8F0",
    fontSize: "12px",
    padding: "4px 8px",
    borderRadius: "4px",
  },
  qTypeBadge: {
    backgroundColor: "#1E293B",
    border: "1px solid #334155",
    color: "#94A3B8",
    fontSize: "11px",
    fontWeight: 600,
    padding: "3px 8px",
    borderRadius: "4px",
  },
  qDiffBadge: {
    fontSize: "12px",
    fontWeight: 600,
  },
  qSourceBadge: {
    fontSize: "11px",
    color: "#94A3B8",
    marginLeft: "auto",
  },
  statementBox: {
    display: "flex",
    gap: "16px",
    backgroundColor: "#1E293B",
    padding: "20px",
    borderRadius: "12px",
    border: "1px solid #334155",
  },
  qIndexIndicator: {
    fontSize: "20px",
    fontWeight: 800,
    color: "#3B82F6",
    flexShrink: 0,
  },
  qText: {
    fontSize: "17px",
    color: "#F8FAFC",
    lineHeight: 1.7,
    whiteSpace: "pre-wrap",
  },
  codeContainer: {
    backgroundColor: "#0A0F1D",
    border: "1px solid #1E293B",
    borderRadius: "8px",
    overflow: "hidden",
  },
  codeHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 14px",
    backgroundColor: "#111827",
    borderBottom: "1px solid #1E293B",
  },
  codeLangBadge: {
    fontSize: "12px",
    fontWeight: 700,
    color: "#38BDF8",
    fontFamily: "monospace",
  },
  copyCodeBtn: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "12px",
    color: "#94A3B8",
    cursor: "pointer",
  },
  codePre: {
    padding: "16px",
    margin: 0,
    fontSize: "14px",
    fontFamily: 'Consolas, Monaco, "Courier New", monospace',
    color: "#E2E8F0",
    lineHeight: 1.6,
    overflowX: "auto",
  },
  codeAnatomyBox: {
    marginTop: "12px",
    borderRadius: "8px",
    backgroundColor: "#0F172A",
    border: "1px solid #1E293B",
    overflow: "hidden",
  },
  codeAnatomyToggleBtn: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "12px 16px",
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    border: "none",
    color: "#93C5FD",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "left",
  },
  codeAnatomyList: {
    padding: "12px 16px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    borderTop: "1px solid #1E293B",
  },
  codeAnatomyItem: {
    padding: "10px 12px",
    borderRadius: "6px",
    border: "1px solid",
    cursor: "pointer",
    transition: "background-color 0.15s",
  },
  codeAnatomyItemHeader: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    marginBottom: "6px",
  },
  codeLineBadge: {
    fontSize: "11px",
    fontWeight: 700,
    padding: "2px 6px",
    borderRadius: "4px",
    backgroundColor: "#1E293B",
    color: "#38BDF8",
    fontFamily: "monospace",
  },
  codeLineText: {
    fontSize: "13px",
    color: "#E2E8F0",
    fontFamily: "Consolas, Monaco, monospace",
  },
  codeExplanationText: {
    fontSize: "13px",
    color: "#94A3B8",
    margin: "0 0 6px 0",
    lineHeight: 1.5,
  },
  traceTag: {
    fontSize: "12px",
    padding: "4px 8px",
    borderRadius: "4px",
    backgroundColor: "rgba(56, 189, 248, 0.1)",
    color: "#38BDF8",
    marginTop: "4px",
    display: "inline-block",
  },
  traceLabel: {
    fontWeight: 700,
  },
  hintContainer: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  hintToggleBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "13px",
    color: "#F59E0B",
    cursor: "pointer",
    alignSelf: "flex-start",
    padding: "4px 8px",
    borderRadius: "4px",
    backgroundColor: "rgba(245, 158, 11, 0.1)",
  },
  hintBox: {
    backgroundColor: "rgba(245, 158, 11, 0.08)",
    border: "1px dashed rgba(245, 158, 11, 0.3)",
    borderRadius: "8px",
    padding: "12px 16px",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    fontSize: "13px",
  },
  progressiveHintItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: "10px",
    padding: "8px 12px",
    backgroundColor: "rgba(245, 158, 11, 0.08)",
    borderRadius: "6px",
    border: "1px solid rgba(245, 158, 11, 0.2)",
  },
  hintBadge: {
    fontSize: "11px",
    fontWeight: 700,
    padding: "2px 6px",
    borderRadius: "4px",
    backgroundColor: "#F59E0B",
    color: "#000000",
    flexShrink: 0,
  },
  hintContentText: {
    fontSize: "13px",
    color: "#F8FAFC",
    lineHeight: 1.5,
  },
  hintLabel: {
    color: "#F59E0B",
    fontWeight: 600,
  },
  hintKeywords: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  },
  hintKeywordTag: {
    backgroundColor: "#1E293B",
    padding: "3px 8px",
    borderRadius: "4px",
    color: "#CBD5E1",
    fontSize: "12px",
  },

  // INPUT SECTION
  inputSection: {
    backgroundColor: "#1E293B",
    border: "1px solid #334155",
    borderRadius: "12px",
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  inputHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  inputLabel: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#94A3B8",
  },
  inputsGrid: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  singleInputRow: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  inputNumberBadge: {
    fontSize: "14px",
    fontWeight: 700,
    color: "#3B82F6",
    width: "28px",
    flexShrink: 0,
  },
  textInput: {
    flex: 1,
    backgroundColor: "#0F172A",
    border: "2px solid #334155",
    borderRadius: "8px",
    padding: "14px 16px",
    color: "#F8FAFC",
    fontSize: "16px",
    fontWeight: 500,
    outline: "none",
    transition: "border-color 0.15s ease",
  },
  actionBtnRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    marginTop: "8px",
  },
  unknownBtn: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "12px 20px",
    borderRadius: "8px",
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    border: "1px solid rgba(245, 158, 11, 0.3)",
    color: "#F59E0B",
    fontSize: "15px",
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  revealBtn: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "12px 20px",
    borderRadius: "8px",
    backgroundColor: "rgba(99, 102, 241, 0.15)",
    border: "1px solid rgba(99, 102, 241, 0.3)",
    color: "#818CF8",
    fontSize: "15px",
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  submitBtn: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "12px 28px",
    borderRadius: "8px",
    backgroundColor: "#3B82F6",
    color: "#FFFFFF",
    fontSize: "15px",
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.15s ease",
  },

  // ACTIVE RECALL REVIEW STATE CARD
  reviewStateCard: {
    backgroundColor: "rgba(99, 102, 241, 0.08)",
    border: "1px solid rgba(99, 102, 241, 0.25)",
    borderRadius: "10px",
    padding: "16px 20px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  reviewStateHeader: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  reviewStateTitle: {
    fontSize: "14px",
    fontWeight: 700,
    color: "#A5B4FC",
  },
  reviewStateBadge: {
    fontSize: "11px",
    fontWeight: 700,
    padding: "2px 8px",
    borderRadius: "4px",
    backgroundColor: "rgba(99, 102, 241, 0.2)",
    color: "#C7D2FE",
    marginLeft: "auto",
  },
  reviewStateGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "12px",
  },
  reviewStateItem: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    padding: "10px 12px",
    borderRadius: "8px",
    border: "1px solid rgba(255, 255, 255, 0.05)",
  },
  reviewStateItemLabel: {
    fontSize: "11px",
    color: "#94A3B8",
  },
  reviewStateItemValue: {
    fontSize: "14px",
    fontWeight: 700,
    color: "#F8FAFC",
  },

  // FEEDBACK SECTION
  feedbackSection: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  feedbackBanner: {
    display: "flex",
    gap: "16px",
    alignItems: "center",
    padding: "18px 24px",
    borderRadius: "12px",
    border: "1.5px solid",
  },
  bannerIconBox: {
    flexShrink: 0,
  },
  bannerContent: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  bannerTitle: {
    fontSize: "18px",
    fontWeight: 700,
  },
  bannerDesc: {
    fontSize: "14px",
    color: "#E2E8F0",
  },
  fuzzyNotice: {
    color: "#38BDF8",
    marginLeft: "8px",
    fontSize: "12px",
  },
  compareContainer: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "16px",
  },
  compareCard: {
    backgroundColor: "#1E293B",
    border: "1px solid #334155",
    borderRadius: "8px",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  compareLabel: {
    fontSize: "12px",
    fontWeight: 600,
    color: "#94A3B8",
  },
  userAnswerVal: {
    fontSize: "16px",
    fontWeight: 600,
    color: "#F8FAFC",
    wordBreak: "break-all",
  },
  groundTruthVal: {
    fontSize: "16px",
    fontWeight: 700,
    color: "var(--color-success)",
    wordBreak: "break-all",
  },
  groundTruthBox: {
    backgroundColor: "rgba(16, 185, 129, 0.05)",
    border: "1px solid rgba(16, 185, 129, 0.3)",
    borderRadius: "10px",
    padding: "18px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  boxTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  groundTruthTitle: {
    fontSize: "14px",
    fontWeight: 700,
    color: "var(--color-success)",
  },
  explanationText: {
    fontSize: "14px",
    color: "#CBD5E1",
    lineHeight: 1.7,
    margin: 0,
  },
  aiBox: {
    backgroundColor: "rgba(168, 85, 247, 0.05)",
    border: "1px solid rgba(168, 85, 247, 0.3)",
    borderRadius: "10px",
    padding: "18px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  aiTitle: {
    fontSize: "14px",
    fontWeight: 700,
    color: "#A855F7",
  },
  aiNoticeBadge: {
    fontSize: "11px",
    color: "#94A3B8",
    marginLeft: "auto",
  },
  variationNoteBox: {
    marginTop: "6px",
    padding: "10px 12px",
    borderRadius: "6px",
    backgroundColor: "rgba(168, 85, 247, 0.1)",
    fontSize: "12px",
    color: "#E9D5FF",
    lineHeight: 1.5,
  },
  nextActionRow: {
    display: "flex",
    justifyContent: "flex-end",
    marginTop: "10px",
  },
  nextBtn: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "14px 32px",
    borderRadius: "8px",
    backgroundColor: "#3B82F6",
    color: "#FFFFFF",
    fontSize: "16px",
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 4px 14px rgba(59, 130, 246, 0.4)",
  },

  // SUMMARY STYLES
  summaryContainer: {
    display: "flex",
    flexDirection: "column",
    gap: "28px",
    maxWidth: "800px",
    margin: "0 auto",
  },
  summaryHero: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    gap: "12px",
    padding: "24px 0",
  },
  trophyIconBox: {
    width: "72px",
    height: "72px",
    borderRadius: "36px",
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "8px",
  },
  summaryTitle: {
    fontSize: "26px",
    fontWeight: 800,
    color: "#F8FAFC",
  },
  summarySubtitle: {
    fontSize: "15px",
    color: "#94A3B8",
  },
  accuracyCircle: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    width: "130px",
    height: "130px",
    borderRadius: "65px",
    backgroundColor: "#1E293B",
    border: "3px solid #3B82F6",
    marginTop: "12px",
  },
  accuracyNumber: {
    fontSize: "32px",
    fontWeight: 800,
    color: "#3B82F6",
  },
  accuracyLabel: {
    fontSize: "12px",
    color: "#94A3B8",
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "14px",
  },
  summaryStatCard: {
    backgroundColor: "#1E293B",
    border: "1px solid #334155",
    borderRadius: "10px",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    textAlign: "center",
  },
  statLabel: {
    fontSize: "12px",
    color: "#94A3B8",
    fontWeight: 600,
  },
  statVal: {
    fontSize: "20px",
    fontWeight: 700,
    color: "#F8FAFC",
  },
  reviewListSection: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  reviewListTitle: {
    fontSize: "16px",
    fontWeight: 700,
    color: "#F8FAFC",
  },
  reviewCards: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  reviewCard: {
    backgroundColor: "#1E293B",
    border: "1px solid #334155",
    borderLeftWidth: "5px",
    borderRadius: "8px",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  reviewCardHeader: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "13px",
  },
  reviewQIndex: {
    fontWeight: 700,
    color: "#3B82F6",
  },
  reviewQSubj: {
    color: "#94A3B8",
  },
  reviewQCat: {
    color: "#CBD5E1",
    fontWeight: 500,
  },
  reviewStatusBadge: {
    marginLeft: "auto",
    fontWeight: 700,
    fontSize: "12px",
  },
  reviewQText: {
    fontSize: "14px",
    color: "#F8FAFC",
    lineHeight: 1.5,
  },
  reviewAnswersRow: {
    display: "flex",
    gap: "24px",
    fontSize: "13px",
    backgroundColor: "#0F172A",
    padding: "10px 14px",
    borderRadius: "6px",
  },
  reviewAnswerItem: {
    display: "flex",
    gap: "6px",
  },
  reviewAnswerKey: {
    color: "#94A3B8",
  },
  reviewAnswerVal: {
    color: "#CBD5E1",
  },
  summaryActionRow: {
    display: "flex",
    justifyContent: "center",
    gap: "16px",
    paddingTop: "16px",
  },
  newSessionBtn: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "12px 24px",
    borderRadius: "8px",
    backgroundColor: "#3B82F6",
    color: "#FFFFFF",
    fontSize: "15px",
    fontWeight: 600,
    cursor: "pointer",
  },
  doneBtn: {
    padding: "12px 24px",
    borderRadius: "8px",
    backgroundColor: "#334155",
    color: "#F8FAFC",
    fontSize: "15px",
    fontWeight: 600,
    cursor: "pointer",
  },
  errorAlert: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    border: "1px solid var(--color-danger)",
    color: "var(--color-danger)",
    borderRadius: "8px",
    padding: "12px 16px",
    fontSize: "14px",
  },
  loadingBox: {
    padding: "48px",
    textAlign: "center",
    color: "#94A3B8",
  },

  // Phase 8 Interactive Code & Hints Styles
  codeHintText: {
    fontSize: "11px",
    color: "#94A3B8",
  },
  codeLinesContainer: {
    display: "flex",
    flexDirection: "column",
    backgroundColor: "#0A0F1D",
  },
  codeLineRow: {
    display: "flex",
    alignItems: "center",
    padding: "2px 8px",
    transition: "background-color 0.15s ease",
  },
  codeLineNumber: {
    width: "36px",
    flexShrink: 0,
    fontFamily: "monospace",
    fontSize: "13px",
    textAlign: "right",
    paddingRight: "12px",
    userSelect: "none",
  },
  codeLineContent: {
    margin: 0,
    padding: 0,
    fontFamily: 'Consolas, Monaco, "Courier New", monospace',
    fontSize: "13.5px",
    color: "#E2E8F0",
    lineHeight: 1.6,
    whiteSpace: "pre",
    flex: 1,
  },
  codeLineLoadingTag: {
    fontSize: "11px",
    color: "#38BDF8",
    marginLeft: "auto",
  },
  inlineAnatomyCard: {
    margin: "4px 12px 10px 36px",
    padding: "12px 16px",
    backgroundColor: "#0F172A",
    border: "1.5px solid #38BDF8",
    borderRadius: "8px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  inlineAnatomyHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1px solid rgba(56, 189, 248, 0.2)",
    paddingBottom: "6px",
  },
  inlineLineSnippet: {
    fontSize: "12px",
    color: "#CBD5E1",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    padding: "2px 6px",
    borderRadius: "4px",
    marginLeft: "8px",
  },
  closeInlineBtn: {
    background: "none",
    border: "none",
    color: "#94A3B8",
    cursor: "pointer",
    fontSize: "14px",
  },
  inlineLoadingText: {
    padding: "8px 0",
    color: "#94A3B8",
    fontSize: "13px",
  },
  inlineAnatomyBody: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    fontSize: "13px",
    lineHeight: 1.5,
  },
  anatomyMeaning: {
    color: "#E2E8F0",
  },
  anatomySyntaxRow: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    flexWrap: "wrap",
  },
  anatomyLabel: {
    color: "#94A3B8",
    fontSize: "12px",
  },
  anatomyTag: {
    backgroundColor: "rgba(56, 189, 248, 0.15)",
    color: "#38BDF8",
    padding: "2px 8px",
    borderRadius: "4px",
    fontSize: "12px",
  },
  anatomyContext: {
    color: "#CBD5E1",
    fontSize: "12.5px",
  },
  anatomyExamTip: {
    color: "#FCD34D",
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    padding: "6px 10px",
    borderRadius: "6px",
    border: "1px solid rgba(245, 158, 11, 0.2)",
  },

  // AI TUTOR SECTION
  aiTutorContainer: {
    backgroundColor: "#1E1B4B",
    border: "1.5px solid #818CF8",
    borderRadius: "12px",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  aiTutorHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  aiTutorTitle: {
    fontSize: "16px",
    fontWeight: 700,
    color: "#C7D2FE",
  },
  aiSourceBadge: {
    fontSize: "11px",
    fontWeight: 700,
    backgroundColor: "#4338CA",
    color: "#E0E7FF",
    padding: "2px 8px",
    borderRadius: "4px",
  },
  loadAIBtn: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    backgroundColor: "#4F46E5",
    color: "#FFFFFF",
    border: "none",
    borderRadius: "6px",
    padding: "6px 12px",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
  },
  aiLoadingBox: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    color: "#C7D2FE",
    fontSize: "14px",
    padding: "12px",
  },
  aiTutorContent: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  aiSummaryBadge: {
    fontSize: "15px",
    fontWeight: 700,
    color: "#F8FAFC",
    backgroundColor: "rgba(129, 140, 248, 0.15)",
    padding: "10px 14px",
    borderRadius: "8px",
    border: "1px solid rgba(129, 140, 248, 0.3)",
  },
  aiConflictBox: {
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    border: "1.5px solid #F59E0B",
    borderRadius: "8px",
    padding: "14px",
  },
  aiWhyWrongBox: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    border: "1px solid rgba(239, 68, 68, 0.25)",
    borderRadius: "8px",
    padding: "12px",
  },
  aiKeyPointBox: {
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    border: "1px solid rgba(59, 130, 246, 0.25)",
    borderRadius: "8px",
    padding: "12px",
  },
  aiCodeTraceBox: {
    backgroundColor: "rgba(15, 23, 42, 0.7)",
    border: "1px solid #334155",
    borderRadius: "8px",
    padding: "12px",
  },
  codeTracePre: {
    margin: "8px 0 0 0",
    fontFamily: "monospace",
    fontSize: "13px",
    color: "#E2E8F0",
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
  },
  aiPitfallsBox: {
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    border: "1px solid rgba(245, 158, 11, 0.25)",
    borderRadius: "8px",
    padding: "12px",
  },
  aiStudyTipsBox: {
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    border: "1px solid rgba(16, 185, 129, 0.25)",
    borderRadius: "8px",
    padding: "12px",
  },
  aiSectionText: {
    margin: "6px 0 0 0",
    fontSize: "14px",
    color: "#E2E8F0",
    lineHeight: 1.6,
  },
  variationRow: {
    display: "flex",
    justifyContent: "flex-end",
    marginTop: "6px",
  },
  variationBtn: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    border: "1px solid rgba(245, 158, 11, 0.4)",
    color: "#F59E0B",
    borderRadius: "8px",
    padding: "10px 18px",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
  },
  variationSuccessAlert: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    border: "1px solid #10B981",
    color: "#A7F3D0",
    borderRadius: "8px",
    padding: "12px 16px",
    fontSize: "13.5px",
    lineHeight: 1.5,
  },

  // VARIATION MODAL STYLES
  variationModalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    backdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1100,
    padding: "20px",
  },
  variationModalCard: {
    backgroundColor: "#0F172A",
    border: "1px solid #334155",
    borderRadius: "14px",
    width: "100%",
    maxWidth: "680px",
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)",
  },
  variationModalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  variationModalTitle: {
    fontSize: "18px",
    fontWeight: 700,
    color: "#F8FAFC",
    margin: 0,
  },
  variationModalDesc: {
    fontSize: "13.5px",
    color: "#94A3B8",
    lineHeight: 1.5,
    margin: 0,
  },
  variationTypeGrid: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    maxHeight: "320px",
    overflowY: "auto",
  },
  variationOptionCard: {
    padding: "12px 16px",
    borderRadius: "8px",
    border: "1.5px solid",
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  variationOptionDesc: {
    margin: "4px 0 0 0",
    fontSize: "12.5px",
    color: "#CBD5E1",
    lineHeight: 1.4,
  },
  variationModalActionRow: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "12px",
    marginTop: "8px",
  },
  variationSubmitBtn: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "10px 20px",
    borderRadius: "8px",
    backgroundColor: "#3B82F6",
    color: "#FFFFFF",
    fontWeight: 600,
    fontSize: "14px",
    cursor: "pointer",
    border: "none",
  },
};
