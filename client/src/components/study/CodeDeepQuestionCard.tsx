import React, { useState, useRef, useEffect } from "react";
import {
  MessageSquare,
  Send,
  X,
  Sparkles,
  RefreshCw,
  Code,
  AlertCircle,
} from "lucide-react";
import {
  Question,
  CodeDeepQuestionMessage,
} from "@jungcheogi/shared";
import { askCodeDeepQuestion } from "../../api/ai";

interface CodeDeepQuestionCardProps {
  question: Question;
  onClose: () => void;
}

export const CodeDeepQuestionCard: React.FC<CodeDeepQuestionCardProps> = ({
  question,
  onClose,
}) => {
  const [messages, setMessages] = useState<CodeDeepQuestionMessage[]>([]);
  const [inputQuestion, setInputQuestion] = useState("");
  const [selectedSnippet, setSelectedSnippet] = useState<string | null>(null);
  const [selectedRange, setSelectedRange] = useState<{
    startLine?: number;
    endLine?: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const codeContainerRef = useRef<HTMLDivElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 자동 스크롤
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // 코드 영역 마우스 드래그(선택) 감지
  const handleCodeMouseUp = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const rawSelected = selection.toString();
    const text = rawSelected.trim();
    if (!text) return;

    // 선택 영역이 이 심층 질문 카드의 코드 영역 내부에 있는지 확인
    if (
      codeContainerRef.current &&
      codeContainerRef.current.contains(selection.anchorNode)
    ) {
      setSelectedSnippet(text);

      // 라인 번호 추정 계산
      const codeLines = (question.code || "").split("\n");
      let start = -1;
      let end = -1;
      for (let i = 0; i < codeLines.length; i++) {
        const line = codeLines[i];
        if (line.includes(text) || (text.length > 5 && text.includes(line.trim()))) {
          if (start === -1) start = i + 1;
          end = i + 1;
        }
      }
      if (start !== -1) {
        setSelectedRange({ startLine: start, endLine: end });
      } else {
        setSelectedRange(null);
      }
    }
  };

  const handleClearSelection = () => {
    setSelectedSnippet(null);
    setSelectedRange(null);
    if (window.getSelection) {
      window.getSelection()?.removeAllRanges();
    }
  };

  const handleSendQuestion = async () => {
    if (!inputQuestion.trim() || isLoading) return;

    const userText = inputQuestion.trim();
    const currentSnippet = selectedSnippet;
    const currentRange = selectedRange;

    const newUserMsg: CodeDeepQuestionMessage = {
      role: "user",
      content: userText,
      selectedText: currentSnippet,
      selectedRange: currentRange,
      createdAt: new Date().toISOString(),
    };

    const nextMessages = [...messages, newUserMsg];
    setMessages(nextMessages);
    setInputQuestion("");
    setError(null);
    setIsLoading(true);

    try {
      const res = await askCodeDeepQuestion({
        questionId: question.id,
        questionText: question.question,
        code: question.code || "",
        language: question.language,
        selectedText: currentSnippet || null,
        selectedRange: currentRange || null,
        userQuestion: userText,
        conversationHistory: nextMessages.slice(0, -1), // 이전 대화 기록 전달
      });

      if (res.data && res.data.success) {
        const assistantMsg: CodeDeepQuestionMessage = {
          role: "assistant",
          content: res.data.answer,
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } else {
        setError(res.error || "질문에 대한 답변을 생성하지 못했습니다.");
      }
    } catch (err: any) {
      setError(err?.message || "네트워크 통신 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
      // 포커스 복원
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 한글 IME 입력 중 Enter 중복 전송 방지
    if ((e.nativeEvent as any).isComposing) return;

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendQuestion();
    }
  };

  const codeLines = (question.code || "").split("\n");

  return (
    <div style={styles.deepCardContainer}>
      {/* 1. Header */}
      <div style={styles.header}>
        <div style={styles.headerTitleWrap}>
          <div style={styles.iconBadge}>
            <MessageSquare size={16} color="#38BDF8" />
          </div>
          <div>
            <div style={styles.titleRow}>
              <span style={styles.headerTitle}>코드 심층 질문 워크스페이스</span>
              <span style={styles.geminiBadge}>Gemini 3.8</span>
              <span style={styles.languageBadge}>{question.language || "CODE"}</span>
            </div>
            <p style={styles.headerSubtitle}>
              궁금한 코드 부분을 마우스로 <strong>자유롭게 드래그(선택)</strong>한 후 질문하세요. 드래그하지 않으면 전체 코드 맥락에서 질문합니다.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={styles.closeBtn}
          title="심층 질문 닫기"
        >
          <X size={18} color="#94A3B8" />
        </button>
      </div>

      <div style={styles.workspaceBody}>
        {/* 2. Non-interactive Text-Selectable Code Viewer */}
        <div style={styles.codeColumn}>
          <div style={styles.codeColumnHeader}>
            <div style={styles.codeHeaderLabel}>
              <Code size={14} color="#94A3B8" />
              <span>문제 소스 코드 (드래그하여 선택 가능)</span>
            </div>
            {selectedSnippet && (
              <button
                type="button"
                onClick={handleClearSelection}
                style={styles.clearSelectionBtn}
              >
                선택 해제 ✕
              </button>
            )}
          </div>

          <div
            ref={codeContainerRef}
            onMouseUp={handleCodeMouseUp}
            style={styles.codeScrollBox}
            title="마우스로 텍스트를 드래그하여 질문할 부분을 지정하세요"
          >
            {codeLines.map((line, idx) => {
              const lineNum = idx + 1;
              return (
                <div key={idx} style={styles.codeLineRow}>
                  <span style={styles.lineNumberCol}>{lineNum}</span>
                  <span style={styles.lineContentCol}>{line || " "}</span>
                </div>
              );
            })}
          </div>

          <div style={styles.codeFooterTip}>
            <span>💡 팁: 원하는 줄이나 수식(`++b`, `*p` 등)을 드래그하면 AI 튜터가 해당 포인트를 집중 해설합니다.</span>
          </div>
        </div>

        {/* 3. Interactive Chat Panel */}
        <div style={styles.chatColumn}>
          <div style={styles.messagesContainer}>
            {messages.length === 0 && (
              <div style={styles.emptyState}>
                <Sparkles size={28} color="#38BDF8" style={{ marginBottom: "8px" }} />
                <div style={styles.emptyTitle}>Gemini 3.8 프로그래밍 튜터</div>
                <div style={styles.emptyText}>
                  좌측 소스 코드에서 이해가 안 가는 부분이나 연산식을 선택하고 질문을 남겨보세요.
                </div>
                <div style={styles.suggestedQuestions}>
                  <button
                    type="button"
                    onClick={() => setInputQuestion("이 코드의 실행 순서와 메모리 변수 상태 변화를 알려주세요.")}
                    style={styles.suggestBtn}
                  >
                    💬 "실행 순서와 변수 변화를 알려주세요"
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputQuestion("시험에서 헷갈리기 쉬운 함정이나 출제 포인트가 무엇인가요?")}
                    style={styles.suggestBtn}
                  >
                    ⚡ "시험 출제 포인트와 함정을 짚어주세요"
                  </button>
                </div>
              </div>
            )}

            {messages.map((msg, idx) => {
              const isUser = msg.role === "user";
              return (
                <div
                  key={idx}
                  style={isUser ? styles.userMessageWrap : styles.assistantMessageWrap}
                >
                  <div style={isUser ? styles.userBubble : styles.assistantBubble}>
                    {/* 선택된 코드 스니펫 뱃지 */}
                    {isUser && msg.selectedText && (
                      <div style={styles.messageSnippetBadge}>
                        <Code size={12} color="#38BDF8" />
                        <span>포커스: </span>
                        <code>{msg.selectedText}</code>
                        {msg.selectedRange?.startLine && (
                          <span style={styles.lineRangeText}>
                            (Line {msg.selectedRange.startLine}
                            {msg.selectedRange.endLine && msg.selectedRange.endLine !== msg.selectedRange.startLine
                              ? `~${msg.selectedRange.endLine}`
                              : ""}
                            )
                          </span>
                        )}
                      </div>
                    )}
                    <div style={styles.messageContent}>{msg.content}</div>
                  </div>
                </div>
              );
            })}

            {isLoading && (
              <div style={styles.assistantMessageWrap}>
                <div style={styles.assistantBubble}>
                  <div style={styles.loadingRow}>
                    <RefreshCw size={14} className="spin" color="#38BDF8" />
                    <span>Gemini 3.8이 코드 문맥을 정밀 분석하고 있습니다...</span>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div style={styles.errorBanner}>
                <AlertCircle size={15} color="#EF4444" />
                <span>{error}</span>
              </div>
            )}

            <div ref={chatBottomRef} />
          </div>

          {/* 4. Input Area */}
          <div style={styles.inputArea}>
            {/* 현재 선택된 스니펫 표시 바 */}
            {selectedSnippet && (
              <div style={styles.activeSelectionBanner}>
                <div style={styles.activeSelectionText}>
                  <span style={styles.selectionLabel}>선택된 포커스:</span>
                  <code style={styles.selectionSnippetText}>
                    {selectedSnippet.length > 50
                      ? `${selectedSnippet.slice(0, 50)}...`
                      : selectedSnippet}
                  </code>
                  {selectedRange?.startLine && (
                    <span style={styles.selectionRangeBadge}>
                      Line {selectedRange.startLine}
                      {selectedRange.endLine && selectedRange.endLine !== selectedRange.startLine
                        ? `~${selectedRange.endLine}`
                        : ""}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleClearSelection}
                  style={styles.cancelSelectionBtn}
                  title="선택 해제"
                >
                  ✕
                </button>
              </div>
            )}

            <div style={styles.inputWrap}>
              <textarea
                ref={inputRef}
                value={inputQuestion}
                onChange={(e) => setInputQuestion(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  selectedSnippet
                    ? `'${selectedSnippet.slice(0, 20)}...' 부분에 대해 질문을 입력하세요 (Enter 전송, Shift+Enter 줄바꿈)`
                    : "코드에 대해 궁금한 점을 입력하세요 (Enter 전송, Shift+Enter 줄바꿈)"
                }
                disabled={isLoading}
                rows={2}
                style={styles.textarea}
              />
              <button
                type="button"
                onClick={handleSendQuestion}
                disabled={!inputQuestion.trim() || isLoading}
                style={{
                  ...styles.sendBtn,
                  opacity: !inputQuestion.trim() || isLoading ? 0.5 : 1,
                  cursor: !inputQuestion.trim() || isLoading ? "not-allowed" : "pointer",
                }}
                title="질문 전송 (Enter)"
              >
                {isLoading ? (
                  <RefreshCw size={16} className="spin" color="#FFFFFF" />
                ) : (
                  <Send size={16} color="#FFFFFF" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  deepCardContainer: {
    backgroundColor: "#0F172A",
    border: "1px solid #334155",
    borderRadius: "12px",
    marginTop: "16px",
    marginBottom: "16px",
    overflow: "hidden",
    boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.4)",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    backgroundColor: "#1E293B",
    borderBottom: "1px solid #334155",
  },
  headerTitleWrap: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  iconBadge: {
    width: "32px",
    height: "32px",
    borderRadius: "8px",
    backgroundColor: "rgba(56, 189, 248, 0.15)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  headerTitle: {
    color: "#F8FAFC",
    fontSize: "14px",
    fontWeight: 700,
  },
  geminiBadge: {
    fontSize: "11px",
    fontWeight: 700,
    color: "#38BDF8",
    backgroundColor: "rgba(56, 189, 248, 0.15)",
    border: "1px solid rgba(56, 189, 248, 0.3)",
    padding: "1px 6px",
    borderRadius: "4px",
  },
  languageBadge: {
    fontSize: "11px",
    fontWeight: 600,
    color: "#94A3B8",
    backgroundColor: "#334155",
    padding: "1px 6px",
    borderRadius: "4px",
  },
  headerSubtitle: {
    margin: "3px 0 0 0",
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
  workspaceBody: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    minHeight: "420px",
    maxHeight: "580px",
  },
  codeColumn: {
    borderRight: "1px solid #334155",
    backgroundColor: "#090D16",
    display: "flex",
    flexDirection: "column",
  },
  codeColumnHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 12px",
    backgroundColor: "#131C2E",
    borderBottom: "1px solid #1E293B",
  },
  codeHeaderLabel: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "12px",
    color: "#94A3B8",
    fontWeight: 500,
  },
  clearSelectionBtn: {
    fontSize: "11px",
    color: "#F87171",
    background: "rgba(239, 68, 68, 0.12)",
    border: "1px solid rgba(239, 68, 68, 0.25)",
    borderRadius: "4px",
    padding: "2px 6px",
    cursor: "pointer",
  },
  codeScrollBox: {
    flex: 1,
    overflowY: "auto",
    padding: "10px 0",
    fontFamily: "'Fira Code', 'Cascadia Code', Consolas, monospace",
    fontSize: "13px",
    lineHeight: "1.6",
    color: "#E2E8F0",
    userSelect: "text",
    WebkitUserSelect: "text",
    cursor: "text",
  },
  codeLineRow: {
    display: "flex",
    alignItems: "flex-start",
    padding: "0 10px",
    userSelect: "text",
    WebkitUserSelect: "text",
  },
  lineNumberCol: {
    width: "32px",
    minWidth: "32px",
    color: "#475569",
    textAlign: "right",
    paddingRight: "12px",
    userSelect: "none",
    WebkitUserSelect: "none",
  },
  lineContentCol: {
    flex: 1,
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
    userSelect: "text",
    WebkitUserSelect: "text",
  },
  codeFooterTip: {
    padding: "8px 12px",
    fontSize: "11px",
    color: "#64748B",
    borderTop: "1px solid #1E293B",
    backgroundColor: "#090D16",
  },
  chatColumn: {
    display: "flex",
    flexDirection: "column",
    backgroundColor: "#0F172A",
  },
  messagesContainer: {
    flex: 1,
    overflowY: "auto",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    minHeight: "220px",
    textAlign: "center",
    padding: "20px",
  },
  emptyTitle: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#E2E8F0",
    marginBottom: "4px",
  },
  emptyText: {
    fontSize: "12px",
    color: "#64748B",
    maxWidth: "320px",
    marginBottom: "16px",
    lineHeight: "1.5",
  },
  suggestedQuestions: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    width: "100%",
    maxWidth: "320px",
  },
  suggestBtn: {
    fontSize: "12px",
    color: "#94A3B8",
    backgroundColor: "#1E293B",
    border: "1px solid #334155",
    borderRadius: "6px",
    padding: "8px 10px",
    textAlign: "left",
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  userMessageWrap: {
    display: "flex",
    justifyContent: "flex-end",
  },
  userBubble: {
    maxWidth: "85%",
    backgroundColor: "#2563EB",
    color: "#FFFFFF",
    borderRadius: "12px 12px 2px 12px",
    padding: "10px 14px",
    fontSize: "13px",
    lineHeight: "1.5",
    wordBreak: "break-word",
  },
  messageSnippetBadge: {
    display: "flex",
    alignItems: "center",
    gap: "5px",
    backgroundColor: "rgba(0, 0, 0, 0.25)",
    padding: "3px 8px",
    borderRadius: "6px",
    fontSize: "11px",
    color: "#E0F2FE",
    marginBottom: "6px",
    flexWrap: "wrap",
  },
  lineRangeText: {
    fontSize: "10px",
    color: "#BAE6FD",
  },
  assistantMessageWrap: {
    display: "flex",
    justifyContent: "flex-start",
  },
  assistantBubble: {
    maxWidth: "92%",
    backgroundColor: "#1E293B",
    border: "1px solid #334155",
    color: "#E2E8F0",
    borderRadius: "12px 12px 12px 2px",
    padding: "12px 14px",
    fontSize: "13px",
    lineHeight: "1.6",
    wordBreak: "break-word",
  },
  messageContent: {
    whiteSpace: "pre-wrap",
  },
  loadingRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    color: "#94A3B8",
    fontSize: "12px",
  },
  errorBanner: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    border: "1px solid rgba(239, 68, 68, 0.3)",
    padding: "8px 12px",
    borderRadius: "6px",
    color: "#F87171",
    fontSize: "12px",
  },
  inputArea: {
    borderTop: "1px solid #334155",
    padding: "10px 14px",
    backgroundColor: "#131C2E",
  },
  activeSelectionBanner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(56, 189, 248, 0.1)",
    border: "1px solid rgba(56, 189, 248, 0.3)",
    borderRadius: "6px",
    padding: "5px 10px",
    marginBottom: "8px",
  },
  activeSelectionText: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "11px",
    color: "#E0F2FE",
    overflow: "hidden",
  },
  selectionLabel: {
    fontWeight: 600,
    color: "#38BDF8",
  },
  selectionSnippetText: {
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    padding: "1px 5px",
    borderRadius: "3px",
    fontFamily: "monospace",
    color: "#F8FAFC",
  },
  selectionRangeBadge: {
    color: "#FACC15",
    fontSize: "10px",
  },
  cancelSelectionBtn: {
    background: "transparent",
    border: "none",
    color: "#94A3B8",
    cursor: "pointer",
    fontSize: "12px",
    padding: "0 4px",
  },
  inputWrap: {
    display: "flex",
    alignItems: "flex-end",
    gap: "8px",
  },
  textarea: {
    flex: 1,
    backgroundColor: "#0F172A",
    border: "1px solid #334155",
    borderRadius: "8px",
    padding: "8px 10px",
    color: "#F8FAFC",
    fontSize: "13px",
    lineHeight: "1.4",
    resize: "none",
    outline: "none",
    fontFamily: "inherit",
  },
  sendBtn: {
    backgroundColor: "#2563EB",
    border: "none",
    borderRadius: "8px",
    width: "38px",
    height: "38px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    transition: "background-color 0.15s ease",
  },
};
