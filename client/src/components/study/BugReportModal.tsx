import React, { useState, useEffect } from "react";
import {
  X,
  Bug,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Send,
  FileText,
} from "lucide-react";
import {
  Question,
  BugReportCategory,
  BUG_REPORT_CATEGORIES,
  BUG_REPORT_CATEGORY_LABELS,
  BugReportQuestionContext,
} from "@jungcheogi/shared";
import { submitBugReport } from "../../api/bugReport";

interface BugReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  question: Question | null;
  sessionId?: string;
  defaultCategory?: BugReportCategory;
}

export const BugReportModal: React.FC<BugReportModalProps> = ({
  isOpen,
  onClose,
  question,
  sessionId,
  defaultCategory = "ANSWER_OR_EXPLANATION",
}) => {
  const [category, setCategory] = useState<BugReportCategory>(defaultCategory);
  const [description, setDescription] = useState("");
  const [expectedBehavior, setExpectedBehavior] = useState("");
  const [actualBehavior, setActualBehavior] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successReportId, setSuccessReportId] = useState<string | null>(null);

  // 모달 열릴 때 상태 초기화
  useEffect(() => {
    if (isOpen) {
      setCategory(defaultCategory);
      setDescription("");
      setExpectedBehavior("");
      setActualBehavior("");
      setError(null);
      setSuccessReportId(null);
      setIsSubmitting(false);
    }
  }, [isOpen, defaultCategory]);

  // ESC 키로 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    const questionContext: BugReportQuestionContext = {
      questionId: question?.id,
      questionCode: question?.questionCode,
      sourceType: question?.sourceType,
      studyVisibility: question?.studyVisibility,
      questionType: question?.type,
      language: question?.language,
      subject: question?.subject,
      category: question?.category,
      conceptId: question?.conceptId,
      parentQuestionId: question?.parentQuestionId,
      provenance: (question as any)?.provenance,
      codeSnippet: question?.code,
      sessionId,
      clientTimestamp: new Date().toISOString(),
      appRoute: typeof window !== "undefined" ? window.location.pathname : undefined,
    };

    const res = await submitBugReport({
      category,
      description: description.trim(),
      expectedBehavior: expectedBehavior.trim() || undefined,
      actualBehavior: actualBehavior.trim() || undefined,
      questionContext,
    });

    setIsSubmitting(false);

    if (res.data && res.data.success) {
      setSuccessReportId(res.data.bugReportId);
      // 1.5초 후 자동으로 모달 닫기 (학습 상태는 100% 보존됨)
      setTimeout(() => {
        onClose();
      }, 1500);
    } else {
      setError(res.error || "신고 접수 중 오류가 발생했습니다.");
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerTitleWrap}>
            <div style={styles.iconBox}>
              <Bug size={18} color="#EF4444" />
            </div>
            <div>
              <h3 style={styles.title}>문제 신고 및 버그 제보</h3>
              <p style={styles.subtitle}>
                학습 중 발견한 오류를 빠르게 남겨주시면 집에서 확인 후 바로 수정합니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            style={styles.closeBtn}
            title="닫기 (ESC)"
          >
            <X size={18} color="#94A3B8" />
          </button>
        </div>

        {/* Content Body */}
        {successReportId ? (
          <div style={styles.successBox}>
            <CheckCircle2 size={42} color="#10B981" style={{ marginBottom: "12px" }} />
            <h4 style={styles.successTitle}>문제 신고가 정상 접수되었습니다</h4>
            <p style={styles.successDesc}>
              접수 번호: <code style={styles.codeBadge}>{successReportId}</code>
            </p>
            <p style={styles.successSub}>
              잠시 후 창이 닫히며, 기존 문제 풀이 상태는 그대로 유지됩니다.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={styles.body}>
            {/* 1. 자동 첨부 문제 정보 안내 바 */}
            <div style={styles.autoContextCard}>
              <div style={styles.contextHeader}>
                <FileText size={14} color="#38BDF8" />
                <span>현재 문제 식별 정보 (자동 첨부)</span>
              </div>
              <div style={styles.contextGrid}>
                <div>
                  <span style={styles.contextLabel}>문제 코드: </span>
                  <strong style={styles.contextValue}>
                    {question?.questionCode || question?.id || "N/A"}
                  </strong>
                </div>
                <div>
                  <span style={styles.contextLabel}>출처: </span>
                  <span style={styles.contextValue}>{question?.sourceType || "N/A"}</span>
                </div>
                <div>
                  <span style={styles.contextLabel}>과목/분류: </span>
                  <span style={styles.contextValue}>
                    {question?.subject || question?.category || "N/A"}
                  </span>
                </div>
                {question?.language && (
                  <div>
                    <span style={styles.contextLabel}>언어: </span>
                    <span style={styles.contextLangBadge}>{question.language}</span>
                  </div>
                )}
                {question?.parentQuestionId && (
                  <div>
                    <span style={styles.contextLabel}>원본 부모: </span>
                    <span style={styles.contextValue}>{question.parentQuestionId}</span>
                  </div>
                )}
              </div>
            </div>

            {/* 2. 신고 유형 선택 */}
            <div style={styles.formGroup}>
              <label style={styles.label}>신고 유형</label>
              <div style={styles.categoryWrap}>
                {BUG_REPORT_CATEGORIES.map((cat) => {
                  const isSelected = category === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategory(cat)}
                      style={{
                        ...styles.categoryBtn,
                        backgroundColor: isSelected
                          ? "rgba(56, 189, 248, 0.15)"
                          : "#1E293B",
                        borderColor: isSelected ? "#38BDF8" : "#334155",
                        color: isSelected ? "#38BDF8" : "#CBD5E1",
                        fontWeight: isSelected ? 600 : 400,
                      }}
                    >
                      <span>{isSelected ? "●" : "○"}</span>
                      <span>{BUG_REPORT_CATEGORY_LABELS[cat]}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. 오류 내용 (필수) */}
            <div style={styles.formGroup}>
              <label style={styles.label}>
                오류 내용 <span style={styles.requiredAsterisk}>*</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="어떤 문제나 어색한 부분이 있었나요? (예: 조건문 실행 결과가 해설과 다름, 특정 줄 설명 오류 등)"
                rows={4}
                required
                disabled={isSubmitting}
                style={styles.textarea}
              />
            </div>

            {/* 4. 예상한 동작 vs 실제 동작 (선택) */}
            <div style={styles.twoColRow}>
              <div style={styles.formGroup}>
                <label style={styles.labelSub}>예상한 동작 (선택)</label>
                <input
                  type="text"
                  value={expectedBehavior}
                  onChange={(e) => setExpectedBehavior(e.target.value)}
                  placeholder="예: 정답이 5로 채점되어야 함"
                  disabled={isSubmitting}
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.labelSub}>실제 동작 (선택)</label>
                <input
                  type="text"
                  value={actualBehavior}
                  onChange={(e) => setActualBehavior(e.target.value)}
                  placeholder="예: 오답 처리되고 6으로 표시됨"
                  disabled={isSubmitting}
                  style={styles.input}
                />
              </div>
            </div>

            {error && (
              <div style={styles.errorBox}>
                <AlertCircle size={15} color="#EF4444" />
                <span>{error}</span>
              </div>
            )}

            {/* Footer Buttons */}
            <div style={styles.footer}>
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                style={styles.cancelBtn}
              >
                취소
              </button>
              <button
                type="submit"
                disabled={!description.trim() || isSubmitting}
                style={{
                  ...styles.submitBtn,
                  opacity: !description.trim() || isSubmitting ? 0.6 : 1,
                  cursor: !description.trim() || isSubmitting ? "not-allowed" : "pointer",
                }}
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw size={15} className="spin" color="#FFFFFF" />
                    <span>접수 중...</span>
                  </>
                ) : (
                  <>
                    <Send size={15} color="#FFFFFF" />
                    <span>신고 제출하기</span>
                  </>
                )}
              </button>
            </div>
          </form>
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
    backdropFilter: "blur(3px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    padding: "16px",
  },
  modal: {
    backgroundColor: "#0F172A",
    border: "1px solid #334155",
    borderRadius: "14px",
    width: "100%",
    maxWidth: "560px",
    maxHeight: "90vh",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.6)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 20px",
    borderBottom: "1px solid #1E293B",
    backgroundColor: "#131C2E",
  },
  headerTitleWrap: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  iconBox: {
    width: "34px",
    height: "34px",
    borderRadius: "8px",
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    margin: 0,
    fontSize: "15px",
    fontWeight: 700,
    color: "#F8FAFC",
  },
  subtitle: {
    margin: "2px 0 0 0",
    fontSize: "12px",
    color: "#94A3B8",
  },
  closeBtn: {
    background: "transparent",
    border: "none",
    padding: "6px",
    borderRadius: "6px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    padding: "18px 20px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  autoContextCard: {
    backgroundColor: "#131C2E",
    border: "1px solid #1E293B",
    borderRadius: "8px",
    padding: "10px 14px",
  },
  contextHeader: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "12px",
    fontWeight: 600,
    color: "#38BDF8",
    marginBottom: "6px",
  },
  contextGrid: {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
    fontSize: "12px",
  },
  contextLabel: {
    color: "#64748B",
  },
  contextValue: {
    color: "#E2E8F0",
  },
  contextLangBadge: {
    fontSize: "11px",
    color: "#F59E0B",
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    padding: "1px 6px",
    borderRadius: "4px",
    fontWeight: 600,
  },
  formGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    flex: 1,
  },
  label: {
    fontSize: "13px",
    fontWeight: 600,
    color: "#E2E8F0",
  },
  labelSub: {
    fontSize: "12px",
    fontWeight: 500,
    color: "#94A3B8",
  },
  requiredAsterisk: {
    color: "#EF4444",
  },
  categoryWrap: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "6px",
  },
  categoryBtn: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "7px 10px",
    borderRadius: "6px",
    border: "1px solid",
    fontSize: "12px",
    cursor: "pointer",
    textAlign: "left",
    transition: "all 0.15s ease",
  },
  textarea: {
    backgroundColor: "#0B101E",
    border: "1px solid #334155",
    borderRadius: "8px",
    padding: "10px 12px",
    color: "#F8FAFC",
    fontSize: "13px",
    lineHeight: "1.5",
    resize: "vertical",
    outline: "none",
    fontFamily: "inherit",
  },
  twoColRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "10px",
  },
  input: {
    backgroundColor: "#0B101E",
    border: "1px solid #334155",
    borderRadius: "8px",
    padding: "8px 10px",
    color: "#F8FAFC",
    fontSize: "12px",
    outline: "none",
    fontFamily: "inherit",
  },
  errorBox: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    border: "1px solid rgba(239, 68, 68, 0.3)",
    padding: "8px 12px",
    borderRadius: "6px",
    color: "#F87171",
    fontSize: "12px",
  },
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: "8px",
    marginTop: "6px",
  },
  cancelBtn: {
    padding: "8px 16px",
    borderRadius: "8px",
    border: "1px solid #334155",
    backgroundColor: "transparent",
    color: "#94A3B8",
    fontSize: "13px",
    cursor: "pointer",
  },
  submitBtn: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "8px 18px",
    borderRadius: "8px",
    border: "none",
    backgroundColor: "#EF4444",
    color: "#FFFFFF",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    transition: "background-color 0.15s ease",
  },
  successBox: {
    padding: "40px 20px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
  },
  successTitle: {
    margin: 0,
    fontSize: "16px",
    fontWeight: 700,
    color: "#F8FAFC",
  },
  successDesc: {
    margin: "8px 0 0 0",
    fontSize: "13px",
    color: "#94A3B8",
  },
  codeBadge: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    color: "#10B981",
    padding: "2px 6px",
    borderRadius: "4px",
    fontWeight: 600,
  },
  successSub: {
    margin: "12px 0 0 0",
    fontSize: "12px",
    color: "#64748B",
  },
};
