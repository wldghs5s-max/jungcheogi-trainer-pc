import fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { env } from "./config/env.js";
import { healthRoutes } from "./routes/health.js";
import { questionRoutes } from "./routes/questions.js";
import { sessionRoutes } from "./routes/sessions.js";
import { importRoutes } from "./routes/imports.js";
import { learningRoutes } from "./routes/learning.js";
import { aiRoutes } from "./routes/ai.js";

function isAllowedAddress(ip?: string): boolean {
  if (!ip) return false;
  // Loopback (127.0.0.1, ::1, ::ffff:127.0.0.1)
  if (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "::ffff:127.0.0.1" ||
    ip.startsWith("127.")
  ) {
    return true;
  }
  // Allow RFC1918 private network IP ranges for home LAN / Wi-Fi access
  const cleanIp = ip.replace(/^::ffff:/, "");
  if (
    cleanIp.startsWith("10.") ||
    cleanIp.startsWith("192.168.") ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(cleanIp)
  ) {
    return true;
  }
  return false;
}

export function buildApp(): FastifyInstance {
  const app = fastify({
    logger: env.NODE_ENV !== "test",
    trustProxy: true,
  });

  app.addHook("onRequest", async (request, reply) => {
    const socketIp = request.socket?.remoteAddress;
    const isLocalSocket = isAllowedAddress(socketIp);
    const isLocalIp = isAllowedAddress(request.ip);
    const isCloudflareTunnel = Boolean(request.headers["cf-ray"]);

    if (!isLocalSocket && !isLocalIp && !isCloudflareTunnel) {
      return reply.status(403).send({
        error: "Forbidden",
        message: "이 API는 로컬, 내부 네트워크(LAN) 및 Cloudflare Tunnel에서만 사용할 수 있습니다.",
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

  // Enable CORS for local development, LAN access, and Cloudflare Tunnel
  app.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server)
      if (!origin) {
        cb(null, true);
        return;
      }

      // Allow localhost, LAN IPs, Cloudflare Tunnel domains, and specified CORS_ORIGIN
      if (
        origin.startsWith("http://localhost:") ||
        origin.startsWith("http://127.0.0.1:") ||
        origin.startsWith("http://192.168.") ||
        origin.startsWith("http://10.") ||
        /^http:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\./.test(origin) ||
        origin.endsWith(".trycloudflare.com") ||
        origin.endsWith(".cloudflare.com") ||
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
