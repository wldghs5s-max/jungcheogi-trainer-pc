import React, { useState, useEffect, useRef } from 'react';
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
  Eye,
  Brain,
  Layers,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import {
  Question,
  StudySession,
  SessionSubmitResponse,
  SessionSummaryResponse,
  Subject,
  SUBJECT_LIST,
  QUESTION_SOURCE_LABELS,
} from '@jungcheogi/shared';
import {
  createStudySession,
  submitSessionAnswer,
  submitSessionUnknown,
  fetchSessionSummary,
  fetchStudySession,
} from '../../api/sessions';

interface StudySessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSubject?: Subject | '';
  initialSessionData?: { session: StudySession; firstQuestion: Question } | null;
}

export const StudySessionModal: React.FC<StudySessionModalProps> = ({
  isOpen,
  onClose,
  initialSubject = '',
  initialSessionData = null,
}) => {
  // Session Lifecycle: 'CONFIG' | 'PRACTICE' | 'SUMMARY'
  const [phase, setPhase] = useState<'CONFIG' | 'PRACTICE' | 'SUMMARY'>('CONFIG');

  // Config State
  const [selectedSubject, setSelectedSubject] = useState<Subject | ''>(initialSubject);
  const [questionCount, setQuestionCount] = useState<number>(5);
  const [sessionTitle, setSessionTitle] = useState<string>('실기 집중 학습 세션');
  const [isStarting, setIsStarting] = useState<boolean>(false);
  const [configError, setConfigError] = useState<string | null>(null);

  // Active Practice State
  const [session, setSession] = useState<StudySession | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [userInputs, setUserInputs] = useState<string[]>(['']);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitResult, setSubmitResult] = useState<SessionSubmitResponse | null>(null);
  const [showHint, setShowHint] = useState<boolean>(false);
  const [hintLevel, setHintLevel] = useState<number>(0);
  const [showCodeAnatomy, setShowCodeAnatomy] = useState<boolean>(false);
  const [expandedLineIndex, setExpandedLineIndex] = useState<number | null>(null);
  const [codeCopied, setCodeCopied] = useState<boolean>(false);

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
        setPhase('PRACTICE');
      } else {
        setPhase('CONFIG');
        setSelectedSubject(initialSubject);
        setSession(null);
        setCurrentQuestion(null);
      }
      setSubmitResult(null);
      setSummary(null);
      setConfigError(null);
      setHintLevel(0);
      setShowCodeAnatomy(false);
      setExpandedLineIndex(null);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [isOpen, initialSubject, initialSessionData]);

  // Setup inputs whenever currentQuestion changes
  useEffect(() => {
    if (!currentQuestion) return;

    setShowHint(false);
    setHintLevel(0);
    setShowCodeAnatomy(false);
    setExpandedLineIndex(null);
    setSubmitResult(null);
    setCodeCopied(false);
    setElapsedSeconds(0);

    const isMulti = Array.isArray(currentQuestion.groundTruthAnswer);
    const count = isMulti ? currentQuestion.groundTruthAnswer.length : 1;
    setUserInputs(new Array(count).fill(''));

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
      title: sessionTitle || '실기 집중 학습 세션',
      subject: selectedSubject ? selectedSubject : undefined,
      count: questionCount,
    };

    const result = await createStudySession(req);
    setIsStarting(false);

    if (result.error || !result.data) {
      setConfigError(result.error || '세션을 생성하지 못했습니다.');
      return;
    }

    setSession(result.data.session);
    setCurrentQuestion(result.data.firstQuestion);
    setPhase('PRACTICE');
  };

  // Handle normal answer submit
  const handleSubmitAnswer = async () => {
    if (!session || !currentQuestion || isSubmitting) return;

    const isMulti = Array.isArray(currentQuestion.groundTruthAnswer);
    const finalAnswer = isMulti ? userInputs : userInputs[0] || '';

    // If multi, verify at least one keyword was entered
    if (isMulti && userInputs.every((val) => !val.trim())) {
      alert('답안을 입력해주세요. 정답을 모를 경우 [모르겠음] 버튼을 눌러주세요.');
      return;
    }
    if (!isMulti && !userInputs[0]?.trim()) {
      alert('답안을 입력해주세요. 정답을 모를 경우 [모르겠음] 버튼을 눌러주세요.');
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
      alert(res.error || '답안 제출 중 오류가 발생했습니다.');
      return;
    }

    setSubmitResult(res.data);
    setSession((prev) => (prev ? { ...prev, ...res.data!.sessionProgress } : null));
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
      alert(res.error || '모르겠음 처리 중 오류가 발생했습니다.');
      return;
    }

    setSubmitResult(res.data);
    setSession((prev) => (prev ? { ...prev, ...res.data!.sessionProgress } : null));
  };

  // Handle "정답 확인" (Active Recall Reveal Solution)
  const handleRevealSolution = async () => {
    if (!session || !currentQuestion || isSubmitting) return;

    if (timerRef.current) clearInterval(timerRef.current);
    setIsSubmitting(true);

    const timeSpentMs = Math.max(elapsedSeconds * 1000, 1000);
    const res = await submitSessionAnswer(session.id, {
      questionId: currentQuestion.id,
      userAnswer: '(정답확인)',
      timeSpentMs,
      hintUsed: showHint || hintLevel > 0,
      solutionRevealed: true,
    });

    setIsSubmitting(false);

    if (res.error || !res.data) {
      alert(res.error || '정답 확인 처리 중 오류가 발생했습니다.');
      return;
    }

    setSubmitResult(res.data);
    setSession((prev) => (prev ? { ...prev, ...res.data!.sessionProgress } : null));
  };

  // Advance to next question or show summary
  const handleNextQuestion = async () => {
    if (!session) return;

    if (submitResult?.isSessionCompleted) {
      // Load session summary
      setPhase('SUMMARY');
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
      setPhase('SUMMARY');
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
      if (!isOpen || phase !== 'PRACTICE') return;

      if (submitResult) {
        // If feedback is showing, Enter advances to next question
        if (e.key === 'Enter') {
          e.preventDefault();
          handleNextQuestion();
        }
      } else {
        // If single input and Enter pressed in non-submit mode
        if (e.key === 'Enter' && !e.shiftKey) {
          const isMulti = currentQuestion && Array.isArray(currentQuestion.groundTruthAnswer);
          if (!isMulti) {
            e.preventDefault();
            handleSubmitAnswer();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
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
              {session?.title || '실기 문제 풀이 & 스마트 채점'}
            </span>
          </div>

          <div style={styles.topBarRight}>
            {phase === 'PRACTICE' && (
              <div style={styles.timerBadge}>
                <Clock size={15} color="#94A3B8" />
                <span>
                  {Math.floor(elapsedSeconds / 60)
                    .toString()
                    .padStart(2, '0')}
                  :{(elapsedSeconds % 60).toString().padStart(2, '0')}
                </span>
              </div>
            )}
            <button
              onClick={() => {
                if (phase === 'PRACTICE' && !submitResult?.isSessionCompleted) {
                  if (confirm('학습 세션을 종료하고 나가시겠습니까? 풀이 기록은 보존됩니다.')) {
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
        {phase === 'PRACTICE' && session && (
          <div style={styles.progressContainer}>
            <div style={styles.progressInfo}>
              <span style={styles.progressText}>
                문항 <strong>{Math.min(session.currentIndex + 1, session.totalQuestions)}</strong> /{' '}
                {session.totalQuestions}
              </span>
              <div style={styles.scoreTally}>
                <span style={{ color: 'var(--color-success)' }}>
                  ✓ 정답 {session.correctCount}
                </span>
                <span style={{ color: 'var(--color-danger)' }}>✕ 오답 {session.wrongCount}</span>
                <span style={{ color: 'var(--color-warning)' }}>
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
          {phase === 'CONFIG' && (
            <div style={styles.configContainer}>
              <div style={styles.configHeader}>
                <h2 style={styles.configTitle}>학습 세션 설정</h2>
                <p style={styles.configSubtitle}>
                  집중할 과목과 문항수를 선택하고 스마트 채점 엔진으로 실기 문제를 풀이합니다.
                </p>
              </div>

              {configError && <div style={styles.errorAlert}>{configError}</div>}

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
                    onChange={(e) => setSelectedSubject(e.target.value as Subject | '')}
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
                            questionCount === num ? 'var(--color-primary)' : 'var(--color-surface)',
                          borderColor:
                            questionCount === num ? 'var(--color-primary)' : 'var(--color-border)',
                          color: questionCount === num ? '#FFF' : 'var(--color-text)',
                        }}
                      >
                        {num}문제
                      </button>
                    ))}
                  </div>
                </div>

                {/* 안내 박스 */}
                <div style={styles.infoCallout}>
                  <Lightbulb size={18} color="#3B82F6" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div style={styles.infoCalloutText}>
                    <strong>Phase 3 스마트 채점 엔진 안내</strong>
                    <ul>
                      <li>
                        <strong>동의어 & 약어 매칭:</strong> 'Builder' ↔ '빌더', 'GROUP BY' ↔
                        '그룹바이' 자동 판정
                      </li>
                      <li>
                        <strong>1글자 오탈자 허용:</strong> 레벤슈타인 거리 기반으로 아쉬운 오탈자
                        정답 인정
                      </li>
                      <li>
                        <strong>복수 빈칸 부분 점수:</strong> 2개 중 1개 일치 시 0.5점 부분 점수
                        부여
                      </li>
                      <li>
                        <strong>모르겠음(Unknown):</strong> 찍지 않고 누르면 오답과 분리되어 복습
                        우선순위에 배정
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
                    <span>{isStarting ? '세션 생성 중...' : '학습 세션 시작하기'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* PHASE 2: ACTIVE PRACTICE VIEW */}
          {/* ============================================================== */}
          {phase === 'PRACTICE' && currentQuestion && (
            <div style={styles.practiceContainer}>
              {/* QUESTION HEADER BADGES */}
              <div style={styles.qMetaRow}>
                <span style={styles.qSubjectBadge}>{currentQuestion.subject}</span>
                <span style={styles.qCategoryBadge}>{currentQuestion.category}</span>
                <span style={styles.qTypeBadge}>{currentQuestion.type}</span>
                <span
                  style={{
                    ...styles.qDiffBadge,
                    color:
                      currentQuestion.difficulty === 'HARD'
                        ? 'var(--color-danger)'
                        : currentQuestion.difficulty === 'MEDIUM'
                        ? 'var(--color-warning)'
                        : 'var(--color-success)',
                  }}
                >
                  난이도: {currentQuestion.difficulty}
                </span>
                <span style={styles.qSourceBadge}>
                  출처: {QUESTION_SOURCE_LABELS[currentQuestion.sourceType] || currentQuestion.sourceType}
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
              {currentQuestion.code && (
                <div style={styles.codeContainer}>
                  <div style={styles.codeHeader}>
                    <span style={styles.codeLangBadge}>
                      {currentQuestion.language || 'CODE'}
                    </span>
                    <button onClick={handleCopyCode} style={styles.copyCodeBtn}>
                      {codeCopied ? (
                        <>
                          <Check size={14} color="#10B981" />
                          <span style={{ color: '#10B981' }}>복사됨</span>
                        </>
                      ) : (
                        <>
                          <Copy size={14} />
                          <span>코드 복사</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre style={styles.codePre}>
                    <code>{currentQuestion.code}</code>
                  </pre>

                  {/* LINE-BY-LINE ANATOMY ACCORDION */}
                  {currentQuestion.codeLineExplanations && currentQuestion.codeLineExplanations.length > 0 && (
                    <div style={styles.codeAnatomyBox}>
                      <button
                        type="button"
                        onClick={() => setShowCodeAnatomy(!showCodeAnatomy)}
                        style={styles.codeAnatomyToggleBtn}
                      >
                        <Layers size={15} color="#38BDF8" />
                        <span>코드 라인별 심층 분석 ({currentQuestion.codeLineExplanations.length}개 라인)</span>
                        <span style={{ marginLeft: 'auto' }}>
                          {showCodeAnatomy ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </span>
                      </button>

                      {showCodeAnatomy && (
                        <div style={styles.codeAnatomyList}>
                          {currentQuestion.codeLineExplanations.map((exp, idx) => (
                            <div
                              key={idx}
                              style={{
                                ...styles.codeAnatomyItem,
                                backgroundColor: expandedLineIndex === idx ? 'rgba(56, 189, 248, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                                borderColor: expandedLineIndex === idx ? 'rgba(56, 189, 248, 0.3)' : 'rgba(255, 255, 255, 0.06)',
                              }}
                              onClick={() => setExpandedLineIndex(expandedLineIndex === idx ? null : idx)}
                            >
                              <div style={styles.codeAnatomyItemHeader}>
                                <span style={styles.codeLineBadge}>L{exp.line}</span>
                                <code style={styles.codeLineText}>{exp.code}</code>
                              </div>
                              <p style={styles.codeExplanationText}>{exp.explanation}</p>
                              {exp.tokens && exp.tokens.length > 0 && (
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                                  {exp.tokens.map((tk, tIdx) => (
                                    <span key={tIdx} style={styles.traceTag}>
                                      <span style={styles.traceLabel}>{tk.token}:</span> {tk.desc}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* PROGRESSIVE HINTS BOX (Phase 5 Active Recall) */}
              {((currentQuestion.hints && currentQuestion.hints.length > 0) ||
                (currentQuestion.keywords && currentQuestion.keywords.length > 0)) && (
                <div style={styles.hintContainer}>
                  {currentQuestion.hints && currentQuestion.hints.length > 0 ? (
                    <div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setShowHint(true);
                            setHintLevel((prev) => Math.min(prev + 1, currentQuestion.hints!.length));
                          }}
                          style={styles.hintToggleBtn}
                          disabled={hintLevel >= currentQuestion.hints.length}
                        >
                          <Lightbulb size={16} color="#F59E0B" />
                          <span>
                            {hintLevel === 0
                              ? `💡 단계별 힌트 보기 (1/${currentQuestion.hints.length}단계)`
                              : hintLevel < currentQuestion.hints.length
                              ? `💡 다음 힌트 추가 확인 (${hintLevel + 1}/${currentQuestion.hints.length}단계)`
                              : `💡 모든 힌트 확인 완료 (${currentQuestion.hints.length}/${currentQuestion.hints.length})`}
                          </span>
                        </button>
                        {hintLevel > 0 && (
                          <button
                            type="button"
                            onClick={() => setShowHint(!showHint)}
                            style={{ ...styles.hintToggleBtn, backgroundColor: 'transparent', border: 'none' }}
                          >
                            <span>{showHint ? '접기' : '펼치기'}</span>
                          </button>
                        )}
                      </div>

                      {showHint && hintLevel > 0 && (
                        <div style={styles.hintBox}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {currentQuestion.hints.slice(0, hintLevel).map((h, i) => (
                              <div key={i} style={styles.progressiveHintItem}>
                                <span style={styles.hintBadge}>힌트 {i + 1}</span>
                                <span style={styles.hintContentText}>{h}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <button
                        type="button"
                        onClick={() => setShowHint(!showHint)}
                        style={styles.hintToggleBtn}
                      >
                        <Lightbulb size={16} color="#F59E0B" />
                        <span>{showHint ? '힌트 접기' : '힌트 보기 (핵심 키워드 힌트)'}</span>
                      </button>
                      {showHint && (
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
                  )}
                </div>
              )}

              {/* ANSWER INPUT SECTION (When not submitted yet) */}
              {!submitResult && (
                <div style={styles.inputSection}>
                  <div style={styles.inputHeader}>
                    <label style={styles.inputLabel}>
                      {Array.isArray(currentQuestion.groundTruthAnswer)
                        ? `순서대로 정답 키워드 ${currentQuestion.groundTruthAnswer.length}개를 작성하세요`
                        : '정답 키워드 또는 용어를 작성하세요 (Enter 제출)'}
                    </label>
                  </div>

                  {/* Multi or Single Inputs */}
                  <div style={styles.inputsGrid}>
                    {userInputs.map((val, idx) => (
                      <div key={idx} style={styles.singleInputRow}>
                        {userInputs.length > 1 && (
                          <span style={styles.inputNumberBadge}>({idx + 1})</span>
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
                              : '정답을 입력하세요 (예: 빌더, Builder, GROUP BY 등)'
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
                      onClick={handleRevealSolution}
                      style={styles.revealBtn}
                      disabled={isSubmitting}
                      title="정답과 해설을 먼저 확인하고 학습을 진행합니다 (복습 큐 등록)"
                    >
                      <Eye size={18} />
                      <span>정답 확인</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSubmitAnswer}
                      style={styles.submitBtn}
                      disabled={isSubmitting}
                    >
                      <CheckCircle2 size={18} />
                      <span>{isSubmitting ? '채점 중...' : '답안 제출 (Enter)'}</span>
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
                        ? 'rgba(245, 158, 11, 0.15)'
                        : submitResult.isCorrect
                        ? 'rgba(16, 185, 129, 0.15)'
                        : submitResult.score > 0
                        ? 'rgba(59, 130, 246, 0.15)'
                        : 'rgba(239, 68, 68, 0.15)',
                      borderColor: submitResult.attempt.isUnknown
                        ? 'var(--color-warning)'
                        : submitResult.isCorrect
                        ? 'var(--color-success)'
                        : submitResult.score > 0
                        ? 'var(--color-primary)'
                        : 'var(--color-danger)',
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
                            ? 'var(--color-warning)'
                            : submitResult.isCorrect
                            ? 'var(--color-success)'
                            : submitResult.score > 0
                            ? 'var(--color-primary)'
                            : 'var(--color-danger)',
                        }}
                      >
                        {submitResult.attempt.isUnknown
                          ? '모르겠음 (복습 우선순위 배정)'
                          : submitResult.isCorrect
                          ? '정답입니다! (+1.0점)'
                          : submitResult.score > 0
                          ? `부분 정답 (+${submitResult.score}점)`
                          : '오답입니다 (0점)'}
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
                          ? submitResult.attempt.userAnswer.join(', ') || '(미입력)'
                          : submitResult.attempt.userAnswer || '(모르겠음 선택)'}
                      </div>
                    </div>
                    <div style={{ ...styles.compareCard, borderColor: 'var(--color-success)' }}>
                      <span style={{ ...styles.compareLabel, color: 'var(--color-success)' }}>
                        기준 정답 (Ground Truth)
                      </span>
                      <div style={styles.groundTruthVal}>
                        {Array.isArray(submitResult.groundTruthAnswer)
                          ? submitResult.groundTruthAnswer.join(', ')
                          : submitResult.groundTruthAnswer}
                      </div>
                    </div>
                  </div>

                  {/* GROUND TRUTH OFFICIAL EXPLANATION (Green/Gold Border) */}
                  {submitResult.officialExplanation && (
                    <div style={styles.groundTruthBox}>
                      <div style={styles.boxTitleRow}>
                        <BookOpen size={18} color="var(--color-success)" />
                        <span style={styles.groundTruthTitle}>공식 검증 해설 (Ground Truth)</span>
                      </div>
                      <p style={styles.explanationText}>{submitResult.officialExplanation}</p>
                    </div>
                  )}

                  {/* AI EXPLANATION (Purple Border - Separated from Ground Truth) */}
                  {submitResult.aiExplanation && (
                    <div style={styles.aiBox}>
                      <div style={styles.boxTitleRow}>
                        <Sparkles size={18} color="#A855F7" />
                        <span style={styles.aiTitle}>AI 보조 학습 해설</span>
                        <span style={styles.aiNoticeBadge}>
                          ※ 공식 출제기관 해설과 분리된 보조 설명입니다
                        </span>
                      </div>
                      <p style={styles.explanationText}>{submitResult.aiExplanation}</p>

                      {/* Variation Notes if parent question exists */}
                      {currentQuestion.aiVariationNotes && (
                        <div style={styles.variationNoteBox}>
                          <strong>🌱 기출 변형 출제 포인트:</strong>{' '}
                          {currentQuestion.aiVariationNotes}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ACTIVE RECALL REVIEW STATE CARD (Phase 5) */}
                  {submitResult.reviewState && (
                    <div style={styles.reviewStateCard}>
                      <div style={styles.reviewStateHeader}>
                        <Brain size={18} color="#818CF8" />
                        <span style={styles.reviewStateTitle}>복습 엔진(Active Recall) 업데이트</span>
                        <span style={styles.reviewStateBadge}>{submitResult.reviewState.reviewState}</span>
                      </div>
                      <div style={styles.reviewStateGrid}>
                        <div style={styles.reviewStateItem}>
                          <span style={styles.reviewStateItemLabel}>라이트너 상자</span>
                          <span style={styles.reviewStateItemValue}>
                            Box {submitResult.reviewState.boxLevel}단계 (총 5단계)
                          </span>
                        </div>
                        <div style={styles.reviewStateItem}>
                          <span style={styles.reviewStateItemLabel}>다음 권장 복습</span>
                          <span style={styles.reviewStateItemValue}>
                            {submitResult.reviewState.intervalDays}일 뒤
                          </span>
                        </div>
                        <div style={styles.reviewStateItem}>
                          <span style={styles.reviewStateItemLabel}>개념 취약도 지수</span>
                          <span
                            style={{
                              ...styles.reviewStateItemValue,
                              color:
                                submitResult.reviewState.weaknessScore >= 0.7
                                  ? '#EF4444'
                                  : submitResult.reviewState.weaknessScore >= 0.4
                                  ? '#F59E0B'
                                  : '#10B981',
                            }}
                          >
                            {Math.round(submitResult.reviewState.weaknessScore * 100)}%
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
                          ? '세션 완료! 종합 결과 확인 🏆'
                          : '다음 문제로 이동 (Enter / Space) ➔'}
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
          {phase === 'SUMMARY' && (
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
                      총 {summary.session.totalQuestions}문항 중 {summary.session.correctCount}문항을 맞추셨습니다.
                    </p>
                    <div style={styles.accuracyCircle}>
                      <span style={styles.accuracyNumber}>{summary.accuracyRate}%</span>
                      <span style={styles.accuracyLabel}>최종 정답률</span>
                    </div>
                  </div>

                  {/* STATS 4-GRID */}
                  <div style={styles.summaryGrid}>
                    <div style={styles.summaryStatCard}>
                      <span style={styles.statLabel}>정답 문항</span>
                      <span style={{ ...styles.statVal, color: 'var(--color-success)' }}>
                        {summary.session.correctCount}개
                      </span>
                    </div>
                    <div style={styles.summaryStatCard}>
                      <span style={styles.statLabel}>오답 문항</span>
                      <span style={{ ...styles.statVal, color: 'var(--color-danger)' }}>
                        {summary.session.wrongCount}개
                      </span>
                    </div>
                    <div style={styles.summaryStatCard}>
                      <span style={styles.statLabel}>모르겠음 (복습 우선)</span>
                      <span style={{ ...styles.statVal, color: 'var(--color-warning)' }}>
                        {summary.session.unknownCount}개
                      </span>
                    </div>
                    <div style={styles.summaryStatCard}>
                      <span style={styles.statLabel}>평균 풀이 시간</span>
                      <span style={styles.statVal}>{summary.averageTimeSpentSeconds}초/문항</span>
                    </div>
                  </div>

                  {/* QUESTION-BY-QUESTION REVIEW LIST */}
                  <div style={styles.reviewListSection}>
                    <h3 style={styles.reviewListTitle}>세션 문항별 풀이 결과</h3>
                    <div style={styles.reviewCards}>
                      {summary.attempts.map((item, idx) => {
                        const q = summary.questions.find((x) => x.id === item.questionId);
                        return (
                          <div
                            key={item.id}
                            style={{
                              ...styles.reviewCard,
                              borderLeftColor: item.isUnknown
                                ? 'var(--color-warning)'
                                : item.isCorrect
                                ? 'var(--color-success)'
                                : 'var(--color-danger)',
                            }}
                          >
                            <div style={styles.reviewCardHeader}>
                              <span style={styles.reviewQIndex}>Q.{idx + 1}</span>
                              <span style={styles.reviewQSubj}>{q?.subject || '과목'}</span>
                              <span style={styles.reviewQCat}>{q?.category || '카테고리'}</span>
                              <div style={styles.reviewStatusBadge}>
                                {item.isUnknown ? (
                                  <span style={{ color: 'var(--color-warning)' }}>? 모르겠음</span>
                                ) : item.isCorrect ? (
                                  <span style={{ color: 'var(--color-success)' }}>✓ 정답</span>
                                ) : (
                                  <span style={{ color: 'var(--color-danger)' }}>✕ 오답</span>
                                )}
                              </div>
                            </div>

                            <div style={styles.reviewQText}>{q?.question || '문항 정보'}</div>

                            <div style={styles.reviewAnswersRow}>
                              <div style={styles.reviewAnswerItem}>
                                <span style={styles.reviewAnswerKey}>나의 답:</span>
                                <span style={styles.reviewAnswerVal}>
                                  {Array.isArray(item.userAnswer)
                                    ? item.userAnswer.join(', ')
                                    : item.userAnswer || '(모르겠음)'}
                                </span>
                              </div>
                              <div style={styles.reviewAnswerItem}>
                                <span style={{ ...styles.reviewAnswerKey, color: 'var(--color-success)' }}>
                                  기준 정답:
                                </span>
                                <strong style={{ color: 'var(--color-success)' }}>
                                  {q?.groundTruthAnswer
                                    ? Array.isArray(q.groundTruthAnswer)
                                      ? q.groundTruthAnswer.join(', ')
                                      : q.groundTruthAnswer
                                    : '(정보 없음)'}
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
                      onClick={() => setPhase('CONFIG')}
                      style={styles.newSessionBtn}
                    >
                      <RotateCcw size={18} />
                      <span>새 학습 세션 시작</span>
                    </button>
                    <button type="button" onClick={onClose} style={styles.doneBtn}>
                      <span>문제 브라우저로 돌아가기</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div style={styles.errorAlert}>세션 요약 정보를 불러오지 못했습니다.</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// STYLES
// ============================================================================
const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    backdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '24px',
  },
  modal: {
    backgroundColor: '#0F172A',
    border: '1px solid #334155',
    borderRadius: '16px',
    width: '100%',
    maxWidth: '1000px',
    maxHeight: '92vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
    overflow: 'hidden',
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 24px',
    backgroundColor: '#1E293B',
    borderBottom: '1px solid #334155',
  },
  topBarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  sessionBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    color: '#F59E0B',
    fontSize: '12px',
    fontWeight: 600,
    padding: '4px 10px',
    borderRadius: '20px',
  },
  topBarTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#F8FAFC',
  },
  topBarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  timerBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '14px',
    fontFamily: 'monospace',
    fontWeight: 700,
    color: '#E2E8F0',
    backgroundColor: '#0F172A',
    padding: '4px 12px',
    borderRadius: '6px',
    border: '1px solid #334155',
  },
  closeBtn: {
    color: '#94A3B8',
    cursor: 'pointer',
    padding: '6px',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressContainer: {
    padding: '12px 24px 8px 24px',
    backgroundColor: '#1E293B',
    borderBottom: '1px solid #334155',
  },
  progressInfo: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
    fontSize: '13px',
  },
  progressText: {
    color: '#CBD5E1',
  },
  scoreTally: {
    display: 'flex',
    gap: '16px',
    fontSize: '12px',
    fontWeight: 600,
  },
  progressBarTrack: {
    width: '100%',
    height: '6px',
    backgroundColor: '#334155',
    borderRadius: '3px',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#3B82F6',
    transition: 'width 0.3s ease-in-out',
  },
  bodyContent: {
    padding: '28px',
    overflowY: 'auto',
    flex: 1,
  },

  // CONFIG STYLES
  configContainer: {
    maxWidth: '650px',
    margin: '0 auto',
  },
  configHeader: {
    textAlign: 'center',
    marginBottom: '28px',
  },
  configTitle: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#F8FAFC',
    marginBottom: '8px',
  },
  configSubtitle: {
    fontSize: '14px',
    color: '#94A3B8',
  },
  configCard: {
    backgroundColor: '#1E293B',
    border: '1px solid #334155',
    borderRadius: '12px',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#CBD5E1',
  },
  inputField: {
    backgroundColor: '#0F172A',
    border: '1px solid #334155',
    borderRadius: '8px',
    padding: '10px 14px',
    color: '#F8FAFC',
    fontSize: '14px',
    outline: 'none',
  },
  selectField: {
    backgroundColor: '#0F172A',
    border: '1px solid #334155',
    borderRadius: '8px',
    padding: '10px 14px',
    color: '#F8FAFC',
    fontSize: '14px',
    outline: 'none',
  },
  countBtnRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '10px',
  },
  countBtn: {
    padding: '10px',
    borderRadius: '8px',
    border: '1px solid',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'all 0.15s ease',
  },
  infoCallout: {
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
    border: '1px solid rgba(59, 130, 246, 0.25)',
    borderRadius: '8px',
    padding: '14px',
    display: 'flex',
    gap: '12px',
    fontSize: '13px',
    color: '#CBD5E1',
    lineHeight: '1.6',
  },
  infoCalloutText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  configActionRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '12px',
  },
  cancelBtn: {
    padding: '10px 20px',
    borderRadius: '8px',
    backgroundColor: '#334155',
    color: '#F8FAFC',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  startBtn: {
    padding: '10px 24px',
    borderRadius: '8px',
    backgroundColor: '#3B82F6',
    color: '#FFFFFF',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },

  // PRACTICE STYLES
  practiceContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    maxWidth: '900px',
    margin: '0 auto',
  },
  qMetaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  qSubjectBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    color: '#3B82F6',
    fontSize: '12px',
    fontWeight: 600,
    padding: '4px 10px',
    borderRadius: '4px',
  },
  qCategoryBadge: {
    backgroundColor: '#334155',
    color: '#E2E8F0',
    fontSize: '12px',
    padding: '4px 8px',
    borderRadius: '4px',
  },
  qTypeBadge: {
    backgroundColor: '#1E293B',
    border: '1px solid #334155',
    color: '#94A3B8',
    fontSize: '11px',
    fontWeight: 600,
    padding: '3px 8px',
    borderRadius: '4px',
  },
  qDiffBadge: {
    fontSize: '12px',
    fontWeight: 600,
  },
  qSourceBadge: {
    fontSize: '11px',
    color: '#94A3B8',
    marginLeft: 'auto',
  },
  statementBox: {
    display: 'flex',
    gap: '16px',
    backgroundColor: '#1E293B',
    padding: '20px',
    borderRadius: '12px',
    border: '1px solid #334155',
  },
  qIndexIndicator: {
    fontSize: '20px',
    fontWeight: 800,
    color: '#3B82F6',
    flexShrink: 0,
  },
  qText: {
    fontSize: '17px',
    color: '#F8FAFC',
    lineHeight: 1.7,
    whiteSpace: 'pre-wrap',
  },
  codeContainer: {
    backgroundColor: '#0A0F1D',
    border: '1px solid #1E293B',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  codeHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 14px',
    backgroundColor: '#111827',
    borderBottom: '1px solid #1E293B',
  },
  codeLangBadge: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#38BDF8',
    fontFamily: 'monospace',
  },
  copyCodeBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    color: '#94A3B8',
    cursor: 'pointer',
  },
  codePre: {
    padding: '16px',
    margin: 0,
    fontSize: '14px',
    fontFamily: 'Consolas, Monaco, "Courier New", monospace',
    color: '#E2E8F0',
    lineHeight: 1.6,
    overflowX: 'auto',
  },
  codeAnatomyBox: {
    marginTop: '12px',
    borderRadius: '8px',
    backgroundColor: '#0F172A',
    border: '1px solid #1E293B',
    overflow: 'hidden',
  },
  codeAnatomyToggleBtn: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 16px',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    border: 'none',
    color: '#93C5FD',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    textAlign: 'left',
  },
  codeAnatomyList: {
    padding: '12px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    borderTop: '1px solid #1E293B',
  },
  codeAnatomyItem: {
    padding: '10px 12px',
    borderRadius: '6px',
    border: '1px solid',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  },
  codeAnatomyItemHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '6px',
  },
  codeLineBadge: {
    fontSize: '11px',
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: '4px',
    backgroundColor: '#1E293B',
    color: '#38BDF8',
    fontFamily: 'monospace',
  },
  codeLineText: {
    fontSize: '13px',
    color: '#E2E8F0',
    fontFamily: 'Consolas, Monaco, monospace',
  },
  codeExplanationText: {
    fontSize: '13px',
    color: '#94A3B8',
    margin: '0 0 6px 0',
    lineHeight: 1.5,
  },
  traceTag: {
    fontSize: '12px',
    padding: '4px 8px',
    borderRadius: '4px',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    color: '#38BDF8',
    marginTop: '4px',
    display: 'inline-block',
  },
  traceLabel: {
    fontWeight: 700,
  },
  hintContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  hintToggleBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    color: '#F59E0B',
    cursor: 'pointer',
    alignSelf: 'flex-start',
    padding: '4px 8px',
    borderRadius: '4px',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
  },
  hintBox: {
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    border: '1px dashed rgba(245, 158, 11, 0.3)',
    borderRadius: '8px',
    padding: '12px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '13px',
  },
  progressiveHintItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '8px 12px',
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderRadius: '6px',
    border: '1px solid rgba(245, 158, 11, 0.2)',
  },
  hintBadge: {
    fontSize: '11px',
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: '4px',
    backgroundColor: '#F59E0B',
    color: '#000000',
    flexShrink: 0,
  },
  hintContentText: {
    fontSize: '13px',
    color: '#F8FAFC',
    lineHeight: 1.5,
  },
  hintLabel: {
    color: '#F59E0B',
    fontWeight: 600,
  },
  hintKeywords: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  hintKeywordTag: {
    backgroundColor: '#1E293B',
    padding: '3px 8px',
    borderRadius: '4px',
    color: '#CBD5E1',
    fontSize: '12px',
  },

  // INPUT SECTION
  inputSection: {
    backgroundColor: '#1E293B',
    border: '1px solid #334155',
    borderRadius: '12px',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  inputHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inputLabel: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#94A3B8',
  },
  inputsGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  singleInputRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  inputNumberBadge: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#3B82F6',
    width: '28px',
    flexShrink: 0,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#0F172A',
    border: '2px solid #334155',
    borderRadius: '8px',
    padding: '14px 16px',
    color: '#F8FAFC',
    fontSize: '16px',
    fontWeight: 500,
    outline: 'none',
    transition: 'border-color 0.15s ease',
  },
  actionBtnRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    marginTop: '8px',
  },
  unknownBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 20px',
    borderRadius: '8px',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    border: '1px solid rgba(245, 158, 11, 0.3)',
    color: '#F59E0B',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  revealBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 20px',
    borderRadius: '8px',
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    border: '1px solid rgba(99, 102, 241, 0.3)',
    color: '#818CF8',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  submitBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 28px',
    borderRadius: '8px',
    backgroundColor: '#3B82F6',
    color: '#FFFFFF',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },

  // ACTIVE RECALL REVIEW STATE CARD
  reviewStateCard: {
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    border: '1px solid rgba(99, 102, 241, 0.25)',
    borderRadius: '10px',
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  reviewStateHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  reviewStateTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#A5B4FC',
  },
  reviewStateBadge: {
    fontSize: '11px',
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: '4px',
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    color: '#C7D2FE',
    marginLeft: 'auto',
  },
  reviewStateGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '12px',
  },
  reviewStateItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.05)',
  },
  reviewStateItemLabel: {
    fontSize: '11px',
    color: '#94A3B8',
  },
  reviewStateItemValue: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#F8FAFC',
  },

  // FEEDBACK SECTION
  feedbackSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  feedbackBanner: {
    display: 'flex',
    gap: '16px',
    alignItems: 'center',
    padding: '18px 24px',
    borderRadius: '12px',
    border: '1.5px solid',
  },
  bannerIconBox: {
    flexShrink: 0,
  },
  bannerContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  bannerTitle: {
    fontSize: '18px',
    fontWeight: 700,
  },
  bannerDesc: {
    fontSize: '14px',
    color: '#E2E8F0',
  },
  fuzzyNotice: {
    color: '#38BDF8',
    marginLeft: '8px',
    fontSize: '12px',
  },
  compareContainer: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  },
  compareCard: {
    backgroundColor: '#1E293B',
    border: '1px solid #334155',
    borderRadius: '8px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  compareLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#94A3B8',
  },
  userAnswerVal: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#F8FAFC',
    wordBreak: 'break-all',
  },
  groundTruthVal: {
    fontSize: '16px',
    fontWeight: 700,
    color: 'var(--color-success)',
    wordBreak: 'break-all',
  },
  groundTruthBox: {
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
    border: '1px solid rgba(16, 185, 129, 0.3)',
    borderRadius: '10px',
    padding: '18px',
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
    fontSize: '14px',
    fontWeight: 700,
    color: 'var(--color-success)',
  },
  explanationText: {
    fontSize: '14px',
    color: '#CBD5E1',
    lineHeight: 1.7,
    margin: 0,
  },
  aiBox: {
    backgroundColor: 'rgba(168, 85, 247, 0.05)',
    border: '1px solid rgba(168, 85, 247, 0.3)',
    borderRadius: '10px',
    padding: '18px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  aiTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#A855F7',
  },
  aiNoticeBadge: {
    fontSize: '11px',
    color: '#94A3B8',
    marginLeft: 'auto',
  },
  variationNoteBox: {
    marginTop: '6px',
    padding: '10px 12px',
    borderRadius: '6px',
    backgroundColor: 'rgba(168, 85, 247, 0.1)',
    fontSize: '12px',
    color: '#E9D5FF',
    lineHeight: 1.5,
  },
  nextActionRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: '10px',
  },
  nextBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '14px 32px',
    borderRadius: '8px',
    backgroundColor: '#3B82F6',
    color: '#FFFFFF',
    fontSize: '16px',
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)',
  },

  // SUMMARY STYLES
  summaryContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '28px',
    maxWidth: '800px',
    margin: '0 auto',
  },
  summaryHero: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: '12px',
    padding: '24px 0',
  },
  trophyIconBox: {
    width: '72px',
    height: '72px',
    borderRadius: '36px',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '8px',
  },
  summaryTitle: {
    fontSize: '26px',
    fontWeight: 800,
    color: '#F8FAFC',
  },
  summarySubtitle: {
    fontSize: '15px',
    color: '#94A3B8',
  },
  accuracyCircle: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: '130px',
    height: '130px',
    borderRadius: '65px',
    backgroundColor: '#1E293B',
    border: '3px solid #3B82F6',
    marginTop: '12px',
  },
  accuracyNumber: {
    fontSize: '32px',
    fontWeight: 800,
    color: '#3B82F6',
  },
  accuracyLabel: {
    fontSize: '12px',
    color: '#94A3B8',
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '14px',
  },
  summaryStatCard: {
    backgroundColor: '#1E293B',
    border: '1px solid #334155',
    borderRadius: '10px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    textAlign: 'center',
  },
  statLabel: {
    fontSize: '12px',
    color: '#94A3B8',
    fontWeight: 600,
  },
  statVal: {
    fontSize: '20px',
    fontWeight: 700,
    color: '#F8FAFC',
  },
  reviewListSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  reviewListTitle: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#F8FAFC',
  },
  reviewCards: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  reviewCard: {
    backgroundColor: '#1E293B',
    border: '1px solid #334155',
    borderLeftWidth: '5px',
    borderRadius: '8px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  reviewCardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
  },
  reviewQIndex: {
    fontWeight: 700,
    color: '#3B82F6',
  },
  reviewQSubj: {
    color: '#94A3B8',
  },
  reviewQCat: {
    color: '#CBD5E1',
    fontWeight: 500,
  },
  reviewStatusBadge: {
    marginLeft: 'auto',
    fontWeight: 700,
    fontSize: '12px',
  },
  reviewQText: {
    fontSize: '14px',
    color: '#F8FAFC',
    lineHeight: 1.5,
  },
  reviewAnswersRow: {
    display: 'flex',
    gap: '24px',
    fontSize: '13px',
    backgroundColor: '#0F172A',
    padding: '10px 14px',
    borderRadius: '6px',
  },
  reviewAnswerItem: {
    display: 'flex',
    gap: '6px',
  },
  reviewAnswerKey: {
    color: '#94A3B8',
  },
  reviewAnswerVal: {
    color: '#CBD5E1',
  },
  summaryActionRow: {
    display: 'flex',
    justifyContent: 'center',
    gap: '16px',
    paddingTop: '16px',
  },
  newSessionBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 24px',
    borderRadius: '8px',
    backgroundColor: '#3B82F6',
    color: '#FFFFFF',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  doneBtn: {
    padding: '12px 24px',
    borderRadius: '8px',
    backgroundColor: '#334155',
    color: '#F8FAFC',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  errorAlert: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    border: '1px solid var(--color-danger)',
    color: 'var(--color-danger)',
    borderRadius: '8px',
    padding: '12px 16px',
    fontSize: '14px',
  },
  loadingBox: {
    padding: '48px',
    textAlign: 'center',
    color: '#94A3B8',
  },
};
