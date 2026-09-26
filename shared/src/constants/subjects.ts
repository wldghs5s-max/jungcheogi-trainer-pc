import { Subject } from '../types/question.js';

export const SUBJECT_LIST: readonly Subject[] = [
  '소프트웨어설계',
  '데이터베이스구축',
  '프로그래밍언어활용',
  '정보시스템구축관리',
  '신기술/보안',
] as const;

export const SUBJECTS = SUBJECT_LIST;

export type SyllabusVerificationStatus = 'OFFICIAL_VERIFIED' | 'PROVISIONAL_ESTIMATE';

export interface SubjectDetail {
  code: string;
  name: Subject;
  weight: string;
  description: string;
  verificationStatus: SyllabusVerificationStatus;
  verificationNote?: string;
}

export interface SyllabusConfig {
  version: string;
  lastUpdated: string;
  isOfficialVerified: boolean;
  notes: string;
  subjects: Record<Subject, SubjectDetail>;
}

/**
 * 시험 출제 구조 및 과목 메타데이터 설정
 * 
 * [설계 원칙]:
 * 시험 제도 및 출제 구조와 관련된 수치는 공식적인 최신 Q-Net 출제기준과
 * 일치하는지 검증하기 전까지 PROVISIONAL_ESTIMATE(잠정 추정치)로 관리합니다.
 * 하드코딩된 값에 시스템 로직이 강하게 결합되지 않도록 중앙 설정 객체로 분리합니다.
 */
export const DEFAULT_SYLLABUS_CONFIG: SyllabusConfig = {
  version: '2024_PROVISIONAL',
  lastUpdated: '2026-09-26',
  isOfficialVerified: false,
  notes: '공식 큐넷(Q-Net) 실기 출제기준과의 공식 일치 검증 전 잠정 분류 체계입니다. 향후 공식 검수 파이프라인에서 확정됩니다.',
  subjects: {
    소프트웨어설계: {
      code: '과목 1',
      name: '소프트웨어설계',
      weight: '약 15~20% (잠정)',
      description: '요구사항 확인, 화면 설계, 애플리케이션 설계, 인터페이스 설계',
      verificationStatus: 'PROVISIONAL_ESTIMATE',
      verificationNote: '실제 회차별 출제 문항수에 따라 변동 가능',
    },
    데이터베이스구축: {
      code: '과목 2',
      name: '데이터베이스구축',
      weight: '약 20~25% (잠정)',
      description: 'SQL 응용, 데이터 모델링, 정규화, 트랜잭션 및 인덱스',
      verificationStatus: 'PROVISIONAL_ESTIMATE',
      verificationNote: '실제 회차별 출제 문항수에 따라 변동 가능',
    },
    프로그래밍언어활용: {
      code: '과목 3',
      name: '프로그래밍언어활용',
      weight: '약 35~45% (잠정)',
      description: 'C, Java, Python 코드 해석 및 실행 추적, 포인터, 객체지향',
      verificationStatus: 'PROVISIONAL_ESTIMATE',
      verificationNote: '프로그래밍 언어 배점 비중이 가장 높음',
    },
    정보시스템구축관리: {
      code: '과목 4',
      name: '정보시스템구축관리',
      weight: '약 10~15% (잠정)',
      description: '소프트웨어 개발 보안, 배포 관리, 네트워크 기초, 프로젝트 관리',
      verificationStatus: 'PROVISIONAL_ESTIMATE',
      verificationNote: '보안 및 시스템 관리 통합 문항',
    },
    '신기술/보안': {
      code: '과목 5',
      name: '신기술/보안',
      weight: '약 10~15% (잠정)',
      description: '최신 IT 신기술 용어, 암호화 알고리즘, 침해 공격 및 방어 기법',
      verificationStatus: 'PROVISIONAL_ESTIMATE',
      verificationNote: '신기술 동향 및 보안 취약점',
    },
  },
};

export const SUBJECT_INFO: Record<Subject, SubjectDetail> = DEFAULT_SYLLABUS_CONFIG.subjects;

export function getSubjectDetail(subject: Subject): SubjectDetail {
  return DEFAULT_SYLLABUS_CONFIG.subjects[subject];
}
