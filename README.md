# 정처기 실기 PC 집중학습 플랫폼 (jungcheogi-trainer-pc)

<!-- TUNNEL_URL_START -->
> ### 📱 실시간 모바일 / 외부 접속 링크
> **[👉 정처기 학습 플랫폼 바로가기 (클릭)](https://explained-backgrounds-changed-buried.trycloudflare.com)**  
> - **실시간 URL**: `https://explained-backgrounds-changed-buried.trycloudflare.com`  
> - **마지막 갱신**: 2026-09-28 23:26:44 KST
<!-- TUNNEL_URL_END -->


> **정보처리기사 실기 시험 대비를 위한 PC 환경 맞춤형 집중학습 플랫폼**  
> 모바일 환경의 단순 암기/퀴즈를 넘어, **PC의 넓은 화면, 키보드 입력, 다중 창, 능동적 회상(Active Recall) 및 코드 해부(Code Dissection)**를 극대화하는 데스크톱 지향 학습 도구입니다.

- **GitHub Repository**: [https://github.com/wldghs5s-max/jungcheogi-trainer-pc.git](https://github.com/wldghs5s-max/jungcheogi-trainer-pc.git)
- **선행 참고 프로젝트**: [https://github.com/wldghs5s-max/jungcheogi-trainer.git](https://github.com/wldghs5s-max/jungcheogi-trainer.git) (모바일 버전 참고용)

---

## 1. 프로젝트 구조 (Monorepo)

본 프로젝트는 npm workspaces 기반 모노레포로 구성되어 있습니다.

```text
jungcheogi-trainer-pc/
├── client/                     # Frontend (React 19 + TypeScript + Vite)
├── server/                     # Backend (Node.js + TypeScript + Fastify 5)
├── shared/                     # 공통 TypeScript 인터페이스 및 상수 (@jungcheogi/shared)
└── docs/                       # 기획 및 분석 문서
```

---

## 2. 핵심 설계 원칙

1. **Ground Truth와 AI 데이터의 엄격한 분리**
   - 공식 기출 정답(`groundTruthAnswer`)과 공식 해설(`officialExplanation`)은 독립 필드로 보호됩니다.
   - AI 설명(`aiExplanation`)이나 AI 변형 문제는 별도의 필드로 저장되어, 공식 원본 정답을 절대 덮어쓰지 않습니다.

2. **기출 → AI 변형 문제 계층 구조 (`parentQuestionId`)**
   - 원본 문제로부터 파생된 AI 변형 문제(Variation)의 부모-자식 관계와 계보를 추적할 수 있도록 모델을 구성했습니다.

3. **코드 실행 엔진의 단계적 안전 접근**
   - Phase 1/2에서는 C / Java / Python 실행 엔진을 실제 구동하지 않고 인터페이스(`ICodeExecutionEngine`)로 추상화합니다.
   - 프로세스 격리, CPU/메모리 제한, 파일시스템/네트워크 차단 등 독립 보안 샌드박스 설계 요구사항을 적용합니다.

4. **로컬 데스크톱 중심 SQLite 데이터베이스**
   - 단일 파일(`data/jungcheogi.db`)로 동작하며, WAL 모드, 외래키 보장, 트랜잭션 마이그레이션을 지원합니다.

5. **백엔드 기본 포트 및 API 키 보안**
   - 백엔드 기본 포트는 `8765`이며 환경변수 `PORT`로 변경 가능합니다.
