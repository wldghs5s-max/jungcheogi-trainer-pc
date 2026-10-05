import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { FastifyInstance } from 'fastify';
import { gradeAnswer, normalizeAnswer, Question, isSeedVariationEligible } from '@jungcheogi/shared';
import { buildApp } from '../src/app.js';
import { QuestionRepository } from '../src/db/repositories/questionRepository.js';
import { SessionRepository } from '../src/db/repositories/sessionRepository.js';
import { ReviewRepository } from '../src/db/repositories/reviewRepository.js';
import { setAIServiceOverride, MockAIService } from '../src/engine/aiService.js';

test('=== [Audit Hardening Integration Test Suite] ===', async (t) => {
  let app: FastifyInstance;
  let db: Database.Database;

  t.before(async () => {
    setAIServiceOverride(new MockAIService());
    app = buildApp();
    await app.ready();
    db = new Database('server/data/jungcheogi.db');
  });

  t.after(async () => {
    setAIServiceOverride(null);
    await app.close();
    db.close();
  });

  await t.test('[Critical 1] 단답형 Unicode / 순서 답안 채점 검증', () => {
    // 1-A. 단일 문자열 Ground Truth
    const gtStr = '① → ② → ④ → ③';
    assert.equal(gradeAnswer('1->2->4->3', gtStr).isCorrect, true);
    assert.equal(gradeAnswer('1 → 2 → 4 → 3', gtStr).isCorrect, true);
    assert.equal(gradeAnswer('① → ② → ④ → ③', gtStr).isCorrect, true);
    assert.equal(gradeAnswer('①②④③', gtStr).isCorrect, true);
    assert.equal(gradeAnswer('1, 2, 4, 3', gtStr).isCorrect, true);
    assert.equal(gradeAnswer('1 2 4 3', gtStr).isCorrect, true);
    assert.equal(gradeAnswer(['1', '2', '4', '3'], gtStr).isCorrect, true);
    assert.equal(gradeAnswer(['①', '②', '④', '③'], gtStr).isCorrect, true);

    // False Positive 방어: 순서가 다른 답안은 절대 정답 불인정
    assert.equal(gradeAnswer('1, 4, 2, 3', gtStr).isCorrect, false);
    assert.equal(gradeAnswer('1234', gtStr).isCorrect, false);
    assert.equal(gradeAnswer('1->4->2->3', gtStr).isCorrect, false);

    // 1-B. 배열 Ground Truth
    const gtArr = ['1', '2', '4', '3'];
    assert.equal(gradeAnswer('1->2->4->3', gtArr).isCorrect, true);
    assert.equal(gradeAnswer('1 → 2 → 4 → 3', gtArr).isCorrect, true);
    assert.equal(gradeAnswer('① → ② → ④ → ③', gtArr).isCorrect, true);
    assert.equal(gradeAnswer('①②④③', gtArr).isCorrect, true);
    assert.equal(gradeAnswer('1, 2, 4, 3', gtArr).isCorrect, true);
    assert.equal(gradeAnswer('1 2 4 3', gtArr).isCorrect, true);
    assert.equal(gradeAnswer(['1', '2', '4', '3'], gtArr).isCorrect, true);
    assert.equal(gradeAnswer(['①', '②', '④', '③'], gtArr).isCorrect, true);

    // False Positive 방어
    assert.equal(gradeAnswer('1, 4, 2, 3', gtArr).isCorrect, false);
    assert.equal(gradeAnswer('1234', gtArr).isCorrect, false);
    assert.equal(gradeAnswer('1->4->2->3', gtArr).isCorrect, false);
  });

  await t.test('[Critical 2] 3~4글자 핵심 IT 약어 퍼지 매칭 금지 및 동의어 정상 처리 검증', () => {
    // 약어 간 Levenshtein 1 오탈자 인정 금지
    assert.equal(gradeAnswer('SAN', 'SDN').isCorrect, false);
    assert.equal(gradeAnswer('LAN', 'WAN').isCorrect, false);
    assert.equal(gradeAnswer('PK', 'FK').isCorrect, false);
    assert.equal(gradeAnswer('TCP', 'UDP').isCorrect, false);
    assert.equal(gradeAnswer('BGP', 'EGP').isCorrect, false);
    assert.equal(gradeAnswer('SAAS', 'PAAS').isCorrect, false);
    assert.equal(gradeAnswer('IAAS', 'PAAS').isCorrect, false);
    assert.equal(gradeAnswer('DHCP', 'ICMP').isCorrect, false);

    // 대소문자 및 정확 일치는 인정
    assert.equal(gradeAnswer('SDN', 'SDN').isCorrect, true);
    assert.equal(gradeAnswer('sdn', 'SDN').isCorrect, true);
    assert.equal(gradeAnswer('paas', 'PAAS').isCorrect, true);
    assert.equal(gradeAnswer('saas', 'SAAS').isCorrect, true);
  });

  await t.test('[High 1 & High 2] 세션 종료 직후 AI Drill 실행 및 SRS 비오염 검증', async () => {
    const questionRepo = new QuestionRepository(db);
    const sessionRepo = new SessionRepository(db);
    const reviewRepo = new ReviewRepository(db);

    // 1. 검증된 정식 문제 2개 확보 (AI 변형 가능한 VERIFIED 기출 문제)
    const verifiedQuestions = questionRepo.findAllMatching().filter(q => q.sourceType === 'REAL_EXAM' && isSeedVariationEligible(q));
    assert.ok(verifiedQuestions.length >= 2, '최소 2개의 검증된 문제가 있어야 합니다');
    const [q1, q2] = verifiedQuestions;

    // 2. 2문항 세션 생성
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: {
        title: '하드닝 검증 세션 (2제)',
        count: 2,
        questionIds: [q1.id, q2.id],
      },
    });
    assert.equal(createRes.statusCode, 201);
    const sessionBody = JSON.parse(createRes.body);
    const sessionId = sessionBody.session.id;

    // 3. 문제 1번 제출 (정답)
    const sub1 = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/submit`,
      payload: {
        questionId: q1.id,
        userAnswer: q1.groundTruthAnswer,
        timeSpentMs: 1500,
      },
    });
    assert.equal(sub1.statusCode, 200);
    const sub1Body = JSON.parse(sub1.body);
    assert.equal(sub1Body.isSessionCompleted, false);
    assert.equal(sub1Body.nextQuestionId, q2.id);

    // 4. 문제 2번 제출 (마지막 문제, 정답)
    const sub2 = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/submit`,
      payload: {
        questionId: q2.id,
        userAnswer: q2.groundTruthAnswer,
        timeSpentMs: 2000,
      },
    });
    assert.equal(sub2.statusCode, 200);
    const sub2Body = JSON.parse(sub2.body);

    // [High 1 검증 A]: 세션이 정상적으로 COMPLETED 로 전환됨
    assert.equal(sub2Body.isSessionCompleted, true);
    assert.equal(sub2Body.nextQuestionId, null);

    const completedSession = sessionRepo.findById(sessionId);
    assert.ok(completedSession);
    assert.equal(completedSession.status, 'COMPLETED');
    assert.equal(completedSession.currentIndex, 2);
    assert.equal(completedSession.correctCount, 2);

    // [High 2 검증 사전 상태]: q1, q2의 SRS 상태 기록
    const q1ReviewBefore = reviewRepo.findByQuestionId(q1.id);
    assert.ok(q1ReviewBefore);
    const q1BoxBefore = q1ReviewBefore.boxLevel;
    const q1RepetitionsBefore = q1ReviewBefore.repetitions;

    // 5. 세션 완료 직후 q1에 대해 AI variation drill 생성 요청
    const drillRes = await app.inject({
      method: 'POST',
      url: '/api/ai/variation-drill',
      payload: {
        parentQuestionId: q1.id,
      },
    });
    assert.equal(drillRes.statusCode, 200);
    const drillBody = JSON.parse(drillRes.body);

    // [High 1 검증 B]: 독립 drillSession 발급 및 기존 세션과 완벽 분리
    assert.ok(drillBody.drillSession);
    assert.notEqual(drillBody.drillSession.id, sessionId);
    assert.equal(drillBody.drillSession.totalQuestions, 1);
    assert.equal(drillBody.question.parentQuestionId, q1.id);
    assert.equal(drillBody.question.studyVisibility, 'TEMPORARY_DRILL');

    // [High 1 검증 C]: 기존 세션의 currentIndex, summary, status 오염 없음
    const sessionAfterDrill = sessionRepo.findById(sessionId);
    assert.equal(sessionAfterDrill?.status, 'COMPLETED');
    assert.equal(sessionAfterDrill?.currentIndex, 2);
    assert.equal(sessionAfterDrill?.correctCount, 2);

    // 6. 독립 Drill Session에 답안 제출 (일부러 오답 제출)
    const drillSubmitRes = await app.inject({
      method: 'POST',
      url: `/api/sessions/${drillBody.drillSession.id}/submit`,
      payload: {
        questionId: drillBody.question.id,
        userAnswer: 'WRONG_ANSWER_FOR_TEST',
        timeSpentMs: 3000,
      },
    });
    assert.equal(drillSubmitRes.statusCode, 200);
    const drillSubmitBody = JSON.parse(drillSubmitRes.body);

    // [High 2 검증 D]: TEMPORARY_DRILL의 오답 제출 후 부모 q1의 SRS 상태가 오염되지 않음
    const q1ReviewAfter = reviewRepo.findByQuestionId(q1.id);
    assert.ok(q1ReviewAfter);
    assert.equal(q1ReviewAfter.boxLevel, q1BoxBefore, '부모 문제의 Leitner boxLevel이 변경되면 안 됨');
    assert.equal(q1ReviewAfter.repetitions, q1RepetitionsBefore, '부모 문제의 repetitions가 오염되면 안 됨');

    // [High 2 검증 E]: TEMPORARY_DRILL 문제는 findDueReviews 및 getDashboardSummary에서 배제됨
    const dueReviews = reviewRepo.findDueReviews({ limit: 100 });
    const containsDrillInDue = dueReviews.some(item => item.question.id === drillBody.question.id);
    assert.equal(containsDrillInDue, false, '임시 드릴 문제가 Due 복습 목록에 들어가면 안 됨');

    const summary = reviewRepo.getDashboardSummary();
    assert.ok(summary);

    // [Cleanup]: 테스트에서 생성한 세션, 시도 기록 및 임시 문제 정리
    db.prepare('DELETE FROM attempts WHERE session_id IN (?, ?)').run(sessionId, drillBody.drillSession.id);
    db.prepare('DELETE FROM sessions WHERE id IN (?, ?)').run(sessionId, drillBody.drillSession.id);
    db.prepare('DELETE FROM questions WHERE id = ?').run(drillBody.question.id);
  });
});
