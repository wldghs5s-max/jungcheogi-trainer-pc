import React from "react";
import { Sparkles, ShieldCheck, CheckCircle2, X } from "lucide-react";
import { Question } from "@jungcheogi/shared";
import { styles } from "../appStyles";

interface VariationModalProps {
  question: Question;
  selectedVarType: string;
  isGeneratingVar: boolean;
  generatedVarResult: any;
  onChangeVarType: (value: string) => void;
  onGenerate: () => void;
  onClose: () => void;
  onOpenImport: () => void;
}

export const VariationModal: React.FC<VariationModalProps> = ({
  question,
  selectedVarType,
  isGeneratingVar,
  generatedVarResult,
  onChangeVarType,
  onGenerate,
  onClose,
  onOpenImport,
}) => {
  return (
    <div style={styles.varModalOverlay}>
      <div style={styles.varModalContent}>
        <div style={styles.varModalHeader}>
          <div style={styles.varModalTitleGroup}>
            <Sparkles size={20} color="#C084FC" />
            <h3 style={styles.varModalTitle}>
              AI 변형 문제 생성 및 Staging 검수 파이프라인
            </h3>
          </div>
          <button onClick={onClose} style={styles.closeBtn}>
            <X size={18} />
          </button>
        </div>

        <div style={styles.varModalBody}>
          <div style={styles.varSourceBox}>
            <div style={styles.varSourceHeader}>
              <span style={styles.varSourceId}>기준 원본: {question.id}</span>
              <span style={styles.varSourceSubject}>{question.subject}</span>
              {question.conceptId && (
                <span style={styles.varSourceConcept}>
                  개념: {question.conceptId}
                </span>
              )}
            </div>
            <p style={styles.varSourceText}>{question.question}</p>
          </div>

          {!generatedVarResult ? (
            <div style={styles.varConfigSection}>
              <label style={styles.varLabel}>
                변형 문제 유형 선택 (Variation Type):
              </label>
              <select
                value={selectedVarType}
                onChange={(e) => onChangeVarType(e.target.value)}
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
                  <strong>staged_questions</strong>에 <strong>PENDING</strong>{" "}
                  상태로 안전하게 격리 등록됩니다.
                </span>
              </div>

              <div style={styles.varModalFooter}>
                <button onClick={onClose} style={styles.cancelBtn}>
                  취소
                </button>
                <button
                  onClick={onGenerate}
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
                      <code>{generatedVarResult.variation?.codeSnippet}</code>
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
                <button onClick={onOpenImport} style={styles.openImportBtn}>
                  검수 관리자 대시보드(ImportModal) 열기 &rarr;
                </button>
                <button onClick={onClose} style={styles.primaryBtn}>
                  확인
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
