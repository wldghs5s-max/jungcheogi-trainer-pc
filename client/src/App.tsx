import React, { useEffect, useState, useCallback } from 'react';
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
} from 'lucide-react';
import { Header } from './components/Header';
import { checkBackendHealth } from './api/health';
import { fetchQuestions, fetchQuestionDetail } from './api/questions';
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
} from '@jungcheogi/shared';

export const App: React.FC = () => {
  const [health, setHealth] = useState<HealthCheckResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState<boolean>(true);
  const [healthError, setHealthError] = useState<string | undefined>(undefined);

  // Question Browser State
  const [questions, setQuestions] = useState<Question[]>([]);
  const [totalQuestions, setTotalQuestions] = useState<number>(0);
  const [loadingQuestions, setLoadingQuestions] = useState<boolean>(false);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [questionDetail, setQuestionDetail] = useState<QuestionDetailResponse | null>(null);

  // Filters
  const [selectedSubject, setSelectedSubject] = useState<Subject | ''>('');
  const [selectedSourceType, setSelectedSourceType] = useState<QuestionSourceType | ''>('');
  const [selectedType, setSelectedType] = useState<QuestionType | ''>('');
  const [searchTerm, setSearchTerm] = useState<string>('');

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
  }, [selectedSubject, selectedSourceType, selectedType, searchTerm, selectedQuestionId]);

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
  }, [selectedSubject, selectedSourceType, selectedType, searchTerm, loadQuestions]);

  useEffect(() => {
    if (selectedQuestionId) {
      loadDetail(selectedQuestionId);
    }
  }, [selectedQuestionId, loadDetail]);

  const realExamCount = questions.filter((q) => q.sourceType === 'REAL_EXAM').length;
  const aiVariationCount = questions.filter((q) => q.sourceType === 'AI_VARIATION').length;
  const codeQuestionCount = questions.filter((q) => q.type === 'CODE_TRACE').length;

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
            <AlertTriangle size={20} color="var(--color-danger)" style={{ flexShrink: 0 }} />
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

        {/* Phase 2 헤더 카드 */}
        <section style={styles.heroSection}>
          <div style={styles.heroHeader}>
            <div style={styles.badgeRow}>
              <span style={styles.badgePrimary}>Phase 2 : 문제 도메인 및 데이터 파이프라인 기반 구축</span>
              <span style={styles.badgeGreen}>
                검증용 Fixture {totalQuestions}문항 적재 완료
              </span>
            </div>
            <h2 style={styles.heroTitle}>
              정보처리기사 실기 문항 도메인 & Ground Truth 분리 검증
            </h2>
            <p style={styles.heroSubtitle}>
              대량 무작위 크롤링 대신, 정밀하게 검증된 기출 원본(Ground Truth)과 AI 파생 변형 문제를
              명확히 분리하고 parentQuestionId 계층 관계를 보장하는 데이터 아키텍처입니다.
            </p>
          </div>

          <div style={styles.grid4}>
            {/* 통계 1: 전체 문항 */}
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={{ ...styles.cardIconBox, backgroundColor: 'rgba(59, 130, 246, 0.15)' }}>
                  <Database size={20} color="#3B82F6" />
                </div>
                <span style={styles.cardTag}>SQLite Table</span>
              </div>
              <h3 style={styles.cardTitle}>적재된 검증 Fixture</h3>
              <p style={styles.cardDesc}>
                단답형, 복수 키워드, C/Java/Python 코드, 서술형, AI 변형 전체 포괄.
              </p>
              <div style={styles.cardFooter}>
                <span style={styles.footerLabel}>전체 문항수:</span>
                <span style={styles.statusOk}>{totalQuestions}문항</span>
              </div>
            </div>

            {/* 통계 2: 실제 기출 */}
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={{ ...styles.cardIconBox, backgroundColor: 'rgba(16, 185, 129, 0.15)' }}>
                  <FileCheck size={20} color="#10B981" />
                </div>
                <span style={styles.cardTag}>Ground Truth</span>
              </div>
              <h3 style={styles.cardTitle}>공식 기출 원본</h3>
              <p style={styles.cardDesc}>
                공식 정답 및 해설이 보존되며, AI 출력에 의해 절대 덮어써지지 않음.
              </p>
              <div style={styles.cardFooter}>
                <span style={styles.footerLabel}>현재 기출수:</span>
                <span style={styles.statusOk}>{realExamCount}문항</span>
              </div>
            </div>

            {/* 통계 3: AI 변형 */}
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={{ ...styles.cardIconBox, backgroundColor: 'rgba(168, 85, 247, 0.15)' }}>
                  <GitBranch size={20} color="#A855F7" />
                </div>
                <span style={styles.cardTag}>Variation Tree</span>
              </div>
              <h3 style={styles.cardTitle}>기출 파생 변형 문제</h3>
              <p style={styles.cardDesc}>
                <code>parentQuestionId</code>로 원본 기출과 1:N 계보를 형성한 변형 문항.
              </p>
              <div style={styles.cardFooter}>
                <span style={styles.footerLabel}>변형 문항수:</span>
                <span style={styles.statusInfo}>{aiVariationCount}문항</span>
              </div>
            </div>

            {/* 통계 4: 코드 추적 문제 */}
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={{ ...styles.cardIconBox, backgroundColor: 'rgba(245, 158, 11, 0.15)' }}>
                  <Code2 size={20} color="#F59E0B" />
                </div>
                <span style={styles.cardTag}>C / Java / Py</span>
              </div>
              <h3 style={styles.cardTitle}>코드 해부 대상 문항</h3>
              <p style={styles.cardDesc}>
                포인터 연산, OOP 다형성 상속, 리스트 슬라이싱 코드 스니펫 포함.
              </p>
              <div style={styles.cardFooter}>
                <span style={styles.footerLabel}>코드 문항수:</span>
                <span style={styles.statusOk}>{codeQuestionCount}문항</span>
              </div>
            </div>
          </div>
        </section>

        {/* 대화형 문제 브라우저 & 상세 인스펙터 */}
        <section style={styles.section}>
          <div style={styles.sectionTitleRow}>
            <Eye size={20} color="#3B82F6" />
            <h3 style={styles.sectionHeading}>문제 도메인 브라우저 & 데이터 인스펙터</h3>
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
                onChange={(e) => setSelectedSubject(e.target.value as Subject | '')}
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
                onChange={(e) => setSelectedSourceType(e.target.value as QuestionSourceType | '')}
                style={styles.selectInput}
              >
                <option value="">모든 출처 (전체)</option>
                <option value="REAL_EXAM">실제 기출 (REAL_EXAM)</option>
                <option value="AI_VARIATION">기출 변형 (AI_VARIATION)</option>
                <option value="TEXTBOOK">공인 교재 (TEXTBOOK)</option>
              </select>

              {/* 유형 필터 */}
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value as QuestionType | '')}
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
              {loadingQuestions && <div style={styles.loadingText}>문항을 불러오는 중...</div>}
              {!loadingQuestions && questions.length === 0 && (
                <div style={styles.emptyText}>조건에 부합하는 문제가 없습니다.</div>
              )}
              {questions.map((q) => {
                const isSelected = q.id === selectedQuestionId;
                const sourceLabel = QUESTION_SOURCE_LABELS[q.sourceType] || q.sourceType;
                return (
                  <div
                    key={q.id}
                    style={{
                      ...styles.questionItem,
                      borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-border)',
                      backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.08)' : 'rgba(15, 23, 42, 0.5)',
                    }}
                    onClick={() => setSelectedQuestionId(q.id)}
                  >
                    <div style={styles.itemMetaRow}>
                      <span
                        style={{
                          ...styles.sourceBadge,
                          backgroundColor:
                            q.sourceType === 'REAL_EXAM'
                              ? 'rgba(16, 185, 129, 0.2)'
                              : q.sourceType === 'AI_VARIATION'
                              ? 'rgba(168, 85, 247, 0.2)'
                              : 'rgba(59, 130, 246, 0.2)',
                          color:
                            q.sourceType === 'REAL_EXAM'
                              ? '#34D399'
                              : q.sourceType === 'AI_VARIATION'
                              ? '#C084FC'
                              : '#60A5FA',
                        }}
                      >
                        {sourceLabel}
                      </span>
                      <span style={styles.subjectTag}>{q.subject}</span>
                      <span style={styles.diffTag}>{q.difficulty}</span>
                    </div>

                    <div style={styles.itemQuestionText}>
                      {q.question.length > 70 ? `${q.question.slice(0, 70)}...` : q.question}
                    </div>

                    <div style={styles.itemFooterRow}>
                      <span style={styles.itemIdText}>{q.id}</span>
                      {q.language && <span style={styles.langTag}>{q.language}</span>}
                      {q.parentQuestionId && (
                        <span style={styles.parentLinkTag}>
                          <GitBranch size={11} style={{ marginRight: '3px' }} />
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
                      <h4 style={styles.detailIdTitle}>{questionDetail.question.id}</h4>
                      <span
                        style={{
                          ...styles.sourceBadge,
                          backgroundColor:
                            questionDetail.question.sourceType === 'REAL_EXAM'
                              ? 'rgba(16, 185, 129, 0.2)'
                              : questionDetail.question.sourceType === 'AI_VARIATION'
                              ? 'rgba(168, 85, 247, 0.2)'
                              : 'rgba(59, 130, 246, 0.2)',
                          color:
                            questionDetail.question.sourceType === 'REAL_EXAM'
                              ? '#34D399'
                              : questionDetail.question.sourceType === 'AI_VARIATION'
                              ? '#C084FC'
                              : '#60A5FA',
                        }}
                      >
                        {QUESTION_SOURCE_LABELS[questionDetail.question.sourceType]}
                      </span>
                      <span style={styles.subjectTag}>{questionDetail.question.subject}</span>
                      <span style={styles.diffTag}>{questionDetail.question.difficulty}</span>
                      {questionDetail.question.examYear && (
                        <span style={styles.examTag}>
                          {questionDetail.question.examYear}년 {questionDetail.question.examRound}회 기출 ({questionDetail.question.questionNumber}번)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 지문 */}
                  <div style={styles.detailSection}>
                    <div style={styles.sectionSubTitle}>문제 지문</div>
                    <div style={styles.questionFullText}>{questionDetail.question.question}</div>
                  </div>

                  {/* 코드 스니펫 (존재 시) */}
                  {questionDetail.question.code && (
                    <div style={styles.detailSection}>
                      <div style={styles.sectionSubTitle}>
                        코드 ({questionDetail.question.language || 'CODE'})
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
                      <span style={styles.groundTruthTitle}>Ground Truth (공식 검증 정답 & 원본 해설)</span>
                    </div>

                    <div style={styles.answerValueBox}>
                      <span style={styles.answerLabel}>공식 정답:</span>
                      <span style={styles.answerValue}>
                        {Array.isArray(questionDetail.question.groundTruthAnswer)
                          ? questionDetail.question.groundTruthAnswer.join(', ')
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

                  {/* AI 보조 해설 및 변형 노트 섹션 (Ground Truth와 명확히 분리) */}
                  {(questionDetail.question.aiExplanation || questionDetail.question.aiVariationNotes) && (
                    <div style={styles.aiBox}>
                      <div style={styles.boxTitleRow}>
                        <Sparkles size={16} color="#A855F7" />
                        <span style={styles.aiTitle}>AI 보조 해설 및 변형 생성 근거 (Ground Truth와 분리)</span>
                      </div>

                      {questionDetail.question.aiVariationNotes && (
                        <div style={styles.aiNoteItem}>
                          <span style={styles.aiNoteLabel}>기출 변형 설계 의도:</span>
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
                        <span style={styles.hierarchyTitle}>파생 원본 기출문제 (Parent Question)</span>
                      </div>
                      <div
                        style={styles.parentCard}
                        onClick={() => setSelectedQuestionId(questionDetail.parentQuestion!.id)}
                      >
                        <div style={styles.parentCardHeader}>
                          <span style={styles.parentCardId}>{questionDetail.parentQuestion.id}</span>
                          <span style={styles.parentCardSubject}>{questionDetail.parentQuestion.subject}</span>
                          <span style={styles.parentClickHint}>클릭하여 원본 기출 보기 &rarr;</span>
                        </div>
                        <div style={styles.parentCardText}>{questionDetail.parentQuestion.question}</div>
                      </div>
                    </div>
                  )}

                  {/* 계층 구조: 파생된 AI 변형 문제 목록 (자신이 원본 기출인 경우) */}
                  {questionDetail.variations.length > 0 && (
                    <div style={styles.hierarchyBox}>
                      <div style={styles.boxTitleRow}>
                        <GitBranch size={16} color="#A855F7" />
                        <span style={styles.hierarchyTitle}>
                          이 기출에서 파생된 AI 변형 문제 ({questionDetail.variations.length}건)
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
                              <span style={styles.variationDiff}>{v.difficulty}</span>
                              <span style={styles.parentClickHint}>클릭하여 변형 문항 보기 &rarr;</span>
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
                <div style={styles.selectPrompt}>좌측 목록에서 문항을 선택하면 상세 내용이 표시됩니다.</div>
              )}
            </div>
          </div>
        </section>

        {/* 출제기준 검증 공지 섹션 */}
        <section style={styles.noticeSection}>
          <div style={styles.noticeHeader}>
            <Info size={18} color="#60A5FA" />
            <h4 style={styles.noticeTitle}>시험 제도 및 과목 출제구조 공식 검증 관리 체계</h4>
          </div>
          <p style={styles.noticeText}>{DEFAULT_SYLLABUS_CONFIG.notes}</p>
          <div style={styles.noticeMeta}>
            <span>관리 버전: <code>{DEFAULT_SYLLABUS_CONFIG.version}</code></span>
            <span>최종 업데이트: {DEFAULT_SYLLABUS_CONFIG.lastUpdated}</span>
            <span style={styles.noticeStatus}>상태: 잠정 추정치 (공식 큐넷 출제기준 대조 전)</span>
          </div>
        </section>
      </main>

      <footer style={styles.footer}>
        <div style={styles.footerContent}>
          <span>jungcheogi-trainer-pc &bull; Phase 2 Question Domain & Pipeline</span>
          <span>Node.js Fastify (:8765) + SQLite + React Vite</span>
        </div>
      </footer>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  appContainer: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--color-bg)',
  },
  mainContent: {
    flex: 1,
    maxWidth: '1280px',
    width: '100%',
    margin: '0 auto',
    padding: '32px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '32px',
  },
  alertBanner: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '14px',
    padding: '16px 20px',
    borderRadius: '10px',
    backgroundColor: 'var(--color-danger-bg)',
    border: '1px solid var(--color-danger)',
  },
  alertContent: { flex: 1 },
  alertTitle: {
    fontWeight: '700',
    fontSize: '14px',
    color: 'var(--color-danger)',
    marginBottom: '4px',
  },
  alertDesc: {
    fontSize: '13px',
    color: 'var(--color-text-muted)',
    marginBottom: '10px',
  },
  commandBox: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '10px',
    backgroundColor: 'var(--color-surface)',
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '12px',
  },
  heroSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  heroHeader: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  badgeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  badgePrimary: {
    fontSize: '12px',
    fontWeight: '600',
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    color: '#60A5FA',
    padding: '4px 10px',
    borderRadius: '20px',
  },
  badgeGreen: {
    fontSize: '12px',
    fontWeight: '600',
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    color: '#34D399',
    padding: '4px 10px',
    borderRadius: '20px',
  },
  heroTitle: {
    fontSize: '26px',
    fontWeight: '800',
    letterSpacing: '-0.5px',
    color: 'var(--color-text)',
  },
  heroSubtitle: {
    fontSize: '15px',
    color: 'var(--color-text-muted)',
    maxWidth: '780px',
  },
  grid4: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '16px',
  },
  card: {
    backgroundColor: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '12px',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardIconBox: {
    width: '38px',
    height: '38px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTag: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    padding: '2px 8px',
    borderRadius: '4px',
  },
  cardTitle: {
    fontSize: '16px',
    fontWeight: '700',
    color: 'var(--color-text)',
  },
  cardDesc: {
    fontSize: '13px',
    color: 'var(--color-text-muted)',
    lineHeight: 1.5,
    flex: 1,
  },
  cardFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: '10px',
    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
    fontSize: '12px',
  },
  footerLabel: { color: 'var(--color-text-muted)' },
  statusOk: { color: 'var(--color-success)', fontWeight: '600' },
  statusInfo: { color: '#C084FC', fontWeight: '600' },
  section: {
    backgroundColor: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '12px',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  sectionTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  sectionHeading: {
    fontSize: '17px',
    fontWeight: '700',
    color: 'var(--color-text)',
  },
  filterBar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  searchWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    padding: '8px 14px',
    flex: 1,
    minWidth: '280px',
  },
  searchInput: {
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: 'var(--color-text)',
    fontSize: '13px',
    width: '100%',
  },
  filterGroup: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  selectInput: {
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    color: 'var(--color-text)',
    fontSize: '13px',
    padding: '8px 12px',
    outline: 'none',
  },
  browserLayout: {
    display: 'grid',
    gridTemplateColumns: '360px 1fr',
    gap: '20px',
    minHeight: '600px',
  },
  listColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    maxHeight: '650px',
    overflowY: 'auto',
    paddingRight: '6px',
  },
  loadingText: {
    color: 'var(--color-text-muted)',
    fontSize: '13px',
    padding: '20px',
    textAlign: 'center',
  },
  emptyText: {
    color: 'var(--color-text-muted)',
    fontSize: '13px',
    padding: '20px',
    textAlign: 'center',
  },
  questionItem: {
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    padding: '12px',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    transition: 'all 0.15s ease',
  },
  itemMetaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap',
  },
  sourceBadge: {
    fontSize: '10px',
    fontWeight: '700',
    padding: '2px 6px',
    borderRadius: '4px',
  },
  subjectTag: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
  },
  diffTag: {
    fontSize: '10px',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    padding: '1px 5px',
    borderRadius: '3px',
    color: 'var(--color-text-muted)',
  },
  itemQuestionText: {
    fontSize: '13px',
    color: 'var(--color-text)',
    lineHeight: 1.4,
  },
  itemFooterRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
    paddingTop: '6px',
  },
  itemIdText: {
    fontFamily: 'monospace',
    fontSize: '10px',
  },
  langTag: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    color: '#60A5FA',
    padding: '1px 5px',
    borderRadius: '3px',
    fontSize: '10px',
  },
  parentLinkTag: {
    display: 'inline-flex',
    alignItems: 'center',
    color: '#C084FC',
    fontSize: '10px',
  },
  detailColumn: {
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    border: '1px solid var(--color-border)',
    borderRadius: '10px',
    padding: '20px',
    maxHeight: '650px',
    overflowY: 'auto',
  },
  selectPrompt: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: 'var(--color-text-muted)',
    fontSize: '14px',
  },
  detailBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
  },
  detailHeader: {
    borderBottom: '1px solid var(--color-border)',
    paddingBottom: '12px',
  },
  detailIdRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  detailIdTitle: {
    fontSize: '16px',
    fontWeight: '700',
    color: 'var(--color-text)',
    fontFamily: 'monospace',
  },
  examTag: {
    fontSize: '11px',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    padding: '2px 8px',
    borderRadius: '4px',
    color: 'var(--color-text)',
  },
  detailSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  sectionSubTitle: {
    fontSize: '12px',
    fontWeight: '700',
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  questionFullText: {
    fontSize: '14px',
    lineHeight: 1.6,
    color: 'var(--color-text)',
    whiteSpace: 'pre-wrap',
  },
  codeBlock: {
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    padding: '14px',
    overflowX: 'auto',
    fontSize: '13px',
    fontFamily: 'Consolas, Monaco, monospace',
    color: '#E2E8F0',
    lineHeight: 1.5,
  },
  groundTruthBox: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    border: '1px solid var(--color-success)',
    borderRadius: '8px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  boxTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  groundTruthTitle: {
    fontSize: '13px',
    fontWeight: '700',
    color: 'var(--color-success)',
  },
  answerValueBox: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '8px',
    flexWrap: 'wrap',
  },
  answerLabel: {
    fontSize: '13px',
    fontWeight: '700',
    color: 'var(--color-text)',
  },
  answerValue: {
    fontSize: '16px',
    fontWeight: '800',
    color: '#34D399',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    padding: '2px 10px',
    borderRadius: '6px',
  },
  officialExplanation: {
    fontSize: '13px',
    color: 'var(--color-text-muted)',
    lineHeight: 1.5,
    borderTop: '1px solid rgba(16, 185, 129, 0.2)',
    paddingTop: '8px',
  },
  explanationLabel: {
    fontWeight: '600',
    color: '#A7F3D0',
    marginBottom: '2px',
  },
  aiBox: {
    backgroundColor: 'rgba(168, 85, 247, 0.08)',
    border: '1px solid rgba(168, 85, 247, 0.4)',
    borderRadius: '8px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  aiTitle: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#C084FC',
  },
  aiNoteItem: {
    fontSize: '13px',
    color: 'var(--color-text-muted)',
    lineHeight: 1.5,
  },
  aiNoteLabel: {
    fontWeight: '600',
    color: '#E9D5FF',
    display: 'block',
    marginBottom: '2px',
  },
  hierarchyBox: {
    backgroundColor: 'rgba(59, 130, 246, 0.06)',
    border: '1px solid rgba(59, 130, 246, 0.3)',
    borderRadius: '8px',
    padding: '14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  hierarchyTitle: {
    fontSize: '12px',
    fontWeight: '700',
    color: '#60A5FA',
  },
  parentCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid var(--color-border)',
    borderRadius: '6px',
    padding: '10px',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
  },
  parentCardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '4px',
    fontSize: '11px',
  },
  parentCardId: {
    fontWeight: '700',
    color: 'var(--color-primary)',
    fontFamily: 'monospace',
  },
  parentCardSubject: {
    color: 'var(--color-text-muted)',
  },
  parentClickHint: {
    color: '#93C5FD',
    fontSize: '11px',
    fontWeight: '600',
  },
  parentCardText: {
    fontSize: '12px',
    color: 'var(--color-text)',
  },
  variationsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  variationCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid var(--color-border)',
    borderRadius: '6px',
    padding: '10px',
    cursor: 'pointer',
  },
  variationCardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '4px',
    fontSize: '11px',
  },
  variationId: {
    fontWeight: '700',
    color: '#C084FC',
    fontFamily: 'monospace',
  },
  variationDiff: {
    color: 'var(--color-text-muted)',
    fontSize: '10px',
  },
  variationText: {
    fontSize: '12px',
    color: 'var(--color-text)',
  },
  keywordsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap',
    borderTop: '1px solid var(--color-border)',
    paddingTop: '12px',
  },
  keywordsLabel: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
  },
  keywordBadge: {
    fontSize: '11px',
    color: '#93C5FD',
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    padding: '2px 8px',
    borderRadius: '4px',
  },
  noticeSection: {
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    border: '1px dashed var(--color-border)',
    borderRadius: '10px',
    padding: '18px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  noticeHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  noticeTitle: {
    fontSize: '14px',
    fontWeight: '700',
    color: '#93C5FD',
  },
  noticeText: {
    fontSize: '13px',
    color: 'var(--color-text-muted)',
    lineHeight: 1.5,
  },
  noticeMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    flexWrap: 'wrap',
    marginTop: '4px',
  },
  noticeStatus: {
    color: '#F59E0B',
    fontWeight: '600',
  },
  footer: {
    borderTop: '1px solid var(--color-border)',
    padding: '18px 24px',
    backgroundColor: 'var(--color-surface)',
  },
  footerContent: {
    maxWidth: '1280px',
    margin: '0 auto',
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    flexWrap: 'wrap',
    gap: '8px',
  },
};
