import assert from 'node:assert';
import { runMigrations } from '../src/db/migrator';
import { closeDatabase, getDatabase } from '../src/db/database';
import { buildApp } from '../src/app';
import { seedFixtureQuestions } from '../src/db/seeder';
import { gradeAnswer, normalizeAnswer } from '@jungcheogi/shared';
import { AttemptRepository } from '../src/db/repositories/attemptRepository';
import { SessionRepository } from '../src/db/repositories/sessionRepository';
import { setupIsolatedTestDb } from './helpers/testDb';

async function testSessionsAndGrading() {
  console.log('=== Phase 3: 문제 풀이, 채점 엔진, 세션 및 Attempt 이력 검증 테스트 시작 ===\n');
  const isolated = setupIsolatedTestDb({ seed: false });

  // 1. 마이그레이션 및 시딩
  runMigrations();
  const db = getDatabase();
  seedFixtureQuestions(db);
  const attemptRepo = new AttemptRepository(db);
  const sessionRepo = new SessionRepository(db);

  // 2. 주관식 채점 및 정규화(Normalization) 엔진 단위 검증
  console.log('--- 1. 채점 및 정규화 엔진 검증 ---');

  // (1) 공백 및 특수문자 제거 정규화
  assert.strictEqual(normalizeAnswer('  (빌더)  '), '빌더');
  assert.strictEqual(normalizeAnswer('GROUP BY'), 'GROUPBY');
  assert.strictEqual(normalizeAnswer('순차적 응집도.'), '순차적응집도');
  console.log('OK   공백, 특수기호, 괄호 정규화 동작 확인');

  // (2) 영문 대소문자 무시 및 동의어(Synonym) 판정
  const gradeSynonym1 = gradeAnswer('Builder', '빌더');
  assert.strictEqual(gradeSynonym1.isCorrect, true, '영문 Builder와 한글 빌더 동의어 일치');

  const gradeSynonym2 = gradeAnswer('그룹바이', 'GROUP BY');
  assert.strictEqual(gradeSynonym2.isCorrect, true, '한글 음차 그룹바이와 영문 GROUP BY 동의어 일치');

  const gradeSynonym3 = gradeAnswer('순차응집도', '순차적 응집도');
  assert.strictEqual(gradeSynonym3.isCorrect, true, '순차응집도와 순차적 응집도 동의어 일치');
  console.log('OK   한글/영문/약어 동의어 사전 매칭 확인');

  // (3) 1글자 오탈자(Typo) 허용 퍼지 매칭
  const gradeFuzzy1 = gradeAnswer('버퍼오버플로', '버퍼 오버플로우');
  assert.strictEqual(gradeFuzzy1.isCorrect, true, '버퍼오버플로 <-> 버퍼 오버플로우 1글자 오탈자 허용');
  console.log('OK   레벤슈타인 1글자 오탈자 허용 퍼지 매칭 확인');

  // (4) 복수 키워드 채점 (부분 점수 및 순서)
  const groundTruthMulti = ['원자성', '영속성'];
  const gradeMultiFull = gradeAnswer(['원자성', '영속성'], groundTruthMulti);
  assert.strictEqual(gradeMultiFull.isCorrect, true);
  assert.strictEqual(gradeMultiFull.score, 1.0, '2개 모두 정답 시 1.0점');

  const gradeMultiPartial = gradeAnswer(['원자성', '일관성'], groundTruthMulti);
  assert.strictEqual(gradeMultiPartial.isCorrect, false);
  assert.strictEqual(gradeMultiPartial.score, 0.5, '1개만 정답 시 0.5 부분 점수');
  assert(gradeMultiPartial.itemResults?.[0].isMatch === true);
  assert(gradeMultiPartial.itemResults?.[1].isMatch === false);
  console.log('OK   복수 키워드 부분 점수 채점 확인 (0.5점 / 1.0점)');

  // (5) "모르겠음" 선택 시 처리
  const gradeUnknown = gradeAnswer('', '빌더', true);
  assert.strictEqual(gradeUnknown.isCorrect, false);
  assert.strictEqual(gradeUnknown.isUnknown, true);
  assert.strictEqual(gradeUnknown.score, 0);
  console.log('OK   모르겠음(Unknown) 플래그 및 점수 0점 처리 확인');

  // 3. Fastify 학습 세션(StudySession) 및 Attempt 연동 API 검증
  console.log('\n--- 2. 학습 세션 및 Attempt 이력 API 검증 ---');
  const app = buildApp();

  // (1) POST /api/sessions: 3문제 세션 생성
  const resCreateSession = await app.inject({
    method: 'POST',
    url: '/api/sessions',
    payload: {
      title: 'Phase 3 집중 풀이 테스트 세션',
      count: 3,
    },
  });
  assert.strictEqual(resCreateSession.statusCode, 201);
  const sessionData = JSON.parse(resCreateSession.body);
  const session = sessionData.session;
  assert.strictEqual(session.totalQuestions, 3);
  assert.strictEqual(session.currentIndex, 0);
  assert.strictEqual(session.status, 'ACTIVE');
  assert(sessionData.firstQuestion, '첫 번째 문제 포함');
  console.log(`OK   [POST /api/sessions] 세션 생성 성공 (ID: ${session.id}, 문항수: ${session.totalQuestions})`);

  // (2) 1번 문제 풀이: 정답 제출
  const q1Id = session.questionIds[0];
  const q1Info = await app.inject({ method: 'GET', url: `/api/questions/${q1Id}` });
  const q1 = JSON.parse(q1Info.body).question;

  const resSubmit1 = await app.inject({
    method: 'POST',
    url: `/api/sessions/${session.id}/submit`,
    payload: {
      questionId: q1Id,
      userAnswer: q1.groundTruthAnswer, // 정답 그대로 제출
      timeSpentMs: 4500,
    },
  });
  assert.strictEqual(resSubmit1.statusCode, 200);
  const submit1Data = JSON.parse(resSubmit1.body);
  assert.strictEqual(submit1Data.isCorrect, true);
  assert.strictEqual(submit1Data.score, 1.0);
  assert.strictEqual(submit1Data.sessionProgress.currentIndex, 1);
  assert.strictEqual(submit1Data.sessionProgress.correctCount, 1);
  assert.strictEqual(submit1Data.isSessionCompleted, false);
  console.log('OK   [1번 문항 제출] 정답 처리 및 세션 진행률(1/3) 갱신 확인');

  // (3) 2번 문제 풀이: "모르겠음" 선택
  const q2Id = session.questionIds[1];
  const resSubmit2 = await app.inject({
    method: 'POST',
    url: `/api/sessions/${session.id}/unknown`,
    payload: {
      questionId: q2Id,
      timeSpentMs: 2500,
      hintUsed: true,
    },
  });
  assert.strictEqual(resSubmit2.statusCode, 200);
  const submit2Data = JSON.parse(resSubmit2.body);
  assert.strictEqual(submit2Data.isCorrect, false);
  assert.strictEqual(submit2Data.attempt.isUnknown, true);
  assert.strictEqual(submit2Data.attempt.missType, 'UNKNOWN');
  assert.strictEqual(submit2Data.attempt.hintUsed, true);
  assert.strictEqual(submit2Data.sessionProgress.currentIndex, 2);
  assert.strictEqual(submit2Data.sessionProgress.unknownCount, 1);
  console.log('OK   [2번 문항 모르겠음] Unknown 플래그 기록, 해설 반환, 진행률(2/3) 갱신 확인');

  // (4) 3번 문제 풀이: 오답 제출 (세션 종료 도달)
  const q3Id = session.questionIds[2];
  const resSubmit3 = await app.inject({
    method: 'POST',
    url: `/api/sessions/${session.id}/submit`,
    payload: {
      questionId: q3Id,
      userAnswer: '완전틀린오답문자열',
      timeSpentMs: 6000,
    },
  });
  assert.strictEqual(resSubmit3.statusCode, 200);
  const submit3Data = JSON.parse(resSubmit3.body);
  assert.strictEqual(submit3Data.isCorrect, false);
  assert.strictEqual(submit3Data.attempt.missType, 'WRONG');
  assert.strictEqual(submit3Data.isSessionCompleted, true, '마지막 문제 제출 후 세션 완료');
  assert.strictEqual(submit3Data.nextQuestionId, null);
  console.log('OK   [3번 문항 오답 제출] 세션 완료(COMPLETED) 상태 전환 확인');

  // (5) 세션 결과 요약 조회: GET /api/sessions/:id/summary
  const resSummary = await app.inject({
    method: 'GET',
    url: `/api/sessions/${session.id}/summary`,
  });
  assert.strictEqual(resSummary.statusCode, 200);
  const summaryData = JSON.parse(resSummary.body);
  assert.strictEqual(summaryData.session.status, 'COMPLETED');
  assert.strictEqual(summaryData.attempts.length, 3);
  assert.strictEqual(summaryData.session.correctCount, 1);
  assert.strictEqual(summaryData.session.unknownCount, 1);
  assert.strictEqual(summaryData.session.wrongCount, 1);
  assert.strictEqual(summaryData.accuracyRate, 33); // 1/3 = 33%
  assert(summaryData.averageTimeSpentSeconds > 0);
  console.log(`OK   [GET /api/sessions/summary] 세션 종합 요약 확인 (정답률: ${summaryData.accuracyRate}%, 평균 풀이시간: ${summaryData.averageTimeSpentSeconds}초)`);

  // (6) DB 영속화된 Attempts 검증
  const savedAttempts = attemptRepo.findBySessionId(session.id);
  assert.strictEqual(savedAttempts.length, 3, 'DB에 3건의 Attempt 저장 확인');
  assert.strictEqual(savedAttempts[0].isCorrect, true);
  assert.strictEqual(savedAttempts[1].isUnknown, true);
  assert.strictEqual(savedAttempts[2].missType, 'WRONG');
  console.log('OK   SQLite attempts 테이블 영속성 및 행동 추적 데이터 일치 확인');

  // (7) 독립 채점 API 검증: POST /api/grade
  const resGradeApi = await app.inject({
    method: 'POST',
    url: '/api/grade',
    payload: {
      userAnswer: 'PK',
      groundTruthAnswer: '기본키',
    },
  });
  assert.strictEqual(resGradeApi.statusCode, 200);
  const gradeApiData = JSON.parse(resGradeApi.body);
  assert.strictEqual(gradeApiData.isCorrect, true, 'PK와 기본키 동의어 채점');
  console.log('OK   [POST /api/grade] 독립 채점 API 정상 동작 확인');

  const resGradeNumeric = await app.inject({
    method: 'POST',
    url: '/api/grade',
    payload: {
      userAnswer: '-5',
      groundTruthAnswer: '5',
      questionType: 'CODE_TRACE',
      language: 'JAVA',
    },
  });
  assert.strictEqual(resGradeNumeric.statusCode, 200);
  assert.strictEqual(JSON.parse(resGradeNumeric.body).isCorrect, false, '독립 채점: -5 ≠ 5');
  console.log('OK   [POST /api/grade] 숫자/코드 출력 오답 보존');

  const drillRes = await app.inject({
    method: 'POST',
    url: '/api/ai/variation-drill',
    payload: { parentQuestionId: 'q_2021_01_03' },
  });
  assert.strictEqual(drillRes.statusCode, 200);
  const drillData = JSON.parse(drillRes.body);
  assert.strictEqual(drillData.success, true);
  assert.strictEqual(drillData.verificationStatus, 'UNVERIFIED');
  assert.strictEqual(drillData.question.studyVisibility, 'TEMPORARY_DRILL');
  assert.strictEqual(drillData.answerSource, 'AI_UNVERIFIED');
  assert.ok(drillData.stagedQuestionId, '백그라운드 Staging 대기열 적재 ID 존재');
  assert.match(drillData.drillSession.title, /비검증 연습/);

  // 비검증 연습 문제 제출 테스트: 채점 점수 0, SRS 미반영 확인
  const drillSubmitRes = await app.inject({
    method: 'POST',
    url: `/api/sessions/${drillData.drillSession.id}/submit`,
    payload: {
      questionId: drillData.question.id,
      userAnswer: '5',
      timeSpentMs: 1500,
    },
  });
  assert.strictEqual(drillSubmitRes.statusCode, 200);
  const drillSubmitData = JSON.parse(drillSubmitRes.body);
  assert.strictEqual(drillSubmitData.isCorrect, false);
  assert.strictEqual(drillSubmitData.score, 0);
  assert.strictEqual(drillSubmitData.isUnverifiedPractice, true);
  assert.strictEqual(drillSubmitData.reviewState, undefined);
  console.log('OK   드릴 실행 검증 불가 시 UNVERIFIED PRACTICE 제공 및 채점/SRS 오염 방지 검증');

  await app.close();
  closeDatabase();
  isolated.cleanup();

  console.log('\n🎉 Phase 3: 문제 풀이, 스마트 채점, 모르겠음 흐름, 세션-Attempt 연동 전체 통과!');
}

testSessionsAndGrading().catch((err) => {
  console.error('FAIL: 테스트 실패:', err);
  process.exit(1);
});
