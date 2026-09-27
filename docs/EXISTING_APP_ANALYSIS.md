# Existing App Analysis (정처기 실기 트레이너)

> **공식 인수인계 및 코드 역분석 문서**  
> 본 문서는 `정처기pc프로젝트/정처기모바일앱` 소스 코드 전체를 실제 구현 기준으로 직접 역분석하여 작성한 공식 기술 분석서입니다.  
> 추측이나 기능 제안을 배제하고 코드상의 실제 실행 흐름, 상태 전이, 데이터 구조, 함수 호출 관계를 충실히 기록합니다.
>
> **신뢰도 태그 기준**:
>
> - `[CONFIRMED]`: 실제 소스 코드 및 테스트 스크립트에서 직접 확인된 사실.
> - `[INFERRED]`: 코드 구조와 정황상 유력하지만 명시적 선언이 부족하여 추론된 사항.
> - `[UNKNOWN]`: 현재 코드베이스만으로는 단정할 수 없는 미확인 사항.

---

## 1. Project Overview

- **프로젝트 명칭**: `jungcheogi-mobile-app` (`[CONFIRMED]` `package.json#name`, `app.json#expo.slug`)
- **앱 표기명**: "정처기 실기 트레이너" (`[CONFIRMED]` `app.json#expo.name`, `HomeScreen.tsx#354`)
- **버전 정보**: v1.3.8, Android `versionCode`: 16 (`[CONFIRMED]` `package.json#version`, `app.json#expo.android.versionCode`)
- **개발 목적**: 국가기술자격 정보처리기사 실기 시험 대비를 위한 모바일 집중 트레이닝 애플리케이션 ("출퇴근 지하철 10분 합격 프로젝트")
- **아키텍처 성격**: **오프라인 우선(Offline-First) 독립형 클라이언트**.
  - 기본 번들 기출/예상 문제(82제), 이론 요약(14건), 1초 두음 암기장(20건), 10종 절차적 프로그래밍 문제 자동 생성 엔진을 로컬에 내장하여 네트워크 없이 100% 자립 동작 가능.
  - 사용자가 설정에서 개인 Google Gemini API Key를 입력한 경우에 한해, 1:1 실시간 대화형 AI 과외(스트리밍) 및 주제 시드 기반의 AI 실기 암기 문제 생성을 추가로 제공함.

---

## 2. Technology Stack

| 분류                 | 라이브러리 / 기술                           | 실제 버전  | 비고 및 역할 `[CONFIRMED]`                                          |
| -------------------- | ------------------------------------------- | ---------- | ------------------------------------------------------------------- |
| **Core Framework**   | React Native                                | `0.86.3`   | 모바일 크로스 플랫폼 런타임                                         |
| **App Framework**    | Expo SDK                                    | `~57.0.20` | Expo 모바일 개발 툴체인 (Managed Workflow)                          |
| **Language & Base**  | React                                       | `19.2.3`   | UI 렌더링 코어                                                      |
|                      | TypeScript                                  | `~6.0.3`   | `tsconfig.json` (strict: true)                                      |
| **State Management** | Zustand                                     | `^5.0.15`  | 전역 상태 관리 (`useQuizStore`, `useSettingsStore`, `useUserStore`) |
| **Local Storage**    | `@react-native-async-storage/async-storage` | `2.2.0`    | 키-값 기반 오프라인 로컬 영속화 계층                                |
| **Cloud Client**     | `@supabase/supabase-js`                     | `^2.115.0` | 원격 동기화용 클라이언트 (기본 비활성화 상태)                       |
| **AI Integration**   | Google Gemini REST API                      | `v1beta`   | `gemini-3.5-flash-lite`, `gemini-3.8-flash` 등 REST/SSE 직접 연동   |
| **UI Components**    | `lucide-react-native`                       | `^1.42.0`  | 벡터 아이콘 세트                                                    |
|                      | `expo-linear-gradient`                      | `~57.0.1`  | 그라데이션 UI 효과                                                  |
|                      | `expo-haptics`                              | `~57.0.2`  | 터치 피드백 햅틱 진동                                               |
|                      | `react-native-safe-area-context`            | `~5.7.0`   | 기기별 노치 및 시스템 인셋 대응                                     |
|                      | `react-native-svg`                          | `15.15.4`  | SVG 렌더링 지원                                                     |
| **Dev & Testing**    | `tsx`                                       | `^4.23.13` | TypeScript 기반 CLI 스크립트 실행기                                 |
|                      | `@expo/ngrok`                               | `^4.1.3`   | 로컬 개발 터널링                                                    |

---

## 3. Application Entry Flow

앱 진입부터 화면 렌더링 및 퀴즈 세션 시작까지의 실제 흐름은 다음과 같습니다.

```
[index.ts] registerRootComponent(App)
   │
   ▼
[App.tsx] App Component -> <SafeAreaProvider> -> <AppShell />
   │
   ├─► [초기화 useEffect] (1회 실행)
   │     ├─ useSettingsStore.loadSettings()       # 다크모드, 햅틱 로드
   │     ├─ useUserStore.loadUserSettings()       # 목표 문제수(dailyTarget) 로드
   │     └─ QuestionRepository.loadCachedServerQuestions() # 저장소 캐시 로드 및 중복 스윕
   │
   ├─► [Android BackHandler 등록]
   │     ├─ mode === "QUIZ"   : 종료 확인 Alert ("계속 풀기" vs "홈으로 나가기")
   │     ├─ mode === "RESULT" : 홈 탭 복귀
   │     └─ mode === "TABS"   : 홈 외 탭이면 홈 복귀 / 홈 탭이면 2초 내 2회 클릭 시 앱 종료
   │
   └─► [화면 렌더링 (State Machine)]
         ├─ mode === "TABS"   -> BottomTabBar + currentTab 화면
         │     ├─ "home"        : HomeScreen (기본값)
         │     ├─ "theory"      : TheoryStudyScreen
         │     ├─ "wrong_note"  : WrongNoteScreen
         │     ├─ "statistics"  : StatisticsScreen
         │     └─ "settings"    : SettingsScreen
         ├─ mode === "QUIZ"   -> QuizScreen
         └─ mode === "RESULT" -> ResultScreen
```

### 상세 실행 단계 `[CONFIRMED]`

1. **진입점 (`index.ts`)**: Expo의 `registerRootComponent(App)`를 통해 엔트리 컴포넌트 구동.
2. **Provider 구조 (`App.tsx#34-40`)**: 별도의 복잡한 중첩 Provider 없이 최상위에 `<SafeAreaProvider>`를 두고 즉시 `<AppShell />`을 렌더링.
3. **네비게이션 구조 (`App.tsx#48-49`)**: 외부 네비게이션 라이브러리(React Navigation 등)를 사용하지 않고, React `useState` 기반의 자체 상태 머신으로 화면을 전환함.
   - `mode`: `"TABS"` | `"QUIZ"` | `"RESULT"`
   - `currentTab`: `"home"` | `"theory"` | `"wrong_note"` | `"statistics"` | `"settings"`

---

## 4. Architecture

프로젝트는 관심사 분리(Separation of Concerns) 원칙에 따라 5개 계층으로 구조화되어 있습니다.

```
┌────────────────────────────────────────────────────────┐
│                   Presentation Layer                   │
│  - Screens: Home, Quiz, Result, Theory, WrongNote,     │
│             Statistics, Settings                       │
│  - Components: common, code, quiz, theory, programming │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│                 State Management Layer                 │
│  - Zustand Stores: quizStore, settingsStore, userStore │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│                 Domain & Service Layer                 │
│  - ProgrammingEngine: 10 Local Generators, Selector,   │
│                       Taxonomy, Validator, Fingerprint │
│  - BackgroundQuestionService & MemoJobService          │
│  - Evaluation & Math: quiz, reviewQueue, statistics    │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│                    Repository Layer                    │
│  - QuestionRepository, AttemptRepository,              │
│    BookmarkRepository, TutorRepository                 │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│             Storage & Infrastructure Layer             │
│  - LocalStorage (AsyncStorageAdapter / MemoryStorage)  │
│  - GeminiService (REST / SSE Streaming)                │
│  - SupabaseClient (Cloud Sync)                         │
└────────────────────────────────────────────────────────┘
```

---

## 5. Directory Structure

```
정처기모바일앱/
├── assets/                     # 앱 아이콘 및 스플래시 이미지
├── scripts/                    # 검증용 CLI 스크립트 4종
│   ├── self-test.ts            # 기출 무결성, 채점 엔진, 복습 큐 자체 테스트
│   ├── programming-engine-test.ts # 10종 생성기, 지문 중복제거, 벤치마크 테스트
│   ├── gemini-service-test.ts  # 모델 폴백, 지수 백오프, 에러 마스킹 테스트
│   └── gemini-question-generator-test.ts # 암기 시드 생성, JSON 파서, 작업 복구 테스트
├── src/
│   ├── api/                    # 네트워크 및 외부 통신
│   │   ├── geminiService.ts    # Gemini REST API 클라이언트 및 SSE 스트리밍
│   │   ├── geminiQuestionGenerator.ts # AI 암기 문제 프롬프트 빌더 및 JSON 복구 파서
│   │   ├── programmingGenerator.ts    # 프로그래밍 문제 생성 퍼사드 함수
│   │   ├── questionSyncService.ts     # 클라우드/로컬 문제 동기화 서비스
│   │   ├── supabaseClient.ts   # Supabase 클라이언트 팩토리
│   │   └── supabaseConfig.ts   # Supabase 설정 저장소
│   ├── components/             # UI 컴포넌트
│   │   ├── code/               # CodeViewer (소스 코드 구문 강조 뷰어)
│   │   ├── common/             # Badge, Button, Card, Header, ProgressBar, BottomTabBar
│   │   ├── programming/        # ProgrammingAdminModal (엔진 진단 및 벤치마크 모달)
│   │   ├── quiz/               # AITutorModal (1:1 튜터 스트리밍 모달)
│   │   └── theory/             # TheoryCard, MnemonicCard (이론 및 두음 카드)
│   ├── data/                   # 정적 데이터 뱅크
│   │   ├── questions/          # 번들 문제 (총 82제)
│   │   │   ├── database.ts
│   │   │   ├── memorizationBank.ts
│   │   │   ├── network.ts
│   │   │   ├── programming.ts
│   │   │   ├── security.ts
│   │   │   ├── softwareEngineering.ts
│   │   │   └── index.ts
│   │   ├── theory/             # 이론 요약 (14건) 및 두음 암기장 (20건)
│   │   │   ├── theoryData.ts
│   │   │   └── mnemonicData.ts
│   │   └── memoTopicSeeds.ts   # Gemini 암기 문제용 주제 시드 70선
│   ├── repositories/           # 데이터 영속화 저장소
│   │   ├── attemptRepository.ts   # 퀴즈 풀이 이력 및 오답 집계
│   │   ├── bookmarkRepository.ts  # 북마크 토글 및 조회
│   │   ├── questionRepository.ts  # 정적/캐시 문제 통합 조회 및 중복 방지
│   │   └── tutorRepository.ts     # AI 튜터 대화 내역 영속화
│   ├── screens/                # 화면 컴포넌트 7종
│   │   ├── HomeScreen.tsx
│   │   ├── QuizScreen.tsx
│   │   ├── ResultScreen.tsx
│   │   ├── SettingsScreen.tsx
│   │   ├── StatisticsScreen.tsx
│   │   ├── TheoryStudyScreen.tsx
│   │   └── WrongNoteScreen.tsx
│   ├── services/               # 핵심 비즈니스 로직
│   │   ├── backgroundQuestionService.ts # 비동기 문제 생성 및 상태 관리
│   │   ├── memoJobService.ts            # 암기 생성 영속 작업 관리자
│   │   └── programming/                 # 로컬 프로그래밍 문제 자동 생성 엔진
│   │       ├── diagnostics.ts
│   │       ├── fingerprint.ts
│   │       ├── geminiProgrammingGenerator.ts
│   │       ├── historyTracker.ts
│   │       ├── programmingEngine.ts
│   │       ├── registry.ts
│   │       ├── selector.ts
│   │       ├── taxonomy.ts
│   │       ├── types.ts
│   │       ├── validation.ts
│   │       └── generators/              # 10종 독립 생성기
│   ├── storage/                # AsyncStorage 래퍼 및 큐
│   │   ├── localStorage.ts
│   │   └── syncQueue.ts
│   ├── store/                  # Zustand 상태 저장소
│   │   ├── quizStore.ts
│   │   ├── settingsStore.ts
│   │   └── userStore.ts
│   ├── types/                  # TypeScript 인터페이스
│   │   ├── attempt.ts
│   │   ├── bookmark.ts
│   │   ├── generationJob.ts
│   │   ├── question.ts
│   │   ├── statistics.ts
│   │   ├── theory.ts
│   │   └── user.ts
│   └── utils/                  # 계산 및 유틸리티
│       ├── haptics.ts
│       ├── keyboardLayout.ts
│       ├── keyboardOverlap.ts
│       ├── quiz.ts             # 스마트 채점 및 동의어/레벤슈타인
│       ├── reviewQueue.ts      # 에빙하우스 망각곡선 복습 큐
│       ├── statistics.ts       # 통계 계산
│       ├── textFormatter.ts    # 마크다운 불릿/볼드 포매터
│       └── theme.ts            # 컬러 팔레트
├── app.json
├── package.json
└── tsconfig.json
```

---

## 6. Data Models

코드베이스에 정의된 실제 인터페이스와 데이터 이동 경로 분석표입니다.

| 데이터 구조명                  | 코드상 위치                             | 역할                            | 생성 위치                                     | 저장/캐싱 위치                          | 읽는 위치                                 |
| ------------------------------ | --------------------------------------- | ------------------------------- | --------------------------------------------- | --------------------------------------- | ----------------------------------------- |
| `Question`                     | `src/types/question.ts`                 | 기출/생성 문제 표현 핵심 모델   | 번들 데이터, 생성기, Gemini                   | 번들 메모리, `@cached_server_questions` | `QuestionRepository`, `QuizScreen`        |
| `QuizAttempt`                  | `src/types/attempt.ts`                  | 1회 풀이 시도 이력              | `useQuizStore.submitAnswer`                   | `@quiz_attempts` (AsyncStorage)         | `AttemptRepository`, `StatisticsScreen`   |
| `WrongQuestionSummary`         | `src/repositories/attemptRepository.ts` | 문제별 누적 오답 통계 집계      | `AttemptRepository.getWrongQuestionSummaries` | 런타임 계산 (비영속)                    | `WrongNoteScreen`, `HomeScreen`           |
| `Bookmark`                     | `src/types/bookmark.ts`                 | 문제 즐겨찾기                   | `BookmarkRepository.toggle`                   | `@bookmarks` (AsyncStorage)             | `WrongNoteScreen`, `QuizScreen`           |
| `TutorThread`                  | `src/repositories/tutorRepository.ts`   | 문제별 AI 튜터 대화 세션        | `AITutorModalBody`                            | `@tutor_threads` (AsyncStorage)         | `AITutorModal`, `WrongNoteScreen`         |
| `UserStats`                    | `src/types/statistics.ts`               | 학습 통계 및 스트릭 지표        | `calculateUserStats()`                        | 런타임 계산 (비영속)                    | `HomeScreen`, `StatisticsScreen`          |
| `TheoryArticle`                | `src/types/theory.ts`                   | 과목별 핵심 이론 요약           | `theoryData.ts` (정적)                        | 정적 번들 메모리                        | `TheoryStudyScreen`                       |
| `MnemonicItem`                 | `src/types/theory.ts`                   | 1초 두음 암기법 카드            | `mnemonicData.ts` (정적)                      | 정적 번들 메모리                        | `TheoryStudyScreen`                       |
| `GeneratedProgrammingQuestion` | `src/services/programming/types.ts`     | 생성된 프로그래밍 문제          | 10종 Generator, Gemini                        | `@cached_server_questions`              | `ProgrammingEngine`, `QuestionRepository` |
| `MemoGenerationJob`            | `src/types/generationJob.ts`            | AI 암기 생성 다중배치 작업 상태 | `BackgroundQuestionService`                   | `@memo_generation_active_job`           | `MemoJobService`                          |

### 문제 데이터 이동 생명주기 (Data Lifecycle) `[CONFIRMED]`

1. **정적 문제**: `src/data/questions/*.ts`에 선언 -> `ALL_QUESTIONS`로 취합 -> 앱 실행 시 `QuestionRepository.getAll()`에서 참조.
2. **동적 생성 문제 (프로그래밍 / Gemini)**: 생성 엔진 실행 -> `QuestionValidator` 또는 `sanitizeQuestion` 통과 -> `QuestionRepository.appendCachedQuestions()`를 통해 중복 검사 -> `@cached_server_questions`에 JSON 직렬화 저장 -> `QuestionRepository.cachedServerQuestions` 메모리 배열에 병합 -> `QuestionRepository.getAll()`에 포함되어 정적 문제와 동일하게 출제됨.

---

## 7. Question System

### 1) 문제 총량 및 구성 `[CONFIRMED]`

- **정적 번들 문제 (`ALL_QUESTIONS`)**: 총 **82문제**
  - `소프트웨어설계`: 17문제
  - `데이터베이스구축`: 17문제
  - `프로그래밍언어활용`: 16문제
  - `정보시스템구축관리`: 14문제
  - `신기술/보안`: 18문제
  - 이 중 순수 단답형 실기 암기 뱅크(`memorizationBank.ts`) 56문제 포함.
- **동적 캐시 문제 (`cachedServerQuestions`)**: 사용자가 생성 버튼을 눌러 추가된 프로그래밍 변형 문제 및 Gemini AI 생성 문제.

### 2) 중복 방지 시스템 (`questionRepository.ts`) `[CONFIRMED]`

- **일반 문제 중복 판정 키 (`generalQuestionStem`)**:
  - `${question.subject}:${question.question.replace(/\s+/g, '').toUpperCase()}`
  - 공백을 제거하고 대문자로 치환한 지문 텍스트와 과목명의 조합으로 중복 판정.
- **프로그래밍 문제 중복 판정 키 (`programmingQuestionKey`)**:
  - 구조 지문(`structuralFingerprint`)이 있으면 `fp:${structuralFingerprint}`를 우선 사용.
  - 구조 지문이 없는 경우 `code:${language}:${type}:${code.replace(/\s+/g, '')}`로 소스 코드 본문 공백 제거 후 판정.
- **중복 정리 (`sweepCachedDuplicates`)**:
  - 앱 번들 정적 문제(82제)는 항상 원본으로 보존.
  - 캐시(`cachedServerQuestions`)에 존재하는 문제 중 번들 문제와 키가 겹치거나 캐시 내부에서 먼저 등장한 항목과 중복되는 항목의 `id`만 골라 무경고 제거(`pickDuplicateCachedIds`).

### 3) 문제 선택 알고리즘 `[CONFIRMED]`

- **지하철 5분 퀵 퀴즈 (`getQuickQuizQuestions`)**:
  - 최근 오답에서 최대 40% (2문제) 추출
  - 정답률 70% 미만 취약 단원에서 최대 30% (1~2문제) 추출
  - 나머지 수량을 전체 문제 풀에서 랜덤 셔플하여 총 5문제 구성
- **안 푼 문제 10선 퀵 퀴즈 (`getUnsolvedQuestions`)**:
  - `AttemptRepository.getAttemptedQuestionIds()`에 포함되지 않은 문제만 필터링하여 무작위 10문제 추출
- **이론 연계 퀴즈 (`getTheoryRelatedQuestions`)**:
  - 이론 카드에 정의된 키워드(`relatedKeywords`)를 지문, 단원, 해설에서 검색(대소문자 무시)하여 매칭. 매칭 수가 부족하면 같은 과목의 다른 문제를 셔플하여 보충.

---

## 8. Question Types

| 문제 유형     | `type` 값         | 데이터 특성                                 | 입력 UI           | 채점 방식                                   |
| ------------- | ----------------- | ------------------------------------------- | ----------------- | ------------------------------------------- |
| **단답형**    | `SHORT_ANSWER`    | 지문 + 정답(단일/복수)                      | `TextInput`       | 정규화 + 동의어 사전 + 레벤슈타인 거리 판정 |
| **객관식**    | `MULTIPLE_CHOICE` | 지문 + 보기 4개(`options`) + 정답           | 4지선다 카드 터치 | 선택한 보기 문자열과 정답의 일치 검사       |
| **코드 추적** | `CODE_TRACE`      | 지문 + 소스 코드(`code`) + 언어(`language`) | `TextInput`       | 코드 실행 결과 출력값 문자열 정규화 비교    |
| **SQL 실기**  | `SQL`             | 쿼리 지문 + SQL 코드/빈칸                   | `TextInput`       | 정규화된 SQL 예약어/절 동의어 비교          |

- **부분 점수 존재 여부**: `[CONFIRMED]` **부분 점수 없음**. `isCorrect`는 항상 `true` 또는 `false`의 불리언 값으로만 기록됨.
- **복수 정답 처리**: 문제 데이터의 `answer`가 배열(`string[]`)인 경우, 사용자의 입력이 배열 내 원소 중 하나와 일치하면 정답으로 판정.
- **특수 모드**: "모름" 제출 시 답안 입력을 무시하고 `selectedAnswer: "(모름)"`, `isCorrect: false`, `missType: "UNKNOWN"`으로 강제 기록.

---

## 9. Answer Evaluation

채점 로직은 `src/utils/quiz.ts`에 독립된 순수 함수들로 구현되어 있습니다.

### 1) 문자열 정규화 (`normalizeAnswer`) `[CONFIRMED]`

```typescript
export function normalizeAnswer(ans: string): string {
  return ans
    .trim()
    .replace(/[()[\]{}.,·\-_/'":;]/g, "")
    .replace(/\s+/g, "")
    .toUpperCase();
}
```

- 모든 괄호(`()`, `[]`, `{}`), 구두점(`.`, `,`, `·`, `_`, `-`, `/`, `'`, `"`, `:`, `;`) 완전 제거.
- 문자열 내부의 모든 공백 제거.
- 영문은 모두 대문자(Uppercase)로 변환.

### 2) 등록된 동의어 그룹 (`SYNONYM_GROUPS`) `[CONFIRMED]`

총 30개 이상의 핵심 기술 키워드 군집이 등록되어 상호 정답으로 인정됩니다:

- SQL 절: `["GROUPBY", "그룹바이", "그룹별"]`, `["SELECT", "셀렉트", "셀렉"]`, `["INSERT", "인서트"]`, `["UPDATE", "업데이트", "갱신"]`, `["DELETE", "딜리트", "삭제"]`, `["HAVING", "해빙"]`, `["ORDERBY", "오더바이", "정렬"]`
- 키/제약조건: `["PRIMARYKEY", "PK", "기본키", "프라이머리키"]`, `["FOREIGNKEY", "FK", "외래키"]`, `["CANDIDATEKEY", "후보키"]`
- 디자인 패턴: `["SINGLETON", "싱글톤", "싱글톤패턴"]`, `["OBSERVER", "옵서버", "옵저버", "옵서버패턴"]`, `["STRATEGY", "전략", "전략패턴"]`, `["ADAPTER", "어댑터", "어댑터패턴"]`, `["FACTORYMETHOD", "팩토리메서드", "팩토리메소드"]`
- UML/다이어그램: `["SEQUENCE", "시퀀스", "시퀀스다이어그램", "순차다이어그램"]`, `["USECASE", "유스케이스", "유스케이스다이어그램"]`
- 트랜잭션/DB: `["DEADLOCK", "교착상태", "데드락"]`, `["ATOMICITY", "원자성"]`, `["CONSISTENCY", "일관성"]`, `["ISOLATION", "고립성", "격리성"]`, `["DURABILITY", "지속성", "영속성"]`, `["INTEGRITY", "무결성", "완전성"]`, `["INNERJOIN", "내부조인", "이너조인", "EQUIJOIN", "등가조인"]`, `["INDEX", "인덱스", "색인"]`, `["VIEW", "뷰"]`, `["TRANSACTION", "트랜잭션"]`, `["NORMALIZATION", "정규화"]`
- 보안: `["XSS", "크로스사이트스크립팅"]`, `["CSRF", "XSRF"]`, `["SQLINJECTION", "SQL인젝션", "SQLI"]`

### 3) 오탈자 구제 (Fuzzy Matching with Levenshtein Distance) `[CONFIRMED]`

- `isFuzzyMatch(left, right)` 규칙:
  - 최소 글자 수: **3글자 이상** (`minLen < 3`인 경우 오탈자 불인정. 예: 숫자 `"3"`과 `"2"`는 오탈자 구제 대상 제외)
  - 길이 차이: 두 단어의 길이 차이가 1 이하일 때만 판정.
  - 레벤슈타인 편집 거리(Levenshtein Distance): **1 이하**만 정답 인정.

### 4) 실제 채점 예시 `[CONFIRMED]`

1. 정답이 `"GROUP BY"`일 때 사용자가 `" 그룹 바이 "` 입력 -> 정규화 후 동의어 일치로 **정답 (TRUE)**.
2. 정답이 `"Primary Key"`일 때 사용자가 `"기본키"` 또는 `"pk"` 입력 -> 동의어 일치로 **정답 (TRUE)**.
3. 정답이 `"싱글톤패턴"`일 때 사용자가 `"싱글톤패틴"` 입력 -> 길이 5, 편집거리 1로 **정답 (TRUE)**.
4. 정답이 `"2"`일 때 사용자가 `"3"` 입력 -> 글자 수 1(<3)이므로 퍼지 매칭 적용 안 되어 **오답 (FALSE)**.
5. 복수 정답 `["SHA-256", "SHA256"]`일 때 사용자가 `"sha 256"` 입력 -> 정규화 후 일치로 **정답 (TRUE)**.

---

## 10. Programming Question Generator

오프라인 상태에서 C, Java, Python 프로그래밍 문제를 무한 변형 생성하는 독립 엔진(`src/services/programming/`)의 구조입니다.

### 1) 10종 독립 생성기 목록 `[CONFIRMED]`

1. `ArrayTraceGenerator`: 1차원/2차원 배열 순회 및 누적 합/변환 추적
2. `BlankCompletionGenerator`: 특정 연산 결과를 내기 위한 소스 코드 빈칸(`[ 빈칸 ]`) 채우기
3. `BugFindingGenerator`: 배열 인덱스 초과(UB), 루프 탈출 조건 오류 등 코드 내 버그 찾기
4. `FunctionReturnGenerator`: 함수 호출, 매개변수 전달(Call by Value), 반환값 계산
5. `LoopOutputGenerator`: for/while/do-while 단일 루프, break/continue, 교차 부호(ALTERNATE) 출력
6. `NestedLoopGenerator`: 이중 중첩 for 문 및 2차원 매트릭스 패턴 출력
7. `PointerResultGenerator`: C 언어 포인터 연산, 주소 참조, 배열 포인터 조작 (C 전용)
8. `RecursiveCallGenerator`: 팩토리얼, 피보나치, 거듭제곱 재귀 호출 스택 추적
9. `StringOperationGenerator`: 문자열 길이, 뒤집기, 슬라이싱, 포인터 이동 연산
10. `StructClassGenerator`: C 구조체 포인터, Java 클래스 상속 및 다형성(오버라이딩), 정적(static) 변수

### 2) 구조 지문 (Structural Fingerprint) `[CONFIRMED]`

- 형식: `LANGUAGE|TOPIC|QUESTION_TYPE|CONTROL_STRUCT|OPERATION|DATA_STRUCT|FLOW_CTRL|DIFFICULTY`
  (예: `C|POINTER_REFERENCE|CODE_OUTPUT|SEQUENTIAL|POINTER_ARITHMETIC|POINTER|NONE|MEDIUM`)
- **유사도 분석 (`StructuralFingerprintService.calculateSimilarity`)**:
  주제(0.30), 문제유형(0.20), 제어구조(0.20), 언어(0.10), 주요연산(0.10), 자료구조(0.05), 흐름제어(0.05)의 가중합으로 0.0~1.0 산출.
  최근 출제된 3문제와 유사도가 0.70 이상이면 과도한 유사 문제로 판정하여 버리고 재생성 시도.

### 3) 조건 완화 정책 (Relaxation Policy) `[CONFIRMED]`

요청 조건에 정확히 부합하는 생성기가 없을 경우 탐색 완화 순서:
1단계(모든 조건) -> 2단계(난이도 완화) -> 3단계(유형 완화) -> 4단계(주제 완화).  
**단, 요청 언어(`language`)는 수험생의 명시적 선택이므로 절대 임의로 완화하거나 변경하지 않음.**

### 4) 문제 "생성"과 "검증"의 명확한 분리 `[CONFIRMED]`

- **생성 단계 (`BaseGenerator.finalizeQuestion`)**: 템플릿과 결정론적 의사난수(SplitMix32 + XorShift32) 연산을 통해 코드 문자열, 정답, 해설을 조합.
- **검증 단계 (`QuestionValidator.validate`)**: 독립된 정적 유효성 검사기가 생성된 문제를 검사:
  1. 필수 필드 누락 검사
  2. 코드 길이 적정성 검사 (실기 시험지 규격에 맞춰 **3행 이상 45행 이하**)
  3. 보안 위험 패턴 검사 (`system`, `popen`, `exec`, `eval`, `subprocess`, `Runtime.getRuntime`, `ProcessBuilder`, `File`, `Socket`, `import os` 등 악성 코드 차단)
  4. 괄호 쌍(`{}`, `()`, `[]`) 밸런스 스택 검사
  5. 무한 루프 가능성 휴리스틱 검사 (`while(1)` 내 `break`/`return` 누락 여부)
  6. 해설 내 정답 문자열 포함 여부 검사 (미포함 시 `manualReviewRequired` 마킹)
  - 검증 탈락(`rejected`) 시 최대 8회까지 다른 생성기로 재시도하며 해당 생성기에 실패 페널티를 부여함.

---

## 11. Gemini Integration

### 1) 사용 모델 및 역할 분리 `[CONFIRMED]`

- **AI 튜터 (`TUTOR_MODELS`)**: 초고속 응답을 위해 `gemini-3.5-flash-lite` 1순위 배치.  
  우선순위: `gemini-3.5-flash-lite` -> `gemini-3.5-flash` -> `gemini-3.8-flash`.
- **문제 생성기 (`GENERATOR_MODELS`)**: 지문의 완성도와 동의어 채점 범위를 위해 고정밀 `gemini-3.8-flash` 1순위 배치.  
  우선순위: `gemini-3.8-flash` -> `gemini-3.5-flash`.
- **지원 종료 모델 차단**: `gemini-1.5`, `gemini-2.0`, `gemini-2.5` 계열은 정규식(`DISCONTINUED_MODEL_REGEX`)으로 완전히 배제됨.

### 2) 재시도 및 오류 분류 체계 `[CONFIRMED]`

- **일시적 오류 (`TRANSIENT_STATUSES`)**: 408, 429, 500, 502, 503, 504.
  - 최대 3회 재시도 (`MAX_RETRIES_PER_MODEL = 3`).
  - 지수 백오프: `1000 * 2^(attempt-1) + jitter(0~300ms)` (약 1초 -> 2초 -> 4초).
- **영구 인증 오류 (`isTerminalAuthStatus`)**: 400, 401, 403.
  - 재시도 없이 즉시 중단하고 사용자에게 API Key 재확인 안내.
- **오류 로깅 보안**: 콘솔 출력 전 API Key와 `AIzaSy...`, `AQ....` 패턴을 `[REDACTED_API_KEY]`로 자동 마스킹.

### 3) 1:1 실시간 AI 튜터 (`askTutorStream`) `[CONFIRMED]`

- **통신 방식**: React Native 환경 제약으로 인해 `XMLHttpRequest.onprogress`를 이용한 직접 SSE 스트리밍 구현.
- **사고 과정 필터링**: 모델이 반환하는 `candidates[0].content.parts` 중 내부 추론 토큰(`part.thought === true`)은 필터링하여 사용자에게 숨김.
- **모드별 프롬프트 분기**:
  - `missType === "UNKNOWN"` ("모름"): 오답 핀잔을 배제하고 교재 단원 챕터를 펼치듯 6단계 표준 해설 구조(단원 위치 -> 필수 개념 -> 연관 용어 -> 빈출 포인트 -> 단원 맥락 풀이 -> 1초 암기 포인트)로 강제 지시.
  - 일반/오답: 수험생 답안과 정답의 논리적 차이를 단계별로 설명.
- **대화 이력 영속화**: 질문과 답변이 완료되면 `TutorRepository.saveThread`를 통해 `@tutor_threads`에 저장되어 오답노트에서 재열람 가능.

### 4) AI 암기 문제 생성 구조 `[CONFIRMED]`

- **생성 단위**: **7문제 × 2묶음 = 총 14문제** (`MEMO_BATCH_SIZE = 7`, `MEMO_BATCH_COUNT = 2`).
- **주제 시드**: `src/data/memoTopicSeeds.ts`에 정의된 70개 핵심 실기 토픽 중 기출/보유 문제와 겹치지 않는 시드를 우선 선별.
- **프롬프트 제약**: C/Java/Python 코드 문제는 절대 출제하지 않도록 명시하고, JSON 스키마(`MEMO_RESPONSE_SCHEMA`)를 전달.

---

## 12. AI Generated Question Validation

AI가 생성한 데이터의 안정성을 보장하기 위한 다단계 검증 파이프라인 분석입니다.

````
[Gemini API 원시 응답]
        │
        ▼
[1단계: extractJsonCandidate]      # 마크다운 코드블록(```json) 및 잘린 접두사 제거
        │
        ▼
[2단계: sanitizeJsonStringLiterals] # 따옴표 내부의 이스케이프 안 된 개행(\n), \r, \t 치환
        │
        ▼
[3단계: tryRepairTruncatedJson]    # 문자열 외부의 '}' 위치를 역추적하여 잘린 배열/객체 닫기 복구
        │
        ▼
[4단계: sanitizeQuestion 스키마 검증]
        ├─ 지문 길이 >= 5자
        ├─ 해설 길이 >= 5자
        ├─ 유효한 정답 문자열 존재
        └─ 객관식일 경우 options 개수 >= 4개
        │
        ▼
[5단계: 배치 최소 임계치 검증]
        └─ 유효 문항 수가 4개(MEMO_MIN_ACCEPTABLE_BATCH_QUESTIONS) 미만이면
           깨진 배치로 간주하고 전체 폐기 및 재시도 유도
        │
        ▼
[6단계: QuestionRepository 중복 검사]
        └─ 기존 지문과 stem 동일 시 저장 거절
````

### 발견된 잠재적 위험 요소 `[CONFIRMED]`

1. **기술적 사실 검증(Fact-checking)의 부재**: JSON 스키마, 필드 길이, 문자열 형식은 엄격히 검증하지만, AI가 생성한 이론 내용(예: 특정 암호화 알고리즘의 블록 크기 등)이 **실제 기사 시험 기준에 맞는지 의미론적으로 검증하는 엔진은 없음**.
2. **동의어 누락 가능성**: AI가 `answer` 배열에 대표 정답만 적고 동의어를 적게 반환한 경우, 수험생이 정답 취지의 다른 단어를 적었을 때 오답 처리될 수 있음.

---

## 13. Persistence

앱에서 사용하는 모든 영속 데이터와 AsyncStorage 키 매핑 현황입니다.

| 저장소 키 (`STORAGE_KEYS`)        | 실제 스토리지 키 문자열            | 저장 데이터 타입                  | 영속화 시점                   |
| --------------------------------- | ---------------------------------- | --------------------------------- | ----------------------------- |
| `QUIZ_ATTEMPTS`                   | `@quiz_attempts`                   | `QuizAttempt[]`                   | 문제 제출 시 즉시 (`unshift`) |
| `BOOKMARKS`                       | `@bookmarks`                       | `Bookmark[]`                      | 북마크 아이콘 클릭 시 즉시    |
| `SETTINGS`                        | `@settings`                        | `{ isDarkMode, isHapticEnabled }` | 스위치 토글 시 즉시           |
| `DAILY_LEARNING`                  | `@daily_learning`                  | `{ dailyTarget }`                 | 목표 문제수 설정 시 즉시      |
| `CACHED_SERVER_QUESTIONS`         | `@cached_server_questions`         | `Question[]`                      | 배치 문제 생성 성공 시 즉시   |
| `OFFLINE_SYNC_QUEUE`              | `@offline_sync_queue`              | `SyncQueueItem[]`                 | 오프라인 시도 발생 시         |
| `TUTOR_THREADS`                   | `@tutor_threads`                   | `Record<string, TutorThread>`     | AI 튜터 응답 수신 완료 시     |
| `PROGRAMMING_RECENT_FINGERPRINTS` | `@programming_recent_fingerprints` | `string[]`                        | 프로그래밍 문제 출제 시       |
| `PROGRAMMING_RECENT_TOPICS`       | `@programming_recent_topics`       | `ProgrammingTopic[]`              | 프로그래밍 문제 출제 시       |
| `MEMO_GENERATION_ACTIVE_JOB`      | `@memo_generation_active_job`      | `MemoGenerationJob`               | 암기 생성 배치 시작/완료 시   |
| (Gemini Key)                      | `@gemini_api_key`                  | `string`                          | 설정 화면에서 API Key 저장 시 |

- **스토리지 구현**: `@react-native-async-storage/async-storage`를 직접 쓰지 않고 `LocalStorage` 퍼사드 클래스를 거치며, 테스트 환경(Node.js)에서는 `MemoryStorageAdapter`로 자동 분기됨.
- **RDBMS / SQLite 부재**: 관계형 데이터베이스를 사용하지 않으며, 모든 배열 데이터를 통째로 JSON 직렬화하여 저장하고 읽어옴.

---

## 14. Cache

- **인메모리 정적 캐시**: `ALL_QUESTIONS` (82문제)는 앱 번들링 시 정적으로 메모리에 상주.
- **동적 문제 캐시 (`QuestionRepository.cachedServerQuestions`)**:
  - 앱 구동 시 `loadCachedServerQuestions()`가 호출되어 AsyncStorage의 `@cached_server_questions`를 메모리 배열로 로드.
  - 이후 `QuestionRepository.getAll()` 호출 시마다 두 배열을 결합(`[...ALL_QUESTIONS, ...cachedServerQuestions]`)하고 Set 기반으로 `id` 중복을 제거하여 반환.
- **캐시 정리 메커니즘 (`sweepCachedDuplicates`)**:
  - 정적 문제와 동일한 지문/코드를 가진 캐시 문항을 백그라운드에서 감지하여 메모리와 스토리지에서 자동 삭제.

---

## 15. Wrong Answer System

- **오답의 정의**: 사용자가 문제를 풀었을 때 정답과 불일치한 경우(`isCorrect === false`).
- **오답의 세부 분류 (`missType`) `[CONFIRMED]`**:
  - `"WRONG"` (헷갈림): 사용자가 답을 직접 입력했으나 오답으로 판정된 경우.
  - `"UNKNOWN"` (모름): 문제를 몰라서 '모름' 버튼을 눌러 제출한 경우 (`selectedAnswer: "(모름)"`).
- **오답노트의 동작 원리**:
  - 오답노트는 별도의 독립 테이블이 아니라 `AttemptRepository.getAllAttempts()`를 전수 스캔하여 `Map<questionId, WrongQuestionSummary>`로 실시간 집계함.
  - **오답 문제의 삭제/제거 여부 `[CONFIRMED]`**: 오답노트에서 특정 문제가 영구 삭제되는 기능은 없음. 과거에 한 번이라도 틀린 적이 있다면(`wrongAttempts > 0 || unknownAttempts > 0`) 오답 집계 대상에 영구 포함됨.
  - 단, `RECENT` 필터는 **가장 최근에 푼 결과가 오답인 문제(`lastAttemptIsWrong === true`)만 필터링**하므로, 사용자가 다시 풀어서 맞히면 '최근 오답' 목록에서는 사라짐.
  - `AttemptRepository.clearAll()`을 실행할 경우에만 모든 풀이 이력이 통째로 초기화됨.

---

## 16. Review Queue

- **구현 성격 `[CONFIRMED]`**: 복습 큐는 **스토리지에 저장되는 별도 테이블이 아님**. 풀이 이력(`QuizAttempt[]`)을 바탕으로 `src/utils/reviewQueue.ts`에서 동적으로 계산되는 파생 뷰(Projection)임.
- **에빙하우스 망각곡선 기반 복습 주기 계산식 (`isDueForReview`)**:
  - 최근 시도가 `isCorrect === true` (정답): **3일 뒤** 복습 대상 (`CORRECT_INTERVAL_DAYS = 3`)
  - 최근 시도가 `missType === "WRONG"` (헷갈림): **1일 뒤** 복습 대상 (`CONFUSED_INTERVAL_DAYS = 1`)
  - 최근 시도가 `missType === "UNKNOWN"` (모름): **당일 즉시(0일)** 복습 대상 (`UNKNOWN_INTERVAL_DAYS = 0`)
- **우선순위 정렬**:
  당일 복습 대상 문제 중 `UNKNOWN`(모름, 우선순위 0) -> `WRONG`(헷갈림, 우선순위 1) -> `CORRECT`(정답, 우선순위 2) 순으로 정렬되어 상위 N문제(기본 10개)가 추출됨.

---

## 17. Statistics

- **계산 함수**: `calculateUserStats(attempts: QuizAttempt[])` (`src/utils/statistics.ts`)
- **측정 지표 목록 `[CONFIRMED]`**:
  1. `totalAttempts`: 총 시도 횟수
  2. `correctAttempts`: 총 정답 횟수
  3. `accuracyRate`: 평균 정답률 (`Math.round((correct / total) * 100)`)
  4. `streakDays`: 연속 학습 일수 (오늘 또는 어제부터 과거로 거슬러 올라가며 하루 1회 이상 풀이가 지속된 일수)
  5. `todaySolvedCount`: 오늘 자정(00:00:00) 이후 푼 문제 수
  6. `subjectStats`: 과목별 풀이 수, 정답 수, 정답률 (%)
  7. `categoryStats`: 단원별 풀이 수, 정답 수, 정답률 (%)
  8. `weakCategories`: **최소 2문제 이상 풀었고 정답률이 70% 미만인 취약 단원 목록** (정답률 오름차순 정렬)
  9. `last7DaysStats`: 최근 7일간의 날짜별 풀이 수 및 정답 수 배열 (차트 렌더링용)
- **통계 갱신 시점**:
  문제를 제출할 때마다 `useQuizStore`가 로컬에 `saveAttempt`를 수행하며, `HomeScreen` 또는 `StatisticsScreen`으로 돌아오거나 화면을 아래로 당겨 새로고침(Pull-to-Refresh)할 때 `calculateUserStats()`를 재실행하여 실시간 반영됨.

---

## 18. Screens and Navigation

### 1) 화면 목록 및 역할 `[CONFIRMED]`

- `HomeScreen` (`src/screens/HomeScreen.tsx`): 학습 대시보드. 스트릭, 목표 진행도, 5분 퀵 퀴즈, 안 푼 문제 10선, 과목별 카드, 문제 생성 버튼.
- `QuizScreen` (`src/screens/QuizScreen.tsx`): 실제 문제 풀이 화면. 진행 프로그레스, 코드 뷰어, 보기/입력창, 모름(20초 락) 버튼, 채점 결과 카드, AI 튜터 호출 버튼.
- `ResultScreen` (`src/screens/ResultScreen.tsx`): 퀴즈 완료 후 성적 요약(정답/헷갈림/모름 개수, 백분율) 및 문제별 풀이 현황, 재도전/홈/오답노트 이동.
- `TheoryStudyScreen` (`src/screens/TheoryStudyScreen.tsx`): 핵심 이론 요약 14선 및 1초 두음 암기장 20선 탭 뷰, 과목 필터 및 검색, 연계 퀴즈 풀기.
- `WrongNoteScreen` (`src/screens/WrongNoteScreen.tsx`): 오답노트 & 북마크. 필터 탭(전체, 최근, 많이틀림, 모름, 북마크), 전체/개별 다시 풀기, 튜터 이력 확인.
- `StatisticsScreen` (`src/screens/StatisticsScreen.tsx`): 학습 통계. 풀이수/정답률 KPI, 최근 7일 바 차트, 과목별 정답률 프로그레스 바.
- `SettingsScreen` (`src/screens/SettingsScreen.tsx`): 다크모드/햅틱 스위치, 일일 학습 목표 슬라이더, Gemini API Key 등록/테스트, 데이터 초기화, 프로그래밍 관리자 모달.

### 2) 모달 컴포넌트 `[CONFIRMED]`

- `AITutorModal` (`src/components/quiz/AITutorModal.tsx`): 풀이 화면 및 오답노트에서 열리는 1:1 Gemini 실시간 채팅 창. 키보드 오버랩 회피 레이아웃 내장.
- `ProgrammingAdminModal` (`src/components/programming/ProgrammingAdminModal.tsx`): 10종 생성기별 성능 벤치마크 및 지문 진단 모달.

---

## 19. Test Structure

| 테스트 명령어              | 실행 스크립트                                                                   | 주요 검증 대상                                                                               | 한계 및 검증하지 않는 영역 `[CONFIRMED]`                               |
| -------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `npm run typecheck`        | `tsc --noEmit`                                                                  | 전체 TypeScript 타입 정적 검사                                                               | 런타임 예외 검증 불가                                                  |
| `npm test`                 | `scripts/self-test.ts`                                                          | 정적 82문제 무결성, 채점 동의어/퍼지 매칭, 망각곡선 복습 큐, 이론 연계 검색                  | 실제 화면 UI 인터랙션 미포함                                           |
| `npm run test:programming` | `scripts/programming-engine-test.ts`                                            | 10종 생성기 유효성, Loop 무한루프 회피, C 포인터/빈칸 무결성, 레지스트리 완화, 캐시 중복제거 | 실제 GCC/Java 컴파일러 실행 아님 (정적 휴리스틱)                       |
| `npm run test:gemini`      | `scripts/gemini-service-test.ts`<br>`scripts/gemini-question-generator-test.ts` | 모델 폴백, 재시도 백오프, 에러 마스킹, JSON 파서 절단 복구, 영속 작업 복구                   | **AI 응답 내용의 실제 정처기 출제기준 사실 적합성 미검증** (Mock 기반) |

---

## 20. Error Handling

1. **Gemini API 예외 처리**:
   - `fetch` / `XMLHttpRequest` 레벨에서 408/429/500/502/503/504 발생 시 자동 지수 백오프 후 차순위 모델로 폴백.
   - 통신 도중 사용자 모달 닫기 시 `AbortController.abort()`로 네트워크 요청 즉시 중단.
2. **JSON 파싱 및 복구 처리 (`parseJsonPayload`)**:
   - 닫는 백틱 누락 복구, 문자열 내부 개행 이스케이프 정규화, 토큰 손상 없는 구조적 `}` 역추적 복구.
3. **앱 종료 및 작업 유실 방지 (`MemoJobService`)**:
   - 다중 배치 생성 중 앱이 강제 종료되어도 재실행 시 `@memo_generation_active_job`을 읽고 `QuestionRepository`의 실제 저장 데이터와 교차 검증(`crossValidateJobWithRepository`)하여 미완료 배치만 이어받음.

---

## 21. Important Dependencies

```json
{
  "dependencies": {
    "@react-native-async-storage/async-storage": "2.2.0",
    "@supabase/supabase-js": "^2.115.0",
    "expo": "~57.0.20",
    "expo-haptics": "~57.0.2",
    "expo-linear-gradient": "~57.0.1",
    "expo-status-bar": "~57.0.1",
    "lucide-react-native": "^1.42.0",
    "react": "19.2.3",
    "react-native": "0.86.3",
    "react-native-safe-area-context": "~5.7.0",
    "react-native-svg": "15.15.4",
    "zustand": "^5.0.15"
  }
}
```

---

## 22. Data Lifecycle

```
[Question Lifecycle]
Static Files (src/data/) ──┐
                           ├─► QuestionRepository.getAll() ─► useQuizStore ─► QuizScreen
Generators / Gemini API ───┴─► @cached_server_questions ───┘

[Attempt & Review Lifecycle]
QuizScreen Answer Submit ──► useQuizStore.submitAnswer()
                                  │
                                  ├─► QuizAttempt 생성
                                  │
                                  ▼
                     AttemptRepository.saveAttempt()
                                  │
                                  ▼
                     @quiz_attempts (AsyncStorage)
                                  │
                 ┌────────────────┴────────────────┐
                 ▼                                 ▼
   AttemptRepository.getWrongSummaries()   reviewQueue.getDueReviewQuestionIds()
                 │                                 │
                 ▼                                 ▼
         WrongNoteScreen                     HomeScreen (오늘 복습)
```

---

## 23. Critical Code Paths

### Path A — 일반 문제 풀이 `[CONFIRMED]`

```text
1. 사용자 문제 시작
   HomeScreen.tsx : handleStartSubjectQuiz() / handleStartQuickQuiz()
2. 문제 선택 및 셔플
   QuestionRepository.ts : getBySubject() / getQuickQuizQuestions() / shuffle()
3. 퀴즈 세션 시작
   App.tsx : handleStartQuiz(questions, title)
   quizStore.ts : startQuiz(questions, title) -> state.currentIndex = 0, state.sessionAttempts = []
4. 문제 표시
   QuizScreen.tsx : questions[currentIndex] 렌더링, CodeViewer.tsx 표시
5. 사용자 답변 입력 및 선택
   QuizScreen.tsx : selectAnswer(text) -> quizStore.ts : selectAnswer()
6. 답변 제출 및 채점
   QuizScreen.tsx : handleSubmit()
   quizStore.ts : submitAnswer()
   quiz.ts : checkAnswer(selectedAnswer, currentQuestion.answer) -> boolean
7. 결과 처리 및 영속화
   quizStore.ts : QuizAttempt 객체 생성
   attemptRepository.ts : saveAttempt(newAttempt) -> LocalStorage.setItem("@quiz_attempts")
8. 다음 문제 이동 또는 완료
   QuizScreen.tsx : handleNext() -> quizStore.ts : nextQuestion()
   마지막 문제일 경우 -> App.tsx : handleFinishQuiz() -> mode = "RESULT" -> ResultScreen.tsx 진입
```

### Path B — 오답 복습 `[CONFIRMED]`

```text
1. 오답노트 진입
   App.tsx : currentTab = "wrong_note" -> WrongNoteScreen.tsx 마운트
2. 오답 데이터 로드 및 집계
   WrongNoteScreen.tsx : loadData()
   attemptRepository.ts : getWrongQuestionSummaries()
   -> @quiz_attempts 전체 역순 순회 후 Map 집계 (wrongAttempts > 0 || unknownAttempts > 0)
3. 필터별 대상 선정
   WrongNoteScreen.tsx : activeFilter ('ALL' | 'RECENT' | 'MOST_WRONG' | 'UNKNOWN' | 'BOOKMARK')
   questionRepository.ts : getByIds(targetIds)
4. 복습 풀이 시작
   WrongNoteScreen.tsx : handleRetryAll() -> onStartQuiz(displayQuestions, filterTitle)
   App.tsx : handleStartQuiz() -> mode = "QUIZ"
5. 재풀이 및 이력 추가
   QuizScreen.tsx -> quizStore.submitAnswer() -> attemptRepository.saveAttempt()
   새로운 QuizAttempt가 unshift로 최상단에 쌓여 lastAttemptIsWrong 상태가 최신으로 갱신됨
```

### Path C — AI 문제 생성 (Gemini 암기) `[CONFIRMED]`

```text
1. 사용자 생성 요청
   HomeScreen.tsx : handleGeminiMemoGenerate()
   backgroundQuestionService.ts : startGeminiMemorizationGeneration()
2. 주제 시드 선택 및 작업(Job) 생성
   memoTopicSeeds.ts : pickTopicSeeds(14, allQuestions)
   backgroundQuestionService.ts : MemoGenerationJob 생성 (2개 배치)
   memoJobService.ts : saveActiveJob(job) -> @memo_generation_active_job
3. Gemini API 호출
   backgroundQuestionService.ts -> generateOneBatch()
   geminiQuestionGenerator.ts : buildPrompt(existing, seeds)
   geminiService.ts : generateText(prompt, { models: GENERATOR_MODELS, json: true })
4. 응답 파싱 및 안전 복구
   geminiQuestionGenerator.ts : parseJsonPayload()
   -> extractJsonCandidate() -> sanitizeJsonStringLiterals() -> tryRepairTruncatedJson()
5. 스키마 검증 및 수집
   geminiQuestionGenerator.ts : collectQuestionsFromText() -> sanitizeQuestion()
   최소 유효 문항수(4개) 검사
6. 저장소 중복 확인 및 영구 저장
   questionRepository.ts : appendCachedQuestions(questions)
   -> 중복 stem 검사 후 cachedServerQuestions 병합 및 LocalStorage.setItem("@cached_server_questions")
7. 작업 완료 및 화면 갱신
   backgroundQuestionService.ts : batch.status = "COMPLETED" -> notify()
   HomeScreen.tsx : loadData() 자동 트리거되어 총 보유 문제 수 카운트 증가
```

### Path D — 앱 재실행 및 상태 복원 `[CONFIRMED]`

```text
1. 앱 프로세스 기동
   index.ts -> App.tsx (AppShell) 마운트
2. 로컬 영속 데이터 로드
   App.tsx useEffect :
   ├─ settingsStore.ts : loadSettings() -> @settings 로드
   ├─ userStore.ts : loadUserSettings() -> @daily_learning 로드
   └─ questionRepository.ts : loadCachedServerQuestions()
3. 캐시 로드 및 중복 자동 스윕
   questionRepository.ts : readCachedServerQuestions() -> @cached_server_questions 파싱
   questionRepository.ts : sweepCachedDuplicates() -> 번들 문제와 겹치는 중복 항목 자동 제거
   questionRepository.ts : persistCachedServerQuestions()
4. 미완료 백그라운드 작업 복원
   HomeScreen.tsx AppState 리스너 ('active') :
   backgroundQuestionService.ts : resumePendingJob()
   memoJobService.ts : crossValidateJobWithRepository() -> 미완료 배치만 이어받아 실행
5. 화면 렌더링
   HomeScreen.tsx : loadData() -> 전체 문제 수 계산, 통계 계산, 복습 큐 계산 완료
```

---

## 24. Reusable Components (재사용 가치 높은 핵심 자산)

1. **프로그래밍 문제 자동 생성 엔진 (`src/services/programming/`)**:
   - C, Java, Python 10종 생성기, SplitMix32 결정론적 시드 난수, 구조 지문(Fingerprint) 유사도 분석기, QuestionValidator 무결성 검증기는 플랫폼 종속성이 전혀 없는 순수 TypeScript 코드로 작성되어 있어 100% 즉시 재사용 가능.
2. **지능형 주관식 채점 엔진 (`src/utils/quiz.ts`)**:
   - 정규화, 30개 동의어 그룹, 레벤슈타인 1글자 오탈자 구제, 복수 정답 판정 알고리즘은 완성도가 매우 높아 그대로 재사용 가능.
3. **학습 데이터 자산 (`src/data/`)**:
   - 82개의 엄선된 실기 문제 풀, 14개의 일상 비유 이론 요약, 20개의 1초 두음 암기법 카드, 70개의 암기 주제 시드는 PC 버전의 기본 DB로 즉시 승계 가능.
4. **Gemini API 복원력 아키텍처 (`src/api/geminiService.ts`, `geminiQuestionGenerator.ts`)**:
   - 3.x 세대 모델 폴백 체인, 지수 백오프, 에러 마스킹, 불완전 JSON 복구 파서(`tryRepairTruncatedJson`), 단원 전담 과외 프롬프트는 PC 버전에서도 핵심 AI 엔진으로 재사용 가치가 매우 높음.
5. **망각곡선 복습 큐 및 통계 유틸 (`src/utils/reviewQueue.ts`, `statistics.ts`)**:
   - 순수 함수로 구현된 망각곡선 주기 계산 및 연속 학습 스트릭 산출 로직.

---

## 25. Mobile-Specific Components (PC 재설계 시 대체/제거 대상)

1. **화면 뷰 및 레이아웃**:
   - 세로 모드 전용 단일 컬럼 스크롤 뷰, 모바일 하단 탭 바(`BottomTabBar`), 전체화면 덮개형 모달(`AITutorModal`, `ProgrammingAdminModal`).
2. **모바일 전용 네이티브 API**:
   - `expo-haptics` (터치 진동): PC 환경에서는 시각/청각 피드백으로 대체 필요.
   - `BackHandler`, `ToastAndroid`: 모바일 OS 전용 뒤로가기 및 토스트 메시지.
   - `KeyboardAvoidingView`, `keyboardOverlap.ts`: 소프트웨어 가상 키보드 높이 계산 유틸리티.
3. **단순 `useState` 기반 네비게이션**:
   - 브라우저 뒤로가기/앞으로가기 히스토리, URL 라우팅이 지원되지 않는 `AppMode` 상태 머신.
4. **단문 위주의 퀴즈 UI**:
   - 스마트폰 작은 화면에 맞춰진 좁은 코드 뷰어 및 한 번에 1문제만 노출하는 모바일 전용 풀이 UI.

---

## 26. Known Technical Limitations

1. **AsyncStorage 대용량 직렬화 병목 `[CONFIRMED]`**:
   - 풀이 이력(`@quiz_attempts`)이 수천 건 이상 누적될 경우, 매 제출 및 화면 진입 시마다 전체 JSON 문자열을 파싱하고 다시 직렬화하므로 메모리 및 성능 저하가 발생할 수 있음 (PC 버전에서는 SQLite나 IndexedDB 같은 인덱스 기반 DB 필요).
2. **프로그래밍 코드의 실제 컴파일/실행 부재 `[CONFIRMED]`**:
   - 10종 생성기와 Validator는 정적 패턴과 시뮬레이션 알고리즘에 의존하며, 실제 GCC나 JVM을 통한 샌드박스 런타임 실행 검증을 거치는 것은 아님.
3. **AI 생성 이론 내용의 지식 검증 한계 `[CONFIRMED]`**:
   - Gemini가 생성한 암기 문제의 스키마와 길이는 엄격히 통제되지만, 생성된 내용 자체가 국가기술자격 표준 지침에 100% 부합하는지 교차 검증하는 로컬 지식 베이스(Ground Truth) 엔진은 미비함.
4. **단일 스레드 JS 연산 블로킹 `[CONFIRMED]`**:
   - 문제 대량 생성 시 메인 JS 스레드에서 연산이 이루어지므로 모바일 환경에서 일시적 버벅임이 발생할 수 있음.

---

## 27. Uncertain / Needs Verification

- `[INFERRED]` Supabase 연동 코드(`supabaseClient.ts`, `syncQueue.ts`)는 구현되어 있으나 기본 설정(`DEFAULT_SUPABASE_CONFIG.enabled`)이 `false`로 꺼져 있어, 실제 운영 서버의 테이블 스키마 및 원격 동기화 동작은 현재 로컬 코드만으로는 최종 확인 불가.
- `[INFERRED]` `app.json`의 `projectId: "dbe7c6c2-2416-499a-bdad-490b2653489c"`는 EAS 클라우드 빌드용 식별자로 추정되며, 로컬 구동 자체에는 영향이 없음.
- `[UNKNOWN]` 사용자가 수천 문제 이상을 장기 풀이했을 때 모바일 OS의 AsyncStorage 용량 한계(기기별 6MB~최대 수십MB) 도달 시점의 거동.
