import React from 'react';
import { Monitor } from 'lucide-react';
import { HealthBadge } from './HealthBadge';
import { HealthCheckResponse } from '@jungcheogi/shared';

interface HeaderProps {
  health: HealthCheckResponse | null;
  loading: boolean;
  error?: string;
  onRefresh: () => void;
}

export const Header: React.FC<HeaderProps> = ({ health, loading, error, onRefresh }) => {
  return (
    <header style={styles.header}>
      <div style={styles.container}>
        <div style={styles.brandRow}>
          <div style={styles.iconBox}>
            <Monitor size={22} color="#3B82F6" />
          </div>
          <div>
            <div style={styles.titleRow}>
              <h1 style={styles.title}>정처기 실기 집중 학습</h1>
              <span style={styles.versionBadge}>실기 모의훈련</span>
            </div>
            <p style={styles.subtitle}>
              정보처리기사 실기 기출 풀이 및 프로그래밍 코드 분석 학습 플랫폼
            </p>
          </div>
        </div>

        <div style={styles.statusRow}>
          <HealthBadge health={health} loading={loading} error={error} onRefresh={onRefresh} />
        </div>
      </div>
    </header>
  );
};

const styles: Record<string, React.CSSProperties> = {
  header: {
    backgroundColor: 'var(--color-surface)',
    borderBottom: '1px solid var(--color-border)',
    padding: '16px 24px',
  },
  container: {
    maxWidth: '1280px',
    margin: '0 auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '16px',
  },
  brandRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
  },
  iconBox: {
    width: '42px',
    height: '42px',
    borderRadius: '10px',
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  title: {
    fontSize: '18px',
    fontWeight: '700',
    color: 'var(--color-text)',
    letterSpacing: '-0.3px',
  },
  versionBadge: {
    fontSize: '11px',
    fontWeight: '600',
    padding: '2px 8px',
    borderRadius: '12px',
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    color: '#60A5FA',
  },
  subtitle: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    marginTop: '2px',
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
};
