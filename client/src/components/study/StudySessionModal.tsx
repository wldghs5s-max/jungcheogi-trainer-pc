import React, { useState, useEffect, useRef } from "react";
import {
  X,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  ArrowRight,
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
  RotateCcw,
  AlertTriangle,
  MessageSquare,
} from "lucide-react";
import {
  Question,
  StudySession,
  SessionSubmitResponse,
  SessionSummaryResponse,
  Subject,
  QUESTION_SOURCE_LABELS,
  AITutoringExplanationResponse,
  AICodeLineResponse,
  GeneratedVariation,
} from "@jungcheogi/shared";
import {
  createStudySession,
  submitSessionAnswer,
  submitSessionUnknown,
  fetchSessionSummary,
  fetchStudySession,
} from "../../api/sessions";
import { styles } from "./studySessionStyles";
import { StudySessionConfig } from "./StudySessionConfig";
import { StudySessionSummary } from "./StudySessionSummary";
import { SyntaxTermModal } from "./SyntaxTermModal";
import { CodeDeepQuestionCard } from "./CodeDeepQuestionCard";
import {
  fetchAIExplanation,
  fetchAIProgressiveHints,
  fetchAICodeExplanations,
  fetchAIVariationDrill,
  stageAIVariationDrill,
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
  const [codeExplanationStatus, setCodeExplanationStatus] = useState<
    "IDLE" | "PENDING" | "READY" | "FAILED" | "REGENERATING"
  >("IDLE");
  const [codeExplanationError, setCodeExplanationError] = useState<
    string | null
  >(null);
  const codeExplanationVersionRef = useRef<number>(0);
  const [selectedLineNumber, setSelectedLineNumber] = useState<number | null>(
    null,
  );
  const [selectedSyntaxKey, setSelectedSyntaxKey] = useState<string | null>(
    null,
  );

  const [aiExplanationData, setAiExplanationData] =
    useState<AITutoringExplanationResponse | null>(null);
  const [loadingAIExplanation, setLoadingAIExplanation] =
    useState<boolean>(false);

  // AI Variation Drill (실시간 학습용 변형 문제 풀기)
  const [isGeneratingDrill, setIsGeneratingDrill] = useState<boolean>(false);
  const [activeDrillVariation, setActiveDrillVariation] =
    useState<GeneratedVariation | null>(null);
  const [aiExplanationError, setAiExplanationError] = useState<string | null>(
    null,
  );
  const isSubmittingRef = useRef<boolean>(false);
  const drillRequestTokenRef = useRef(0);
  const [isDrillQuestion, setIsDrillQuestion] = useState<boolean>(false);
  const [isDrillSaved, setIsDrillSaved] = useState<boolean>(false);
  const [isSavingDrill, setIsSavingDrill] = useState<boolean>(false);
  const [originalQuestionBeforeDrill, setOriginalQuestionBeforeDrill] =
    useState<Question | null>(null);
  const [drillSession, setDrillSession] = useState<StudySession | null>(null);
  const [drillExecutionStatus, setDrillExecutionStatus] = useState<
    "SUCCESS" | "UNAVAILABLE" | "ERROR" | null
  >(null);

  // 코드 심층 질문 워크스페이스 상태
  const [isDeepQuestionOpen, setIsDeepQuestionOpen] = useState<boolean>(false);

  // Timer State
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Summary State
  const [summary, setSummary] = useState<SessionSummaryResponse | null>(null);
  const [loadingSummary, setLoadingSummary] = useState<boolean>(false);

  // Focus ref for inputs
  const firstInputRef = useRef<HTMLInputElement | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

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
      setAiExplanationError(null);
      setIsGeneratingDrill(false);
      drillRequestTokenRef.current += 1;
      setActiveDrillVariation(null);
      setIsDrillQuestion(false);
      setIsDrillSaved(false);
      setIsSavingDrill(false);
      setOriginalQuestionBeforeDrill(null);
      setDrillSession(null);
      setDrillExecutionStatus(null);
      setIsDeepQuestionOpen(false);
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
    setIsDeepQuestionOpen(false);
    setCodeExplanationStatus("IDLE");
    setCodeExplanationError(null);
    setAiExplanationData(null);
    setAiExplanationError(null);

    // Phase 8: 코드 문제가 로드되는 즉시 백그라운드에서 전체 줄별 해설 패키지 사전 생성 (Non-blocking)
    if (currentQuestion.code && currentQuestion.code.trim().length > 0) {
      const q = currentQuestion;
      const targetVersion = ++codeExplanationVersionRef.current;
      setCodeExplanationStatus("PENDING");

      fetchAICodeExplanations({
        questionId: q.id,
        questionData: q,
        forceRegenerate: false,
      })
        .then((res) => {
          if (codeExplanationVersionRef.current !== targetVersion) return;
          if (res.data && res.data.lines) {
            const cacheMap: Record<number, AICodeLineResponse> = {};
            res.data.lines.forEach((l) => {
              cacheMap[l.lineNumber] = l;
            });
            setCodeLineCache(cacheMap);
            setCodeExplanationStatus("READY");
            setCodeExplanationError(null);
          } else {
            setCodeExplanationStatus("FAILED");
            setCodeExplanationError(
              res.error || "코드 해설을 불러오지 못했습니다.",
            );
          }
        })
        .catch((err) => {
          if (codeExplanationVersionRef.current !== targetVersion) return;
          setCodeExplanationStatus("FAILED");
          setCodeExplanationError(err?.message || "코드 해설 요청 실패");
        });
    }

    let count = 1;
    if (Array.isArray(currentQuestion.groundTruthAnswer)) {
      count = currentQuestion.groundTruthAnswer.length;
    } else if (
      typeof currentQuestion.groundTruthAnswer === "string" &&
      !currentQuestion.groundTruthAnswer.includes("->") &&
      /[①-⑳]/.test(currentQuestion.groundTruthAnswer)
    ) {
      const parts = currentQuestion.groundTruthAnswer
        .split(/[,;\n]+/)
        .filter((p) => p.trim());
      if (parts.length > 1) count = parts.length;
    }
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
    if (isSubmittingRef.current || isSubmitting || !session || !currentQuestion) return;

    const isMulti =
      userInputs.length > 1 ||
      Array.isArray(currentQuestion.groundTruthAnswer);
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
    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      if (isDrillQuestion) {
        if (!drillSession) {
          alert("드릴 세션이 없어 결과를 기록할 수 없습니다.");
          return;
        }
        const drillRes = await submitSessionAnswer(drillSession.id, {
          questionId: currentQuestion.id,
          userAnswer: finalAnswer,
          timeSpentMs: Math.max(elapsedSeconds * 1000, 1000),
          hintUsed: showHint || hintLevel > 0,
        });
        if (drillRes.error || !drillRes.data) {
          alert(drillRes.error || "드릴 답안 제출 중 오류가 발생했습니다.");
          return;
        }
        setSubmitResult(drillRes.data);
        if (!drillRes.data.isCorrect) {
          handleLoadAIExplanation(drillRes.data);
        }
        return;
      }

      const timeSpentMs = Math.max(elapsedSeconds * 1000, 1000);
      const res = await submitSessionAnswer(session.id, {
        questionId: currentQuestion.id,
        userAnswer: finalAnswer,
        timeSpentMs,
        hintUsed: showHint || hintLevel > 0,
      });

      if (res.error || !res.data) {
        alert(res.error || "답안 제출 중 오류가 발생했습니다.");
        return;
      }

      setSubmitResult(res.data);
      setSession((prev) =>
        prev
          ? {
              ...prev,
              correctCount: res.data!.sessionProgress.correctCount,
              wrongCount: res.data!.sessionProgress.wrongCount,
              unknownCount: res.data!.sessionProgress.unknownCount,
            }
          : null,
      );
      if (!res.data.isCorrect) {
        handleLoadAIExplanation(res.data);
      }
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  // Handle "모르겠음" quick action
  const handleUnknown = async () => {
    if (isSubmittingRef.current || isSubmitting || !currentQuestion) return;

    if (timerRef.current) clearInterval(timerRef.current);
    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      if (isDrillQuestion) {
        if (!drillSession) {
          alert("드릴 세션이 없어 결과를 기록할 수 없습니다.");
          return;
        }
        const drillRes = await submitSessionUnknown(drillSession.id, {
          questionId: currentQuestion.id,
          timeSpentMs: Math.max(elapsedSeconds * 1000, 1000),
          hintUsed: showHint || hintLevel > 0,
        });
        if (drillRes.error || !drillRes.data) {
          alert(drillRes.error || "드릴 모르겠음 처리 중 오류가 발생했습니다.");
          return;
        }
        setSubmitResult(drillRes.data);
        handleLoadAIExplanation(drillRes.data);
        return;
      }

      if (!session) return;

      const timeSpentMs = Math.max(elapsedSeconds * 1000, 1000);
      const res = await submitSessionUnknown(session.id, {
        questionId: currentQuestion.id,
        timeSpentMs,
        hintUsed: showHint || hintLevel > 0,
      });

      if (res.error || !res.data) {
        alert(res.error || "모르겠음 처리 중 오류가 발생했습니다.");
        return;
      }

      setSubmitResult(res.data);
      setSession((prev) =>
        prev
          ? {
              ...prev,
              correctCount: res.data!.sessionProgress.correctCount,
              wrongCount: res.data!.sessionProgress.wrongCount,
              unknownCount: res.data!.sessionProgress.unknownCount,
            }
          : null,
      );
      handleLoadAIExplanation(res.data);
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
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
      questionData: currentQuestion,
    });
    setLoadingHints(false);

    if (res.data && res.data.hints) {
      setAiHints(res.data.hints);
      setHintLevel(1);
    } else {
      setHintLevel((prev) => Math.max(prev + 1, 1));
    }
  };

  // Phase 8: Interactive Line-by-line Code Anatomy (Zero-Gemini Instant Display)
  const handleSelectCodeLine = (lineNum: number) => {
    if (!currentQuestion || !currentQuestion.code) return;
    if (selectedLineNumber === lineNum) {
      setSelectedLineNumber(null);
      return;
    }
    setSelectedLineNumber(lineNum);
  };

  // Phase 8: 전체 해설 다시 생성 (문제 단위 1회 일괄 재생성 & 원자적 캐시 교체)
  const handleRegenerateAllCodeExplanations = async () => {
    if (!currentQuestion || !currentQuestion.code) return;
    if (
      codeExplanationStatus === "REGENERATING" ||
      codeExplanationStatus === "PENDING"
    ) {
      return;
    }

    const q = currentQuestion;
    const targetVersion = ++codeExplanationVersionRef.current;
    setCodeExplanationStatus("REGENERATING");
    setCodeExplanationError(null);

    try {
      const res = await fetchAICodeExplanations({
        questionId: q.id,
        questionData: q,
        forceRegenerate: true,
      });

      if (codeExplanationVersionRef.current !== targetVersion) return;

      if (res.data && res.data.lines) {
        const cacheMap: Record<number, AICodeLineResponse> = {};
        res.data.lines.forEach((l) => {
          cacheMap[l.lineNumber] = l;
        });
        setCodeLineCache(cacheMap);
        setCodeExplanationStatus("READY");
        if (res.data.errorMessage) {
          setCodeExplanationError(res.data.errorMessage);
        } else {
          setCodeExplanationError(null);
        }
      } else {
        // 실패 시: 기존 정상 해설은 절대 삭제하지 않고 유지!
        setCodeExplanationStatus(
          Object.keys(codeLineCache).length > 0 ? "READY" : "FAILED",
        );
        setCodeExplanationError(
          res.error || "재생성에 실패하여 기존 해설을 유지합니다.",
        );
      }
    } catch (err: any) {
      if (codeExplanationVersionRef.current !== targetVersion) return;
      setCodeExplanationStatus(
        Object.keys(codeLineCache).length > 0 ? "READY" : "FAILED",
      );
      setCodeExplanationError(
        err?.message || "재생성에 실패하여 기존 해설을 유지합니다.",
      );
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
    setAiExplanationError(null);
    const res = await fetchAIExplanation({
      questionId: currentQuestion.id,
      questionData: currentQuestion,
      userAnswer: result.attempt.userAnswer,
      isCorrect: result.isCorrect,
      isUnknown: result.attempt.isUnknown,
      deepAnalysis,
    });
    setLoadingAIExplanation(false);

    if (res.data) {
      setAiExplanationData(res.data);
    } else {
      setAiExplanationError(res.error || "AI 해설을 불러오지 못했습니다.");
    }
  };

  // Phase 8: 학습용 AI 즉시 변형 문제 풀기 (No strategy selection, instant transition)
  const handleStartAIVariationDrill = async (targetQuestionId?: string) => {
    const parentId =
      targetQuestionId ||
      originalQuestionBeforeDrill?.id ||
      currentQuestion?.id;
    if (!parentId || isGeneratingDrill) return;
    const requestToken = Date.now();
    drillRequestTokenRef.current = requestToken;
    setIsGeneratingDrill(true);

    const res = await fetchAIVariationDrill({
      parentQuestionId: parentId,
    });
    setIsGeneratingDrill(false);

    if (drillRequestTokenRef.current !== requestToken) {
      return;
    }

    if (
      !res.data ||
      !res.data.success ||
      !res.data.question ||
      !res.data.drillSession
    ) {
      alert(
        res.error ||
          res.data?.message ||
          "AI 변형 문제 생성에 실패했습니다. 다시 생성하거나 검수 대기열을 이용해주세요.",
      );
      return;
    }

    if (!isDrillQuestion && currentQuestion) {
      setOriginalQuestionBeforeDrill(currentQuestion);
    }

    setIsDrillQuestion(true);
    setActiveDrillVariation(res.data.variation || null);
    setIsDrillSaved(false);
    setDrillSession(res.data.drillSession);
    setDrillExecutionStatus(res.data.executionStatus || "UNAVAILABLE");
    setCurrentQuestion(res.data.question);
    const count = Array.isArray(res.data.question.groundTruthAnswer)
      ? res.data.question.groundTruthAnswer.length
      : 1;
    setUserInputs(new Array(count).fill(""));
    setShowHint(false);
    setHintLevel(0);
    setSubmitResult(null);
    setAiExplanationData(null);
    setElapsedSeconds(0);
    setAiHints(null);
    setCodeLineCache({});
    setSelectedLineNumber(null);
    setPhase("PRACTICE");
  };

  // 임시 변형 문제를 Staging 검수 대기열에 저장
  const handleSaveDrillQuestion = async () => {
    if (!activeDrillVariation || isDrillSaved || isSavingDrill) return;
    setIsSavingDrill(true);
    const res = await stageAIVariationDrill({
      variation: activeDrillVariation,
    });
    setIsSavingDrill(false);
    if (res.data) {
      setIsDrillSaved(true);
    } else {
      alert(res.error || "Staging 저장 중 오류가 발생했습니다.");
    }
  };

  // Advance to next question or show summary
  const handleNextQuestion = async () => {
    if (!session) return;

    if (isDrillQuestion) {
      setIsDrillQuestion(false);
      setActiveDrillVariation(null);
      setIsDrillSaved(false);
      setOriginalQuestionBeforeDrill(null);
      setDrillSession(null);
      setDrillExecutionStatus(null);

      const sessionRes = await fetchStudySession(session.id);
      if (sessionRes.data && sessionRes.data.currentQuestion) {
        setSession(sessionRes.data.session);
        setCurrentQuestion(sessionRes.data.currentQuestion);
        setSubmitResult(null);
      } else {
        setPhase("SUMMARY");
        setLoadingSummary(true);
        const sumResult = await fetchSessionSummary(session.id);
        setLoadingSummary(false);
        if (sumResult.data) {
          setSummary(sumResult.data);
        }
      }
      return;
    }

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

      if (e.isComposing || (e as any).keyCode === 229) return;

      if (submitResult) {
        // If feedback is showing, Enter advances to next question
        if (e.key === "Enter") {
          e.preventDefault();
          handleNextQuestion();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, phase, submitResult, currentQuestion]);

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
            <StudySessionConfig
              sessionTitle={sessionTitle}
              selectedSubject={selectedSubject}
              questionCount={questionCount}
              isStarting={isStarting}
              configError={configError}
              onTitleChange={setSessionTitle}
              onSubjectChange={setSelectedSubject}
              onCountChange={setQuestionCount}
              onStart={handleStartSession}
              onCancel={onClose}
            />
          )}

          {phase === "PRACTICE" && currentQuestion && (
            <div style={styles.practiceContainer}>
              {/* QUESTION HEADER BADGES */}
              <div style={styles.qMetaRow}>
                {isDrillQuestion && (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      backgroundColor: "rgba(245, 158, 11, 0.2)",
                      color: "#FBBF24",
                      border: "1px solid #F59E0B",
                      borderRadius: "4px",
                      padding: "3px 8px",
                      fontSize: "12px",
                      fontWeight: 700,
                    }}
                  >
                    <Zap size={13} color="#FBBF24" />
                    임시 AI 변형 드릴
                  </span>
                )}
                {isDrillQuestion && drillExecutionStatus !== "SUCCESS" && (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      backgroundColor: "rgba(245, 158, 11, 0.15)",
                      color: "#FBBF24",
                      border: "1px solid rgba(245, 158, 11, 0.4)",
                      borderRadius: "4px",
                      padding: "3px 8px",
                      fontSize: "12px",
                      fontWeight: 700,
                    }}
                  >
                    ⚡ AI 생성 연습 문제 · 아직 정답 자동 검증 전
                  </span>
                )}
                {(currentQuestion.questionCode || currentQuestion.id) && (
                  <span
                    onClick={() => {
                      const code =
                        currentQuestion.questionCode || currentQuestion.id;
                      navigator.clipboard.writeText(code);
                      alert(
                        `문항 식별 코드 '${code}'가 클립보드에 복사되었습니다.`,
                      );
                    }}
                    style={{
                      cursor: "pointer",
                      fontFamily: "monospace",
                      fontSize: "12px",
                      fontWeight: 700,
                      backgroundColor: "rgba(59, 130, 246, 0.15)",
                      color: "#60A5FA",
                      border: "1px solid rgba(59, 130, 246, 0.4)",
                      borderRadius: "4px",
                      padding: "3px 8px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                    title="클릭하여 문항 식별 코드 복사"
                  >
                    <span>
                      {currentQuestion.questionCode || currentQuestion.id}
                    </span>
                    <span style={{ fontSize: "10px", opacity: 0.8 }}>📋</span>
                  </span>
                )}
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
                        {isDrillQuestion
                          ? "임시 AI 드릴 (문제집 미포함)"
                          : QUESTION_SOURCE_LABELS[currentQuestion.sourceType] ||
                            currentQuestion.sourceType}
                </span>
              </div>

              {/* QUESTION STATEMENT */}
              <div style={styles.statementBox}>
                <div style={styles.qIndexIndicator}>
                  {isDrillQuestion
                    ? "AI 변형"
                    : `Q.${session ? session.currentIndex + 1 : 1}`}
                </div>
                <div style={styles.qText}>{currentQuestion.question}</div>
              </div>

              {/* CODE BLOCK IF PRESENT */}
              {/* CODE BLOCK IF PRESENT (Phase 8: Line-by-Line Interactive Anatomy) */}
              {currentQuestion.code && (
                <>
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

                      {/* AI 해설 준비 상태 배지 (가짜 progress 없이 실제 상태만 정직하게 표시) */}
                      {codeExplanationStatus === "PENDING" && (
                        <span style={styles.statusPendingBadge}>
                          <RefreshCw size={12} className="spin" color="#38BDF8" />
                          <span>AI 줄별 해설 준비 중...</span>
                        </span>
                      )}
                      {codeExplanationStatus === "REGENERATING" && (
                        <span style={styles.statusRegenBadge}>
                          <RotateCcw size={12} className="spin" color="#F59E0B" />
                          <span>↻ AI 줄별 해설 다시 생성 중...</span>
                        </span>
                      )}
                      {codeExplanationStatus === "READY" && (
                        <span style={styles.statusReadyBadge}>
                          <CheckCircle2 size={12} color="#10B981" />
                          <span>✓ AI 줄별 해설 준비 완료</span>
                        </span>
                      )}
                      {codeExplanationStatus === "FAILED" && (
                        <span style={styles.statusFailedBadge}>
                          <AlertTriangle size={12} color="#EF4444" />
                          <span>AI 줄별 해설 준비 실패</span>
                        </span>
                      )}

                      <span style={styles.codeHintText}>
                        • 줄 번호를 클릭하면 AI 메모리/실행 분석을 확인할 수 있습니다
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <button
                        type="button"
                        onClick={() => setIsDeepQuestionOpen((prev) => !prev)}
                        style={{
                          ...styles.copyCodeBtn,
                          backgroundColor: isDeepQuestionOpen
                            ? "rgba(56, 189, 248, 0.2)"
                            : "rgba(56, 189, 248, 0.1)",
                          borderColor: isDeepQuestionOpen
                            ? "#38BDF8"
                            : "rgba(56, 189, 248, 0.3)",
                          color: "#38BDF8",
                        }}
                        title="이 코드에 대해 궁금한 점을 Gemini에게 직접 질문합니다"
                      >
                        <MessageSquare size={13} color="#38BDF8" />
                        <span>{isDeepQuestionOpen ? "심층 질문 닫기" : "코드 심층 질문"}</span>
                      </button>
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
                  </div>

                  {/* Interactive Code Lines */}
                  <div style={styles.codeLinesContainer}>
                    {currentQuestion.code.split("\n").map((lineText, idx) => {
                      const lineNum = idx + 1;
                      const isSelected = selectedLineNumber === lineNum;
                      const lineData = codeLineCache[lineNum];
                      const isBusy =
                        codeExplanationStatus === "PENDING" ||
                        codeExplanationStatus === "REGENERATING";

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
                            {isBusy && !lineData && isSelected && (
                              <span style={styles.codeLineLoadingTag}>
                                {codeExplanationStatus === "REGENERATING"
                                  ? "재생성 중..."
                                  : "준비 중..."}
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

                              {isBusy && !lineData ? (
                                <div style={styles.inlineLoadingText}>
                                  <RefreshCw
                                    size={14}
                                    className="spin"
                                    color="#38BDF8"
                                    style={{
                                      display: "inline-block",
                                      marginRight: "6px",
                                      verticalAlign: "middle",
                                    }}
                                  />
                                  <span>
                                    {codeExplanationStatus === "REGENERATING"
                                      ? "새로운 전체 해설을 분석 및 재생성하고 있습니다..."
                                      : "해설을 준비하고 있습니다... (문제를 풀면서 잠시 기다려주세요)"}
                                  </span>
                                </div>
                              ) : lineData ? (
                                <div style={styles.inlineAnatomyBody}>
                                  {/* 문법 요소 (독립 학습 모달 연결) */}
                                  {lineData.syntaxTerms && lineData.syntaxTerms.length > 0 ? (
                                    <div style={styles.anatomySyntaxRow}>
                                      <span style={styles.anatomyLabel}>
                                        문법 요소 (클릭 시 지식 모달):
                                      </span>
                                      {lineData.syntaxTerms.map((st, sIdx) => (
                                        <button
                                          key={sIdx}
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedSyntaxKey(st.canonicalKey);
                                          }}
                                          style={styles.syntaxTermPillBtn}
                                          title={`[${st.display}] 문법 지식 상세 모달 열기 (AI 0회 호출)`}
                                        >
                                          <span>{st.display}</span>
                                          <span style={styles.syntaxTermKeyHint}>
                                            ({st.canonicalKey.split(".")[1] || st.canonicalKey})
                                          </span>
                                        </button>
                                      ))}
                                    </div>
                                  ) : lineData.syntaxElements && lineData.syntaxElements.length > 0 ? (
                                    <div style={styles.anatomySyntaxRow}>
                                      <span style={styles.anatomyLabel}>
                                        문법 요소:
                                      </span>
                                      {lineData.syntaxElements.map((el, eIdx) => (
                                        <span key={eIdx} style={styles.anatomyTag}>
                                          {el}
                                        </span>
                                      ))}
                                    </div>
                                  ) : null}

                                  {/* ① 📋 이 줄이 하는 일 */}
                                  <div style={styles.anatomyRole}>
                                    <strong style={{ color: "#38BDF8", display: "block", marginBottom: "4px" }}>
                                      ① 📋 이 줄이 하는 일 (핵심 역할):
                                    </strong>
                                    <span>{lineData.lineRole || lineData.summary}</span>
                                  </div>

                                  {/* ② ⚡ 실행 시 실제 동작 */}
                                  <div style={styles.anatomyBehavior}>
                                    <strong style={{ color: "#34D399", display: "block", marginBottom: "4px" }}>
                                      ② ⚡ 실행 시 실제 동작 (값·조건·메모리):
                                    </strong>
                                    <span>{lineData.runtimeBehavior || lineData.runtimeMeaning || lineData.summary}</span>
                                  </div>

                                  {/* ③ 🔗 앞뒤 코드 연계 흐름 */}
                                  {(lineData.flowContext || lineData.flow || lineData.surroundingContext) && (
                                    <div style={styles.anatomyContext}>
                                      <strong style={{ color: "#94A3B8" }}>
                                        ③ 🔗 앞뒤 코드 연계 흐름:
                                      </strong>{" "}
                                      <span>{lineData.flowContext || lineData.flow || lineData.surroundingContext}</span>
                                    </div>
                                  )}

                                  {/* ④ ⚠️ 시험 주의점 & 함정 */}
                                  {(lineData.caution || lineData.examTip) && (
                                    <div style={styles.anatomyExamTip}>
                                      <strong style={{ color: "#F59E0B" }}>
                                        ④ ⚠️ 시험 주의점 & 함정:
                                      </strong>{" "}
                                      <span>{lineData.caution || lineData.examTip}</span>
                                    </div>
                                  )}

                                  {/* ⑤ 💡 문제 풀이 보조 힌트 */}
                                  {lineData.problemHint && (
                                    <div style={styles.anatomyHint}>
                                      <strong style={{ color: "#60A5FA" }}>
                                        ⑤ 💡 문제 풀이 보조 힌트:
                                      </strong>{" "}
                                      <span>{lineData.problemHint}</span>
                                    </div>
                                  )}

                                  {/* 전체 해설 다시 생성 액션 바 (어느 줄에서든 1클릭 일괄 재생성) */}
                                  <div
                                    style={{
                                      marginTop: "12px",
                                      paddingTop: "10px",
                                      borderTop: "1px dashed rgba(148, 163, 184, 0.2)",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "space-between",
                                      flexWrap: "wrap",
                                      gap: "8px",
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontSize: "12px",
                                        color: "#94A3B8",
                                      }}
                                    >
                                      💡 설명이 불충분하거나 어색한가요?
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRegenerateAllCodeExplanations();
                                      }}
                                      disabled={codeExplanationStatus === "REGENERATING"}
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "5px",
                                        padding: "4px 10px",
                                        fontSize: "12px",
                                        fontWeight: 600,
                                        color: "#F59E0B",
                                        backgroundColor: "rgba(245, 158, 11, 0.12)",
                                        border: "1px solid rgba(245, 158, 11, 0.35)",
                                        borderRadius: "6px",
                                        cursor:
                                          codeExplanationStatus === "REGENERATING"
                                            ? "not-allowed"
                                            : "pointer",
                                      }}
                                      title="문제 전체 코드를 다시 분석하여 모든 줄의 해설 패키지를 일괄 교체합니다."
                                    >
                                      <RotateCcw
                                        size={13}
                                        className={
                                          codeExplanationStatus === "REGENERATING"
                                            ? "spin"
                                            : ""
                                        }
                                      />
                                      <span>
                                        {codeExplanationStatus === "REGENERATING"
                                          ? "전체 해설 재생성 중..."
                                          : "↻ 전체 해설 다시 생성"}
                                      </span>
                                    </button>
                                  </div>
                                  {codeExplanationError && (
                                    <div
                                      style={{
                                        marginTop: "6px",
                                        fontSize: "12px",
                                        color: "#EF4444",
                                      }}
                                    >
                                      {codeExplanationError}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div
                                  style={{
                                    padding: "8px 0",
                                    color: "#EF4444",
                                    fontSize: "13px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    flexWrap: "wrap",
                                    gap: "8px",
                                  }}
                                >
                                  <span>
                                    {codeExplanationError ||
                                      "AI 해설 준비에 실패했습니다."}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRegenerateAllCodeExplanations();
                                    }}
                                    disabled={codeExplanationStatus === "REGENERATING"}
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "5px",
                                      padding: "4px 10px",
                                      fontSize: "12px",
                                      fontWeight: 600,
                                      color: "#F59E0B",
                                      backgroundColor: "rgba(245, 158, 11, 0.12)",
                                      border: "1px solid rgba(245, 158, 11, 0.35)",
                                      borderRadius: "6px",
                                      cursor: "pointer",
                                    }}
                                  >
                                    <RotateCcw size={13} />
                                    <span>해설 생성 다시 시도</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>

                {/* 코드 심층 질문 워크스페이스 카드 (독립 분리 카드) */}
                {isDeepQuestionOpen && (
                  <CodeDeepQuestionCard
                    question={currentQuestion}
                    onClose={() => setIsDeepQuestionOpen(false)}
                  />
                )}
              </>
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
                      {userInputs.length > 1
                        ? `순서대로 정답 키워드 ${userInputs.length}개를 작성하세요 (Enter로 다음 빈칸 이동)`
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
                          ref={(el) => {
                            inputRefs.current[idx] = el;
                            if (idx === 0) firstInputRef.current = el;
                          }}
                          type="text"
                          value={val}
                          onChange={(e) => {
                            const newInputs = [...userInputs];
                            newInputs[idx] = e.target.value;
                            setUserInputs(newInputs);
                          }}
                          onKeyDown={(e) => {
                            if (e.nativeEvent.isComposing || e.key === "Process" || e.keyCode === 229) return;
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              e.stopPropagation();
                              if (isSubmittingRef.current || isSubmitting) return;
                              if (idx < userInputs.length - 1) {
                                inputRefs.current[idx + 1]?.focus();
                              } else {
                                handleSubmitAnswer();
                              }
                            }
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
                  {(() => {
                    const isUnverified =
                      submitResult.isUnverifiedPractice ||
                      (isDrillQuestion && drillExecutionStatus !== "SUCCESS");
                    return (
                      <div
                        style={{
                          ...styles.feedbackBanner,
                          backgroundColor: isUnverified
                            ? "rgba(245, 158, 11, 0.15)"
                            : submitResult.attempt.isUnknown
                              ? "rgba(245, 158, 11, 0.15)"
                              : submitResult.isCorrect
                                ? "rgba(16, 185, 129, 0.15)"
                                : submitResult.score > 0
                                  ? "rgba(59, 130, 246, 0.15)"
                                  : "rgba(239, 68, 68, 0.15)",
                          borderColor: isUnverified
                            ? "var(--color-warning)"
                            : submitResult.attempt.isUnknown
                              ? "var(--color-warning)"
                              : submitResult.isCorrect
                                ? "var(--color-success)"
                                : submitResult.score > 0
                                  ? "var(--color-primary)"
                                  : "var(--color-danger)",
                        }}
                      >
                        <div style={styles.bannerIconBox}>
                          {isUnverified ? (
                            <HelpCircle size={28} color="#F59E0B" />
                          ) : submitResult.attempt.isUnknown ? (
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
                              color: isUnverified
                                ? "#F59E0B"
                                : submitResult.attempt.isUnknown
                                  ? "var(--color-warning)"
                                  : submitResult.isCorrect
                                    ? "var(--color-success)"
                                    : submitResult.score > 0
                                      ? "var(--color-primary)"
                                      : "var(--color-danger)",
                            }}
                          >
                            {isUnverified
                              ? "비검증 AI 연습 문제 (채점 결과 참고용)"
                              : submitResult.attempt.isUnknown
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
                    );
                  })()}

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
                        {isDrillQuestion
                          ? drillExecutionStatus !== "SUCCESS"
                            ? "AI 생성 참고 답안 (미검증)"
                            : "실행 검증 정답"
                          : "기준 정답 (Ground Truth)"}
                      </span>
                      <div style={styles.groundTruthVal}>
                        {Array.isArray(submitResult.groundTruthAnswer)
                          ? submitResult.groundTruthAnswer.join(", ")
                          : submitResult.groundTruthAnswer}
                      </div>
                    </div>
                  </div>

                  {/* Phase 8: 맞힌 문제 & 틀린 문제 공통 AI 즉시 변형 문제 풀기 액션 바 */}
                  <div style={styles.variationRow}>
                    <button
                      type="button"
                      onClick={() => {
                        void handleStartAIVariationDrill();
                      }}
                      disabled={isGeneratingDrill}
                      style={{
                        ...styles.drillStartBtn,
                        backgroundColor: submitResult.isCorrect
                          ? "rgba(16, 185, 129, 0.15)"
                          : "rgba(245, 158, 11, 0.15)",
                        borderColor: submitResult.isCorrect
                          ? "rgba(16, 185, 129, 0.4)"
                          : "rgba(245, 158, 11, 0.4)",
                        color: submitResult.isCorrect ? "#10B981" : "#F59E0B",
                      }}
                    >
                      {isGeneratingDrill ? (
                        <>
                          <RefreshCw
                            size={16}
                            className="spin"
                            color={submitResult.isCorrect ? "#10B981" : "#F59E0B"}
                          />
                          <span>
                            AI가 문제 특성을 분석하여 맞춤 변형 문제를 생성 및 검증하는 중...
                          </span>
                        </>
                      ) : (
                        <>
                          <Zap
                            size={16}
                            color={submitResult.isCorrect ? "#10B981" : "#F59E0B"}
                          />
                          <span>
                            {submitResult.isCorrect
                              ? "💡 맞힌 문제 다지기 (AI 변형 문제 즉시 풀기)"
                              : "💡 오답 약점 보완 (AI 변형 문제 즉시 풀기)"}
                          </span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* GROUND TRUTH OFFICIAL EXPLANATION (Green/Gold Border) */}
                  {submitResult.officialExplanation && (
                    <div style={styles.groundTruthBox}>
                      <div style={styles.boxTitleRow}>
                        <BookOpen size={18} color="var(--color-success)" />
                        <span style={styles.groundTruthTitle}>
                          {submitResult.officialExplanation
                            ? "공식 검증 해설 (Ground Truth)"
                            : "공식 해설"}
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
                          style={{
                            ...styles.loadAIBtn,
                            backgroundColor: submitResult?.isCorrect
                              ? "rgba(59, 130, 246, 0.15)"
                              : undefined,
                            borderColor: submitResult?.isCorrect
                              ? "rgba(59, 130, 246, 0.4)"
                              : undefined,
                            color: submitResult?.isCorrect ? "#60A5FA" : undefined,
                          }}
                        >
                          <Sparkles size={14} />
                          <span>
                            {submitResult?.isCorrect
                              ? "해설 필요 (AI 설명 요청)"
                              : "AI 해설 요청하기"}
                          </span>
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

                    {aiExplanationError && !loadingAIExplanation && (
                      <div style={styles.aiLoadingBox}>
                        <span>{aiExplanationError}</span>
                        <button
                          type="button"
                          onClick={() => handleLoadAIExplanation()}
                          style={styles.loadAIBtn}
                        >
                          다시 시도
                        </button>
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
                            <strong style={{ color: submitResult?.attempt?.isUnknown ? "#F59E0B" : "#F87171" }}>
                              {submitResult?.attempt?.isUnknown
                                ? "🧭 문제 접근 길잡이 & 사고 전개 과정:"
                                : "🔍 오답 & 풀이 진단:"}
                            </strong>
                            <p style={styles.aiSectionText}>
                              {aiExplanationData.whyWrong}
                            </p>
                          </div>
                        )}

                        <div style={styles.aiKeyPointBox}>
                          <strong style={{ color: submitResult?.attempt?.isUnknown ? "#38BDF8" : "#60A5FA" }}>
                            {submitResult?.attempt?.isUnknown
                              ? "💡 핵심 개념 & 주변 필수 배경지식 특강:"
                              : "💡 핵심 개념 및 공식 정답 성립 원리:"}
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

                        {/* AI VARIATION DRILL TRIGGER BUTTON */}
                        <div style={styles.variationRow}>
                          <button
                            type="button"
                            onClick={() => {
                              void handleStartAIVariationDrill();
                            }}
                            disabled={isGeneratingDrill}
                            style={styles.drillStartBtn}
                          >
                            {isGeneratingDrill ? (
                              <>
                                <RefreshCw
                                  size={16}
                                  className="spin"
                                  color="#F59E0B"
                                />
                                <span>
                                  AI가 문제 특성을 분석하여 맞춤 변형 문제를
                                  생성 및 검증하는 중...
                                </span>
                              </>
                            ) : (
                              <>
                                <Zap size={16} color="#F59E0B" />
                                <span>💡 이 문제의 AI 변형 문제 풀기</span>
                              </>
                            )}
                          </button>
                        </div>

                        {/* If this is an answered drill question, offer optional staging save */}
                        {isDrillQuestion && activeDrillVariation && (
                          <div style={styles.drillSaveContainer}>
                            {!isDrillSaved ? (
                              <button
                                type="button"
                                onClick={handleSaveDrillQuestion}
                                disabled={isSavingDrill}
                                style={styles.saveDrillBtn}
                              >
                                <CheckCircle2 size={15} color="#10B981" />
                                <span>
                                  {isSavingDrill
                                    ? "저장 중..."
                                    : "이 문제 저장 (검수 대기열로 보내기)"}
                                </span>
                              </button>
                            ) : (
                              <div style={styles.drillSavedBadge}>
                                <CheckCircle2 size={16} color="#10B981" />
                                <span>
                                  ✅ 검수 대기열(Staging)에 저장 완료되었습니다!
                                </span>
                              </div>
                            )}
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
                        {isDrillQuestion
                          ? session?.status === "COMPLETED"
                            ? "원래 학습 결과 요약으로 돌아가기"
                            : "원래 학습으로 돌아가기"
                          : submitResult.isSessionCompleted
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
            <StudySessionSummary
              summary={summary}
              loadingSummary={loadingSummary}
              onRestart={() => setPhase("CONFIG")}
              onClose={onClose}
              onStartDrill={(qId) => handleStartAIVariationDrill(qId)}
            />
          )}
        </div>
      </div>

      {/* SYNTAX KNOWLEDGE LEARNING MODAL (AI API 0회 호출) */}
      <SyntaxTermModal
        canonicalKey={selectedSyntaxKey}
        onClose={() => setSelectedSyntaxKey(null)}
        onSelectRelatedTerm={(key) => setSelectedSyntaxKey(key)}
      />
    </div>
  );
};
