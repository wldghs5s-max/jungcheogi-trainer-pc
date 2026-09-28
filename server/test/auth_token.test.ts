import assert from "node:assert";
import { buildApp, isAllowedAddress } from "../src/app.js";
import { setupIsolatedTestDb } from "./helpers/testDb.js";

async function withTokenEnv(token: string | undefined, run: () => Promise<void>) {
  const previous = process.env.LOCAL_API_TOKEN;
  if (token === undefined) {
    delete process.env.LOCAL_API_TOKEN;
  } else {
    process.env.LOCAL_API_TOKEN = token;
  }
  try {
    await run();
  } finally {
    if (previous === undefined) {
      delete process.env.LOCAL_API_TOKEN;
    } else {
      process.env.LOCAL_API_TOKEN = previous;
    }
  }
}

async function testAuthToken() {
  console.log("=== LOCAL_API_TOKEN 인증 흐름 ===\n");
  const isolated = setupIsolatedTestDb();
  const validToken = "test-local-token";

  try {
    await withTokenEnv(undefined, async () => {
      const app = buildApp();
      const res = await app.inject({ method: "GET", url: "/api/health" });
      assert.strictEqual(res.statusCode, 200);
      await app.close();
      console.log("OK   토큰 미설정 시 인증 없이 통과");
    });

    await withTokenEnv(validToken, async () => {
      const app = buildApp();

      const missing = await app.inject({ method: "GET", url: "/api/health" });
      assert.strictEqual(missing.statusCode, 401);
      console.log("OK   토큰 설정 + 헤더 누락 → 401");

      const invalid = await app.inject({
        method: "GET",
        url: "/api/health",
        headers: { "x-local-token": "wrong-token" },
      });
      assert.strictEqual(invalid.statusCode, 401);
      console.log("OK   잘못된 토큰 → 401");

      const ok = await app.inject({
        method: "GET",
        url: "/api/health",
        headers: { "x-local-token": validToken },
      });
      assert.strictEqual(ok.statusCode, 200);
      console.log("OK   정상 토큰 → 200");

      const preflight = await app.inject({
        method: "OPTIONS",
        url: "/api/health",
        headers: {
          Origin: "http://localhost:5173",
          "Access-Control-Request-Method": "GET",
        },
      });
      assert.notStrictEqual(preflight.statusCode, 401);
      console.log("OK   허용 출처 OPTIONS 사전 요청은 401이 아님");

      const created = await app.inject({
        method: "POST",
        url: "/api/sessions",
        headers: { "x-local-token": validToken },
        payload: { title: "auth-unknown", count: 1 },
      });
      assert.strictEqual(created.statusCode, 201);
      const body = JSON.parse(created.body);
      const unknown = await app.inject({
        method: "POST",
        url: `/api/sessions/${body.session.id}/unknown`,
        headers: { "x-local-token": validToken },
        payload: { questionId: body.firstQuestion.id, timeSpentMs: 10 },
      });
      assert.strictEqual(unknown.statusCode, 200);
      const unknownBody = JSON.parse(unknown.body);
      assert.strictEqual(unknownBody.attempt.isUnknown, true);
      console.log("OK   정상 토큰으로 unknown 내부 처리(재inject 없음)");

      assert.strictEqual(isAllowedAddress("127.0.0.1"), true);
      assert.strictEqual(isAllowedAddress("192.168.0.10"), true);
      assert.strictEqual(isAllowedAddress("8.8.8.8"), false);
      console.log("OK   cf-ray만으로는 외부 IP를 허용하지 않음(소켓이 로컬/LAN이어야 함)");

      await app.close();
    });
  } finally {
    isolated.cleanup();
  }

  console.log("\nLOCAL_API_TOKEN 인증 검증 통과");
}

testAuthToken().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
