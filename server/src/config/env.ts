import path from "path";
import dotenv from "dotenv";

import fs from "fs";

// 1. Load candidate files in order: server/.env (Primary for backend), then root .env
const envCandidates = [
  path.resolve(process.cwd(), "server/.env"),
  path.resolve(process.cwd(), ".env"),
  path.resolve(__dirname, "../../.env"),
  path.resolve(__dirname, "../../../.env"),
];

for (const candidate of envCandidates) {
  if (fs.existsSync(candidate)) {
    try {
      const parsed = dotenv.parse(fs.readFileSync(candidate));
      for (const [key, val] of Object.entries(parsed)) {
        // Prioritize non-empty values over empty strings
        if (val && val.trim() && (!process.env[key] || !process.env[key]?.trim())) {
          process.env[key] = val.trim();
        }
      }
    } catch {}
  }
}
dotenv.config();

function getDefaultDbPath(): string {
  // Two levels up from this config file is always the canonical server directory:
  const serverDir = path.resolve(__dirname, "../..");
  const canonicalDbPath = path.resolve(serverDir, "data/jungcheogi.db");

  const custom = process.env.DATABASE_PATH;
  if (custom && path.isAbsolute(custom)) {
    return custom;
  }

  // If relative path targets jungcheogi.db, always map to the canonical server/data path
  if (custom && custom.includes("jungcheogi.db")) {
    return canonicalDbPath;
  }

  return canonicalDbPath;
}

export const env = {
  PORT: Number(process.env.PORT) || 8765,
  HOST: process.env.HOST || "0.0.0.0",
  NODE_ENV: process.env.NODE_ENV || "development",
  DATABASE_PATH: getDefaultDbPath(),
  CORS_ORIGIN: process.env.CORS_ORIGIN || "http://localhost:5173",
  LOCAL_API_TOKEN: process.env.LOCAL_API_TOKEN || "",
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
  GEMINI_FAST_MODEL:
    process.env.GEMINI_FAST_MODEL ||
    process.env.GEMINI_TUTOR_MODEL ||
    process.env.GEMINI_MODEL ||
    "gemini-3.5-flash-lite",
  GEMINI_SMART_MODEL:
    process.env.GEMINI_SMART_MODEL ||
    process.env.GEMINI_GENERATOR_MODEL ||
    "gemini-3.8-flash",
  // Backward compatibility aliases
  GEMINI_TUTOR_MODEL:
    process.env.GEMINI_FAST_MODEL ||
    process.env.GEMINI_TUTOR_MODEL ||
    "gemini-3.5-flash-lite",
  GEMINI_GENERATOR_MODEL:
    process.env.GEMINI_SMART_MODEL ||
    process.env.GEMINI_GENERATOR_MODEL ||
    "gemini-3.8-flash",
  GEMINI_MODEL:
    process.env.GEMINI_FAST_MODEL ||
    process.env.GEMINI_MODEL ||
    "gemini-3.5-flash-lite",
};
