import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from .env
dotenv.config();

export const env = {
  PORT: Number(process.env.PORT) || 8765,
  HOST: process.env.HOST || '127.0.0.1',
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATABASE_PATH: process.env.DATABASE_PATH || path.resolve(process.cwd(), 'data/jungcheogi.db'),
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
};
