import React, { useState, useEffect, useCallback } from "react";
import {
  X,
  UploadCloud,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  Code2,
  Trash2,
  Edit3,
  Save,
  RefreshCw,
  Layers,
  ShieldCheck,
  Database,
  Info,
} from "lucide-react";
import {
  ImportFormat,
  ImportBatch,
  StagedQuestion,
  QuestionSourceType,
  Subject,
  SUBJECT_LIST,
  UpdateStagedQuestionRequest,
} from "@jungcheogi/shared";
import {
  parseAndStageImport,
  fetchImportBatches,
  fetchImportBatchDetail,
  updateStagedQuestionApi,
  setStagedStatusApi,
  approveAllStagedApi,
  commitImportBatchApi,
  deleteImportBatchApi,
} from "../../api/imports";

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onQuestionsUpdated?: () => void;
}

const SAMPLE_MARKDOWN = `# 2024년 1회 기출문제 검수 대상

### [문제 1] 단답형
- 과목: 소프트웨어설계
- 카테고리: 디자인 패턴
- 출처: REAL_EXAM
- 기출: 2024년 1회 1번
- 난이도: MEDIUM

객체 생성에 관련된 디자인 패턴 중 하나로, 복잡한 인스턴스를 조립하여 만드는 구조이며, 생성과 표현을 분리하여 동일한 생성 절차에서 서로 다른 표현 결과를 만들 수 있는 패턴은 무엇인가?

**정답**: 빌더
**해설**: GoF 디자인 패턴 중 생성 패턴에 해당하는 빌더(Builder) 패턴 설명입니다.
**키워드**: 빌더, Builder, 생성패턴

---

### [문제 2] C 언어 포인터
- 과목: 프로그래밍언어활용
- 카테고리: C 프로그래밍
- 출처: REAL_EXAM
- 기출: 2024년 1회 2번
- 난이도: HARD

다음 C언어로 작성된 프로그램의 실행 결과를 작성하시오.

\`\`\`c
#include <stdio.h>
int main() {
    int arr[3] = {100, 200, 300};
    int *ptr = arr;
    printf("%d\\n", *(ptr + 2));
    return 0;
}
\`\`\`

**정답**: 300
**해설**: ptr은 arr[0]을 가리키며, *(ptr + 2)는 arr[2]의 값 300을 참조합니다.
**키워드**: C언어, 포인터, 배열
`;

const SAMPLE_JSON = JSON.stringify(
  [
    {
      subject: "데이터베이스구축",
      category: "SQL 응용",
      subCategory: "조회 쿼리",
      type: "SQL",
      sourceType: "TEXTBOOK",
      question:
        "테이블에서 특정 컬럼의 중복 값을 제거하고 고유한 값만 조회하는 SQL 키워드를 작성하시오.",
      groundTruthAnswer: "DISTINCT",
      officialExplanation:
        "DISTINCT 키워드는 SELECT 절에서 중복된 결과 튜플을 제거합니다.",
      difficulty: "EASY",
      keywords: ["SQL", "DISTINCT", "중복제거"],
    },
    {
      subject: "프로그래밍언어활용",
      category: "Java 프로그래밍",
      type: "CODE_TRACE",
      sourceType: "REAL_EXAM",
      examYear: 2024,
      examRound: 2,
      questionNumber: 7,
      question:
        "다음 Java 코드가 실행되었을 때 콘솔에 출력되는 결과를 작성하시오.",
      codeSnippet: `public class Test {\n  public static void main(String[] args) {\n    int sum = 0;\n    for (int i = 1; i <= 5; i++) {\n      if (i % 2 == 0) sum += i;\n    }\n    System.out.println(sum);\n  }\n}`,
      language: "JAVA",
      groundTruthAnswer: "6",
      officialExplanation: "1부터 5 사이의 짝수 2, 4의 합은 6입니다.",
      difficulty: "EASY",
      keywords: ["Java", "반복문", "조건문"],
    },
  ],
  null,
  2,
);

export const ImportModal: React.FC<ImportModalProps> = ({
  isOpen,
  onClose,
  onQuestionsUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<"NEW_IMPORT" | "REVIEW_STAGING">(
    "NEW_IMPORT",
  );

  // New Import Form State
  const [format, setFormat] = useState<ImportFormat>("MARKDOWN");
  const [sourceType, setSourceType] = useState<QuestionSourceType>("REAL_EXAM");
  const [sourceName, setSourceName] = useState<string>("2024_01_exam_draft.md");
  const [content, setContent] = useState<string>(SAMPLE_MARKDOWN);
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Review Staging State
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<ImportBatch | null>(null);
  const [stagedQuestions, setStagedQuestions] = useState<StagedQuestion[]>([]);
  const [loadingBatch, setLoadingBatch] = useState<boolean>(false);
  const [batchActionError, setBatchActionError] = useState<string | null>(null);
  const [batchActionSuccess, setBatchActionSuccess] = useState<string | null>(
    null,
  );

  // Edit Question Modal / Drawer State
  const [editingQuestion, setEditingQuestion] = useState<StagedQuestion | null>(
    null,
  );
  const [editFormData, setEditFormData] = useState<UpdateStagedQuestionRequest>(
    {},
  );
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);

  // Load all batches
  const loadBatches = useCallback(
    async (selectBatchId?: string) => {
      const res = await fetchImportBatches();
      if (res.data) {
        setBatches(res.data);
        if (res.data.length > 0) {
          const nextId =
            selectBatchId ||
            (selectedBatchId && res.data.some((b) => b.id === selectedBatchId)
              ? selectedBatchId
              : res.data[0].id);
          setSelectedBatchId(nextId);
        } else {
          setSelectedBatchId(null);
          setSelectedBatch(null);
          setStagedQuestions([]);
        }
      }
    },
    [selectedBatchId],
  );

  // Load selected batch details
  const loadBatchDetail = useCallback(async (batchId: string) => {
    setLoadingBatch(true);
    setBatchActionError(null);
    const res = await fetchImportBatchDetail(batchId);
    if (res.data) {
      setSelectedBatch(res.data.batch);
      setStagedQuestions(res.data.stagedQuestions);
    } else {
      setBatchActionError(res.error || "배치 상세 정보를 불러오지 못했습니다.");
    }
    setLoadingBatch(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadBatches();
    }
  }, [isOpen, loadBatches]);

  useEffect(() => {
    if (selectedBatchId) {
      loadBatchDetail(selectedBatchId);
    }
  }, [selectedBatchId, loadBatchDetail]);

  if (!isOpen) return null;

  // Handle parsing & staging
  const handleParseAndStage = async () => {
    if (!content.trim()) {
      setParseError("내용을 입력해주세요.");
      return;
    }
    setIsParsing(true);
    setParseError(null);

    const res = await parseAndStageImport({
      format,
      sourceType,
      sourceName: sourceName.trim() || `import_${Date.now()}`,
      content,
    });

    setIsParsing(false);
    if (res.error) {
      setParseError(res.error);
    } else if (res.data) {
      // Switch to Review tab and select new batch
      await loadBatches(res.data.batch.id);
      setActiveTab("REVIEW_STAGING");
    }
  };

  // Handle setting status for a staged question
  const handleSetStatus = async (
    stagedId: string,
    status: StagedQuestion["reviewStatus"],
  ) => {
    setBatchActionError(null);
    const res = await setStagedStatusApi(stagedId, { reviewStatus: status });
    if (res.error) {
      setBatchActionError(res.error);
    } else if (res.data) {
      setSelectedBatch(res.data.batch);
      setStagedQuestions((prev) =>
        prev.map((q) => (q.id === stagedId ? res.data!.stagedQuestion : q)),
      );
    }
  };

  // Handle bulk approve
  const handleBulkApprove = async () => {
    if (!selectedBatchId) return;
    setBatchActionError(null);
    const res = await approveAllStagedApi(selectedBatchId);
    if (res.error) {
      setBatchActionError(res.error);
    } else if (res.data) {
      setSelectedBatch(res.data.batch);
      loadBatchDetail(selectedBatchId);
      setBatchActionSuccess(
        `검증 오류가 없는 ${res.data.approvedCount}개 문항이 일괄 승인되었습니다.`,
      );
      setTimeout(() => setBatchActionSuccess(null), 4000);
    }
  };

  // Handle commit to Live DB
  const handleCommitBatch = async () => {
    if (!selectedBatchId) return;
    const confirmCommit = window.confirm(
      "승인(APPROVED)된 문항을 실 서비스 questions 테이블에 영구 커밋하시겠습니까?\n커밋 후에는 라이브 학습 세션에서 즉시 출제됩니다.",
    );
    if (!confirmCommit) return;

    setBatchActionError(null);
    const res = await commitImportBatchApi(selectedBatchId);
    if (res.error) {
      setBatchActionError(res.error);
    } else if (res.data) {
      setSelectedBatch(res.data.batch);
      loadBatchDetail(selectedBatchId);
      setBatchActionSuccess(
        `성공적으로 ${res.data.committedCount}개 문항이 실서비스 DB에 원자적 커밋되었습니다!`,
      );
      if (onQuestionsUpdated) {
        onQuestionsUpdated();
      }
    }
  };

  // Handle delete batch
  const handleDeleteBatch = async () => {
    if (!selectedBatchId) return;
    const confirmDel = window.confirm(
      "해당 스테이징 배치를 삭제하시겠습니까?\n이미 Live DB에 커밋된 문항은 안전하게 보존되며, 스테이징 임시 데이터만 정리됩니다.",
    );
    if (!confirmDel) return;

    const res = await deleteImportBatchApi(selectedBatchId);
    if (res.success) {
      await loadBatches();
    } else {
      setBatchActionError(res.error || "배치 삭제 실패");
    }
  };

  // Open edit modal for a question
  const openEditQuestion = (q: StagedQuestion) => {
    setEditingQuestion(q);
    setEditFormData({
      subject: q.subject,
      category: q.category,
      subCategory: q.subCategory,
      type: q.type,
      questionText: q.questionText,
      codeSnippet: q.codeSnippet,
      language: q.language,
      groundTruthAnswer: q.groundTruthAnswer,
      officialExplanation: q.officialExplanation,
      difficulty: q.difficulty,
      keywords: q.keywords,
      examYear: q.examYear,
      examRound: q.examRound,
      questionNumber: q.questionNumber,
      conceptId: q.conceptId || "",
      reviewerNotes: q.reviewerNotes,
    });
  };

  // Save edit form
  const handleSaveEdit = async () => {
    if (!editingQuestion) return;
    setIsSavingEdit(true);
    const res = await updateStagedQuestionApi(editingQuestion.id, editFormData);
    setIsSavingEdit(false);
    if (res.error) {
      alert(`문항 수정 실패: ${res.error}`);
    } else if (res.data) {
      setSelectedBatch(res.data.batch);
      setStagedQuestions((prev) =>
        prev.map((q) =>
          q.id === editingQuestion.id ? res.data!.stagedQuestion : q,
        ),
      );
      setEditingQuestion(null);
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <div style={styles.headerIconBox}>
              <UploadCloud size={22} color="#3B82F6" />
            </div>
            <div>
              <div style={styles.titleRow}>
                <h2 style={styles.title}>
                  문제 데이터 등록 및 검수
                </h2>
              </div>
              <p style={styles.subtitle}>
                새로운 기출문제를 가져와 검수한 후 학습 문제로 등록합니다.
              </p>
            </div>
          </div>
          <button onClick={onClose} style={styles.closeBtn} title="닫기">
            <X size={20} />
          </button>
        </div>

        {/* Ground Truth Policy Notice Banner */}
        <div style={styles.policyNotice}>
          <ShieldCheck size={18} color="#10B981" />
          <span>
            <strong>Ground Truth 무결성 원칙:</strong> 파싱된 데이터는 검수 없이
            자동 적재되지 않으며, 검수자(Reviewer)가 승인한 문항만 Live DB에
            영구 반영됩니다.
          </span>
        </div>

        {/* Tab Selector */}
        <div style={styles.tabBar}>
          <button
            onClick={() => setActiveTab("NEW_IMPORT")}
            style={{
              ...styles.tabBtn,
              ...(activeTab === "NEW_IMPORT" ? styles.tabBtnActive : {}),
            }}
          >
            <UploadCloud size={16} />
            <span>새 데이터 Import</span>
          </button>
          <button
            onClick={() => setActiveTab("REVIEW_STAGING")}
            style={{
              ...styles.tabBtn,
              ...(activeTab === "REVIEW_STAGING" ? styles.tabBtnActive : {}),
            }}
          >
            <Layers size={16} />
            <span>검수 스테이징 관리 ({batches.length}개 배치)</span>
          </button>
        </div>

        {/* Tab 1: New Import Form */}
        {activeTab === "NEW_IMPORT" && (
          <div style={styles.tabBody}>
            <div style={styles.importFormGrid}>
              {/* Form Controls */}
              <div style={styles.formRow}>
                <div style={styles.formField}>
                  <label style={styles.label}>포맷 선택</label>
                  <div style={styles.pillRow}>
                    <button
                      type="button"
                      onClick={() => {
                        setFormat("MARKDOWN");
                        setSourceName("2024_01_exam_draft.md");
                        setContent(SAMPLE_MARKDOWN);
                      }}
                      style={{
                        ...styles.pillBtn,
                        ...(format === "MARKDOWN" ? styles.pillBtnActive : {}),
                      }}
                    >
                      <FileText size={14} />
                      <span>Markdown (.md)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFormat("JSON");
                        setSourceName("sample_questions.json");
                        setContent(SAMPLE_JSON);
                      }}
                      style={{
                        ...styles.pillBtn,
                        ...(format === "JSON" ? styles.pillBtnActive : {}),
                      }}
                    >
                      <Code2 size={14} />
                      <span>JSON (.json)</span>
                    </button>
                  </div>
                </div>

                <div style={styles.formField}>
                  <label style={styles.label}>출처 유형 (Source Type)</label>
                  <select
                    value={sourceType}
                    onChange={(e) =>
                      setSourceType(e.target.value as QuestionSourceType)
                    }
                    style={styles.selectInput}
                  >
                    <option value="REAL_EXAM">공식 기출 (REAL_EXAM)</option>
                    <option value="TEXTBOOK">수험서 / 교재 (TEXTBOOK)</option>
                    <option value="LECTURE_NOTE">
                      강의 / 요약노트 (LECTURE_NOTE)
                    </option>
                    <option value="AI_VARIATION">
                      AI 변형 문항 (AI_VARIATION)
                    </option>
                  </select>
                </div>

                <div style={styles.formField}>
                  <label style={styles.label}>파일명 / 소스 식별자</label>
                  <input
                    type="text"
                    value={sourceName}
                    onChange={(e) => setSourceName(e.target.value)}
                    placeholder="예: 2024_01_실기_단답.md"
                    style={styles.textInput}
                  />
                </div>
              </div>

              {/* Sample loader buttons */}
              <div style={styles.sampleRow}>
                <span style={styles.sampleLabel}>템플릿 로드:</span>
                <button
                  type="button"
                  onClick={() => {
                    setFormat("MARKDOWN");
                    setContent(SAMPLE_MARKDOWN);
                  }}
                  style={styles.sampleBtn}
                >
                  마크다운 샘플
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFormat("JSON");
                    setContent(SAMPLE_JSON);
                  }}
                  style={styles.sampleBtn}
                >
                  JSON 샘플
                </button>
              </div>

              {/* Textarea */}
              <div style={styles.editorBox}>
                <label style={styles.label}>
                  데이터 원문 입력 (
                  {format === "MARKDOWN" ? "마크다운 규격" : "JSON 배열"})
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  style={styles.textarea}
                  rows={14}
                  spellCheck={false}
                />
              </div>

              {parseError && (
                <div style={styles.errorAlert}>
                  <AlertTriangle size={16} />
                  <span>{parseError}</span>
                </div>
              )}

              {/* Action button */}
              <div style={styles.actionRow}>
                <button
                  type="button"
                  onClick={handleParseAndStage}
                  disabled={isParsing}
                  style={styles.primaryBtn}
                >
                  {isParsing ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      <span>파싱 및 검증 진행 중...</span>
                    </>
                  ) : (
                    <>
                      <UploadCloud size={16} />
                      <span>파싱 및 검수 스테이징 등록</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Review Staging */}
        {activeTab === "REVIEW_STAGING" && (
          <div style={styles.tabBody}>
            {/* Batch Selector & Actions Bar */}
            <div style={styles.batchSelectorBar}>
              <div style={styles.batchSelectWrapper}>
                <label style={styles.batchSelectLabel}>검수 배치 선택:</label>
                <select
                  value={selectedBatchId || ""}
                  onChange={(e) => setSelectedBatchId(e.target.value)}
                  style={styles.batchSelect}
                >
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      [{b.status}] {b.sourceName} ({b.totalCount}문항 - 승인:
                      {b.approvedCount}/커밋:{b.committedCount})
                    </option>
                  ))}
                  {batches.length === 0 && (
                    <option value="">등록된 배치가 없습니다</option>
                  )}
                </select>
                <button
                  onClick={() => loadBatches()}
                  style={styles.iconBtn}
                  title="새로고침"
                >
                  <RefreshCw size={16} />
                </button>
              </div>

              {selectedBatch && (
                <div style={styles.batchActions}>
                  <button
                    onClick={handleBulkApprove}
                    disabled={selectedBatch.pendingCount === 0}
                    style={styles.secondaryBtn}
                  >
                    <CheckCircle2 size={15} color="#10B981" />
                    <span>정상 문항 일괄 승인</span>
                  </button>
                  <button
                    onClick={handleCommitBatch}
                    disabled={selectedBatch.approvedCount === 0}
                    style={styles.commitBtn}
                  >
                    <Database size={15} />
                    <span>
                      승인 문항 Live DB 커밋 ({selectedBatch.approvedCount}건)
                    </span>
                  </button>
                  <button
                    onClick={handleDeleteBatch}
                    style={styles.dangerBtn}
                    title="배치 삭제"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              )}
            </div>

            {batchActionSuccess && (
              <div style={styles.successAlert}>
                <CheckCircle2 size={16} />
                <span>{batchActionSuccess}</span>
              </div>
            )}

            {batchActionError && (
              <div style={styles.errorAlert}>
                <AlertTriangle size={16} />
                <span>{batchActionError}</span>
              </div>
            )}

            {/* Batch Summary Stats */}
            {selectedBatch && (
              <div style={styles.batchSummaryRow}>
                <div style={styles.summaryItem}>
                  <span style={styles.summaryLabel}>전체 문항</span>
                  <span style={styles.summaryVal}>
                    {selectedBatch.totalCount}건
                  </span>
                </div>
                <div style={styles.summaryItem}>
                  <span style={styles.summaryLabel}>검수 대기 (PENDING)</span>
                  <span style={{ ...styles.summaryVal, color: "#F59E0B" }}>
                    {selectedBatch.pendingCount}건
                  </span>
                </div>
                <div style={styles.summaryItem}>
                  <span style={styles.summaryLabel}>검수 승인 (APPROVED)</span>
                  <span style={{ ...styles.summaryVal, color: "#10B981" }}>
                    {selectedBatch.approvedCount}건
                  </span>
                </div>
                <div style={styles.summaryItem}>
                  <span style={styles.summaryLabel}>반려 (REJECTED)</span>
                  <span style={{ ...styles.summaryVal, color: "#EF4444" }}>
                    {selectedBatch.rejectedCount}건
                  </span>
                </div>
                <div style={styles.summaryItem}>
                  <span style={styles.summaryLabel}>
                    DB 커밋 완료 (COMMITTED)
                  </span>
                  <span style={{ ...styles.summaryVal, color: "#3B82F6" }}>
                    {selectedBatch.committedCount}건
                  </span>
                </div>
              </div>
            )}

            {/* Staged Question Items List */}
            {loadingBatch ? (
              <div style={styles.centerBox}>
                <RefreshCw size={24} className="animate-spin" />
                <span style={{ marginTop: "8px" }}>배치 데이터 로딩 중...</span>
              </div>
            ) : stagedQuestions.length === 0 ? (
              <div style={styles.emptyBox}>
                <Info size={32} color="var(--color-text-muted)" />
                <p>선택된 배치에 문항이 없거나 아직 Import되지 않았습니다.</p>
              </div>
            ) : (
              <div style={styles.questionList}>
                {stagedQuestions.map((q) => {
                  const hasErrors = q.validationIssues.some(
                    (i) => i.severity === "ERROR",
                  );

                  return (
                    <div
                      key={q.id}
                      style={{
                        ...styles.questionCard,
                        borderColor:
                          q.reviewStatus === "APPROVED"
                            ? "rgba(16, 185, 129, 0.4)"
                            : q.reviewStatus === "REJECTED"
                              ? "rgba(239, 68, 68, 0.4)"
                              : q.reviewStatus === "COMMITTED"
                                ? "rgba(59, 130, 246, 0.4)"
                                : "var(--color-border)",
                      }}
                    >
                      {/* Card Header */}
                      <div style={styles.qCardHeader}>
                        <div style={styles.qHeaderLeft}>
                          <span style={styles.qIndexBadge}>
                            #{q.indexInBatch}
                          </span>
                          <span style={styles.qSubjectBadge}>{q.subject}</span>
                          <span style={styles.qCategoryText}>
                            {q.category}{" "}
                            {q.subCategory ? `> ${q.subCategory}` : ""}
                          </span>
                          {q.examYear && (
                            <span style={styles.qExamBadge}>
                              {q.examYear}년 {q.examRound}회 {q.questionNumber}
                              번
                            </span>
                          )}
                          {q.conceptId && (
                            <span style={styles.qExamBadge}>
                              개념: {q.conceptId}
                            </span>
                          )}
                        </div>

                        <div style={styles.qHeaderRight}>
                          {/* Duplicate Detection Badge */}
                          {q.duplicateStatus === "NEW" && (
                            <span style={styles.badgeNew}>NEW (신규)</span>
                          )}
                          {q.duplicateStatus === "DUPLICATE_WARNING" && (
                            <span
                              style={styles.badgeDupWarning}
                              title={`기존 문항(${q.duplicateQuestionId})과 유사도: ${Math.round(
                                (q.duplicateSimilarity || 0) * 100,
                              )}%`}
                            >
                              중복 주의 (
                              {Math.round((q.duplicateSimilarity || 0) * 100)}%)
                            </span>
                          )}
                          {q.duplicateStatus === "AI_VARIATION_CANDIDATE" && (
                            <span
                              style={styles.badgeVariation}
                              title={`기존 문항(${q.duplicateQuestionId})의 변형 후보`}
                            >
                              변형 후보 (
                              {Math.round((q.duplicateSimilarity || 0) * 100)}%)
                            </span>
                          )}

                          {/* Review Status Badge */}
                          <span
                            style={{
                              ...styles.statusBadge,
                              ...(q.reviewStatus === "PENDING"
                                ? styles.statusBadgePending
                                : q.reviewStatus === "APPROVED"
                                  ? styles.statusBadgeApproved
                                  : q.reviewStatus === "REJECTED"
                                    ? styles.statusBadgeRejected
                                    : styles.statusBadgeCommitted),
                            }}
                          >
                            {q.reviewStatus}
                          </span>
                        </div>
                      </div>

                      {/* Validation Issues Alert Box */}
                      {q.validationIssues.length > 0 && (
                        <div
                          style={{
                            ...styles.validationBox,
                            backgroundColor: hasErrors
                              ? "rgba(239, 68, 68, 0.1)"
                              : "rgba(245, 158, 11, 0.1)",
                            borderColor: hasErrors
                              ? "rgba(239, 68, 68, 0.3)"
                              : "rgba(245, 158, 11, 0.3)",
                          }}
                        >
                          <div style={styles.validationTitle}>
                            <AlertTriangle
                              size={14}
                              color={hasErrors ? "#EF4444" : "#F59E0B"}
                            />
                            <span>
                              검증 발견 사항 ({q.validationIssues.length}건):
                            </span>
                          </div>
                          <ul style={styles.validationList}>
                            {q.validationIssues.map((issue, idx) => (
                              <li key={idx} style={styles.validationItem}>
                                <strong
                                  style={{
                                    color:
                                      issue.severity === "ERROR"
                                        ? "#EF4444"
                                        : "#F59E0B",
                                  }}
                                >
                                  [{issue.severity}]
                                </strong>{" "}
                                <span>{issue.message}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Question Content Body */}
                      <div style={styles.qBody}>
                        <p style={styles.qText}>{q.questionText}</p>

                        {q.codeSnippet && (
                          <div style={styles.codeSnippetBox}>
                            <div style={styles.codeHeader}>
                              <Code2 size={13} color="#94A3B8" />
                              <span>{q.language || "CODE"}</span>
                            </div>
                            <pre style={styles.codePre}>
                              <code>{q.codeSnippet}</code>
                            </pre>
                          </div>
                        )}

                        {/* Ground Truth & Official Explanation */}
                        <div style={styles.groundTruthBox}>
                          <div style={styles.gtRow}>
                            <span style={styles.gtLabel}>
                              Ground Truth 정답:
                            </span>
                            <span style={styles.gtAnswer}>
                              {Array.isArray(q.groundTruthAnswer)
                                ? q.groundTruthAnswer.join(", ")
                                : q.groundTruthAnswer || "(정답 미지정)"}
                            </span>
                          </div>
                          {q.officialExplanation && (
                            <div style={styles.explanationRow}>
                              <span style={styles.explanationLabel}>
                                공식 해설:
                              </span>
                              <span style={styles.explanationText}>
                                {q.officialExplanation}
                              </span>
                            </div>
                          )}
                          {q.keywords && q.keywords.length > 0 && (
                            <div style={styles.keywordRow}>
                              <span style={styles.keywordLabel}>키워드:</span>
                              <div style={styles.keywordList}>
                                {q.keywords.map((kw, i) => (
                                  <span key={i} style={styles.kwBadge}>
                                    {kw}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Reviewer Action Bar per Item */}
                      <div style={styles.qActionRow}>
                        <button
                          type="button"
                          onClick={() => openEditQuestion(q)}
                          style={styles.editBtn}
                        >
                          <Edit3 size={14} />
                          <span>문항 수정 (Edit)</span>
                        </button>

                        <div style={styles.decisionBtns}>
                          {q.reviewStatus !== "COMMITTED" && (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  handleSetStatus(q.id, "APPROVED")
                                }
                                style={{
                                  ...styles.actionDecisionBtn,
                                  ...(q.reviewStatus === "APPROVED"
                                    ? styles.actionBtnActiveApprove
                                    : {}),
                                }}
                              >
                                <CheckCircle2 size={14} color="#10B981" />
                                <span>승인 (Approve)</span>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleSetStatus(q.id, "REJECTED")
                                }
                                style={{
                                  ...styles.actionDecisionBtn,
                                  ...(q.reviewStatus === "REJECTED"
                                    ? styles.actionBtnActiveReject
                                    : {}),
                                }}
                              >
                                <XCircle size={14} color="#EF4444" />
                                <span>반려 (Reject)</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSetStatus(q.id, "PENDING")}
                                style={{
                                  ...styles.actionDecisionBtn,
                                  ...(q.reviewStatus === "PENDING"
                                    ? styles.actionBtnActivePending
                                    : {}),
                                }}
                              >
                                <span>대기 (Pending)</span>
                              </button>
                            </>
                          )}
                          {q.reviewStatus === "COMMITTED" && (
                            <span style={styles.committedNotice}>
                              <CheckCircle2 size={14} color="#3B82F6" />
                              <span>
                                Live DB 적재 완료 ({q.committedQuestionId})
                              </span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Edit Modal (Inline Drawer/Modal for fine-tuning question data) */}
        {editingQuestion && (
          <div style={styles.editModalOverlay}>
            <div style={styles.editModalContent}>
              <div style={styles.editModalHeader}>
                <div style={styles.titleRow}>
                  <Edit3 size={18} color="#3B82F6" />
                  <h3 style={styles.editModalTitle}>
                    문항 세부 검수 & 수정 (#{editingQuestion.indexInBatch})
                  </h3>
                </div>
                <button
                  onClick={() => setEditingQuestion(null)}
                  style={styles.closeBtn}
                >
                  <X size={18} />
                </button>
              </div>

              <div style={styles.editModalBody}>
                {/* Subject & Category */}
                <div style={styles.editRow2}>
                  <div style={styles.formField}>
                    <label style={styles.label}>과목</label>
                    <select
                      value={editFormData.subject || ""}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          subject: e.target.value as Subject,
                        })
                      }
                      style={styles.selectInput}
                    >
                      {SUBJECT_LIST.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={styles.formField}>
                    <label style={styles.label}>카테고리</label>
                    <input
                      type="text"
                      value={editFormData.category || ""}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          category: e.target.value,
                        })
                      }
                      style={styles.textInput}
                    />
                  </div>
                  <div style={styles.formField}>
                    <label style={styles.label}>개념 ID (conceptId)</label>
                    <input
                      type="text"
                      value={editFormData.conceptId || ""}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          conceptId: e.target.value,
                        })
                      }
                      placeholder="예: concept_c_pointer"
                      style={styles.textInput}
                    />
                  </div>
                </div>

                {/* Exam Meta */}
                <div style={styles.editRow3}>
                  <div style={styles.formField}>
                    <label style={styles.label}>기출 연도</label>
                    <input
                      type="number"
                      value={editFormData.examYear ?? ""}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          examYear: e.target.value
                            ? Number(e.target.value)
                            : undefined,
                        })
                      }
                      placeholder="예: 2024"
                      style={styles.textInput}
                    />
                  </div>
                  <div style={styles.formField}>
                    <label style={styles.label}>회차</label>
                    <input
                      type="number"
                      value={editFormData.examRound ?? ""}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          examRound: e.target.value
                            ? Number(e.target.value)
                            : undefined,
                        })
                      }
                      placeholder="예: 1"
                      style={styles.textInput}
                    />
                  </div>
                  <div style={styles.formField}>
                    <label style={styles.label}>문항 번호</label>
                    <input
                      type="number"
                      value={editFormData.questionNumber ?? ""}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          questionNumber: e.target.value
                            ? Number(e.target.value)
                            : undefined,
                        })
                      }
                      placeholder="예: 3"
                      style={styles.textInput}
                    />
                  </div>
                </div>

                {/* Question Text */}
                <div style={styles.formField}>
                  <label style={styles.label}>문제 지문 (Question Text)</label>
                  <textarea
                    value={editFormData.questionText || ""}
                    onChange={(e) =>
                      setEditFormData({
                        ...editFormData,
                        questionText: e.target.value,
                      })
                    }
                    style={styles.textarea}
                    rows={3}
                  />
                </div>

                {/* Code Snippet & Language */}
                <div style={styles.formField}>
                  <div style={styles.codeLabelRow}>
                    <label style={styles.label}>코드 스니펫 (선택)</label>
                    <select
                      value={editFormData.language || ""}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          language: e.target.value as any,
                        })
                      }
                      style={styles.codeLangSelect}
                    >
                      <option value="">언어 선택</option>
                      <option value="C">C</option>
                      <option value="JAVA">Java</option>
                      <option value="PYTHON">Python</option>
                      <option value="SQL">SQL</option>
                    </select>
                  </div>
                  <textarea
                    value={editFormData.codeSnippet || ""}
                    onChange={(e) =>
                      setEditFormData({
                        ...editFormData,
                        codeSnippet: e.target.value,
                      })
                    }
                    style={styles.codeTextarea}
                    rows={4}
                    placeholder="int main() { ... }"
                  />
                </div>

                {/* Ground Truth Answer */}
                <div style={styles.formField}>
                  <label style={styles.label}>
                    Ground Truth 정답 (복수 키워드는 쉼표로 구분)
                  </label>
                  <input
                    type="text"
                    value={
                      Array.isArray(editFormData.groundTruthAnswer)
                        ? editFormData.groundTruthAnswer.join(", ")
                        : editFormData.groundTruthAnswer || ""
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val.includes(",")) {
                        setEditFormData({
                          ...editFormData,
                          groundTruthAnswer: val
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        });
                      } else {
                        setEditFormData({
                          ...editFormData,
                          groundTruthAnswer: val,
                        });
                      }
                    }}
                    style={styles.textInput}
                  />
                </div>

                {/* Official Explanation */}
                <div style={styles.formField}>
                  <label style={styles.label}>
                    공식 해설 (Official Explanation)
                  </label>
                  <textarea
                    value={editFormData.officialExplanation || ""}
                    onChange={(e) =>
                      setEditFormData({
                        ...editFormData,
                        officialExplanation: e.target.value,
                      })
                    }
                    style={styles.textarea}
                    rows={2}
                  />
                </div>

                {/* Keywords */}
                <div style={styles.formField}>
                  <label style={styles.label}>키워드 (쉼표 구분)</label>
                  <input
                    type="text"
                    value={(editFormData.keywords || []).join(", ")}
                    onChange={(e) =>
                      setEditFormData({
                        ...editFormData,
                        keywords: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    style={styles.textInput}
                  />
                </div>
              </div>

              {/* Edit Modal Footer */}
              <div style={styles.editModalFooter}>
                <button
                  type="button"
                  onClick={() => setEditingQuestion(null)}
                  style={styles.secondaryBtn}
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={isSavingEdit}
                  style={styles.primaryBtn}
                >
                  <Save size={15} />
                  <span>
                    {isSavingEdit ? "저장 중..." : "수정 사항 저장 & 재검증"}
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

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    backdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    padding: "24px",
  },
  modal: {
    backgroundColor: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: "16px",
    width: "100%",
    maxWidth: "1080px",
    maxHeight: "92vh",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
  },
  header: {
    padding: "20px 24px",
    borderBottom: "1px solid var(--color-border)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(15, 23, 42, 0.4)",
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
  },
  headerIconBox: {
    width: "42px",
    height: "42px",
    borderRadius: "10px",
    backgroundColor: "rgba(59, 130, 246, 0.15)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  title: {
    fontSize: "18px",
    fontWeight: "700",
    color: "var(--color-text)",
    margin: 0,
  },
  phaseBadge: {
    fontSize: "11px",
    fontWeight: "700",
    padding: "2px 8px",
    borderRadius: "12px",
    backgroundColor: "rgba(59, 130, 246, 0.2)",
    color: "#60A5FA",
  },
  subtitle: {
    fontSize: "12px",
    color: "var(--color-text-muted)",
    marginTop: "3px",
    margin: 0,
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "var(--color-text-muted)",
    cursor: "pointer",
    padding: "6px",
    borderRadius: "8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  policyNotice: {
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    borderBottom: "1px solid rgba(16, 185, 129, 0.2)",
    padding: "10px 24px",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    fontSize: "13px",
    color: "#A7F3D0",
  },
  tabBar: {
    display: "flex",
    borderBottom: "1px solid var(--color-border)",
    backgroundColor: "rgba(30, 41, 59, 0.5)",
    padding: "0 24px",
    gap: "8px",
  },
  tabBtn: {
    background: "none",
    border: "none",
    borderBottom: "2px solid transparent",
    color: "var(--color-text-muted)",
    padding: "14px 16px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    transition: "all 0.2s",
  },
  tabBtnActive: {
    color: "#3B82F6",
    borderBottomColor: "#3B82F6",
  },
  tabBody: {
    flex: 1,
    overflowY: "auto",
    padding: "24px",
  },
  importFormGrid: {
    display: "flex",
    flexDirection: "column",
    gap: "18px",
  },
  formRow: {
    display: "grid",
    gridTemplateColumns: "1.2fr 1fr 1.2fr",
    gap: "16px",
  },
  formField: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  label: {
    fontSize: "13px",
    fontWeight: "600",
    color: "var(--color-text-muted)",
  },
  pillRow: {
    display: "flex",
    gap: "8px",
  },
  pillBtn: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    padding: "8px 12px",
    borderRadius: "8px",
    border: "1px solid var(--color-border)",
    backgroundColor: "var(--color-bg)",
    color: "var(--color-text-muted)",
    fontSize: "13px",
    cursor: "pointer",
  },
  pillBtnActive: {
    backgroundColor: "rgba(59, 130, 246, 0.15)",
    borderColor: "#3B82F6",
    color: "#60A5FA",
    fontWeight: "600",
  },
  selectInput: {
    backgroundColor: "var(--color-bg)",
    border: "1px solid var(--color-border)",
    borderRadius: "8px",
    padding: "9px 12px",
    color: "var(--color-text)",
    fontSize: "13px",
    outline: "none",
  },
  textInput: {
    backgroundColor: "var(--color-bg)",
    border: "1px solid var(--color-border)",
    borderRadius: "8px",
    padding: "9px 12px",
    color: "var(--color-text)",
    fontSize: "13px",
    outline: "none",
  },
  sampleRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    fontSize: "13px",
  },
  sampleLabel: {
    color: "var(--color-text-muted)",
  },
  sampleBtn: {
    background: "none",
    border: "1px dashed var(--color-border)",
    borderRadius: "6px",
    padding: "4px 10px",
    color: "#60A5FA",
    fontSize: "12px",
    cursor: "pointer",
  },
  editorBox: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  textarea: {
    backgroundColor: "var(--color-bg)",
    border: "1px solid var(--color-border)",
    borderRadius: "8px",
    padding: "12px",
    color: "var(--color-text)",
    fontSize: "13px",
    fontFamily: "monospace",
    lineHeight: "1.5",
    outline: "none",
    resize: "vertical",
  },
  errorAlert: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "12px 16px",
    borderRadius: "8px",
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    border: "1px solid rgba(239, 68, 68, 0.3)",
    color: "#FCA5A5",
    fontSize: "13px",
  },
  successAlert: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "12px 16px",
    borderRadius: "8px",
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    border: "1px solid rgba(16, 185, 129, 0.3)",
    color: "#6EE7B7",
    fontSize: "13px",
    marginBottom: "16px",
  },
  actionRow: {
    display: "flex",
    justifyContent: "flex-end",
    marginTop: "6px",
  },
  primaryBtn: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    backgroundColor: "#3B82F6",
    color: "#FFFFFF",
    border: "none",
    borderRadius: "8px",
    padding: "10px 18px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "background-color 0.2s",
  },
  secondaryBtn: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    border: "1px solid var(--color-border)",
    borderRadius: "8px",
    padding: "8px 14px",
    fontSize: "13px",
    fontWeight: "500",
    color: "var(--color-text)",
    cursor: "pointer",
  },
  commitBtn: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    backgroundColor: "#10B981",
    color: "#FFFFFF",
    border: "none",
    borderRadius: "8px",
    padding: "8px 16px",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
  },
  dangerBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    border: "1px solid rgba(239, 68, 68, 0.3)",
    borderRadius: "8px",
    padding: "8px",
    color: "#EF4444",
    cursor: "pointer",
  },
  batchSelectorBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    marginBottom: "16px",
    flexWrap: "wrap",
  },
  batchSelectWrapper: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flex: 1,
    minWidth: "280px",
  },
  batchSelectLabel: {
    fontSize: "13px",
    fontWeight: "600",
    color: "var(--color-text-muted)",
    whiteSpace: "nowrap",
  },
  batchSelect: {
    flex: 1,
    backgroundColor: "var(--color-bg)",
    border: "1px solid var(--color-border)",
    borderRadius: "8px",
    padding: "8px 12px",
    color: "var(--color-text)",
    fontSize: "13px",
    outline: "none",
  },
  iconBtn: {
    background: "none",
    border: "1px solid var(--color-border)",
    borderRadius: "8px",
    padding: "8px",
    color: "var(--color-text-muted)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  batchActions: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  batchSummaryRow: {
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    gap: "12px",
    backgroundColor: "rgba(30, 41, 59, 0.4)",
    border: "1px solid var(--color-border)",
    borderRadius: "10px",
    padding: "12px 16px",
    marginBottom: "20px",
  },
  summaryItem: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  summaryLabel: {
    fontSize: "11px",
    color: "var(--color-text-muted)",
    marginBottom: "4px",
  },
  summaryVal: {
    fontSize: "16px",
    fontWeight: "700",
    color: "var(--color-text)",
  },
  centerBox: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "48px",
    color: "var(--color-text-muted)",
  },
  emptyBox: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "48px",
    color: "var(--color-text-muted)",
    gap: "12px",
  },
  questionList: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  questionCard: {
    backgroundColor: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: "12px",
    padding: "18px 20px",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  qCardHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap",
  },
  qHeaderLeft: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  qIndexBadge: {
    fontSize: "12px",
    fontWeight: "700",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    color: "var(--color-text)",
    padding: "2px 8px",
    borderRadius: "6px",
  },
  qSubjectBadge: {
    fontSize: "12px",
    fontWeight: "600",
    color: "#3B82F6",
    backgroundColor: "rgba(59, 130, 246, 0.15)",
    padding: "2px 8px",
    borderRadius: "6px",
  },
  qCategoryText: {
    fontSize: "12px",
    color: "var(--color-text-muted)",
  },
  qExamBadge: {
    fontSize: "11px",
    color: "#94A3B8",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    padding: "2px 6px",
    borderRadius: "4px",
  },
  qHeaderRight: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  badgeNew: {
    fontSize: "11px",
    fontWeight: "700",
    color: "#10B981",
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    padding: "2px 8px",
    borderRadius: "6px",
  },
  badgeDupWarning: {
    fontSize: "11px",
    fontWeight: "700",
    color: "#F59E0B",
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    padding: "2px 8px",
    borderRadius: "6px",
  },
  badgeVariation: {
    fontSize: "11px",
    fontWeight: "700",
    color: "#A855F7",
    backgroundColor: "rgba(168, 85, 247, 0.15)",
    padding: "2px 8px",
    borderRadius: "6px",
  },
  statusBadge: {
    fontSize: "11px",
    fontWeight: "700",
    padding: "2px 8px",
    borderRadius: "6px",
  },
  statusBadgePending: {
    color: "#F59E0B",
    backgroundColor: "rgba(245, 158, 11, 0.2)",
  },
  statusBadgeApproved: {
    color: "#10B981",
    backgroundColor: "rgba(16, 185, 129, 0.2)",
  },
  statusBadgeRejected: {
    color: "#EF4444",
    backgroundColor: "rgba(239, 68, 68, 0.2)",
  },
  statusBadgeCommitted: {
    color: "#3B82F6",
    backgroundColor: "rgba(59, 130, 246, 0.2)",
  },
  validationBox: {
    border: "1px solid",
    borderRadius: "8px",
    padding: "10px 14px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  validationTitle: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "12px",
    fontWeight: "600",
  },
  validationList: {
    margin: 0,
    paddingLeft: "18px",
    fontSize: "12px",
    lineHeight: "1.5",
  },
  validationItem: {
    marginBottom: "2px",
  },
  qBody: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  qText: {
    fontSize: "14px",
    lineHeight: "1.6",
    color: "var(--color-text)",
    margin: 0,
    whiteSpace: "pre-wrap",
  },
  codeSnippetBox: {
    backgroundColor: "var(--color-bg)",
    border: "1px solid var(--color-border)",
    borderRadius: "8px",
    overflow: "hidden",
  },
  codeHeader: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "6px 12px",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderBottom: "1px solid var(--color-border)",
    fontSize: "11px",
    fontWeight: "600",
    color: "#94A3B8",
  },
  codePre: {
    margin: 0,
    padding: "12px",
    fontSize: "13px",
    fontFamily: "monospace",
    overflowX: "auto",
    lineHeight: "1.45",
  },
  groundTruthBox: {
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    border: "1px solid rgba(255, 255, 255, 0.05)",
    borderRadius: "8px",
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  gtRow: {
    display: "flex",
    alignItems: "baseline",
    gap: "10px",
  },
  gtLabel: {
    fontSize: "12px",
    fontWeight: "700",
    color: "#10B981",
    whiteSpace: "nowrap",
  },
  gtAnswer: {
    fontSize: "14px",
    fontWeight: "700",
    color: "var(--color-text)",
  },
  explanationRow: {
    display: "flex",
    alignItems: "baseline",
    gap: "10px",
  },
  explanationLabel: {
    fontSize: "12px",
    fontWeight: "600",
    color: "var(--color-text-muted)",
    whiteSpace: "nowrap",
  },
  explanationText: {
    fontSize: "13px",
    color: "#CBD5E1",
    lineHeight: "1.5",
  },
  keywordRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    marginTop: "2px",
  },
  keywordLabel: {
    fontSize: "11px",
    color: "var(--color-text-muted)",
  },
  keywordList: {
    display: "flex",
    gap: "6px",
    flexWrap: "wrap",
  },
  kwBadge: {
    fontSize: "11px",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    color: "#94A3B8",
    padding: "2px 6px",
    borderRadius: "4px",
  },
  qActionRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderTop: "1px solid var(--color-border)",
    paddingTop: "12px",
    marginTop: "4px",
    flexWrap: "wrap",
    gap: "10px",
  },
  editBtn: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    background: "none",
    border: "1px solid var(--color-border)",
    borderRadius: "6px",
    padding: "6px 12px",
    fontSize: "12px",
    color: "var(--color-text)",
    cursor: "pointer",
  },
  decisionBtns: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  actionDecisionBtn: {
    display: "flex",
    alignItems: "center",
    gap: "5px",
    background: "none",
    border: "1px solid var(--color-border)",
    borderRadius: "6px",
    padding: "6px 10px",
    fontSize: "12px",
    color: "var(--color-text-muted)",
    cursor: "pointer",
  },
  actionBtnActiveApprove: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    borderColor: "#10B981",
    color: "#10B981",
    fontWeight: "600",
  },
  actionBtnActiveReject: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    borderColor: "#EF4444",
    color: "#EF4444",
    fontWeight: "600",
  },
  actionBtnActivePending: {
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    borderColor: "#F59E0B",
    color: "#F59E0B",
    fontWeight: "600",
  },
  committedNotice: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "12px",
    fontWeight: "600",
    color: "#60A5FA",
  },
  // Edit Modal Overlay
  editModalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10000,
    padding: "24px",
  },
  editModalContent: {
    backgroundColor: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: "14px",
    width: "100%",
    maxWidth: "720px",
    maxHeight: "90vh",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 20px 40px rgba(0, 0, 0, 0.6)",
  },
  editModalHeader: {
    padding: "16px 20px",
    borderBottom: "1px solid var(--color-border)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  editModalTitle: {
    fontSize: "16px",
    fontWeight: "700",
    margin: 0,
    color: "var(--color-text)",
  },
  editModalBody: {
    flex: 1,
    overflowY: "auto",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  editRow2: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "12px",
  },
  editRow3: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: "12px",
  },
  codeLabelRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  codeLangSelect: {
    backgroundColor: "var(--color-bg)",
    border: "1px solid var(--color-border)",
    borderRadius: "6px",
    padding: "4px 8px",
    color: "var(--color-text)",
    fontSize: "12px",
    outline: "none",
  },
  codeTextarea: {
    backgroundColor: "var(--color-bg)",
    border: "1px solid var(--color-border)",
    borderRadius: "8px",
    padding: "10px",
    color: "var(--color-text)",
    fontSize: "12px",
    fontFamily: "monospace",
    lineHeight: "1.4",
    outline: "none",
    resize: "vertical",
  },
  editModalFooter: {
    padding: "14px 20px",
    borderTop: "1px solid var(--color-border)",
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px",
  },
};
