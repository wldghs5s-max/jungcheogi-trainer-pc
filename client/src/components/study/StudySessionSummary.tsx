import React from "react";
import { Trophy, RotateCcw } from "lucide-react";
import { SessionSummaryResponse } from "@jungcheogi/shared";
import { styles } from "./studySessionStyles";

interface StudySessionSummaryProps {
  summary: SessionSummaryResponse | null;
  loadingSummary: boolean;
  onRestart: () => void;
  onClose: () => void;
}

export const StudySessionSummary: React.FC<StudySessionSummaryProps> = ({
  summary,
  loadingSummary,
  onRestart,
  onClose,
}) => {
  return (
    <div style={styles.summaryContainer}>
      {loadingSummary ? (
        <div style={styles.loadingBox}>
          <p>세션 학습 종합 데이터를 집계하고 있습니다...</p>
        </div>
      ) : summary ? (
        <div>
          <div style={styles.summaryHero}>
            <div style={styles.trophyIconBox}>
              <Trophy size={42} color="#F59E0B" />
            </div>
            <h2 style={styles.summaryTitle}>학습 세션 완료!</h2>
            <p style={styles.summarySubtitle}>
              총 {summary.session.totalQuestions}문항 중{" "}
              {summary.session.correctCount}문항을 맞추셨습니다.
            </p>
            <div style={styles.accuracyCircle}>
              <span style={styles.accuracyNumber}>{summary.accuracyRate}%</span>
              <span style={styles.accuracyLabel}>최종 정답률</span>
            </div>
          </div>

          <div style={styles.summaryGrid}>
            <div style={styles.summaryStatCard}>
              <span style={styles.statLabel}>정답 문항</span>
              <span style={{ ...styles.statVal, color: "var(--color-success)" }}>
                {summary.session.correctCount}개
              </span>
            </div>
            <div style={styles.summaryStatCard}>
              <span style={styles.statLabel}>오답 문항</span>
              <span style={{ ...styles.statVal, color: "var(--color-danger)" }}>
                {summary.session.wrongCount}개
              </span>
            </div>
            <div style={styles.summaryStatCard}>
              <span style={styles.statLabel}>모르겠음 (복습 우선)</span>
              <span style={{ ...styles.statVal, color: "var(--color-warning)" }}>
                {summary.session.unknownCount}개
              </span>
            </div>
            <div style={styles.summaryStatCard}>
              <span style={styles.statLabel}>평균 풀이 시간</span>
              <span style={styles.statVal}>
                {summary.averageTimeSpentSeconds}초/문항
              </span>
            </div>
          </div>

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
                        ? "var(--color-warning)"
                        : item.isCorrect
                          ? "var(--color-success)"
                          : "var(--color-danger)",
                    }}
                  >
                    <div style={styles.reviewCardHeader}>
                      <span style={styles.reviewQIndex}>Q.{idx + 1}</span>
                      <span style={styles.reviewQSubj}>
                        {q?.subject || "과목"}
                      </span>
                      <span style={styles.reviewQCat}>
                        {q?.category || "카테고리"}
                      </span>
                      <div style={styles.reviewStatusBadge}>
                        {item.scoringStatus === "UNSCORED" ? (
                          <span style={{ color: "#F59E0B" }}>
                            ⚡ 비검증 연습 (미채점)
                          </span>
                        ) : item.isUnknown ? (
                          <span style={{ color: "var(--color-warning)" }}>
                            ? 모르겠음
                          </span>
                        ) : item.isCorrect ? (
                          <span style={{ color: "var(--color-success)" }}>
                            ✓ 정답
                          </span>
                        ) : (
                          <span style={{ color: "var(--color-danger)" }}>
                            ✕ 오답
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={styles.reviewQText}>
                      {q?.question || "문항 정보"}
                    </div>
                    <div style={styles.reviewAnswersRow}>
                      <div style={styles.reviewAnswerItem}>
                        <span style={styles.reviewAnswerKey}>나의 답:</span>
                        <span style={styles.reviewAnswerVal}>
                          {Array.isArray(item.userAnswer)
                            ? item.userAnswer.join(", ")
                            : item.userAnswer || "(모르겠음)"}
                        </span>
                      </div>
                      <div style={styles.reviewAnswerItem}>
                        <span
                          style={{
                            ...styles.reviewAnswerKey,
                            color: "var(--color-success)",
                          }}
                        >
                          기준 정답:
                        </span>
                        <strong style={{ color: "var(--color-success)" }}>
                          {q?.groundTruthAnswer
                            ? Array.isArray(q.groundTruthAnswer)
                              ? q.groundTruthAnswer.join(", ")
                              : q.groundTruthAnswer
                            : "(정보 없음)"}
                        </strong>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={styles.summaryActionRow}>
            <button
              type="button"
              onClick={onRestart}
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
        <div style={styles.errorAlert}>
          세션 요약 정보를 불러오지 못했습니다.
        </div>
      )}
    </div>
  );
};
