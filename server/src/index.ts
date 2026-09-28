import { env } from './config/env';
import { runMigrations } from './db/migrator';
import { closeDatabase } from './db/database';
import { buildApp } from './app';

async function main() {
  console.log('====================================================');
  console.log('  정처기 PC 집중학습 플랫폼 백엔드 서버 시작');
  console.log('====================================================');

  // 1. SQLite 마이그레이션 실행
  try {
    const { appliedCount, totalMigrations } = runMigrations();
    console.log(
      `[DB] SQLite 마이그레이션 확인 완료: 신규 적용 ${appliedCount}건, 총 ${totalMigrations}건`
    );

    // 학습용 기본 시드는 넣지 않는다. 개념 사전만 비어 있으면 채운다.
    const { ConceptRepository } = await import('./db/repositories/conceptRepository.js');
    const conceptRepo = new ConceptRepository();
    conceptRepo.seedInitialConcepts();
  } catch (err) {
    console.error('[DB] 마이그레이션 실행 중 치명적 오류 발생:', err);
    process.exit(1);
  }

  // 2. Fastify 서버 구동
  const app = buildApp();

  const shutdown = async (signal: string) => {
    console.log(`\n[Server] ${signal} 수신, 안전하게 종료하는 중...`);
    try {
      await app.close();
      closeDatabase();
      console.log('[Server] 정상 종료되었습니다.');
      process.exit(0);
    } catch (e) {
      console.error('[Server] 종료 중 오류:', e);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    const address = await app.listen({ port: env.PORT, host: env.HOST });
    console.log(`[Server] 백엔드 리스너 시작: ${address}`);
    console.log(`[Server] Healthcheck API: http://${env.HOST}:${env.PORT}/api/health`);
    console.log(`[Server] 기본 포트: ${env.PORT} (PORT 환경변수로 변경 가능)`);
  } catch (err) {
    console.error('[Server] 서버 시작 실패:', err);
    closeDatabase();
    process.exit(1);
  }
}

main();
