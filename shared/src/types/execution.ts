import { CodeLanguage } from './question.js';

export type CodeExecutionStatus =
  | 'SUCCESS'
  | 'COMPILE_ERROR'
  | 'RUNTIME_ERROR'
  | 'TIMEOUT'
  | 'RESTRICTED' // 악성 시스템 콜 또는 보안 정책 위반으로 차단
  | 'UNSUPPORTED_LANGUAGE'
  | 'UNAVAILABLE'; // 격리 실행 환경이 없어 검증 불가

export interface CodeExecutionRequest {
  language: CodeLanguage;
  code: string;
  stdin?: string;
  timeoutMs?: number; // 기본값: 2000ms
  /** 호스트 직접 실행. 기본 false. 격리 샌드박스가 없을 때 생성 코드에는 사용하지 않는다. */
  allowHostExecution?: boolean;
}

/**
 * 코드 실행의 기본 결과 (stdout, stderr, exit code)
 * 향후 세부적인 code_traces(줄 단위 변수 추적, Call Stack)는 
 * 안정적인 데이터 추출 검증 단계 이후 확장하도록 추상화함.
 */
export interface CodeExecutionResult {
  status: CodeExecutionStatus;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  executionTimeMs: number;
  memoryUsedBytes?: number;
  errorMessage?: string;
}

/**
 * 코드 실행 엔진 인터페이스 (Phase 1 추상화)
 * 
 * [보안 설계 요구사항 - Phase 1 이후 별도 샌드박스 단계에서 구현]:
 * 1. 프로세스 격리: 호스트 OS와 격리된 임시 프로세스 공간
 * 2. 리소스 할당 제한: CPU 코어 시간(최대 2초), 메모리 한도(최대 128MB) 강제
 * 3. 파일 시스템 접근 차단: 호스트 파일 탐색/수정 불가 (chroot 또는 격리 디렉토리)
 * 4. 네트워크 접근 차단: 소켓 및 외부 인터넷 통신 원천 차단
 */
export interface ICodeExecutionEngine {
  execute(request: CodeExecutionRequest): Promise<CodeExecutionResult>;
}
