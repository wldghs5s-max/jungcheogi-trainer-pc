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
  UploadCloud,
  Brain,
  Target,
  RotateCcw,
  CheckCircle,
  CheckCircle2,
  Zap,
  Crosshair,
  TrendingUp,
  X,
  ShieldCheck,
} from "lucide-react";
import { Header } from "./components/Header";
import { StudySessionModal } from "./components/study/StudySessionModal";
import { ImportModal } from "./components/importer/ImportModal";
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
    const [dashRes, weakRes, dueRes, queueRes, recsRes] = await Promise.all([
      fetchLearningDashboard(excludeTestFixtures),
      fetchWeakConcepts(5),
      fetchDueReviews(20),
      fetchDailyQueueSummary(excludeTestFixtures),
      fetchRecommendations({ limit: 6, excludeTestFixtures }),
    ]);
    if (dashRes.data) setDashboardSummary(dashRes.data);
    if (weakRes.data) setWeakConcepts(weakRes.data);
    if (dueRes.data) setDueReviews(dueRes.data);
    if (queueRes.data) setDailyQueue(queueRes.data);
    if (recsRes.data) setRecommendations(recsRes.data.items);
  }, [excludeTestFixtures]);

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

  const fixtureCount = questions.filter(
    (q) => q.sourceType === "TEST_FIXTURE",
  ).length;
  const realExamCount = questions.filter(
    (q) => q.sourceType === "REAL_EXAM",
  ).length;
  const aiVariationCount = questions.filter(
    (q) => q.sourceType === "AI_VARIATION",
  ).length;
  const codeQuestionCount = questions.filter(
    (q) => q.type === "CODE_TRACE",
  ).length;

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
                <span style={styles.footerLabel}>기출 및 연습:</span>
                <span style={styles.statusOk}>
                  {fixtureCount + realExamCount}문항
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
                  setStudySessionSubject(selectedSubject);
                  setIsStudySessionOpen(true);
                }}
                style={styles.sessionBannerBtn}
              >
                <Play size={18} />
                <span>집중 학습 세션 시작하기</span>
              </button>
              <button
                onClick={() => {
                  setStudySessionSubject("");
                  setIsStudySessionOpen(true);
                }}
                style={styles.reviewQueueBannerBtn}
              >
                <Brain size={18} color="#A5B4FC" />
                <span>오늘의 복습 큐 ({dueReviews.length}문항)</span>
              </button>
              <button
                onClick={() => setIsImportModalOpen(true)}
                style={styles.importBannerBtn}
              >
                <UploadCloud size={18} color="#60A5FA" />
                <span>문제 데이터 가져오기</span>
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
                  onClick={() => {
                    setStudySessionSubject("");
                    setIsStudySessionOpen(true);
                  }}
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
                              : q.sourceType === "AI_VARIATION"
                                ? "rgba(168, 85, 247, 0.2)"
                                : "rgba(59, 130, 246, 0.2)",
                          color:
                            q.sourceType === "REAL_EXAM"
                              ? "#34D399"
                              : q.sourceType === "AI_VARIATION"
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
                      <span style={styles.itemIdText}>{q.id}</span>
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
                      <h4 style={styles.detailIdTitle}>
                        {questionDetail.question.id}
                      </h4>
                      <span
                        style={{
                          ...styles.sourceBadge,
                          backgroundColor:
                            questionDetail.question.sourceType === "REAL_EXAM"
                              ? "rgba(16, 185, 129, 0.2)"
                              : questionDetail.question.sourceType ===
                                  "AI_VARIATION"
                                ? "rgba(168, 85, 247, 0.2)"
                                : "rgba(59, 130, 246, 0.2)",
                          color:
                            questionDetail.question.sourceType === "REAL_EXAM"
                              ? "#34D399"
                              : questionDetail.question.sourceType ===
                                  "AI_VARIATION"
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

      {/* Phase 4 문제 데이터 검수 및 Import 모달 */}
      <ImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onQuestionsUpdated={() => {
          loadQuestions();
          loadLearningData();
        }}
      />

      {/* Phase 7 AI 변형 문제 생성 및 Staging 검수 모달 */}
      {isVariationModalOpen && questionDetail && (
        <div style={styles.varModalOverlay}>
          <div style={styles.varModalContent}>
            <div style={styles.varModalHeader}>
              <div style={styles.varModalTitleGroup}>
                <Sparkles size={20} color="#C084FC" />
                <h3 style={styles.varModalTitle}>
                  AI 변형 문제 생성 및 Staging 검수 파이프라인
                </h3>
              </div>
              <button
                onClick={() => setIsVariationModalOpen(false)}
                style={styles.closeBtn}
              >
                <X size={18} />
              </button>
            </div>

            <div style={styles.varModalBody}>
              <div style={styles.varSourceBox}>
                <div style={styles.varSourceHeader}>
                  <span style={styles.varSourceId}>
                    기준 원본: {questionDetail.question.id}
                  </span>
                  <span style={styles.varSourceSubject}>
                    {questionDetail.question.subject}
                  </span>
                  {questionDetail.question.conceptId && (
                    <span style={styles.varSourceConcept}>
                      개념: {questionDetail.question.conceptId}
                    </span>
                  )}
                </div>
                <p style={styles.varSourceText}>
                  {questionDetail.question.question}
                </p>
              </div>

              {!generatedVarResult ? (
                <div style={styles.varConfigSection}>
                  <label style={styles.varLabel}>
                    변형 문제 유형 선택 (Variation Type):
                  </label>
                  <select
                    value={selectedVarType}
                    onChange={(e) => setSelectedVarType(e.target.value)}
                    style={styles.varSelect}
                  >
                    <option value="PARAMETER_VARIATION">
                      1. PARAMETER_VARIATION (수치 / 변수 / 파라미터 변형)
                    </option>
                    <option value="CODE_VARIATION">
                      2. CODE_VARIATION (코드 구조 / 제어문 / 연산자 변형)
                    </option>
                    <option value="SCENARIO_VARIATION">
                      3. SCENARIO_VARIATION (실무 시나리오 / 적용 맥락 변형)
                    </option>
                    <option value="CONCEPT_VARIATION">
                      4. CONCEPT_VARIATION (개념 재구성 / 역방향 핵심 평가)
                    </option>
                    <option value="DIFFICULTY_VARIATION">
                      5. DIFFICULTY_VARIATION (다단계 제약 / 난이도 심화 조절)
                    </option>
                  </select>

                  <div style={styles.varSafetyNotice}>
                    <ShieldCheck size={16} color="#34D399" />
                    <span>
                      ★ 생성된 변형 문제는 Live DB에 즉시 삽입되지 않으며,{" "}
                      <strong>staged_questions</strong>에{" "}
                      <strong>PENDING</strong> 상태로 안전하게 격리 등록됩니다.
                    </span>
                  </div>

                  <div style={styles.varModalFooter}>
                    <button
                      onClick={() => setIsVariationModalOpen(false)}
                      style={styles.cancelBtn}
                    >
                      취소
                    </button>
                    <button
                      onClick={handleGenerateVariation}
                      disabled={isGeneratingVar}
                      style={styles.executeVarBtn}
                    >
                      {isGeneratingVar
                        ? "변형 문항 생성 및 검증 중..."
                        : "변형 문제 생성 및 Staging 적재"}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={styles.varResultSection}>
                  <div style={styles.varResultHeader}>
                    <CheckCircle2 size={18} color="#34D399" />
                    <span style={styles.varResultTitle}>
                      변형 문제 생성 및 3단계 무결성 검증 완료 (Staging 등록됨)
                    </span>
                  </div>

                  <div style={styles.varPreviewBox}>
                    <div style={styles.varMetaRow}>
                      <span style={styles.varMetaBadge}>
                        유형: {generatedVarResult.variation?.variationType}
                      </span>
                      <span style={styles.varMetaBadge}>
                        부모: {generatedVarResult.variation?.parentQuestionId}
                      </span>
                      {generatedVarResult.variation?.conceptId && (
                        <span style={styles.varMetaBadge}>
                          개념: {generatedVarResult.variation?.conceptId}
                        </span>
                      )}
                      <span style={styles.varStatusBadge}>
                        검수 상태: PENDING (검수 대기)
                      </span>
                    </div>

                    <div style={styles.varFieldGroup}>
                      <span style={styles.varFieldLabel}>변형 문제 지문:</span>
                      <p style={styles.varFieldContent}>
                        {generatedVarResult.variation?.prompt}
                      </p>
                    </div>

                    {generatedVarResult.variation?.codeSnippet && (
                      <div style={styles.varFieldGroup}>
                        <span style={styles.varFieldLabel}>변형 소스코드:</span>
                        <pre style={styles.varCodeSnippet}>
                          <code>
                            {generatedVarResult.variation?.codeSnippet}
                          </code>
                        </pre>
                      </div>
                    )}

                    <div style={styles.varFieldGroup}>
                      <span style={styles.varFieldLabel}>생성된 기준 정답:</span>
                      <span style={styles.varAnswerValue}>
                        {Array.isArray(
                          generatedVarResult.variation?.groundTruthAnswer,
                        )
                          ? generatedVarResult.variation?.groundTruthAnswer.join(
                              ", ",
                            )
                          : generatedVarResult.variation?.groundTruthAnswer}
                      </span>
                    </div>

                    <div style={styles.varFieldGroup}>
                      <span style={styles.varFieldLabel}>AI 보조 해설:</span>
                      <p style={styles.varFieldContent}>
                        {generatedVarResult.variation?.aiExplanation}
                      </p>
                    </div>

                    <div style={styles.varFieldGroup}>
                      <span style={styles.varFieldLabel}>변형 설계 의도:</span>
                      <p style={styles.varFieldContent}>
                        {generatedVarResult.variation?.aiVariationNotes}
                      </p>
                    </div>
                  </div>

                  <div style={styles.varModalFooter}>
                    <button
                      onClick={() => {
                        setIsVariationModalOpen(false);
                        setIsImportModalOpen(true);
                      }}
                      style={styles.openImportBtn}
                    >
                      검수 관리자 대시보드(ImportModal) 열기 &rarr;
                    </button>
                    <button
                      onClick={() => setIsVariationModalOpen(false)}
                      style={styles.primaryBtn}
                    >
                      확인
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  appContainer: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    backgroundColor: "var(--color-bg)",
  },
  mainContent: {
    flex: 1,
    maxWidth: "1280px",
    width: "100%",
    margin: "0 auto",
    padding: "32px 24px",
    display: "flex",
    flexDirection: "column",
    gap: "32px",
  },
  alertBanner: {
    display: "flex",
    alignItems: "flex-start",
    gap: "14px",
    padding: "16px 20px",
    borderRadius: "10px",
    backgroundColor: "var(--color-danger-bg)",
    border: "1px solid var(--color-danger)",
  },
  alertContent: { flex: 1 },
  alertTitle: {
    fontWeight: "700",
    fontSize: "14px",
    color: "var(--color-danger)",
    marginBottom: "4px",
  },
  alertDesc: {
    fontSize: "13px",
    color: "var(--color-text-muted)",
    marginBottom: "10px",
  },
  commandBox: {
    display: "inline-flex",
    alignItems: "center",
    gap: "10px",
    backgroundColor: "var(--color-surface)",
    padding: "6px 12px",
    borderRadius: "6px",
    fontSize: "12px",
  },
  heroSection: {
    display: "flex",
    flexDirection: "column",
    gap: "24px",
  },
  heroHeader: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  badgeRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  badgePrimary: {
    fontSize: "12px",
    fontWeight: "600",
    backgroundColor: "rgba(59, 130, 246, 0.2)",
    color: "#60A5FA",
    padding: "4px 10px",
    borderRadius: "20px",
  },
  badgeGreen: {
    fontSize: "12px",
    fontWeight: "600",
    backgroundColor: "rgba(16, 185, 129, 0.2)",
    color: "#34D399",
    padding: "4px 10px",
    borderRadius: "20px",
  },
  heroTitle: {
    fontSize: "26px",
    fontWeight: "800",
    letterSpacing: "-0.5px",
    color: "var(--color-text)",
  },
  heroSubtitle: {
    fontSize: "15px",
    color: "var(--color-text-muted)",
    maxWidth: "780px",
  },
  grid4: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
    gap: "16px",
  },
  card: {
    backgroundColor: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: "12px",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardIconBox: {
    width: "38px",
    height: "38px",
    borderRadius: "8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTag: {
    fontSize: "11px",
    color: "var(--color-text-muted)",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    padding: "2px 8px",
    borderRadius: "4px",
  },
  cardTitle: {
    fontSize: "16px",
    fontWeight: "700",
    color: "var(--color-text)",
  },
  cardDesc: {
    fontSize: "13px",
    color: "var(--color-text-muted)",
    lineHeight: 1.5,
    flex: 1,
  },
  cardFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: "10px",
    borderTop: "1px solid rgba(255, 255, 255, 0.08)",
    fontSize: "12px",
  },
  footerLabel: { color: "var(--color-text-muted)" },
  statusOk: { color: "var(--color-success)", fontWeight: "600" },
  statusInfo: { color: "#C084FC", fontWeight: "600" },
  section: {
    backgroundColor: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: "12px",
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  sectionTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  sectionHeading: {
    fontSize: "17px",
    fontWeight: "700",
    color: "var(--color-text)",
  },
  filterBar: {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
    alignItems: "center",
    justifyContent: "space-between",
  },
  searchWrapper: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    border: "1px solid var(--color-border)",
    borderRadius: "8px",
    padding: "8px 14px",
    flex: 1,
    minWidth: "280px",
  },
  searchInput: {
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--color-text)",
    fontSize: "13px",
    width: "100%",
  },
  filterGroup: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  },
  selectInput: {
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    border: "1px solid var(--color-border)",
    borderRadius: "8px",
    color: "var(--color-text)",
    fontSize: "13px",
    padding: "8px 12px",
    outline: "none",
  },
  browserLayout: {
    display: "grid",
    gridTemplateColumns: "360px 1fr",
    gap: "20px",
    minHeight: "600px",
  },
  listColumn: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    maxHeight: "650px",
    overflowY: "auto",
    paddingRight: "6px",
  },
  loadingText: {
    color: "var(--color-text-muted)",
    fontSize: "13px",
    padding: "20px",
    textAlign: "center",
  },
  emptyText: {
    color: "var(--color-text-muted)",
    fontSize: "13px",
    padding: "20px",
    textAlign: "center",
  },
  questionItem: {
    borderRadius: "8px",
    border: "1px solid var(--color-border)",
    padding: "12px",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    transition: "all 0.15s ease",
  },
  itemMetaRow: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    flexWrap: "wrap",
  },
  sourceBadge: {
    fontSize: "10px",
    fontWeight: "700",
    padding: "2px 6px",
    borderRadius: "4px",
  },
  subjectTag: {
    fontSize: "11px",
    color: "var(--color-text-muted)",
  },
  diffTag: {
    fontSize: "10px",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    padding: "1px 5px",
    borderRadius: "3px",
    color: "var(--color-text-muted)",
  },
  itemQuestionText: {
    fontSize: "13px",
    color: "var(--color-text)",
    lineHeight: 1.4,
  },
  itemFooterRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    fontSize: "11px",
    color: "var(--color-text-muted)",
    borderTop: "1px solid rgba(255, 255, 255, 0.05)",
    paddingTop: "6px",
  },
  itemIdText: {
    fontFamily: "monospace",
    fontSize: "10px",
  },
  langTag: {
    backgroundColor: "rgba(59, 130, 246, 0.15)",
    color: "#60A5FA",
    padding: "1px 5px",
    borderRadius: "3px",
    fontSize: "10px",
  },
  parentLinkTag: {
    display: "inline-flex",
    alignItems: "center",
    color: "#C084FC",
    fontSize: "10px",
  },
  detailColumn: {
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    border: "1px solid var(--color-border)",
    borderRadius: "10px",
    padding: "20px",
    maxHeight: "650px",
    overflowY: "auto",
  },
  selectPrompt: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    color: "var(--color-text-muted)",
    fontSize: "14px",
  },
  detailBox: {
    display: "flex",
    flexDirection: "column",
    gap: "18px",
  },
  detailHeader: {
    borderBottom: "1px solid var(--color-border)",
    paddingBottom: "12px",
  },
  detailIdRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  detailIdTitle: {
    fontSize: "16px",
    fontWeight: "700",
    color: "var(--color-text)",
    fontFamily: "monospace",
  },
  examTag: {
    fontSize: "11px",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    padding: "2px 8px",
    borderRadius: "4px",
    color: "var(--color-text)",
  },
  detailSection: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  sectionSubTitle: {
    fontSize: "12px",
    fontWeight: "700",
    color: "var(--color-text-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  questionFullText: {
    fontSize: "14px",
    lineHeight: 1.6,
    color: "var(--color-text)",
    whiteSpace: "pre-wrap",
  },
  codeBlock: {
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    border: "1px solid var(--color-border)",
    borderRadius: "8px",
    padding: "14px",
    overflowX: "auto",
    fontSize: "13px",
    fontFamily: "Consolas, Monaco, monospace",
    color: "#E2E8F0",
    lineHeight: 1.5,
  },
  groundTruthBox: {
    backgroundColor: "rgba(16, 185, 129, 0.08)",
    border: "1px solid var(--color-success)",
    borderRadius: "8px",
    padding: "16px",
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
    fontSize: "13px",
    fontWeight: "700",
    color: "var(--color-success)",
  },
  answerValueBox: {
    display: "flex",
    alignItems: "baseline",
    gap: "8px",
    flexWrap: "wrap",
  },
  answerLabel: {
    fontSize: "13px",
    fontWeight: "700",
    color: "var(--color-text)",
  },
  answerValue: {
    fontSize: "16px",
    fontWeight: "800",
    color: "#34D399",
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    padding: "2px 10px",
    borderRadius: "6px",
  },
  officialExplanation: {
    fontSize: "13px",
    color: "var(--color-text-muted)",
    lineHeight: 1.5,
    borderTop: "1px solid rgba(16, 185, 129, 0.2)",
    paddingTop: "8px",
  },
  explanationLabel: {
    fontWeight: "600",
    color: "#A7F3D0",
    marginBottom: "2px",
  },
  aiBox: {
    backgroundColor: "rgba(168, 85, 247, 0.08)",
    border: "1px solid rgba(168, 85, 247, 0.4)",
    borderRadius: "8px",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  aiTitle: {
    fontSize: "13px",
    fontWeight: "700",
    color: "#C084FC",
  },
  aiNoteItem: {
    fontSize: "13px",
    color: "var(--color-text-muted)",
    lineHeight: 1.5,
  },
  aiNoteLabel: {
    fontWeight: "600",
    color: "#E9D5FF",
    display: "block",
    marginBottom: "2px",
  },
  hierarchyBox: {
    backgroundColor: "rgba(59, 130, 246, 0.06)",
    border: "1px solid rgba(59, 130, 246, 0.3)",
    borderRadius: "8px",
    padding: "14px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  hierarchyTitle: {
    fontSize: "12px",
    fontWeight: "700",
    color: "#60A5FA",
  },
  parentCard: {
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    border: "1px solid var(--color-border)",
    borderRadius: "6px",
    padding: "10px",
    cursor: "pointer",
    transition: "background-color 0.15s ease",
  },
  parentCardHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "4px",
    fontSize: "11px",
  },
  parentCardId: {
    fontWeight: "700",
    color: "var(--color-primary)",
    fontFamily: "monospace",
  },
  parentCardSubject: {
    color: "var(--color-text-muted)",
  },
  parentClickHint: {
    color: "#93C5FD",
    fontSize: "11px",
    fontWeight: "600",
  },
  parentCardText: {
    fontSize: "12px",
    color: "var(--color-text)",
  },
  variationsList: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  variationCard: {
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    border: "1px solid var(--color-border)",
    borderRadius: "6px",
    padding: "10px",
    cursor: "pointer",
  },
  variationCardHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "4px",
    fontSize: "11px",
  },
  variationId: {
    fontWeight: "700",
    color: "#C084FC",
    fontFamily: "monospace",
  },
  variationDiff: {
    color: "var(--color-text-muted)",
    fontSize: "10px",
  },
  variationText: {
    fontSize: "12px",
    color: "var(--color-text)",
  },
  keywordsRow: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    flexWrap: "wrap",
    borderTop: "1px solid var(--color-border)",
    paddingTop: "12px",
  },
  keywordsLabel: {
    fontSize: "12px",
    color: "var(--color-text-muted)",
  },
  keywordBadge: {
    fontSize: "11px",
    color: "#93C5FD",
    backgroundColor: "rgba(59, 130, 246, 0.15)",
    padding: "2px 8px",
    borderRadius: "4px",
  },
  noticeSection: {
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    border: "1px dashed var(--color-border)",
    borderRadius: "10px",
    padding: "18px 20px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  noticeHeader: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  noticeTitle: {
    fontSize: "14px",
    fontWeight: "700",
    color: "#93C5FD",
  },
  noticeText: {
    fontSize: "13px",
    color: "var(--color-text-muted)",
    lineHeight: 1.5,
  },
  noticeMeta: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    fontSize: "12px",
    color: "var(--color-text-muted)",
    flexWrap: "wrap",
    marginTop: "4px",
  },
  noticeStatus: {
    color: "#F59E0B",
    fontWeight: "600",
  },
  footer: {
    borderTop: "1px solid var(--color-border)",
    padding: "18px 24px",
    backgroundColor: "var(--color-surface)",
  },
  footerContent: {
    maxWidth: "1280px",
    margin: "0 auto",
    display: "flex",
    justifyContent: "space-between",
    fontSize: "12px",
    color: "var(--color-text-muted)",
    flexWrap: "wrap",
    gap: "8px",
  },
  sessionBanner: {
    marginTop: "24px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "rgba(59, 130, 246, 0.08)",
    border: "1.5px solid rgba(59, 130, 246, 0.3)",
    borderRadius: "12px",
    padding: "20px 24px",
    gap: "20px",
    flexWrap: "wrap",
  },
  sessionBannerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    flex: 1,
    minWidth: "280px",
  },
  sessionBannerIcon: {
    width: "48px",
    height: "48px",
    borderRadius: "12px",
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  sessionBannerTitle: {
    fontSize: "16px",
    fontWeight: 700,
    color: "#F8FAFC",
    marginBottom: "4px",
  },
  sessionBannerSubtitle: {
    fontSize: "13px",
    color: "#CBD5E1",
    lineHeight: 1.5,
  },
  sessionBannerBtn: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    backgroundColor: "#3B82F6",
    color: "#FFFFFF",
    padding: "12px 24px",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 4px 12px rgba(59, 130, 246, 0.3)",
    transition: "all 0.15s ease",
    flexShrink: 0,
  },
  sessionBannerActions: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    flexWrap: "wrap",
  },
  importBannerBtn: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    backgroundColor: "rgba(59, 130, 246, 0.12)",
    border: "1px solid rgba(59, 130, 246, 0.4)",
    color: "#93C5FD",
    padding: "12px 20px",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.15s ease",
    flexShrink: 0,
  },
  solveDetailBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    backgroundColor: "rgba(59, 130, 246, 0.15)",
    border: "1px solid rgba(59, 130, 246, 0.4)",
    color: "#60A5FA",
    padding: "4px 10px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
    marginLeft: "auto",
    transition: "all 0.15s ease",
  },
  reviewQueueBannerBtn: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    backgroundColor: "rgba(99, 102, 241, 0.15)",
    border: "1px solid rgba(99, 102, 241, 0.4)",
    color: "#C7D2FE",
    padding: "12px 20px",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.15s ease",
    flexShrink: 0,
  },

  // PHASE 5 LEARNING DASHBOARD STYLES
  learningSection: {
    backgroundColor: "#0F172A",
    borderRadius: "16px",
    border: "1px solid #1E293B",
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  learningHeaderRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "12px",
  },
  learningSectionHeading: {
    fontSize: "18px",
    fontWeight: 700,
    color: "#F8FAFC",
    margin: 0,
  },
  fixtureToggleLabel: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    cursor: "pointer",
  },
  fixtureCheckbox: {
    cursor: "pointer",
    accentColor: "#6366F1",
  },
  learningGrid: {
    display: "grid",
    gridTemplateColumns: "1.1fr 0.9fr",
    gap: "20px",
  },
  learningCard: {
    backgroundColor: "#1E293B",
    borderRadius: "12px",
    border: "1px solid #334155",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  learningCardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  learningCardTitle: {
    fontSize: "15px",
    fontWeight: 700,
    color: "#F8FAFC",
    margin: 0,
  },
  clearFilterBtn: {
    fontSize: "11px",
    fontWeight: 600,
    color: "#EF4444",
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    border: "1px solid rgba(239, 68, 68, 0.3)",
    borderRadius: "4px",
    padding: "2px 6px",
    cursor: "pointer",
  },
  emptyConceptBox: {
    padding: "24px",
    textAlign: "center",
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    borderRadius: "8px",
    border: "1px dashed rgba(255, 255, 255, 0.08)",
  },
  conceptList: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  conceptItem: {
    borderRadius: "8px",
    border: "1px solid",
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    transition: "all 0.15s ease",
  },
  conceptItemTop: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  conceptSubjectBadge: {
    fontSize: "11px",
    fontWeight: 600,
    padding: "2px 6px",
    borderRadius: "4px",
    backgroundColor: "#334155",
    color: "#93C5FD",
  },
  conceptCategoryText: {
    fontSize: "12px",
    color: "#94A3B8",
  },
  conceptWeaknessBadge: {
    fontSize: "11px",
    fontWeight: 700,
    padding: "2px 8px",
    borderRadius: "4px",
    marginLeft: "auto",
  },
  conceptTitleRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  conceptTitle: {
    fontSize: "14px",
    fontWeight: 700,
    color: "#F8FAFC",
  },
  filterByConceptBtn: {
    fontSize: "11px",
    fontWeight: 600,
    color: "#38BDF8",
    backgroundColor: "rgba(56, 189, 248, 0.1)",
    border: "1px solid rgba(56, 189, 248, 0.25)",
    borderRadius: "4px",
    padding: "3px 8px",
    cursor: "pointer",
  },
  progressBarBg: {
    height: "6px",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: "3px",
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: "3px",
    transition: "width 0.3s ease",
  },
  conceptStatsRow: {
    display: "flex",
    gap: "12px",
    fontSize: "11px",
    color: "#94A3B8",
  },
  dueBadge: {
    fontSize: "11px",
    fontWeight: 700,
    padding: "3px 8px",
    borderRadius: "4px",
    backgroundColor: "rgba(99, 102, 241, 0.2)",
    color: "#A5B4FC",
  },
  leitnerBoxesContainer: {
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    gap: "8px",
  },
  leitnerBoxCol: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "2px",
    backgroundColor: "#0F172A",
    borderRadius: "6px",
    padding: "8px 4px",
    border: "1px solid rgba(255, 255, 255, 0.05)",
  },
  leitnerBoxName: {
    fontSize: "11px",
    fontWeight: 700,
    color: "#94A3B8",
  },
  leitnerBoxInterval: {
    fontSize: "10px",
    color: "#64748B",
  },
  leitnerBoxCount: {
    fontSize: "16px",
    fontWeight: 700,
    color: "#F8FAFC",
    marginTop: "2px",
  },
  emptyDueBox: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    padding: "24px 16px",
    backgroundColor: "rgba(16, 185, 129, 0.05)",
    borderRadius: "8px",
    border: "1px dashed rgba(16, 185, 129, 0.2)",
    flex: 1,
    textAlign: "center",
  },
  dueList: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    marginBottom: "12px",
  },
  dueItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#0F172A",
    padding: "8px 12px",
    borderRadius: "6px",
    border: "1px solid rgba(255, 255, 255, 0.05)",
  },
  dueBoxBadge: {
    fontSize: "10px",
    fontWeight: 700,
    padding: "2px 6px",
    borderRadius: "3px",
    backgroundColor: "rgba(99, 102, 241, 0.2)",
    color: "#C7D2FE",
  },
  dueQuestionSubject: {
    fontSize: "12px",
    color: "#CBD5E1",
  },
  dueConceptTitle: {
    fontSize: "11px",
    color: "#38BDF8",
  },
  dueIntervalText: {
    fontSize: "11px",
    color: "#64748B",
  },
  startReviewSessionBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    width: "100%",
    padding: "12px",
    backgroundColor: "#4F46E5",
    color: "#FFFFFF",
    borderRadius: "8px",
    border: "none",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
    transition: "background-color 0.15s",
    marginTop: "auto",
  },
  dailyQueueSection: {
    backgroundColor: "#1E293B",
    borderRadius: "12px",
    border: "1px solid rgba(245, 158, 11, 0.25)",
    padding: "24px",
    marginBottom: "28px",
    boxShadow: "0 4px 20px rgba(0, 0, 0, 0.2)",
  },
  dailyQueueHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "16px",
    marginBottom: "20px",
  },
  dailyQueueIconBox: {
    width: "44px",
    height: "44px",
    borderRadius: "10px",
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  dailyQueueTitle: {
    fontSize: "20px",
    fontWeight: 700,
    color: "#F8FAFC",
    margin: 0,
  },
  dailyQueueBadge: {
    fontSize: "11px",
    fontWeight: 700,
    color: "#F59E0B",
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    padding: "2px 8px",
    borderRadius: "12px",
    border: "1px solid rgba(245, 158, 11, 0.3)",
  },
  dailyQueueSubtitle: {
    fontSize: "13px",
    color: "#94A3B8",
    margin: "4px 0 0 0",
  },
  dailyQueueStartBtn: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "12px 24px",
    backgroundColor: "#F59E0B",
    color: "#0F172A",
    borderRadius: "8px",
    border: "none",
    fontSize: "15px",
    fontWeight: 700,
    cursor: "pointer",
    transition: "all 0.15s ease",
    boxShadow: "0 2px 10px rgba(245, 158, 11, 0.3)",
  },
  dailyQueueStatsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "14px",
    marginBottom: "20px",
  },
  dailyStatCard: {
    backgroundColor: "#0F172A",
    borderRadius: "8px",
    padding: "16px",
    border: "1px solid rgba(255, 255, 255, 0.06)",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  dailyStatLabel: {
    fontSize: "12px",
    fontWeight: 600,
    color: "#94A3B8",
  },
  dailyStatValue: {
    fontSize: "24px",
    fontWeight: 800,
  },
  dailyStatHint: {
    fontSize: "11px",
    color: "#64748B",
  },
  coldStartBanner: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    border: "1px dashed rgba(245, 158, 11, 0.3)",
    borderRadius: "8px",
    padding: "14px 16px",
    color: "#FDE68A",
    fontSize: "13px",
    lineHeight: 1.5,
    marginBottom: "20px",
  },
  recommendationsContainer: {
    marginTop: "16px",
    borderTop: "1px solid rgba(255, 255, 255, 0.08)",
    paddingTop: "18px",
  },
  recommendationsHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "8px",
    marginBottom: "14px",
  },
  recommendationsTitle: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#E2E8F0",
  },
  recommendationsSubtitle: {
    fontSize: "11px",
    color: "#64748B",
  },
  recommendationsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "12px",
  },
  recItemCard: {
    backgroundColor: "#0F172A",
    borderRadius: "8px",
    padding: "14px",
    border: "1px solid rgba(255, 255, 255, 0.06)",
    cursor: "pointer",
    transition: "transform 0.15s, border-color 0.15s",
  },
  recItemTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "8px",
  },
  recSubjectBadge: {
    fontSize: "11px",
    fontWeight: 600,
    color: "#38BDF8",
    backgroundColor: "rgba(56, 189, 248, 0.15)",
    padding: "2px 6px",
    borderRadius: "4px",
  },
  recScoreBadge: {
    fontSize: "11px",
    fontWeight: 700,
    color: "#F59E0B",
  },
  recPromptText: {
    fontSize: "13px",
    color: "#CBD5E1",
    lineHeight: 1.4,
    margin: "0 0 10px 0",
  },
  recReasonsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
  },
  reasonBadge: {
    fontSize: "10px",
    fontWeight: 600,
    padding: "2px 6px",
    borderRadius: "3px",
  },
  drillStartBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    padding: "4px 8px",
    backgroundColor: "#DC2626",
    color: "#FFFFFF",
    border: "none",
    borderRadius: "4px",
    fontSize: "11px",
    fontWeight: 600,
    cursor: "pointer",
    transition: "background-color 0.15s",
  },
  // Phase 7 AI Variation Styles
  variationActionBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "rgba(168, 85, 247, 0.08)",
    border: "1px solid rgba(168, 85, 247, 0.25)",
    borderRadius: "8px",
    padding: "12px 16px",
    gap: "12px",
    flexWrap: "wrap",
    marginTop: "8px",
  },
  variationActionLeft: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flex: 1,
  },
  variationActionTitle: {
    fontSize: "12px",
    color: "#E2E8F0",
  },
  generateVarBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    backgroundColor: "#9333EA",
    color: "#FFFFFF",
    border: "none",
    borderRadius: "6px",
    padding: "8px 14px",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
    transition: "background-color 0.15s",
  },
  varModalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    backdropFilter: "blur(4px)",
    padding: "20px",
  },
  varModalContent: {
    backgroundColor: "#1E293B",
    borderRadius: "12px",
    maxWidth: "760px",
    width: "100%",
    maxHeight: "90vh",
    display: "flex",
    flexDirection: "column",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
    overflow: "hidden",
  },
  varModalHeader: {
    padding: "16px 20px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  varModalTitleGroup: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  varModalTitle: {
    fontSize: "16px",
    fontWeight: 700,
    color: "#F8FAFC",
    margin: 0,
  },
  varModalBody: {
    padding: "20px",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  varSourceBox: {
    backgroundColor: "#0F172A",
    borderRadius: "8px",
    padding: "12px 14px",
    border: "1px solid rgba(255, 255, 255, 0.06)",
  },
  varSourceHeader: {
    display: "flex",
    gap: "8px",
    alignItems: "center",
    marginBottom: "6px",
  },
  varSourceId: {
    fontSize: "12px",
    fontWeight: 700,
    color: "#38BDF8",
  },
  varSourceSubject: {
    fontSize: "11px",
    backgroundColor: "rgba(56, 189, 248, 0.15)",
    color: "#38BDF8",
    padding: "1px 6px",
    borderRadius: "3px",
  },
  varSourceConcept: {
    fontSize: "11px",
    backgroundColor: "rgba(168, 85, 247, 0.15)",
    color: "#C084FC",
    padding: "1px 6px",
    borderRadius: "3px",
  },
  varSourceText: {
    fontSize: "13px",
    color: "#94A3B8",
    margin: 0,
    lineHeight: 1.4,
  },
  varConfigSection: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  varLabel: {
    fontSize: "13px",
    fontWeight: 600,
    color: "#CBD5E1",
  },
  varSelect: {
    backgroundColor: "#0F172A",
    color: "#F8FAFC",
    border: "1px solid rgba(255, 255, 255, 0.15)",
    borderRadius: "6px",
    padding: "10px 12px",
    fontSize: "13px",
    outline: "none",
  },
  varSafetyNotice: {
    display: "flex",
    alignItems: "flex-start",
    gap: "8px",
    backgroundColor: "rgba(52, 211, 153, 0.08)",
    border: "1px solid rgba(52, 211, 153, 0.25)",
    borderRadius: "6px",
    padding: "10px 12px",
    fontSize: "12px",
    color: "#A7F3D0",
    lineHeight: 1.4,
  },
  varResultSection: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  varResultHeader: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  varResultTitle: {
    fontSize: "14px",
    fontWeight: 700,
    color: "#34D399",
  },
  varPreviewBox: {
    backgroundColor: "#0F172A",
    borderRadius: "8px",
    padding: "14px",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  varMetaRow: {
    display: "flex",
    gap: "8px",
    alignItems: "center",
    flexWrap: "wrap",
  },
  varMetaBadge: {
    fontSize: "11px",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    color: "#CBD5E1",
    padding: "2px 8px",
    borderRadius: "4px",
  },
  varStatusBadge: {
    fontSize: "11px",
    fontWeight: 700,
    backgroundColor: "rgba(234, 179, 8, 0.2)",
    color: "#FACC15",
    padding: "2px 8px",
    borderRadius: "4px",
  },
  varFieldGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  varFieldLabel: {
    fontSize: "11px",
    fontWeight: 700,
    color: "#64748B",
    textTransform: "uppercase",
  },
  varFieldContent: {
    fontSize: "13px",
    color: "#E2E8F0",
    margin: 0,
    lineHeight: 1.4,
  },
  varCodeSnippet: {
    backgroundColor: "#020617",
    color: "#F8FAFC",
    padding: "10px",
    borderRadius: "4px",
    fontSize: "12px",
    overflowX: "auto",
    margin: 0,
  },
  varAnswerValue: {
    fontSize: "13px",
    fontWeight: 700,
    color: "#34D399",
  },
  varModalFooter: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px",
    marginTop: "8px",
  },
  cancelBtn: {
    backgroundColor: "transparent",
    color: "#94A3B8",
    border: "1px solid rgba(255, 255, 255, 0.15)",
    borderRadius: "6px",
    padding: "8px 16px",
    fontSize: "13px",
    cursor: "pointer",
  },
  executeVarBtn: {
    backgroundColor: "#9333EA",
    color: "#FFFFFF",
    border: "none",
    borderRadius: "6px",
    padding: "8px 18px",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
  },
  openImportBtn: {
    backgroundColor: "#2563EB",
    color: "#FFFFFF",
    border: "none",
    borderRadius: "6px",
    padding: "8px 16px",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
  },
};
