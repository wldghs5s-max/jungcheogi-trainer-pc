# 정처기 실기 PC 집중학습 플랫폼 (jungcheogi-trainer-pc)

> ### 📌 최신 프로젝트 릴리즈 정보 (gitingest 최신화 확인용)
> - **버전 (Version)**: `v0.1.0` (Phase 2 Diverse AI Pool & Diverse Random Engine)
> - **마지막 갱신 일시 (Last Updated)**: `2026-10-05 22:25:00 KST`
> - **직전 커밋 해시 (Previous Commit)**: `e86d176` (feat: implement diverse random selection, batch diversity generator, and 2025-01 review status)
> - **데이터베이스 문제 풀 현황**: **총 110문항**
>   - 기출 공식 시드 (`REAL_EXAM`): 38문항 (2024-01: 18건 VERIFIED / 2025-01: 코드 10건 VERIFIED, 이론 10건 REVIEW_NEEDED 격리)
>   - 교재 예상문제 시드 (`TEXTBOOK_EXPECTED`): 25문항 (VERIFIED)
>   - AI 생성 변형 문제 (`AI_VARIATION`): 47문항 (엄격 6단계 검증 통과)
> - **핵심 아키텍처 및 업데이트**:
>   1. **Diverse Random 선별 엔진**: 최근 30회/5세션 풀이 이력 가중치 감점(-95%) 및 부모 Seed 동적 분산(-90%) 적용으로 중복·편중 출제 원천 차단
>   2. **다양성 AI 문제 생성기**: SQL/Python/Java/C/소공 고난도 추론 유형(`Reasoning Taxonomy`) 및 6단계 엄격 검증 파이프라인 탑재
>   3. **2025-01 기출 시드 인제스트**: 코드/SQL 10문항 `VERIFIED`, 이론/순서도 10문항 `REVIEW_NEEDED` 출제 격리 적용

<!-- TUNNEL_URL_START -->
> ### 📱 실시간 모바일 / 외부 접속 링크
> **[👉 정처기 학습 플랫폼 바로가기 (클릭)](https://findarticles-ons-status-attorney.trycloudflare.com)**  
> - **실시간 URL**: `https://findarticles-ons-status-attorney.trycloudflare.com`  
> - **마지막 갱신**: 2026-10-05 14:43:49 KST
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
