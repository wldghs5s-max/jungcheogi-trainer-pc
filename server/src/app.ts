import fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { env } from "./config/env.js";
import { healthRoutes } from "./routes/health.js";
import { questionRoutes } from "./routes/questions.js";
import { sessionRoutes } from "./routes/sessions.js";
import { importRoutes } from "./routes/imports.js";
import { learningRoutes } from "./routes/learning.js";
import { aiRoutes } from "./routes/ai.js";

function isLoopbackAddress(ip?: string): boolean {
  if (!ip) return false;
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "::ffff:127.0.0.1" ||
    ip.startsWith("127.")
  );
}

export function buildApp(): FastifyInstance {
  const app = fastify({
    logger: env.NODE_ENV !== "test",
    trustProxy: false,
  });

  app.addHook("onRequest", async (request, reply) => {
    if (!isLoopbackAddress(request.ip)) {
      return reply.status(403).send({
        error: "Forbidden",
        message: "이 API는 로컬호스트에서만 사용할 수 있습니다.",
      });
    }

    if (request.method === "OPTIONS") return;

    const requiredToken = (process.env.LOCAL_API_TOKEN || "").trim();
    if (!requiredToken) return;

    const provided =
      (request.headers["x-local-token"] as string | undefined) ||
      request.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (provided !== requiredToken) {
      return reply.status(401).send({
        error: "Unauthorized",
        message: "로컬 API 토큰이 필요합니다.",
      });
    }
  });

  // Enable CORS for local development and future Cloudflare Tunnel
  app.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server)
      if (!origin) {
        cb(null, true);
        return;
      }

      // Allow localhost and specified CORS_ORIGIN
      if (
        origin.startsWith("http://localhost:") ||
        origin.startsWith("http://127.0.0.1:") ||
        origin === env.CORS_ORIGIN
      ) {
        cb(null, true);
        return;
      }

      cb(new Error("Not allowed by CORS"), false);
    },
    credentials: true,
  });

  // Register API routes
  app.register(healthRoutes);
  app.register(questionRoutes);
  app.register(sessionRoutes);
  app.register(importRoutes);
  app.register(learningRoutes);
  app.register(aiRoutes);

  return app;
}
