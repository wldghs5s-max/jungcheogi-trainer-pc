import assert from 'node:assert';
import { runMigrations } from '../src/db/migrator';
import { closeDatabase, getDatabase } from '../src/db/database';
import { buildApp } from '../src/app';
import { setupIsolatedTestDb } from './helpers/testDb';

async function testHealthEndpoint() {
  console.log('=== Backend /api/health 통합 테스트 시작 ===\n');
  const isolated = setupIsolatedTestDb({ seed: false });

  // 1. 마이그레이션 실행
  const migResult = runMigrations();
  assert(migResult.totalMigrations >= 1, '마이그레이션이 최소 1건 이상 등록/적용되어야 함');
  console.log('OK   마이그레이션 실행 및 추적 확인');

  // 2. 스키마 확인
  const db = getDatabase();
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all() as Array<{ name: string }>;
  const tableNames = new Set(tables.map((t) => t.name));

  assert(tableNames.has('schema_migrations'), 'schema_migrations 테이블 존재');
  assert(tableNames.has('questions'), 'questions 테이블 존재');
  assert(tableNames.has('attempts'), 'attempts 테이블 존재');
  assert(tableNames.has('review_states'), 'review_states 테이블 존재');
  assert(tableNames.has('system_settings'), 'system_settings 테이블 존재');
  console.log('OK   핵심 SQLite 테이블 5개 스키마 무결성 확인');

  // 3. Fastify inject 호출
  const app = buildApp();
  const response = await app.inject({
    method: 'GET',
    url: '/api/health',
  });

  assert.strictEqual(response.statusCode, 200, 'HTTP 상태코드 200 응답');
  const payload = JSON.parse(response.body);

  assert.strictEqual(payload.status, 'ok', "상태가 'ok'여야 함");
  assert.strictEqual(typeof payload.port, 'number', '포트 번호 반환 확인');
  assert.strictEqual(payload.database.connected, true, '데이터베이스 연결 true 확인');
  assert(payload.database.migrationsApplied >= 1, '적용된 마이그레이션 수 1 이상');
  assert.strictEqual(payload.features.sandboxExecution, false, 'Phase 1 샌드박스는 false로 선언됨');
  console.log('OK   /api/health 엔드포인트 응답 무결성 확인');
  console.log('     응답 내용:', JSON.stringify(payload, null, 2));

  await app.close();
  closeDatabase();
  isolated.cleanup();

  console.log('\n🎉 모든 백엔드 헬스체크 및 DB 연결 테스트 통과!');
}

testHealthEndpoint().catch((err) => {
  console.error('FAIL: 테스트 실패:', err);
  process.exit(1);
});
