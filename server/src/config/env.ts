import path from 'path';
import dotenv from 'dotenv';

import fs from 'fs';

// Load environment variables from .env
dotenv.config();

function getDefaultDbPath(): string {
  if (process.env.DATABASE_PATH) {
    return process.env.DATABASE_PATH;
  }
  // Check if cwd is monorepo root or server directory
  if (fs.existsSync(path.resolve(process.cwd(), 'server'))) {
    return path.resolve(process.cwd(), 'server/data/jungcheogi.db');
  }
  return path.resolve(process.cwd(), 'data/jungcheogi.db');
}

export const env = {
  PORT: Number(process.env.PORT) || 8765,
  HOST: process.env.HOST || '127.0.0.1',
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATABASE_PATH: getDefaultDbPath(),
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
};
