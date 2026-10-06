import React, { useEffect, useState } from "react";
import { X, BookOpen, Code2, AlertTriangle, Cpu, CheckCircle2, RefreshCw } from "lucide-react";
import { SyntaxTerm } from "@jungcheogi/shared";
import { fetchSyntaxTerm } from "../../api/syntax";

interface SyntaxTermModalProps {
  canonicalKey: string | null;
  onClose: () => void;
  onSelectRelatedTerm?: (key: string) => void;
}

export const SyntaxTermModal: React.FC<SyntaxTermModalProps> = ({
  canonicalKey,
  onClose,
  onSelectRelatedTerm,
}) => {
  const [term, setTerm] = useState<SyntaxTerm | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canonicalKey) {
      setTerm(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    fetchSyntaxTerm(canonicalKey)
      .then((data) => {
        if (isMounted) {
          setTerm(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || "문법 정보를 불러오는 중 오류가 발생했습니다.");
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [canonicalKey]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!canonicalKey) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(15, 23, 42, 0.75)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "20px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "#1E293B",
          border: "1px solid #334155",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "680px",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.6)",
          color: "#F8FAFC",
          overflow: "hidden",
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid #334155",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: "#0F172A",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <span
              style={{
                fontFamily: "monospace",
                fontSize: "16px",
                fontWeight: 700,
                color: "#38BDF8",
                backgroundColor: "rgba(56, 189, 248, 0.15)",
                border: "1px solid rgba(56, 189, 248, 0.4)",
                padding: "3px 10px",
                borderRadius: "8px",
              }}
            >
              {term ? term.displayToken : canonicalKey}
            </span>
            <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#F8FAFC" }}>
              {term ? term.term : "문법 지식 사전"}
            </h3>
            {term && (
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "#94A3B8",
                  backgroundColor: "#334155",
                  padding: "2px 8px",
                  borderRadius: "6px",
                }}
              >
                {term.language}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#94A3B8",
              cursor: "pointer",
              padding: "4px",
              borderRadius: "6px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            title="닫기 (ESC)"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div
          style={{
            padding: "24px",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            lineHeight: 1.6,
          }}
        >
          {loading ? (
            <div
              style={{
                padding: "40px 0",
                textAlign: "center",
                color: "#94A3B8",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "12px",
              }}
            >
              <RefreshCw size={24} className="spin" color="#38BDF8" />
              <span>문법 지식을 불러오는 중...</span>
            </div>
          ) : error ? (
            <div
              style={{
                padding: "20px",
                backgroundColor: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                borderRadius: "10px",
                color: "#FCA5A5",
                fontSize: "14px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                <AlertTriangle size={18} color="#EF4444" />
                <strong>문법 정보를 찾을 수 없습니다.</strong>
              </div>
              <p style={{ margin: 0 }}>{error}</p>
            </div>
          ) : term ? (
            <>
              {/* ① 무엇인가? (개념 정의) */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <BookOpen size={16} color="#38BDF8" />
                  <strong style={{ fontSize: "14px", color: "#38BDF8" }}>
                    ① 무엇인가? (개념 정의)
                  </strong>
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: "14px",
                    color: "#E2E8F0",
                    backgroundColor: "rgba(15, 23, 42, 0.5)",
                    padding: "12px 14px",
                    borderRadius: "8px",
                    borderLeft: "3px solid #38BDF8",
                  }}
                >
                  {term.shortDescription}
                </p>
                {term.detailedExplanation && (
                  <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#94A3B8" }}>
                    {term.detailedExplanation}
                  </p>
                )}
              </div>

              {/* ② 기본 문법 형태 */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Code2 size={16} color="#A78BFA" />
                  <strong style={{ fontSize: "14px", color: "#A78BFA" }}>
                    ② 기본 문법 형태
                  </strong>
                </div>
                <pre
                  style={{
                    margin: 0,
                    fontSize: "13px",
                    fontFamily: "monospace",
                    color: "#DDD6FE",
                    backgroundColor: "#0F172A",
                    padding: "12px 14px",
                    borderRadius: "8px",
                    border: "1px solid #334155",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {term.syntaxPattern}
                </pre>
              </div>

              {/* ③ 어떻게 동작하는가? */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Cpu size={16} color="#34D399" />
                  <strong style={{ fontSize: "14px", color: "#34D399" }}>
                    ③ 어떻게 동작하는가? (실행 규칙)
                  </strong>
                </div>
                <div
                  style={{
                    fontSize: "13.5px",
                    color: "#E2E8F0",
                    backgroundColor: "rgba(15, 23, 42, 0.5)",
                    padding: "12px 14px",
                    borderRadius: "8px",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {term.howItWorks}
                </div>
              </div>

              {/* ④ 간단한 예제 코드 */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <CheckCircle2 size={16} color="#FBBF24" />
                  <strong style={{ fontSize: "14px", color: "#FBBF24" }}>
                    ④ 간단한 예제 코드
                  </strong>
                </div>
                <pre
                  style={{
                    margin: 0,
                    fontSize: "13px",
                    fontFamily: "monospace",
                    color: "#FEF08A",
                    backgroundColor: "#0F172A",
                    padding: "14px",
                    borderRadius: "8px",
                    border: "1px solid #334155",
                    overflowX: "auto",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {term.exampleCode}
                </pre>
              </div>

              {/* ⑤ 시험에서 자주 헷갈리는 점 */}
              <div
                style={{
                  backgroundColor: "rgba(245, 158, 11, 0.1)",
                  border: "1px solid rgba(245, 158, 11, 0.35)",
                  borderRadius: "10px",
                  padding: "14px 16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <AlertTriangle size={16} color="#F59E0B" />
                  <strong style={{ fontSize: "14px", color: "#F59E0B" }}>
                    ⑤ 시험에서 자주 헷갈리는 점 & 함정
                  </strong>
                </div>
                <div
                  style={{
                    fontSize: "13px",
                    color: "#FDE68A",
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.6,
                  }}
                >
                  {term.commonMistakes}
                </div>
              </div>

              {/* 관련 문법 링크 */}
              {term.relatedTerms && term.relatedTerms.length > 0 && (
                <div style={{ marginTop: "4px" }}>
                  <span style={{ fontSize: "12px", color: "#94A3B8", marginRight: "8px" }}>
                    연관 문법:
                  </span>
                  <div style={{ display: "inline-flex", gap: "6px", flexWrap: "wrap" }}>
                    {term.relatedTerms.map((relKey) => (
                      <button
                        key={relKey}
                        type="button"
                        onClick={() => onSelectRelatedTerm?.(relKey)}
                        style={{
                          fontSize: "11px",
                          fontFamily: "monospace",
                          color: "#38BDF8",
                          backgroundColor: "rgba(56, 189, 248, 0.1)",
                          border: "1px solid rgba(56, 189, 248, 0.3)",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          cursor: "pointer",
                        }}
                      >
                        {relKey}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: "12px 24px",
            borderTop: "1px solid #334155",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: "#0F172A",
            fontSize: "12px",
            color: "#64748B",
          }}
        >
          <span>⚡ 로컬 지식 DB 즉시 조회 (AI API 0회 호출)</span>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "6px 16px",
              backgroundColor: "#334155",
              color: "#F8FAFC",
              border: "none",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
