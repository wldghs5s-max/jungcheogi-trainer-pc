# 2025년 1회 기출 복원 사진 전사·학습 검수 자료

## 1. 개요 및 검수 방침

- **목표**: 개인 정보처리기사 실기 학습 및 Seed 무결성 확보.
- **원본 특성**: 수험생 복원 문제집 사진으로, **문제 원본 사진 내에 공식 정답 및 해설이 포함되어 있지 않음**.
- **원칙 준수**:
  - `transcriptionStatus`: 사진에서 텍스트가 100% 명확히 판독 가능한 경우 `VERIFIED`, 순서도 다이어그램 손실이 있는 문항은 `REVIEW`.
  - `answerStatus`: 결정론적 컴파일/인터프리터/관계대수 실행 검증이 완료된 코드/SQL 문항만 `VERIFIED`, 원본에 답이 없는 이론/단답/약어 문항은 추측 배제 원칙에 따라 `REVIEW_NEEDED` (`readyForGrading = false`) 처리.
  - 모든 `REVIEW_NEEDED` 문항은 AI 문제 생성(Seed Eligibility Guard)에서 엄격히 제외됨.

---

## 2. 데이터 현황 요약

- **총 이미지 수**: 13장 (`20261005_172054.jpg` ~ `20261005_172320.jpg`)
- **총 문항 수**: 20문항 (`q_2025_01_01` ~ `q_2025_01_20`)
- **전사 상태 (Transcription Status)**:
  - `VERIFIED`: 19문항 (Q1 ~ Q13, Q15 ~ Q20)
  - `REVIEW`: 1문항 (Q14 - C언어/순서도 다이어그램 텍스트 변환 한계)
- **정답 상태 (Answer Status)**:
  - `VERIFIED`: 10문항 (Q3, Q5, Q6, Q11, Q12, Q16, Q17, Q18, Q19, Q20 - 코드 실행 및 SQL 검증 완료, `readyForGrading = true`)
  - `REVIEW_NEEDED`: 10문항 (Q1, Q2, Q4, Q7, Q8, Q9, Q10, Q13, Q14, Q15 - 공식 답안 미포함 이론 문항, `readyForGrading = false`)

---

## 3. 원본 사진 - 문항 매핑 표

| 사진 파일명 | 포함 문항 | 과목 / 유형 | 전사 상태 | 정답 상태 | 채점 준비 |
|:---|:---|:---|:---:|:---:|:---:|
| `20261005_172054.jpg` | Q1 | 네트워크 보안 (세션 하이재킹) | VERIFIED | REVIEW_NEEDED | false |
| `20261005_172054.jpg` | Q2 | DB 무결성 제약조건 (도메인/개체/참조) | VERIFIED | REVIEW_NEEDED | false |
| `20261015_172118.jpg` | Q3 | C 문자열/배열 포인터 조작 | VERIFIED | VERIFIED | true |
| `20261005_172132.jpg` | Q4 | 데이터 전송 오류 검출 (CRC) | VERIFIED | REVIEW_NEEDED | false |
| `20261005_172132.jpg` | Q5 | Java 클래스 상속/정적 바인딩 | VERIFIED | VERIFIED | true |
| `20261005_172138.jpg` | Q6 | Python 딕셔너리 및 리스트 조작 | VERIFIED | VERIFIED | true |
| `20261005_172138.jpg` | Q7 | 소프트웨어 설계 디자인 패턴 (Proxy) | VERIFIED | REVIEW_NEEDED | false |
| `20261005_172150.jpg` | Q8 | 소프트웨어 공학 테스트 (회귀 테스트) | VERIFIED | REVIEW_NEEDED | false |
| `20261005_172150.jpg` | Q9 | 암호화 알고리즘 (IDEA) | VERIFIED | REVIEW_NEEDED | false |
| `20261005_172150.jpg` | Q10 | 라우팅 프로토콜 (BGP) | VERIFIED | REVIEW_NEEDED | false |
| `20261005_172205.jpg` | Q11 | SQL Group By / Having 집계 | VERIFIED | VERIFIED | true |
| `20261005_172210.jpg` | Q12 | C 비트 연산자 및 시프트 연산 | VERIFIED | VERIFIED | true |
| `20261005_172218.jpg` | Q13 | 네트워크 용어 (SDN) | VERIFIED | REVIEW_NEEDED | false |
| `20261005_172218.jpg` | Q14 | 테스트 커버리지 / 제어 흐름 다이어그램 | REVIEW | REVIEW_NEEDED | false |
| `20261005_172230.jpg` | Q15 | 보안 용어 (스미싱 / Smishing) | VERIFIED | REVIEW_NEEDED | false |
| `20261005_172249.jpg` | Q16 | Java 인터페이스 구현 및 다형성 | VERIFIED | VERIFIED | true |
| `20261005_172249.jpg` | Q17 | SQL Join 및 서브쿼리 연산 | VERIFIED | VERIFIED | true |
| `20261005_172304.jpg` | Q18 | C 재귀 함수 (Factorial / Fibonacci) | VERIFIED | VERIFIED | true |
| `20261005_172314.jpg` | Q19 | Python 람다 / 슬라이싱 / map | VERIFIED | VERIFIED | true |
| `20261005_172320.jpg` | Q20 | C 2차원 배열 포인터 탐색 | VERIFIED | VERIFIED | true |

---

## 4. 특이사항 및 검수 메모

1. **Q14 (테스트 커버리지 / 순서도)**:
   - 복원 사진 내에 순서도(Flowchart/Control Flow Graph) 다이어그램이 포함되어 있으나 순수 텍스트 JSON으로 전사 시 시각적 분기 기호 손실 위험이 존재함.
   - 따라서 `transcriptionStatus: "REVIEW"`로 명시하고 `readyForGrading: false`로 설정함.
2. **이론 단답형 문항 (10문항)**:
   - 기출 복원 사진에는 문제 지문만 존재하고 모범 답안이 명시되어 있지 않음.
   - 엄격한 원칙에 따라 국문/영문 정답 표기 및 동의어 인정 범위가 불확실하므로, `answerStatus: "REVIEW_NEEDED"` 및 `readyForGrading: false`로 유지하여 임의 채점으로 인한 왜곡을 원천 차단함.
3. **코드 및 SQL 문항 (10문항)**:
   - C (GCC), Java (OpenJDK), Python (3.11), SQLite 테스트 러너를 통해 지문 코드를 완전히 독립 재현 및 트레이스하여 출력 결과를 100% 검증함.
   - 따라서 `transcriptionStatus: "VERIFIED"`, `answerStatus: "VERIFIED"`, `readyForGrading: true`로 설정되어 AI 변형 및 실전 풀이 학습에 즉시 활용 가능함.

