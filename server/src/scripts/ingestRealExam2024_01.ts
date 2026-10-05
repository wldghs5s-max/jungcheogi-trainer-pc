import { ingestCleanDatabase } from './ingest2024_01_clean.js';

/**
 * @deprecated 구형 스키마 스크립트 호환용 wrapper입니다. 정식 인제스트는 ingest2024_01_clean.ts를 사용하세요.
 */
export function ingestRealExam2024_01() {
  console.log('[Notice] ingestRealExam2024_01() 호출됨 -> 정식 인제스트(ingestCleanDatabase)로 위임 실행합니다.');
  return ingestCleanDatabase();
}

if (process.argv[1]?.includes('ingestRealExam2024_01')) {
  ingestRealExam2024_01();
}

