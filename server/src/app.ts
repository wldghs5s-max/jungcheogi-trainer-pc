import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { env } from './config/env';
import { healthRoutes } from './routes/health';
import { questionRoutes } from './routes/questions';
import { sessionRoutes } from './routes/sessions';
import { importRoutes } from './routes/imports';
import { learningRoutes } from './routes/learning';

export function buildApp(): FastifyInstance {
  const app = fastify({
    logger: env.NODE_ENV !== 'test',
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
        origin.startsWith('http://localhost:') ||
        origin.startsWith('http://127.0.0.1:') ||
        origin === env.CORS_ORIGIN
      ) {
        cb(null, true);
        return;
      }

      cb(null, true); // Permissive in dev
    },
    credentials: true,
  });

  // Register API routes
  app.register(healthRoutes);
  app.register(questionRoutes);
  app.register(sessionRoutes);
  app.register(importRoutes);
  app.register(learningRoutes);

  return app;
}
