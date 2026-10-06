import React, { useEffect, useState, useCallback } from "react";
import {
  Database,
  AlertTriangle,
  Search,
  Code2,
  GitBranch,
  Sparkles,
  Info,
  Eye,
  FileCheck,
  Play,
  Flame,
  Brain,
  Target,
  RotateCcw,
  CheckCircle,
  Zap,
  Crosshair,
  TrendingUp,
} from "lucide-react";
import { Header } from "./components/Header";
import { StudySessionModal } from "./components/study/StudySessionModal";
import { ImportModal } from "./components/importer/ImportModal";
import { GenerateQuestionModal } from "./components/generator/GenerateQuestionModal";
import { VariationModal } from "./components/VariationModal";
import { checkBackendHealth } from "./api/health";
import { fetchQuestions, fetchQuestionDetail } from "./api/questions";
import {
  fetchLearningDashboard,
  fetchWeakConcepts,
  fetchDueReviews,
  fetchDailyQueueSummary,
  fetchRecommendations,
  createDailySession,
  createConceptDrillSession,
  generateVariationApi,
} from "./api/learning";
import { createStudySession } from "./api/sessions";
import { styles } from "./appStyles";
import {
  HealthCheckResponse,
  Question,
  QuestionFilter,
  QuestionDetailResponse,
  Subject,
  QuestionSourceType,
  QuestionType,
  SUBJECT_LIST,
  DEFAULT_SYLLABUS_CONFIG,
  QUESTION_SOURCE_LABELS,
  LearningDashboardSummary,
  WeakConceptSummary,
  DueReviewItem,
  DailyLearningQueueSummary,
  RecommendedQuestionItem,
  StudySession,
} from "@jungcheogi/shared";

export const App: React.FC = () => {
  const [health, setHealth] = useState<HealthCheckResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState<boolean>(true);
  const [healthError, setHealthError] = useState<string | undefined>(undefined);

  // Question Browser State
  const [questions, setQuestions] = useState<Question[]>([]);
  const [totalQuestions, setTotalQuestions] = useState<number>(0);
  const [loadingQuestions, setLoadingQuestions] = useState<boolean>(false);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(
    null,
  );
  const [questionDetail, setQuestionDetail] =
    useState<QuestionDetailResponse | null>(null);

  // Filters
  const [selectedSubject, setSelectedSubject] = useState<Subject | "">("");
  const [selectedSourceType, setSelectedSourceType] = useState<
    QuestionSourceType | ""
  >("");
  const [selectedType, setSelectedType] = useState<QuestionType | "">("");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedConceptFilter, setSelectedConceptFilter] = useState<
    string | null
  >(null);

  // Phase 3 Study Session State
  const [isStudySessionOpen, setIsStudySessionOpen] = useState<boolean>(false);
  const [studySessionSubject, setStudySessionSubject] = useState<Subject | "">(
    "",
  );

  // Phase 4 Import & Review Modal State
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [importModalInitialBatchId, setImportModalInitialBatchId] = useState<
    string | null
  >(null);

  // AI Question Generation Modal State
  const [isGenerateModalOpen, setIsGenerateModalOpen] =
    useState<boolean>(false);

  const openImportModal = (batchId: string | null = null) => {
    setImportModalInitialBatchId(batchId);
    setIsImportModalOpen(true);
  };

  // Phase 5 Learning Engine & Weak Concept State
  const [dashboardSummary, setDashboardSummary] =
    useState<LearningDashboardSummary | null>(null);
  const [weakConcepts, setWeakConcepts] = useState<WeakConceptSummary[]>([]);
  const [dueReviews, setDueReviews] = useState<DueReviewItem[]>([]);
  const [excludeTestFixtures, setExcludeTestFixtures] =
    useState<boolean>(false);

  // Phase 6 Recommendation & Daily Queue State
  const [dailyQueue, setDailyQueue] =
    useState<DailyLearningQueueSummary | null>(null);
  const [recommendations, setRecommendations] = useState<
    RecommendedQuestionItem[]
  >([]);
  const [initialSessionData, setInitialSessionData] = useState<{
    session: StudySession;
    firstQuestion: Question;
  } | null>(null);
  const [isStartingDailySession, setIsStartingDailySession] =
    useState<boolean>(false);
  const [isStartingReviewQueue, setIsStartingReviewQueue] =
    useState<boolean>(false);
  const [sourceCounts, setSourceCounts] = useState({
    fixture: 0,
    real: 0,
    ai: 0,
    code: 0,
  });
  const [drillLoadingConceptId, setDrillLoadingConceptId] = useState<
    string | null
  >(null);

  // Phase 7 AI Variation Generation State
  const [isVariationModalOpen, setIsVariationModalOpen] = useState<boolean>(false);
  const [selectedVarType, setSelectedVarType] = useState<string>("PARAMETER_VARIATION");
  const [isGeneratingVar, setIsGeneratingVar] = useState<boolean>(false);
  const [generatedVarResult, setGeneratedVarResult] = useState<any>(null);

  const handleGenerateVariation = async () => {
    if (!questionDetail) return;
    setIsGeneratingVar(true);
    const res = await generateVariationApi({
      questionId: questionDetail.question.id,
      variationType: selectedVarType,
      autoStage: true,
    });
    setIsGeneratingVar(false);
    if (res.data) {
      setGeneratedVarResult(res.data);
    } else {
      alert(res.error || "변형 문제 생성에 실패했습니다.");
    }
  };

  const loadHealth = useCallback(async () => {
    setHealthLoading(true);
    setHealthError(undefined);
    const result = await checkBackendHealth();
    if (result.error) {
      setHealthError(result.error);
      setHealth(null);
    } else {
      setHealth(result.data);
      setHealthError(undefined);
    }
    setHealthLoading(false);
  }, []);

  const loadQuestions = useCallback(async () => {
    setLoadingQuestions(true);
    const filter: QuestionFilter = {};
    if (selectedSubject) filter.subject = selectedSubject;
    if (selectedSourceType) filter.sourceType = selectedSourceType;
    if (selectedType) filter.type = selectedType;
    if (selectedConceptFilter) filter.conceptId = selectedConceptFilter;
    if (searchTerm.trim()) filter.search = searchTerm.trim();
    filter.limit = 200;

    const result = await fetchQuestions(filter);
    if (result.data) {
      setQuestions(result.data.items);
      setTotalQuestions(result.data.total);
      if (!selectedQuestionId && result.data.items.length > 0) {
        setSelectedQuestionId(result.data.items[0].id);
      }
    }
    setLoadingQuestions(false);
  }, [
    selectedSubject,
    selectedSourceType,
    selectedType,
    selectedConceptFilter,
    searchTerm,
    selectedQuestionId,
  ]);

  const loadLearningData = useCallback(async () => {
    const [dashRes, weakRes, dueRes, queueRes, recsRes, statsRes] =
      await Promise.all([
      fetchLearningDashboard(excludeTestFixtures),
      fetchWeakConcepts(5),
      fetchDueReviews(20),
      fetchDailyQueueSummary(excludeTestFixtures),
      fetchRecommendations({ limit: 6, excludeTestFixtures }),
      fetchQuestions({ limit: 500 }),
    ]);
    if (dashRes.data) setDashboardSummary(dashRes.data);
    if (weakRes.data) setWeakConcepts(weakRes.data);
    if (dueRes.data) setDueReviews(dueRes.data);
    if (queueRes.data) setDailyQueue(queueRes.data);
    if (recsRes.data) setRecommendations(recsRes.data.items);
    if (statsRes.data) {
      setSourceCounts({
        fixture: statsRes.data.items.filter((q) => q.sourceType === "TEST_FIXTURE")
          .length,
        real: statsRes.data.items.filter((q) => q.sourceType === "REAL_EXAM")
          .length,
        ai: statsRes.data.items.filter((q) => q.sourceType === "AI_VARIATION")
          .length,
        code: statsRes.data.items.filter((q) => q.type === "CODE_TRACE").length,
      });
    }
  }, [excludeTestFixtures]);

  const handleStartReviewQueue = async () => {
    if (dueReviews.length === 0) {
      alert("오늘 복습할 문항이 없습니다.");
      return;
    }
    setIsStartingReviewQueue(true);
    const res = await createStudySession({
      title: `오늘의 복습 큐 (${dueReviews.length}제)`,
      questionIds: dueReviews.map((item) => item.question.id),
    });
    setIsStartingReviewQueue(false);
    if (res.data) {
      setInitialSessionData(res.data);
      setIsStudySessionOpen(true);
    } else {
      alert(res.error || "복습 세션 생성에 실패했습니다.");
    }
  };

  const handleStartDailySession = async () => {
    setIsStartingDailySession(true);
    const res = await createDailySession({
      count: 10,
      subject: selectedSubject ? selectedSubject : undefined,
      excludeTestFixtures,
    });
    setIsStartingDailySession(false);
    if (res.data) {
      setInitialSessionData(res.data);
      setIsStudySessionOpen(true);
    } else {
      alert(res.error || "오늘의 학습 세션 생성에 실패했습니다.");
    }
  };

  const handleStartConceptDrill = async (conceptId: string) => {
    setDrillLoadingConceptId(conceptId);
    const res = await createConceptDrillSession({
      conceptId,
      count: 5,
    });
    setDrillLoadingConceptId(null);
    if (res.data) {
      setInitialSessionData(res.data);
      setIsStudySessionOpen(true);
    } else {
      alert(res.error || "개념 드릴 세션 생성에 실패했습니다.");
    }
  };

  useEffect(() => {
    loadLearningData();
  }, [loadLearningData]);

  const loadDetail = useCallback(async (id: string) => {
    const result = await fetchQuestionDetail(id);
    if (result.data) {
      setQuestionDetail(result.data);
    }
  }, []);

  useEffect(() => {
    loadHealth();
    const timer = setInterval(loadHealth, 30000);
    return () => clearInterval(timer);
  }, [loadHealth]);

  useEffect(() => {
    loadQuestions();
  }, [
    selectedSubject,
    selectedSourceType,
    selectedType,
    selectedConceptFilter,
    searchTerm,
    loadQuestions,
  ]);

  useEffect(() => {
    if (selectedQuestionId) {
      loadDetail(selectedQuestionId);
    }
  }, [selectedQuestionId, loadDetail]);

  const fixtureCount = sourceCounts.fixture;
  const realExamCount = sourceCounts.real;
  const aiVariationCount = sourceCounts.ai;
  const codeQuestionCount = sourceCounts.code;

  return (
    <div style={styles.appContainer}>
      <Header
        health={health}
        loading={healthLoading}
        error={healthError}
        onRefresh={() => {
          loadHealth();
          loadQuestions();
        }}
        onOpenReviewQueue={() => openImportModal()}
      />

      <main style={styles.mainContent}>
        {/* 오프라인 또는 오류 안내 배너 */}
        {healthError && (
          <div style={styles.alertBanner}>
            <AlertTriangle
              size={20}
              color="var(--color-danger)"
              style={{ flexShrink: 0 }}
            />
            <div style={styles.alertContent}>
              <div style={styles.alertTitle}>백엔드 서버 미연결 감지</div>
              <p style={styles.alertDesc}>{healthError}</p>
              <div style={styles.commandBox}>
                <code>npm run dev:server</code>
                <span>(포트: 8765로 Fastify 서버 구동)</span>
              </div>
            </div>
          </div>
        )}

        {/* Phase 3 헤더 카드 */}
        <section style={styles.heroSection}>
          <div style={styles.heroHeader}>
            <div style={styles.badgeRow}>
              <span style={styles.badgePrimary}>
                정보처리기사 실기
              </span>
              <span style={styles.badgeGreen}>
                전체 {totalQuestions}문항 학습 가능
              </span>
            </div>
            <h2 style={styles.heroTitle}>
              정보처리기사 실기 집중 풀이
            </h2>
            <p style={styles.heroSubtitle}>
              실제 기출문제 풀이, 취약 개념 분석 및 반복 복습을 진행할 수 있는 실기 시험 대비 학습 플랫폼입니다.
            </p>
          </div>

          <div style={styles.grid4}>
            {/* 통계 1: 전체 문항 */}
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div
                  style={{
                    ...styles.cardIconBox,
                    backgroundColor: "rgba(59, 130, 246, 0.15)",
                  }}
                >
                  <Database size={20} color="#3B82F6" />
                </div>
                <span style={styles.cardTag}>문제 보관함</span>
              </div>
              <h3 style={styles.cardTitle}>전체 수록 문항</h3>
              <p style={styles.cardDesc}>
                단답형, 코드 추적, SQL, 약점 변형 문제를 포함합니다.
              </p>
              <div style={styles.cardFooter}>
                <span style={styles.footerLabel}>전체 문항수:</span>
                <span style={styles.statusOk}>{totalQuestions}문항</span>
              </div>
            </div>

            {/* 통계 2: 검증 Fixture / 기출 */}
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div
                  style={{
                    ...styles.cardIconBox,
                    backgroundColor: "rgba(16, 185, 129, 0.15)",
                  }}
                >
                  <FileCheck size={20} color="#10B981" />
                </div>
                <span style={styles.cardTag}>실전 기출</span>
              </div>
              <h3 style={styles.cardTitle}>실제 기출 및 핵심 문항</h3>
              <p style={styles.cardDesc}>
                검증된 정답과 상세 해설이 포함된 실전 문항입니다.
              </p>
              <div style={styles.cardFooter}>
                <span style={styles.footerLabel}>기출 / 연습:</span>
                <span style={styles.statusOk}>
                  {realExamCount} / {fixtureCount}문항
                </span>
              </div>
            </div>

            {/* 통계 3: AI 변형 */}
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div
                  style={{
                    ...styles.cardIconBox,
                    backgroundColor: "rgba(168, 85, 247, 0.15)",
                  }}
                >
                  <GitBranch size={20} color="#A855F7" />
                </div>
                <span style={styles.cardTag}>변형 문제</span>
              </div>
              <h3 style={styles.cardTitle}>기출 파생 변형 문제</h3>
              <p style={styles.cardDesc}>
                기출 핵심 원리를 바탕으로 변형된 심화 문항입니다.
              </p>
              <div style={styles.cardFooter}>
                <span style={styles.footerLabel}>변형 문항수:</span>
                <span style={styles.statusInfo}>{aiVariationCount}문항</span>
              </div>
            </div>

            {/* 통계 4: 코드 추적 문제 */}
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div
                  style={{
                    ...styles.cardIconBox,
                    backgroundColor: "rgba(245, 158, 11, 0.15)",
                  }}
                >
                  <Code2 size={20} color="#F59E0B" />
                </div>
                <span style={styles.cardTag}>프로그래밍</span>
              </div>
              <h3 style={styles.cardTitle}>코드 실행 추적 문항</h3>
              <p style={styles.cardDesc}>
                C언어 포인터, Java 상속·다형성, Python 인덱싱 등을 다룹니다.
              </p>
              <div style={styles.cardFooter}>
                <span style={styles.footerLabel}>코드 문항수:</span>
                <span style={styles.statusOk}>{codeQuestionCount}문항</span>
              </div>
            </div>
          </div>

          {/* 실기 집중 풀이 실행 배너 */}
          <div style={styles.sessionBanner}>
            <div style={styles.sessionBannerLeft}>
              <div style={styles.sessionBannerIcon}>
                <Flame size={28} color="#F59E0B" />
              </div>
              <div>
                <h3 style={styles.sessionBannerTitle}>
                  실기 집중 풀이 세션
                </h3>
                <p style={styles.sessionBannerSubtitle}>
                  시험 실전과 동일한 환경에서 단답형 및 코드 추적 문제를 직접 풀이하고 즉시 정답과 해설을 확인하세요.
                </p>
              </div>
            </div>
            <div style={styles.sessionBannerActions}>
              <button
                onClick={() => {
                  setInitialSessionData(null);
                  setStudySessionSubject(selectedSubject);
                  setIsStudySessionOpen(true);
                }}
                style={styles.sessionBannerBtn}
              >
                <Play size={18} />
                <span>집중 학습 세션 시작하기</span>
              </button>
              <button
                onClick={handleStartReviewQueue}
                disabled={isStartingReviewQueue || dueReviews.length === 0}
                style={styles.reviewQueueBannerBtn}
              >
                <Brain size={18} color="#A5B4FC" />
                <span>
                  {isStartingReviewQueue
                    ? "복습 세션 준비 중..."
                    : `오늘의 복습 큐 (${dueReviews.length}문항)`}
                </span>
              </button>
              <button
                onClick={() => setIsGenerateModalOpen(true)}
                style={{
                  ...styles.importBannerBtn,
                  backgroundColor: "rgba(168, 85, 247, 0.15)",
                  borderColor: "rgba(168, 85, 247, 0.4)",
                  color: "#C084FC",
                }}
              >
                <Sparkles size={18} color="#C084FC" />
                <span>AI 문제 생성</span>
              </button>
            </div>
          </div>
        </section>

        {/* 오늘의 추천 학습 대시보드 */}
        <section style={styles.dailyQueueSection}>
          <div style={styles.dailyQueueHeader}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={styles.dailyQueueIconBox}>
                <Zap size={22} color="#F59E0B" />
              </div>
              <div>
                <div
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <h3 style={styles.dailyQueueTitle}>
                    오늘의 맞춤 학습 큐
                  </h3>
                  <span style={styles.dailyQueueBadge}>
                    추천 학습
                  </span>
                </div>
                <p style={styles.dailyQueueSubtitle}>
                  복습 주기, 취약 개념, 최근 오답 및 미풀이 문항을 종합 분석하여 추천 문제를 자동 구성합니다.
                </p>
              </div>
            </div>

            <button
              onClick={handleStartDailySession}
              disabled={isStartingDailySession}
              style={styles.dailyQueueStartBtn}
            >
              <Zap size={18} />
              <span>
                {isStartingDailySession
                  ? "학습 큐 구성 중..."
                  : "오늘의 학습 시작"}
              </span>
            </button>
          </div>

          {/* 4분할 통계 수치 */}
          <div style={styles.dailyQueueStatsGrid}>
            <div style={styles.dailyStatCard}>
              <span style={styles.dailyStatLabel}>복습 예정</span>
              <span style={{ ...styles.dailyStatValue, color: "#EF4444" }}>
                {dailyQueue?.dueCount ?? dueReviews.length}제
              </span>
              <span style={styles.dailyStatHint}>망각 곡선 도래 문항</span>
            </div>
            <div style={styles.dailyStatCard}>
              <span style={styles.dailyStatLabel}>취약 개념</span>
              <span style={{ ...styles.dailyStatValue, color: "#F59E0B" }}>
                {dailyQueue?.weakConceptCount ?? weakConcepts.length}개
              </span>
              <span style={styles.dailyStatHint}>오답/Unknown 누적 영역</span>
            </div>
            <div style={styles.dailyStatCard}>
              <span style={styles.dailyStatLabel}>최근 오답</span>
              <span style={{ ...styles.dailyStatValue, color: "#A855F7" }}>
                {dailyQueue?.recentFailedCount ?? 0}제
              </span>
              <span style={styles.dailyStatHint}>오답 & 정답확인 문항</span>
            </div>
            <div style={styles.dailyStatCard}>
              <span style={styles.dailyStatLabel}>신규 문항</span>
              <span style={{ ...styles.dailyStatValue, color: "#10B981" }}>
                {dailyQueue?.newQuestionsCount ?? 0}제
              </span>
              <span style={styles.dailyStatHint}>
                아직 풀지 않은 미도전 문제
              </span>
            </div>
          </div>

          {/* 콜드 스타트 안내 배너 (데이터 0건일 때) */}
          {dailyQueue?.isColdStart && (
            <div style={styles.coldStartBanner}>
              <Sparkles size={18} color="#FBBF24" />
              <span>
                아직 풀이 이력이 없습니다. [오늘의 학습 시작]을 누르면 미풀이
                기출 문항으로 첫 세션이 자동 구성되며, 풀이 이력이 쌓일수록
                나만을 위한 복습 주기와 취약 개념 드릴링이 정교해집니다.
              </span>
            </div>
          )}

          {/* 추천 문항 Top N 및 사유 배지 (Reason Codes) */}
          {recommendations.length > 0 && (
            <div style={styles.recommendationsContainer}>
              <div style={styles.recommendationsHeader}>
                <div
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <TrendingUp size={16} color="#60A5FA" />
                  <span style={styles.recommendationsTitle}>
                    엔진이 선별한 우선 추천 문항 및 추천 사유
                  </span>
                </div>
                <span style={styles.recommendationsSubtitle}>
                  가중치: 복습주기(35) + 취약개념(25) + Unknown(24) +
                  정답확인(20) + 오답(18)
                </span>
              </div>

              <div style={styles.recommendationsGrid}>
                {recommendations.map((rec) => (
                  <div
                    key={rec.question.id}
                    style={styles.recItemCard}
                    onClick={() => {
                      setSelectedQuestionId(rec.question.id);
                      const el = document.getElementById(
                        "question-detail-view",
                      );
                      el?.scrollIntoView({ behavior: "smooth" });
                    }}
                  >
                    <div style={styles.recItemTop}>
                      <span style={styles.recSubjectBadge}>
                        {rec.question.subject}
                      </span>
                      <span style={styles.recScoreBadge}>
                        {rec.score.totalScore}점
                      </span>
                    </div>

                    <p style={styles.recPromptText}>
                      {rec.question.question.length > 65
                        ? `${rec.question.question.slice(0, 65)}...`
                        : rec.question.question}
                    </p>

                    <div style={styles.recReasonsRow}>
                      {rec.score.reasonCodes.map((code: string) => {
                        const BADGE_MAP: Record<
                          string,
                          { label: string; bg: string; color: string }
                        > = {
                          DUE_REVIEW: {
                            label: "복습 예정",
                            bg: "rgba(239, 68, 68, 0.15)",
                            color: "#F87171",
                          },
                          WEAK_CONCEPT: {
                            label: "취약 개념",
                            bg: "rgba(244, 63, 94, 0.15)",
                            color: "#FB7185",
                          },
                          RECENT_FAILURE: {
                            label: "최근 오답",
                            bg: "rgba(245, 158, 11, 0.15)",
                            color: "#FBBF24",
                          },
                          RECENT_UNKNOWN: {
                            label: "Unknown 발생",
                            bg: "rgba(168, 85, 247, 0.15)",
                            color: "#C084FC",
                          },
                          SOLUTION_REVEALED: {
                            label: "정답 확인",
                            bg: "rgba(99, 102, 241, 0.15)",
                            color: "#818CF8",
                          },
                          HINT_DEPENDENCY: {
                            label: "힌트 의존",
                            bg: "rgba(234, 179, 8, 0.15)",
                            color: "#FACC15",
                          },
                          LONG_INACTIVE: {
                            label: "장기 미복습",
                            bg: "rgba(6, 182, 212, 0.15)",
                            color: "#22D3EE",
                          },
                          NEW_UNSTUDIED: {
                            label: "새 문제",
                            bg: "rgba(16, 185, 129, 0.15)",
                            color: "#34D399",
                          },
                        };
                        const badge = BADGE_MAP[code] || {
                          label: code,
                          bg: "rgba(255,255,255,0.1)",
                          color: "#94A3B8",
                        };
                        return (
                          <span
                            key={code}
                            style={{
                              ...styles.reasonBadge,
                              backgroundColor: badge.bg,
                              color: badge.color,
                            }}
                          >
                            {badge.label}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ============================================================== */}
        {/* PHASE 5: 학습 엔진 & 취약 개념 추적 대시보드 */}
        {/* ============================================================== */}
        <section style={styles.learningSection}>
          <div style={styles.learningHeaderRow}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <Brain size={22} color="#818CF8" />
              <h3 style={styles.learningSectionHeading}>
                개념별 취약점 분석 & 복습 현황
              </h3>
            </div>

            {/* Test Fixture 제외 필터 토글 */}
            <label style={styles.fixtureToggleLabel}>
              <input
                type="checkbox"
                checked={excludeTestFixtures}
                onChange={(e) => setExcludeTestFixtures(e.target.checked)}
                style={styles.fixtureCheckbox}
              />
              <span style={{ fontSize: "12px", color: "#94A3B8" }}>
                기초 연습 문항 제외 (실전 기출 중심 통계)
              </span>
            </label>
          </div>

          <div style={styles.learningGrid}>
            {/* CARD 1: 취약 개념 Top 5 */}
            <div style={styles.learningCard}>
              <div style={styles.learningCardHeader}>
                <div
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <Target size={18} color="#EF4444" />
                  <h4 style={styles.learningCardTitle}>
                    집중 극복 취약 개념 Top 5
                  </h4>
                </div>
                {selectedConceptFilter && (
                  <button
                    onClick={() => setSelectedConceptFilter(null)}
                    style={styles.clearFilterBtn}
                  >
                    필터 해제 ✕
                  </button>
                )}
              </div>

              {weakConcepts.length === 0 ? (
                <div style={styles.emptyConceptBox}>
                  <p style={{ margin: 0, color: "#94A3B8", fontSize: "13px" }}>
                    아직 집계된 취약 개념이 없습니다. 집중 학습 세션을 진행하면
                    오답·모르겠음·힌트 사용 데이터가 개념별로 자동 집계됩니다.
                  </p>
                </div>
              ) : (
                <div style={styles.conceptList}>
                  {weakConcepts.map((wc) => (
                    <div
                      key={wc.conceptId}
                      style={{
                        ...styles.conceptItem,
                        borderColor:
                          selectedConceptFilter === wc.conceptId
                            ? "#3B82F6"
                            : "rgba(255, 255, 255, 0.08)",
                        backgroundColor:
                          selectedConceptFilter === wc.conceptId
                            ? "rgba(59, 130, 246, 0.08)"
                            : "#1E293B",
                      }}
                    >
                      <div style={styles.conceptItemTop}>
                        <span style={styles.conceptSubjectBadge}>
                          {wc.subject}
                        </span>
                        <span style={styles.conceptCategoryText}>
                          {wc.category}
                        </span>
                        <span
                          style={{
                            ...styles.conceptWeaknessBadge,
                            backgroundColor:
                              wc.weaknessScore >= 0.7
                                ? "rgba(239, 68, 68, 0.2)"
                                : wc.weaknessScore >= 0.4
                                  ? "rgba(245, 158, 11, 0.2)"
                                  : "rgba(16, 185, 129, 0.2)",
                            color:
                              wc.weaknessScore >= 0.7
                                ? "#F87171"
                                : wc.weaknessScore >= 0.4
                                  ? "#FBBF24"
                                  : "#34D399",
                          }}
                        >
                          취약도 {Math.round(wc.weaknessScore * 100)}%
                        </span>
                      </div>

                      <div style={styles.conceptTitleRow}>
                        <span style={styles.conceptTitle}>
                          {wc.conceptTitle}
                        </span>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            onClick={() =>
                              handleStartConceptDrill(wc.conceptId)
                            }
                            disabled={drillLoadingConceptId === wc.conceptId}
                            style={styles.drillStartBtn}
                            title="이 개념에 속한 문제로 집중 드릴 세션을 시작합니다"
                          >
                            <Crosshair size={13} />
                            <span>
                              {drillLoadingConceptId === wc.conceptId
                                ? "생성 중..."
                                : "집중 드릴"}
                            </span>
                          </button>
                          <button
                            onClick={() =>
                              setSelectedConceptFilter(
                                selectedConceptFilter === wc.conceptId
                                  ? null
                                  : wc.conceptId,
                              )
                            }
                            style={styles.filterByConceptBtn}
                          >
                            {selectedConceptFilter === wc.conceptId
                              ? "선택됨 ✓"
                              : "모아보기"}
                          </button>
                        </div>
                      </div>

                      {/* Weakness Progress Bar */}
                      <div style={styles.progressBarBg}>
                        <div
                          style={{
                            ...styles.progressBarFill,
                            width: `${Math.round(wc.weaknessScore * 100)}%`,
                            backgroundColor:
                              wc.weaknessScore >= 0.7
                                ? "#EF4444"
                                : wc.weaknessScore >= 0.4
                                  ? "#F59E0B"
                                  : "#10B981",
                          }}
                        />
                      </div>

                      <div style={styles.conceptStatsRow}>
                        <span>
                          시도: <strong>{wc.totalAttempts}회</strong>
                        </span>
                        <span style={{ color: "#F87171" }}>
                          오답: <strong>{wc.wrongCount}회</strong>
                        </span>
                        <span style={{ color: "#FBBF24" }}>
                          모르겠음: <strong>{wc.unknownCount}회</strong>
                        </span>
                        <span style={{ color: "#60A5FA" }}>
                          힌트: <strong>{wc.hintCount}회</strong>
                        </span>
                        <span>
                          평균: <strong>{wc.avgScore}점</strong>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* CARD 2: 오늘의 복습 큐 & Leitner Box */}
            <div style={styles.learningCard}>
              <div style={styles.learningCardHeader}>
                <div
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <Brain size={18} color="#818CF8" />
                  <h4 style={styles.learningCardTitle}>
                    능동 복습 큐 & 라이트너 5단계 분포
                  </h4>
                </div>
                <span style={styles.dueBadge}>
                  오늘 대기: {dueReviews.length}문항
                </span>
              </div>

              {/* Learning Dashboard 4-Stats Grid */}
              {dashboardSummary && (
                <div style={styles.leitnerBoxesContainer}>
                  <div style={styles.leitnerBoxCol}>
                    <span style={styles.leitnerBoxName}>학습 문항</span>
                    <span style={styles.leitnerBoxInterval}>누적 풀이</span>
                    <span style={styles.leitnerBoxCount}>
                      {dashboardSummary.totalStudiedQuestions}
                    </span>
                  </div>
                  <div style={styles.leitnerBoxCol}>
                    <span style={styles.leitnerBoxName}>복습 대기</span>
                    <span style={styles.leitnerBoxInterval}>오늘 대상</span>
                    <span
                      style={{ ...styles.leitnerBoxCount, color: "#EF4444" }}
                    >
                      {dashboardSummary.dueReviewCount}
                    </span>
                  </div>
                  <div style={styles.leitnerBoxCol}>
                    <span style={styles.leitnerBoxName}>마스터</span>
                    <span style={styles.leitnerBoxInterval}>숙련 완료</span>
                    <span
                      style={{ ...styles.leitnerBoxCount, color: "#10B981" }}
                    >
                      {dashboardSummary.masteredCount}
                    </span>
                  </div>
                  <div style={styles.leitnerBoxCol}>
                    <span style={styles.leitnerBoxName}>정답률</span>
                    <span style={styles.leitnerBoxInterval}>누적 비율</span>
                    <span
                      style={{ ...styles.leitnerBoxCount, color: "#38BDF8" }}
                    >
                      {dashboardSummary.overallAccuracy}%
                    </span>
                  </div>
                </div>
              )}

              {/* DUE REVIEWS LIST PREVIEW */}
              <div
                style={{
                  marginTop: "14px",
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <span
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "#94A3B8",
                    marginBottom: "8px",
                  }}
                >
                  오늘 복습 권장 문항 ({dueReviews.length}개 대기 중)
                </span>

                {dueReviews.length === 0 ? (
                  <div style={styles.emptyDueBox}>
                    <CheckCircle size={24} color="#10B981" />
                    <span
                      style={{
                        fontSize: "13px",
                        color: "#10B981",
                        fontWeight: 600,
                      }}
                    >
                      오늘 복습 대기 문항이 없습니다. 완벽합니다!
                    </span>
                    <span style={{ fontSize: "12px", color: "#64748B" }}>
                      새로운 문제를 풀이하거나 전체 학습 세션을 진행해보세요.
                    </span>
                  </div>
                ) : (
                  <div style={styles.dueList}>
                    {dueReviews.slice(0, 4).map((d) => (
                      <div key={d.question.id} style={styles.dueItem}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                          }}
                        >
                          <span style={styles.dueBoxBadge}>
                            Box {d.reviewState.boxLevel}
                          </span>
                          <span style={styles.dueQuestionSubject}>
                            {d.question.subject}
                          </span>
                          <span style={styles.dueConceptTitle}>
                            {d.question.keywords?.[0]
                              ? `#${d.question.keywords[0]}`
                              : d.question.type}
                          </span>
                        </div>
                        <span style={styles.dueIntervalText}>
                          주기 {d.reviewState.intervalDays}일 뒤
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={handleStartReviewQueue}
                  disabled={isStartingReviewQueue || dueReviews.length === 0}
                  style={styles.startReviewSessionBtn}
                >
                  <RotateCcw size={16} />
                  <span>오늘의 복습 세션 시작하기 (망각 방지 회상)</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* 대화형 문제 브라우저 & 상세 인스펙터 */}
        <section style={styles.section}>
          <div style={styles.sectionTitleRow}>
            <Eye size={20} color="#3B82F6" />
            <h3 style={styles.sectionHeading}>
              문제 도메인 브라우저 & 데이터 인스펙터
            </h3>
          </div>

          {/* 검색 및 필터 컨트롤 바 */}
          <div style={styles.filterBar}>
            <div style={styles.searchWrapper}>
              <Search size={16} color="var(--color-text-muted)" />
              <input
                type="text"
                placeholder="지문 내용, 키워드, 카테고리 검색 (예: 포인터, ACID, 빌더...)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={styles.searchInput}
              />
            </div>

            <div style={styles.filterGroup}>
              {/* 과목 필터 */}
              <select
                value={selectedSubject}
                onChange={(e) =>
                  setSelectedSubject(e.target.value as Subject | "")
                }
                style={styles.selectInput}
              >
                <option value="">모든 과목 (전체)</option>
                {SUBJECT_LIST.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              {/* 출처 필터 */}
              <select
                value={selectedSourceType}
                onChange={(e) =>
                  setSelectedSourceType(
                    e.target.value as QuestionSourceType | "",
                  )
                }
                style={styles.selectInput}
              >
                <option value="">모든 출처 (전체)</option>
                <option value="TEST_FIXTURE">
                  기초 연습 문제 (FIXTURE)
                </option>
                <option value="REAL_EXAM">실제 기출 (REAL_EXAM)</option>
                <option value="TEXTBOOK_EXPECTED">기본서 예상문제 (TEXTBOOK_EXPECTED)</option>
                <option value="AI_GENERATED">AI 신규 생성 (AI_GENERATED)</option>
                <option value="AI_VARIATION">기출 변형 (AI_VARIATION)</option>
                <option value="TEXTBOOK">공인 교재 (TEXTBOOK)</option>
              </select>

              {/* 유형 필터 */}
              <select
                value={selectedType}
                onChange={(e) =>
                  setSelectedType(e.target.value as QuestionType | "")
                }
                style={styles.selectInput}
              >
                <option value="">모든 유형 (전체)</option>
                <option value="SHORT_ANSWER">주관식 단답형</option>
                <option value="CODE_TRACE">코드 추적 (CODE_TRACE)</option>
                <option value="SQL">SQL 응용</option>
              </select>
            </div>
          </div>

          {/* 2컬럼 레이아웃: 좌측 문제 목록, 우측 선택 상세 인스펙터 */}
          <div style={styles.browserLayout}>
            {/* 좌측: 문제 카드 목록 */}
            <div style={styles.listColumn}>
              {loadingQuestions && (
                <div style={styles.loadingText}>문항을 불러오는 중...</div>
              )}
              {!loadingQuestions && questions.length === 0 && (
                <div style={styles.emptyText}>
                  조건에 부합하는 문제가 없습니다.
                </div>
              )}
              {questions.map((q) => {
                const isSelected = q.id === selectedQuestionId;
                const sourceLabel =
                  QUESTION_SOURCE_LABELS[q.sourceType] || q.sourceType;
                return (
                  <div
                    key={q.id}
                    style={{
                      ...styles.questionItem,
                      borderColor: isSelected
                        ? "var(--color-primary)"
                        : "var(--color-border)",
                      backgroundColor: isSelected
                        ? "rgba(59, 130, 246, 0.08)"
                        : "rgba(15, 23, 42, 0.5)",
                    }}
                    onClick={() => setSelectedQuestionId(q.id)}
                  >
                    <div style={styles.itemMetaRow}>
                      <span
                        style={{
                          ...styles.sourceBadge,
                          backgroundColor:
                            q.sourceType === "REAL_EXAM"
                              ? "rgba(16, 185, 129, 0.2)"
                              : q.sourceType === "AI_VARIATION" ||
                                  q.sourceType === "AI_GENERATED"
                                ? "rgba(168, 85, 247, 0.2)"
                                : "rgba(59, 130, 246, 0.2)",
                          color:
                            q.sourceType === "REAL_EXAM"
                              ? "#34D399"
                              : q.sourceType === "AI_VARIATION" ||
                                  q.sourceType === "AI_GENERATED"
                                ? "#C084FC"
                                : "#60A5FA",
                        }}
                      >
                        {sourceLabel}
                      </span>
                      <span style={styles.subjectTag}>{q.subject}</span>
                      <span style={styles.diffTag}>{q.difficulty}</span>
                      {q.examYear && (
                        <span
                          style={{
                            ...styles.diffTag,
                            backgroundColor: "rgba(245, 158, 11, 0.15)",
                            color: "#FBBF24",
                            borderColor: "rgba(245, 158, 11, 0.4)",
                            fontWeight: 600,
                          }}
                        >
                          {q.examYear}년 {q.examRound}회 #{q.questionNumber}
                        </span>
                      )}
                    </div>

                    <div style={styles.itemQuestionText}>
                      {q.question.length > 70
                        ? `${q.question.slice(0, 70)}...`
                        : q.question}
                    </div>

                    <div style={styles.itemFooterRow}>
                      <span
                        style={{
                          fontFamily: "monospace",
                          fontSize: "11px",
                          fontWeight: 700,
                          color: "#60A5FA",
                          backgroundColor: "rgba(59, 130, 246, 0.12)",
                          border: "1px solid rgba(59, 130, 246, 0.25)",
                          padding: "1px 6px",
                          borderRadius: "4px",
                        }}
                      >
                        {q.questionCode || q.id}
                      </span>
                      {q.language && (
                        <span style={styles.langTag}>{q.language}</span>
                      )}
                      {q.parentQuestionId && (
                        <span style={styles.parentLinkTag}>
                          <GitBranch size={11} style={{ marginRight: "3px" }} />
                          변형 문항
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 우측: 상세 인스펙터 */}
            <div style={styles.detailColumn}>
              {questionDetail ? (
                <div style={styles.detailBox}>
                  {/* 상세 상단 메타데이터 */}
                  <div style={styles.detailHeader}>
                    <div style={styles.detailIdRow}>
                      <span
                        onClick={() => {
                          const code =
                            questionDetail.question.questionCode ||
                            questionDetail.question.id;
                          navigator.clipboard.writeText(code);
                          alert(
                            `문항 식별 코드 '${code}'가 클립보드에 복사되었습니다.`,
                          );
                        }}
                        style={{
                          cursor: "pointer",
                          fontFamily: "monospace",
                          fontSize: "13px",
                          fontWeight: 700,
                          color: "#60A5FA",
                          backgroundColor: "rgba(59, 130, 246, 0.15)",
                          border: "1px solid rgba(59, 130, 246, 0.4)",
                          borderRadius: "6px",
                          padding: "3px 8px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                        title="클릭하여 문항 식별 코드 복사"
                      >
                        <span>
                          {questionDetail.question.questionCode ||
                            questionDetail.question.id}
                        </span>
                        <span style={{ fontSize: "11px", opacity: 0.8 }}>📋</span>
                      </span>

                      <span
                        style={{
                          ...styles.sourceBadge,
                          backgroundColor:
                            questionDetail.question.sourceType === "REAL_EXAM"
                              ? "rgba(16, 185, 129, 0.2)"
                              : questionDetail.question.sourceType ===
                                    "AI_VARIATION" ||
                                  questionDetail.question.sourceType ===
                                    "AI_GENERATED"
                                ? "rgba(168, 85, 247, 0.2)"
                                : "rgba(59, 130, 246, 0.2)",
                          color:
                            questionDetail.question.sourceType === "REAL_EXAM"
                              ? "#34D399"
                              : questionDetail.question.sourceType ===
                                    "AI_VARIATION" ||
                                  questionDetail.question.sourceType ===
                                    "AI_GENERATED"
                                ? "#C084FC"
                                : "#60A5FA",
                        }}
                      >
                        {
                          QUESTION_SOURCE_LABELS[
                            questionDetail.question.sourceType
                          ]
                        }
                      </span>
                      {(questionDetail.question.sourceType === "AI_GENERATED" ||
                        questionDetail.question.sourceType === "AI_VARIATION") && (
                        <span
                          style={{
                            fontSize: "11px",
                            color: "#FBBF24",
                            backgroundColor: "rgba(245, 158, 11, 0.15)",
                            border: "1px solid rgba(245, 158, 11, 0.3)",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            fontWeight: 600,
                          }}
                          title="현재 환경에 C 컴파일러가 없어 정적 정합성 검증만 통과한 상태입니다."
                        >
                          실제 C 실행 미검증 (정적 검증)
                        </span>
                      )}
                      <span style={styles.subjectTag}>
                        {questionDetail.question.subject}
                      </span>
                      <span style={styles.diffTag}>
                        {questionDetail.question.difficulty}
                      </span>
                      {questionDetail.question.examYear && (
                        <span style={styles.examTag}>
                          {questionDetail.question.examYear}년{" "}
                          {questionDetail.question.examRound}회 기출 (
                          {questionDetail.question.questionNumber}번)
                        </span>
                      )}
                      <button
                        onClick={() => {
                          setInitialSessionData(null);
                          setStudySessionSubject(
                            questionDetail.question.subject,
                          );
                          setIsStudySessionOpen(true);
                        }}
                        style={styles.solveDetailBtn}
                        title="이 과목을 대상으로 집중 문제 풀이 세션을 시작합니다"
                      >
                        <Play size={13} />
                        <span>이 과목 풀이 세션</span>
                      </button>
                    </div>
                  </div>

                  {/* 지문 */}
                  <div style={styles.detailSection}>
                    <div style={styles.sectionSubTitle}>문제 지문</div>
                    <div style={styles.questionFullText}>
                      {questionDetail.question.question}
                    </div>
                  </div>

                  {/* 코드 스니펫 (존재 시) */}
                  {questionDetail.question.code && (
                    <div style={styles.detailSection}>
                      <div style={styles.sectionSubTitle}>
                        코드 ({questionDetail.question.language || "CODE"})
                      </div>
                      <pre style={styles.codeBlock}>
                        <code>{questionDetail.question.code}</code>
                      </pre>
                    </div>
                  )}

                  {/* Ground Truth 섹션 (엄격히 보호되는 공식 정답 및 해설) */}
                  <div style={styles.groundTruthBox}>
                    <div style={styles.boxTitleRow}>
                      <FileCheck size={16} color="var(--color-success)" />
                      <span style={styles.groundTruthTitle}>
                        Ground Truth (공식 검증 정답 & 원본 해설)
                      </span>
                    </div>

                    <div style={styles.answerValueBox}>
                      <span style={styles.answerLabel}>공식 정답:</span>
                      <span style={styles.answerValue}>
                        {Array.isArray(
                          questionDetail.question.groundTruthAnswer,
                        )
                          ? questionDetail.question.groundTruthAnswer.join(", ")
                          : questionDetail.question.groundTruthAnswer}
                      </span>
                    </div>

                    {questionDetail.question.officialExplanation && (
                      <div style={styles.officialExplanation}>
                        <div style={styles.explanationLabel}>공식 해설:</div>
                        <p>{questionDetail.question.officialExplanation}</p>
                      </div>
                    )}
                  </div>

                  {/* Phase 7: AI 변형 문제 생성 액션 바 */}
                  <div style={styles.variationActionBar}>
                    <div style={styles.variationActionLeft}>
                      <Sparkles size={16} color="#C084FC" />
                      <span style={styles.variationActionTitle}>
                        이 원본 문제를 기반으로 AI 변형 문제를 생성하여 Staging 검수 파이프라인에 등록할 수 있습니다.
                      </span>
                    </div>
                    <button
                      style={styles.generateVarBtn}
                      onClick={() => {
                        setGeneratedVarResult(null);
                        setIsVariationModalOpen(true);
                      }}
                    >
                      <Sparkles size={14} />
                      <span>AI 변형 문제 생성 (Staging 검수)</span>
                    </button>
                  </div>

                  {/* AI 보조 해설 및 변형 노트 섹션 (Ground Truth와 명확히 분리) */}
                  {(questionDetail.question.aiExplanation ||
                    questionDetail.question.aiVariationNotes) && (
                    <div style={styles.aiBox}>
                      <div style={styles.boxTitleRow}>
                        <Sparkles size={16} color="#A855F7" />
                        <span style={styles.aiTitle}>
                          AI 보조 해설 및 변형 생성 근거 (Ground Truth와 분리)
                        </span>
                      </div>

                      {questionDetail.question.aiVariationNotes && (
                        <div style={styles.aiNoteItem}>
                          <span style={styles.aiNoteLabel}>
                            기출 변형 설계 의도:
                          </span>
                          <p>{questionDetail.question.aiVariationNotes}</p>
                        </div>
                      )}

                      {questionDetail.question.aiExplanation && (
                        <div style={styles.aiNoteItem}>
                          <span style={styles.aiNoteLabel}>AI 보조 설명:</span>
                          <p>{questionDetail.question.aiExplanation}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 계층 구조: 부모 기출문제 정보 (자신이 변형 문제인 경우) */}
                  {questionDetail.parentQuestion && (
                    <div style={styles.hierarchyBox}>
                      <div style={styles.boxTitleRow}>
                        <GitBranch size={16} color="#3B82F6" />
                        <span style={styles.hierarchyTitle}>
                          파생 원본 기출문제 (Parent Question)
                        </span>
                      </div>
                      <div
                        style={styles.parentCard}
                        onClick={() =>
                          setSelectedQuestionId(
                            questionDetail.parentQuestion!.id,
                          )
                        }
                      >
                        <div style={styles.parentCardHeader}>
                          <span style={styles.parentCardId}>
                            {questionDetail.parentQuestion.id}
                          </span>
                          <span style={styles.parentCardSubject}>
                            {questionDetail.parentQuestion.subject}
                          </span>
                          <span style={styles.parentClickHint}>
                            클릭하여 원본 기출 보기 &rarr;
                          </span>
                        </div>
                        <div style={styles.parentCardText}>
                          {questionDetail.parentQuestion.question}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 계층 구조: 파생된 AI 변형 문제 목록 (자신이 원본 기출인 경우) */}
                  {questionDetail.variations.length > 0 && (
                    <div style={styles.hierarchyBox}>
                      <div style={styles.boxTitleRow}>
                        <GitBranch size={16} color="#A855F7" />
                        <span style={styles.hierarchyTitle}>
                          이 기출에서 파생된 AI 변형 문제 (
                          {questionDetail.variations.length}건)
                        </span>
                      </div>
                      <div style={styles.variationsList}>
                        {questionDetail.variations.map((v) => (
                          <div
                            key={v.id}
                            style={styles.variationCard}
                            onClick={() => setSelectedQuestionId(v.id)}
                          >
                            <div style={styles.variationCardHeader}>
                              <span style={styles.variationId}>{v.id}</span>
                              <span style={styles.variationDiff}>
                                {v.difficulty}
                              </span>
                              <span style={styles.parentClickHint}>
                                클릭하여 변형 문항 보기 &rarr;
                              </span>
                            </div>
                            <div style={styles.variationText}>{v.question}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 키워드 태그 */}
                  <div style={styles.keywordsRow}>
                    <span style={styles.keywordsLabel}>색인 키워드:</span>
                    {questionDetail.question.keywords.map((kw, idx) => (
                      <span key={idx} style={styles.keywordBadge}>
                        #{kw}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={styles.selectPrompt}>
                  좌측 목록에서 문항을 선택하면 상세 내용이 표시됩니다.
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 출제기준 검증 공지 섹션 */}
        <section style={styles.noticeSection}>
          <div style={styles.noticeHeader}>
            <Info size={18} color="#60A5FA" />
            <h4 style={styles.noticeTitle}>
              시험 제도 및 과목 출제구조 공식 검증 관리 체계
            </h4>
          </div>
          <p style={styles.noticeText}>{DEFAULT_SYLLABUS_CONFIG.notes}</p>
          <div style={styles.noticeMeta}>
            <span>
              관리 버전: <code>{DEFAULT_SYLLABUS_CONFIG.version}</code>
            </span>
            <span>최종 업데이트: {DEFAULT_SYLLABUS_CONFIG.lastUpdated}</span>
            <span style={styles.noticeStatus}>
              상태: 잠정 추정치 (공식 큐넷 출제기준 대조 전)
            </span>
          </div>
        </section>
      </main>

      <footer style={styles.footer}>
        <div style={styles.footerContent}>
          <span>
            jungcheogi-trainer-pc &bull; 정보처리기사 실기 집중 트레이너
          </span>
          <span>PC 최적화 학습 모드</span>
        </div>
      </footer>

      {/* Phase 3, 5 & 6 집중 문제 풀이 및 복습 모달 */}
      <StudySessionModal
        isOpen={isStudySessionOpen}
        onClose={() => {
          setIsStudySessionOpen(false);
          setInitialSessionData(null);
          loadQuestions();
          loadLearningData();
        }}
        initialSubject={studySessionSubject}
        initialSessionData={initialSessionData}
      />

      {/* Phase 4 검수 스테이징 관리 모달 */}
      <ImportModal
        isOpen={isImportModalOpen}
        onClose={() => {
          setIsImportModalOpen(false);
          setImportModalInitialBatchId(null);
        }}
        initialBatchId={importModalInitialBatchId}
        onQuestionsUpdated={() => {
          loadQuestions();
          loadLearningData();
        }}
      />

      {/* AI 문제 생성 모달 */}
      <GenerateQuestionModal
        isOpen={isGenerateModalOpen}
        onClose={() => setIsGenerateModalOpen(false)}
        onOpenReviewStaging={(batchId) => {
          setIsGenerateModalOpen(false);
          openImportModal(batchId || null);
        }}
      />

      {isVariationModalOpen && questionDetail && (
        <VariationModal
          question={questionDetail.question}
          selectedVarType={selectedVarType}
          isGeneratingVar={isGeneratingVar}
          generatedVarResult={generatedVarResult}
          onChangeVarType={setSelectedVarType}
          onGenerate={handleGenerateVariation}
          onClose={() => setIsVariationModalOpen(false)}
          onOpenImport={() => {
            setIsVariationModalOpen(false);
            setIsImportModalOpen(true);
          }}
        />
      )}
    </div>
  );
};
