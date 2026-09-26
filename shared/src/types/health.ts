export interface DatabaseHealth {
  connected: boolean;
  path: string;
  migrationsApplied: number;
  sqliteVersion?: string;
  questionsCount?: number;
}

export interface HealthCheckResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  uptime: number;
  version: string;
  port: number;
  environment: string;
  database: DatabaseHealth;
  features: {
    sandboxExecution: boolean;
    geminiAi: boolean;
    activeRecall: boolean;
  };
}
