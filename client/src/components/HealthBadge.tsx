import React from 'react';
import { CheckCircle2, AlertCircle, RefreshCw, Database } from 'lucide-react';
import { HealthCheckResponse } from '@jungcheogi/shared';

interface HealthBadgeProps {
  health: HealthCheckResponse | null;
  loading: boolean;
  error?: string;
  onRefresh: () => void;
}

export const HealthBadge: React.FC<HealthBadgeProps> = ({
  health,
  loading,
  error,
  onRefresh,
}) => {
  const isHealthy = !error && health && health.status === 'ok';

  return (
    <div style={styles.container}>
      <div
        style={{
          ...styles.badge,
          backgroundColor: loading
            ? 'rgba(148, 163, 184, 0.15)'
            : isHealthy
            ? 'var(--color-success-bg)'
            : 'var(--color-danger-bg)',
          borderColor: loading
            ? '#64748B'
            : isHealthy
            ? 'var(--color-success)'
            : 'var(--color-danger)',
        }}
      >
        {loading ? (
          <RefreshCw
            size={14}
            color="#94A3B8"
            style={{ animation: 'spin 1s linear infinite' }}
          />
        ) : isHealthy ? (
          <CheckCircle2 size={14} color="var(--color-success)" />
        ) : (
          <AlertCircle size={14} color="var(--color-danger)" />
        )}

        <span
          style={{
            ...styles.text,
            color: loading
              ? '#94A3B8'
              : isHealthy
              ? 'var(--color-success)'
              : 'var(--color-danger)',
          }}
        >
          {loading
            ? '연결 확인 중...'
            : isHealthy
            ? `서버 정상 (포트: ${health.port}, DB: ${health.database.connected ? '정상' : '오류'})`
            : '백엔드 오프라인 (:8765)'}
        </span>

        {isHealthy && health.database.questionsCount !== undefined && (
          <span style={styles.dbCount}>
            <Database size={12} style={{ marginRight: '4px' }} />
            문제 {health.database.questionsCount}건
          </span>
        )}
      </div>

      <button
        style={{
          ...styles.refreshBtn,
          opacity: loading ? 0.6 : 1,
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
        onClick={onRefresh}
        disabled={loading}
        title="백엔드 연결 상태 다시 확인"
      >
        <RefreshCw size={13} color="var(--color-text-muted)" />
      </button>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px',
    borderRadius: '8px',
    border: '1px solid transparent',
    fontSize: '12px',
    fontWeight: '500',
    transition: 'all 0.2s ease',
  },
  text: {
    fontSize: '12px',
    fontWeight: '600',
  },
  dbCount: {
    marginLeft: '6px',
    paddingLeft: '8px',
    borderLeft: '1px solid rgba(255, 255, 255, 0.15)',
    display: 'inline-flex',
    alignItems: 'center',
    fontSize: '11px',
    color: 'var(--color-text-muted)',
  },
  refreshBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    borderRadius: '6px',
    backgroundColor: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    transition: 'background-color 0.15s ease',
  },
};
