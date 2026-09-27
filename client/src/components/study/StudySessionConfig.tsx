import React from "react";
import { Play, Lightbulb } from "lucide-react";
import { Subject, SUBJECT_LIST } from "@jungcheogi/shared";
import { styles } from "./studySessionStyles";

interface StudySessionConfigProps {
  sessionTitle: string;
  selectedSubject: Subject | "";
  questionCount: number;
  isStarting: boolean;
  configError: string | null;
  onTitleChange: (value: string) => void;
  onSubjectChange: (value: Subject | "") => void;
  onCountChange: (value: number) => void;
  onStart: () => void;
  onCancel: () => void;
}

export const StudySessionConfig: React.FC<StudySessionConfigProps> = ({
  sessionTitle,
  selectedSubject,
  questionCount,
  isStarting,
  configError,
  onTitleChange,
  onSubjectChange,
  onCountChange,
  onStart,
  onCancel,
}) => {
  return (
    <div style={styles.configContainer}>
      <div style={styles.configHeader}>
        <h2 style={styles.configTitle}>학습 세션 설정</h2>
        <p style={styles.configSubtitle}>
          집중할 과목과 문항수를 선택하고 스마트 채점 엔진으로 실기 문제를
          풀이합니다.
        </p>
      </div>

      {configError && <div style={styles.errorAlert}>{configError}</div>}

      <div style={styles.configCard}>
        <div style={styles.formGroup}>
          <label style={styles.label}>세션 명칭</label>
          <input
            type="text"
            value={sessionTitle}
            onChange={(e) => onTitleChange(e.target.value)}
            style={styles.inputField}
            placeholder="예: 프로그래밍언어 집중 풀이"
          />
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>대상 과목 선택</label>
          <select
            value={selectedSubject}
            onChange={(e) => onSubjectChange(e.target.value as Subject | "")}
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

        <div style={styles.formGroup}>
          <label style={styles.label}>풀이 문항수</label>
          <div style={styles.countBtnRow}>
            {[3, 5, 10, 12].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => onCountChange(num)}
                style={{
                  ...styles.countBtn,
                  backgroundColor:
                    questionCount === num
                      ? "var(--color-primary)"
                      : "var(--color-surface)",
                  borderColor:
                    questionCount === num
                      ? "var(--color-primary)"
                      : "var(--color-border)",
                  color: questionCount === num ? "#FFF" : "var(--color-text)",
                }}
              >
                {num}문제
              </button>
            ))}
          </div>
        </div>

        <div style={styles.infoCallout}>
          <Lightbulb
            size={18}
            color="#3B82F6"
            style={{ flexShrink: 0, marginTop: 2 }}
          />
          <div style={styles.infoCalloutText}>
            <strong>학습 팁</strong>
            <ul>
              <li>영문/한글 표기 및 공백 차이는 유연하게 자동 채점됩니다.</li>
              <li>
                확실하지 않은 문제는 <strong>모르겠음</strong>을 눌러 취약
                개념으로 집중 복습하세요.
              </li>
            </ul>
          </div>
        </div>

        <div style={styles.configActionRow}>
          <button
            type="button"
            onClick={onCancel}
            style={styles.cancelBtn}
            disabled={isStarting}
          >
            취소
          </button>
          <button
            type="button"
            onClick={onStart}
            style={styles.startBtn}
            disabled={isStarting}
          >
            <Play size={18} />
            <span>{isStarting ? "세션 생성 중..." : "학습 세션 시작하기"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
