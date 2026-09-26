import { FastifyInstance } from 'fastify';
import { HealthCheckResponse } from '@jungcheogi/shared';
import { getDatabase } from '../db/database';
import { env } from '../config/env';

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/health', async (_request, reply) => {
    let dbConnected = false;
    let migrationsApplied = 0;
    let sqliteVersion = 'unknown';
    let questionsCount = 0;

    try {
      const db = getDatabase();
      const migStmt = db.prepare('SELECT COUNT(*) as count FROM schema_migrations');
      const migRow = migStmt.get() as { count: number } | undefined;
      migrationsApplied = migRow?.count || 0;

      const verStmt = db.prepare('SELECT sqlite_version() as v');
      const verRow = verStmt.get() as { v: string } | undefined;
      if (verRow?.v) {
        sqliteVersion = verRow.v;
      }

      const qStmt = db.prepare('SELECT COUNT(*) as count FROM questions');
      const qRow = qStmt.get() as { count: number } | undefined;
      questionsCount = qRow?.count || 0;

      dbConnected = true;
    } catch {
      dbConnected = false;
    }

    const response: HealthCheckResponse = {
      status: dbConnected ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '0.1.0-phase1',
      port: env.PORT,
      environment: env.NODE_ENV,
      database: {
        connected: dbConnected,
        path: env.DATABASE_PATH,
        migrationsApplied,
        sqliteVersion,
        questionsCount,
      },
      features: {
        sandboxExecution: false, // Phase 1: 샌드박스 실행 엔진 미구현 (추상화만 선언)
        geminiAi: false,          // Phase 1: AI 연동 미구현
        activeRecall: false,      // Phase 1: 암기 회상 미구현
      },
    };

    return reply.status(dbConnected ? 200 : 503).send(response);
  });
}
