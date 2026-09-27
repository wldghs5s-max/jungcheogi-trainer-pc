import React, { useState, useEffect } from "react";
import {
  X,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Database,
  Cpu,
} from "lucide-react";
import { apiFetch } from "../../api/http";
import { AIBatchGenerateResponse, LearningDomainsResponse } from "@jungcheogi/shared";

interface GenerateQuestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenReviewStaging: (batchId?: string) => void;
}

export const GenerateQuestionModal: React.FC<GenerateQuestionModalProps> = ({
  isOpen,
  onClose,
  onOpenReviewStaging,
}) => {
  const [mode, setMode] = useState<"RANDOM" | "DOMAIN">("RANDOM");
  const [domain, setDomain] = useState<string>("C");
  const [count, setCount] = useState<number>(5);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AIBatchGenerateResponse | null>(null);
  const [domains, setDomains] = useState<LearningDomainsResponse | null>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setResult(null);
      // Fetch available domains from DB
      apiFetch("/api/ai/learning-domains")
        .then((res) => (res.ok ? res.json() : null))
        .then((data: LearningDomainsResponse | null) => {
          if (data) {
            setDomains(data);
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    setResult(null);

    try {
      const res = await apiFetch("/api/ai/batch-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          domain: mode === "DOMAIN" ? domain : undefined,
          count,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "문제 생성 중 오류가 발생했습니다.");
      } else {
        setResult(data as AIBatchGenerateResponse);
      }
    } catch (err: any) {
      setError(err?.message || "네트워크 오류가 발생했습니다.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={styles.iconBox}>
              <Sparkles size={20} color="#C084FC" />
            </div>
            <div>
              <h3 style={styles.title}>AI 문제 생성</h3>
              <p style={styles.subtitle}>
                기출 핵심 개념을 기반으로 실전형 문제를 생성하여 검수 대기열(Staging)에 등록합니다.
              </p>
            </div>
          </div>
          <button onClick={onClose} style={styles.closeBtn} title="닫기">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={styles.body}>
          {result ? (
            /* Result State */
            <div style={styles.resultBox}>
              <div style={styles.resultIconBox}>
                <CheckCircle2 size={48} color="#10B981" />
              </div>
              <h4 style={styles.resultTitle}>문제 생성 완료!</h4>
              <p style={styles.resultDesc}>
                <strong>{result.count}개</strong>의 새로운 문제가 생성되어 검수 대기열(Staging)에 안전하게 등록되었습니다.
              </p>
              <div style={styles.resultInfoBadge}>
                <Database size={15} color="#60A5FA" />
                <span>배치 ID: {result.batchId}</span>
              </div>
              <p style={styles.resultNotice}>
                생성된 문제는 검수 화면에서 정답과 해설, 코드 실행 무결성을 확인하고 승인(APPROVED)한 뒤 실전 학습 DB에 반영할 수 있습니다.
              </p>

              <div style={styles.resultActions}>
                <button
                  onClick={() => onOpenReviewStaging(result.batchId)}
                  style={styles.primaryBtn}
                >
                  <span>검수 대기열로 이동</span>
                  <ArrowRight size={16} />
                </button>
                <button
                  onClick={() => {
                    setResult(null);
                    setError(null);
                  }}
                  style={styles.secondaryBtn}
                >
                  <RefreshCw size={15} />
                  <span>계속 생성하기</span>
                </button>
              </div>
            </div>
          ) : (
            /* Form State */
            <div style={styles.form}>
              {/* Generation Mode */}
              <div style={styles.formGroup}>
                <label style={styles.label}>생성 방식</label>
                <div style={styles.modeButtonGroup}>
                  <button
                    type="button"
                    onClick={() => setMode("RANDOM")}
                    style={{
                      ...styles.modeButton,
                      borderColor: mode === "RANDOM" ? "#3B82F6" : "var(--color-border)",
                      backgroundColor:
                        mode === "RANDOM" ? "rgba(59, 130, 246, 0.15)" : "transparent",
                      color: mode === "RANDOM" ? "#60A5FA" : "var(--color-text-muted)",
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>랜덤 문제</div>
                    <div style={{ fontSize: "11px", marginTop: "2px", opacity: 0.8 }}>
                      전체 영역 기출에서 균형 있게 선별 생성
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMode("DOMAIN")}
                    style={{
                      ...styles.modeButton,
                      borderColor: mode === "DOMAIN" ? "#A855F7" : "var(--color-border)",
                      backgroundColor:
                        mode === "DOMAIN" ? "rgba(168, 85, 247, 0.15)" : "transparent",
                      color: mode === "DOMAIN" ? "#C084FC" : "var(--color-text-muted)",
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>특정 영역 문제</div>
                    <div style={{ fontSize: "11px", marginTop: "2px", opacity: 0.8 }}>
                      C, Java, Python, SQL 등 특정 분야 집중 생성
                    </div>
                  </button>
                </div>
              </div>

              {/* Domain Select (When DOMAIN mode) */}
              {mode === "DOMAIN" && (
                <div style={styles.formGroup}>
                  <label style={styles.label}>
                    학습 영역 선택
                    {domains && (
                      <span style={{ fontSize: "11px", color: "#64748B", marginLeft: "6px" }}>
                        (DB 실존 영역 연동)
                      </span>
                    )}
                  </label>
                  <select
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    style={styles.select}
                  >
                    <optgroup label="프로그래밍 언어 (실기 빈출)">
                      <option value="C">C 언어 (포인터, 배열, 문자열, 재귀, 구조체)</option>
                      <option value="Java">Java (클래스, 상속, 오버라이딩, 다형성)</option>
                      <option value="Python">Python (슬라이싱, 문자열 연산, 리스트)</option>
                    </optgroup>
                    <optgroup label="데이터베이스 & SQL">
                      <option value="SQL">SQL (조인, 서브쿼리, 그룹핑, 릴레이션)</option>
                      <option value="데이터베이스구축">데이터베이스 (정규화, 트랜잭션, 회복)</option>
                    </optgroup>
                    <optgroup label="소프트웨어 공학 & 시스템">
                      <option value="소프트웨어설계">소프트웨어 설계 (디자인 패턴, 모듈 응집도/결합도)</option>
                      <option value="정보시스템구축관리">정보시스템 구축 (운영체제, 라우팅, 보안)</option>
                      <option value="신기술/보안">신기술 및 정보보안 (공격 기법, 암호화)</option>
                    </optgroup>
                  </select>
                </div>
              )}

              {/* Count Select */}
              <div style={styles.formGroup}>
                <label style={styles.label}>생성 문제 수</label>
                <div style={styles.countButtonGroup}>
                  {[5, 10].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setCount(num)}
                      style={{
                        ...styles.countButton,
                        borderColor: count === num ? "#10B981" : "var(--color-border)",
                        backgroundColor:
                          count === num ? "rgba(16, 185, 129, 0.15)" : "transparent",
                        color: count === num ? "#34D399" : "var(--color-text)",
                        fontWeight: count === num ? 700 : 500,
                      }}
                    >
                      {num}문제
                    </button>
                  ))}
                </div>
              </div>

              {/* AI Strategy Info Box */}
              <div style={styles.strategyInfoBox}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                  <Cpu size={16} color="#818CF8" style={{ marginTop: "2px", flexShrink: 0 }} />
                  <div style={{ fontSize: "12px", color: "#94A3B8", lineHeight: 1.5 }}>
                    <strong style={{ color: "#CBD5E1" }}>자동 AI 최적화 전략:</strong> 문제의 성격에 따라 코드 구조 변형, 핵심 알고리즘 응용, 파라미터 조정을 AI가 자동 선택하며, 독립 코드 실행 엔진을 통해 정답과 해설의 무결성을 사전 검증합니다.
                  </div>
                </div>
              </div>

              {error && (
                <div style={styles.errorBox}>
                  <AlertTriangle size={16} color="#EF4444" />
                  <span>{error}</span>
                </div>
              )}

              {/* Action Button */}
              <div style={styles.footer}>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  style={styles.primaryBtn}
                >
                  {isGenerating ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      <span>AI 문제 생성 중... ({count}문제 검증 진행)</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      <span>{count}문제 생성 시작</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
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
    zIndex: 1000,
    padding: "20px",
  },
  modal: {
    backgroundColor: "var(--color-surface, #1e293b)",
    borderRadius: "14px",
    border: "1px solid var(--color-border, #334155)",
    width: "100%",
    maxWidth: "560px",
    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "18px 24px",
    borderBottom: "1px solid var(--color-border, #334155)",
    backgroundColor: "rgba(15, 23, 42, 0.6)",
  },
  iconBox: {
    width: "36px",
    height: "36px",
    borderRadius: "8px",
    backgroundColor: "rgba(192, 132, 252, 0.15)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: "17px",
    fontWeight: 700,
    color: "var(--color-text, #f8fafc)",
    margin: 0,
  },
  subtitle: {
    fontSize: "12px",
    color: "var(--color-text-muted, #94a3b8)",
    margin: "3px 0 0 0",
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "var(--color-text-muted, #94a3b8)",
    cursor: "pointer",
    padding: "6px",
    borderRadius: "6px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    padding: "24px",
  },
  form: {
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
    color: "var(--color-text, #f8fafc)",
  },
  modeButtonGroup: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "10px",
  },
  modeButton: {
    padding: "12px",
    borderRadius: "8px",
    border: "1px solid",
    textAlign: "left",
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  select: {
    width: "100%",
    padding: "10px 14px",
    borderRadius: "8px",
    border: "1px solid var(--color-border, #334155)",
    backgroundColor: "rgba(15, 23, 42, 0.7)",
    color: "var(--color-text, #f8fafc)",
    fontSize: "14px",
    outline: "none",
  },
  countButtonGroup: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "10px",
  },
  countButton: {
    padding: "10px",
    borderRadius: "8px",
    border: "1px solid",
    fontSize: "14px",
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  strategyInfoBox: {
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    border: "1px solid rgba(148, 163, 184, 0.15)",
    borderRadius: "8px",
    padding: "12px",
  },
  errorBox: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    border: "1px solid rgba(239, 68, 68, 0.3)",
    borderRadius: "8px",
    padding: "12px",
    fontSize: "13px",
    color: "#F87171",
  },
  footer: {
    marginTop: "8px",
  },
  primaryBtn: {
    width: "100%",
    padding: "12px 18px",
    backgroundColor: "#3B82F6",
    color: "#FFFFFF",
    border: "none",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    transition: "background-color 0.15s ease",
  },
  secondaryBtn: {
    width: "100%",
    padding: "10px 18px",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    color: "var(--color-text, #f8fafc)",
    border: "1px solid var(--color-border, #334155)",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: 500,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
  },
  resultBox: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    padding: "16px 0",
  },
  resultIconBox: {
    marginBottom: "16px",
  },
  resultTitle: {
    fontSize: "20px",
    fontWeight: 700,
    color: "var(--color-text, #f8fafc)",
    margin: "0 0 8px 0",
  },
  resultDesc: {
    fontSize: "14px",
    color: "var(--color-text-muted, #94a3b8)",
    margin: "0 0 16px 0",
  },
  resultInfoBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    backgroundColor: "rgba(59, 130, 246, 0.12)",
    border: "1px solid rgba(59, 130, 246, 0.3)",
    padding: "6px 12px",
    borderRadius: "20px",
    fontSize: "12px",
    fontFamily: "monospace",
    color: "#60A5FA",
    marginBottom: "16px",
  },
  resultNotice: {
    fontSize: "12px",
    color: "#64748B",
    lineHeight: 1.5,
    maxWidth: "420px",
    margin: "0 0 24px 0",
  },
  resultActions: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    width: "100%",
  },
};
