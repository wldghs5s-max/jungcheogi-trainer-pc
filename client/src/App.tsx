import React, { useEffect, useState, useCallback } from 'react';
import {
  Server,
  Database,
  Layers,
  ShieldCheck,
  CheckCircle2,
  Terminal,
  AlertTriangle,
  BookOpen,
} from 'lucide-react';
import { Header } from './components/Header';
import { checkBackendHealth } from './api/health';
import { HealthCheckResponse, SUBJECT_INFO, SUBJECT_LIST } from '@jungcheogi/shared';

export const App: React.FC = () => {
  const [health, setHealth] = useState<HealthCheckResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | undefined>(undefined);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    const result = await checkBackendHealth();
    if (result.error) {
      setError(result.error);
      setHealth(null);
    } else {
      setHealth(result.data);
      setError(undefined);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchHealth();
    // 30초마다 자동 헬스체크
    const timer = setInterval(fetchHealth, 30000);
    return () => clearInterval(timer);
  }, [fetchHealth]);

  return (
    <div style={styles.appContainer}>
      <Header
        health={health}
        loading={loading}
        error={error}
        onRefresh={fetchHealth}
      />

      <main style={styles.mainContent}>
        {/* 오프라인 또는 오류 안내 배너 */}
        {error && (
          <div style={styles.alertBanner}>
            <AlertTriangle size={20} color="var(--color-danger)" style={{ flexShrink: 0 }} />
            <div style={styles.alertContent}>
              <div style={styles.alertTitle}>백엔드 서버 미연결 감지</div>
              <p style={styles.alertDesc}>{error}</p>
              <div style={styles.commandBox}>
                <code>npm run dev:server</code>
                <span>(포트: 8765로 Fastify 서버 구동)</span>
              </div>
            </div>
          </div>
        )}

        {/* Phase 1 환영 및 현황 히어로 */}
        <section style={styles.heroSection}>
          <div style={styles.heroHeader}>
            <div style={styles.badgeRow}>
              <span style={styles.badgePrimary}>Phase 1 : 기반 구축 완료</span>
              <span style={styles.badgeGreen}>
                {health?.status === 'ok' ? '백엔드/DB 연동 성공' : '대기 중'}
              </span>
            </div>
            <h2 style={styles.heroTitle}>
              정보처리기사 실기 PC 집중학습 플랫폼
            </h2>
            <p style={styles.heroSubtitle}>
              단순 암기를 넘어선 능동적 회상(Active Recall) & 코드 해부(Code Dissection) 학습 환경 구축
            </p>
          </div>

          <div style={styles.grid4}>
            {/* 서버 카드 */}
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={{ ...styles.cardIconBox, backgroundColor: 'rgba(59, 130, 246, 0.15)' }}>
                  <Server size={20} color="#3B82F6" />
                </div>
                <span style={styles.cardTag}>Fastify 5</span>
              </div>
              <h3 style={styles.cardTitle}>백엔드 코어 서버</h3>
              <p style={styles.cardDesc}>
                포트 <code>8765</code> (환경변수 PORT 지원), 고속 JSON 파싱, SSE 스트리밍 준비 완료.
              </p>
              <div style={styles.cardFooter}>
                <span style={styles.footerLabel}>상태:</span>
                <span style={health ? styles.statusOk : styles.statusWait}>
                  {health ? `정상 (${health.port}번 포트)` : '오프라인'}
                </span>
              </div>
            </div>

            {/* DB 카드 */}
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={{ ...styles.cardIconBox, backgroundColor: 'rgba(16, 185, 129, 0.15)' }}>
                  <Database size={20} color="#10B981" />
                </div>
                <span style={styles.cardTag}>SQLite (WAL)</span>
              </div>
              <h3 style={styles.cardTitle}>로컬 임베디드 DB</h3>
              <p style={styles.cardDesc}>
                단일 파일 저장, 백업 용이, 외래키 보장 및 SQL 트랜잭션 마이그레이션 적용.
              </p>
              <div style={styles.cardFooter}>
                <span style={styles.footerLabel}>마이그레이션:</span>
                <span style={health?.database.connected ? styles.statusOk : styles.statusWait}>
                  {health?.database.migrationsApplied ?? 0}건 적용됨
                </span>
              </div>
            </div>

            {/* Shared 카드 */}
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={{ ...styles.cardIconBox, backgroundColor: 'rgba(168, 85, 247, 0.15)' }}>
                  <Layers size={20} color="#A855F7" />
                </div>
                <span style={styles.cardTag}>@jungcheogi/shared</span>
              </div>
              <h3 style={styles.cardTitle}>공통 타입 및 계약</h3>
              <p style={styles.cardDesc}>
                Question, Attempt, ReviewState 모델 및 원본(Ground Truth)과 AI 분리 설계.
              </p>
              <div style={styles.cardFooter}>
                <span style={styles.footerLabel}>과목 수:</span>
                <span style={styles.statusOk}>{SUBJECT_LIST.length}개 과목 표준화</span>
              </div>
            </div>

            {/* Sandbox 보안 카드 */}
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={{ ...styles.cardIconBox, backgroundColor: 'rgba(245, 158, 11, 0.15)' }}>
                  <ShieldCheck size={20} color="#F59E0B" />
                </div>
                <span style={styles.cardTag}>Sandbox Spec</span>
              </div>
              <h3 style={styles.cardTitle}>코드 실행 추상화</h3>
              <p style={styles.cardDesc}>
                Phase 1에서는 인터페이스만 정의. 향후 별도 프로세스 격리/보안 샌드박스로 구현.
              </p>
              <div style={styles.cardFooter}>
                <span style={styles.footerLabel}>구현 범위:</span>
                <span style={styles.statusInfo}>추상 인터페이스 (Phase 1)</span>
              </div>
            </div>
          </div>
        </section>

        {/* 정처기 5대 과목 프리뷰 */}
        <section style={styles.section}>
          <div style={styles.sectionTitleRow}>
            <BookOpen size={20} color="#3B82F6" />
            <h3 style={styles.sectionHeading}>정보처리기사 실기 출제 기준 5대 과목 체계</h3>
          </div>
          <div style={styles.subjectsGrid}>
            {SUBJECT_LIST.map((key) => {
              const info = SUBJECT_INFO[key];
              return (
                <div key={key} style={styles.subjectItem}>
                  <div style={styles.subjectHeader}>
                    <span style={styles.subjectNum}>{info.code}</span>
                    <span style={styles.subjectWeight}>출제 비중: {info.weight}</span>
                  </div>
                  <h4 style={styles.subjectName}>{info.name}</h4>
                  <p style={styles.subjectDesc}>{info.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Phase 1 원칙 및 아키텍처 체크리스트 */}
        <section style={styles.section}>
          <div style={styles.sectionTitleRow}>
            <CheckCircle2 size={20} color="#10B981" />
            <h3 style={styles.sectionHeading}>Phase 1 아키텍처 원칙 준수 내역</h3>
          </div>

          <div style={styles.principlesGrid}>
            <div style={styles.principleCard}>
              <div style={styles.principleTitle}>1. Ground Truth와 AI 생성 데이터의 엄격한 분리</div>
              <p style={styles.principleText}>
                공식 기출 정답(<code>groundTruthAnswer</code>)과 공식 해설(<code>officialExplanation</code>)은
                AI 설명이나 변형 문제 생성 시 절대 덮어써지지 않도록 분리되었습니다.
              </p>
            </div>

            <div style={styles.principleCard}>
              <div style={styles.principleTitle}>2. 원본 기출 → AI 변형 문제 계층 구조</div>
              <p style={styles.principleText}>
                <code>parentQuestionId</code>를 지원하여 원본 문제로부터 파생된 AI 변형 문제(Variation)의
                부모-자식 관계와 계보를 추적할 수 있도록 설계되었습니다.
              </p>
            </div>

            <div style={styles.principleCard}>
              <div style={styles.principleTitle}>3. 코드 실행 엔진의 안전한 단계적 접근</div>
              <p style={styles.principleText}>
                Phase 1에서는 C/Java/Python을 실제 실행하지 않고 <code>ICodeExecutionEngine</code> 계약만 정의했습니다.
                향후 격리 프로세스, 자원 제한, 파일시스템 차단 등을 갖춘 독립 샌드박스로 구현됩니다.
              </p>
            </div>

            <div style={styles.principleCard}>
              <div style={styles.principleTitle}>4. 로컬 데스크톱 중심 SQLite 데이터베이스</div>
              <p style={styles.principleText}>
                과장된 성능 보장 대신 개인 PC 환경에서 단일 파일로 동작하며, 설치나 설정 없이
                백업과 복원이 간편한 임베디드 SQLite(WAL 모드)를 채택했습니다.
              </p>
            </div>
          </div>
        </section>

        {/* 서버 상세 연결 진단 */}
        {health && (
          <section style={styles.section}>
            <div style={styles.sectionTitleRow}>
              <Terminal size={20} color="#3B82F6" />
              <h3 style={styles.sectionHeading}>시스템 상세 상태 (진단 리포트)</h3>
            </div>
            <div style={styles.diagnosticsBox}>
              <div style={styles.diagRow}>
                <span style={styles.diagKey}>서버 버전:</span>
                <span style={styles.diagVal}>{health.version}</span>
              </div>
              <div style={styles.diagRow}>
                <span style={styles.diagKey}>서비스 상태:</span>
                <span style={styles.diagValOk}>{health.status}</span>
              </div>
              <div style={styles.diagRow}>
                <span style={styles.diagKey}>Fastify 포트:</span>
                <span style={styles.diagVal}>{health.port}</span>
              </div>
              <div style={styles.diagRow}>
                <span style={styles.diagKey}>SQLite 연결:</span>
                <span style={styles.diagValOk}>
                  {health.database.connected ? '연결됨 (정상)' : '연결 안 됨'}{' '}
                  {health.database.sqliteVersion ? `(버전: ${health.database.sqliteVersion})` : ''}
                </span>
              </div>
              <div style={styles.diagRow}>
                <span style={styles.diagKey}>적용된 DB 마이그레이션:</span>
                <span style={styles.diagVal}>{health.database.migrationsApplied}건</span>
              </div>
              <div style={styles.diagRow}>
                <span style={styles.diagKey}>서버 가동 시간:</span>
                <span style={styles.diagVal}>{Math.round(health.uptime)}초</span>
              </div>
              <div style={styles.diagRow}>
                <span style={styles.diagKey}>응답 타임스탬프:</span>
                <span style={styles.diagVal}>{health.timestamp}</span>
              </div>
            </div>
          </section>
        )}
      </main>

      <footer style={styles.footer}>
        <div style={styles.footerContent}>
          <span>jungcheogi-trainer-pc &bull; Phase 1 Foundation</span>
          <span>Node.js Fastify (:8765) + SQLite + React Vite</span>
        </div>
      </footer>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  appContainer: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--color-bg)',
  },
  mainContent: {
    flex: 1,
    maxWidth: '1280px',
    width: '100%',
    margin: '0 auto',
    padding: '32px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '32px',
  },
  alertBanner: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '14px',
    padding: '16px 20px',
    borderRadius: '10px',
    backgroundColor: 'var(--color-danger-bg)',
    border: '1px solid var(--color-danger)',
  },
  alertContent: {
    flex: 1,
  },
  alertTitle: {
    fontWeight: '700',
    fontSize: '14px',
    color: 'var(--color-danger)',
    marginBottom: '4px',
  },
  alertDesc: {
    fontSize: '13px',
    color: 'var(--color-text-muted)',
    marginBottom: '10px',
  },
  commandBox: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '10px',
    backgroundColor: 'var(--color-surface)',
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '12px',
  },
  heroSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  heroHeader: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  badgeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  badgePrimary: {
    fontSize: '12px',
    fontWeight: '600',
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    color: '#60A5FA',
    padding: '4px 10px',
    borderRadius: '20px',
  },
  badgeGreen: {
    fontSize: '12px',
    fontWeight: '600',
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    color: '#34D399',
    padding: '4px 10px',
    borderRadius: '20px',
  },
  heroTitle: {
    fontSize: '26px',
    fontWeight: '800',
    letterSpacing: '-0.5px',
    color: 'var(--color-text)',
  },
  heroSubtitle: {
    fontSize: '15px',
    color: 'var(--color-text-muted)',
    maxWidth: '720px',
  },
  grid4: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '16px',
  },
  card: {
    backgroundColor: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '12px',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardIconBox: {
    width: '38px',
    height: '38px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTag: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    padding: '2px 8px',
    borderRadius: '4px',
  },
  cardTitle: {
    fontSize: '16px',
    fontWeight: '700',
    color: 'var(--color-text)',
  },
  cardDesc: {
    fontSize: '13px',
    color: 'var(--color-text-muted)',
    lineHeight: 1.5,
    flex: 1,
  },
  cardFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: '10px',
    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
    fontSize: '12px',
  },
  footerLabel: {
    color: 'var(--color-text-muted)',
  },
  statusOk: {
    color: 'var(--color-success)',
    fontWeight: '600',
  },
  statusWait: {
    color: '#94A3B8',
    fontWeight: '500',
  },
  statusInfo: {
    color: '#F59E0B',
    fontWeight: '500',
  },
  section: {
    backgroundColor: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '12px',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  sectionTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  sectionHeading: {
    fontSize: '17px',
    fontWeight: '700',
    color: 'var(--color-text)',
  },
  subjectsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '14px',
  },
  subjectItem: {
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    padding: '14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  subjectHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  subjectNum: {
    fontSize: '11px',
    fontWeight: '700',
    color: 'var(--color-primary)',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    padding: '2px 6px',
    borderRadius: '4px',
  },
  subjectWeight: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
  },
  subjectName: {
    fontSize: '14px',
    fontWeight: '700',
    color: 'var(--color-text)',
  },
  subjectDesc: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    lineHeight: 1.4,
  },
  principlesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '16px',
  },
  principleCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  principleTitle: {
    fontSize: '14px',
    fontWeight: '700',
    color: '#60A5FA',
  },
  principleText: {
    fontSize: '13px',
    color: 'var(--color-text-muted)',
    lineHeight: 1.5,
  },
  diagnosticsBox: {
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    padding: '16px',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: '12px',
    fontSize: '13px',
  },
  diagRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  diagKey: {
    color: 'var(--color-text-muted)',
    minWidth: '120px',
  },
  diagVal: {
    color: 'var(--color-text)',
    fontFamily: 'monospace',
  },
  diagValOk: {
    color: 'var(--color-success)',
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  footer: {
    borderTop: '1px solid var(--color-border)',
    padding: '18px 24px',
    backgroundColor: 'var(--color-surface)',
  },
  footerContent: {
    maxWidth: '1280px',
    margin: '0 auto',
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    flexWrap: 'wrap',
    gap: '8px',
  },
};
