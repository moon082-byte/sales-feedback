// 로컬 D1로 워커를 띄워 인증 흐름을 검증한 뒤 종료하는 스모크 테스트
//   npm run smoke   (사전: npm run db:migrate:local, .dev.vars 에 DEV_MODE=1)
import { unstable_dev } from 'wrangler';
import assert from 'node:assert/strict';

const worker = await unstable_dev('src/index.ts', {
  experimental: { disableExperimentalWarning: true, testScheduled: true },
  local: true,
  logLevel: 'warn',
});

const call = async (path, { method = 'GET', body, token, headers = {} } = {}) => {
  const res = await worker.fetch(path, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null), headers: res.headers };
};

const step = (name) => console.log('✓', name);

try {
  const tid = String(90000 + Math.floor(Math.random() * 9999));

  let r = await call('/me');
  assert.equal(r.status, 401);
  step('미인증 /me → 401');

  r = await call('/telegram/webhook', { method: 'POST', body: {} });
  assert.equal(r.status, 403);
  step('시크릿 없는 웹훅 → 403');

  r = await call('/auth/verify', { method: 'POST', body: { code: '000000' }, headers: { 'cf-connecting-ip': `t-${tid}` } });
  assert.equal(r.status, 400);
  step('잘못된 코드 → 400');

  r = await call('/dev/login-code', { method: 'POST', body: { telegramId: tid } });
  assert.equal(r.status, 200);
  const code = r.data.code;
  assert.match(code, /^\d{6}$/);
  step('개발용 코드 발급');

  r = await call('/auth/verify', { method: 'POST', body: { code }, headers: { 'cf-connecting-ip': `t-${tid}` } });
  assert.equal(r.status, 200);
  const token = r.data.token;
  assert.equal(r.data.user.nickname, null);
  step('코드 검증 → 세션 발급, 닉네임 없음');

  r = await call('/auth/verify', { method: 'POST', body: { code }, headers: { 'cf-connecting-ip': `t-${tid}` } });
  assert.equal(r.status, 400);
  step('같은 코드 재사용 → 400');

  r = await call('/me', { method: 'PATCH', token, body: { nickname: 'a' } });
  assert.equal(r.status, 400);
  step('짧은 닉네임 거부');

  r = await call('/me', { method: 'PATCH', token, body: { nickname: '테스터' } });
  assert.equal(r.status, 200);
  assert.match(r.data.user.tag, /^\d{4}$/);
  step(`닉네임 설정 → ${r.data.user.nickname}#${r.data.user.tag}`);

  r = await call('/me/settings', { method: 'PATCH', token, body: { reportDaily: false } });
  assert.equal(r.data.settings.reportDaily, false);
  assert.equal(r.data.settings.notifyTelegram, true);
  step('설정 변경');

  r = await call('/users?q=테스', { token });
  assert.equal(r.status, 200);
  step(`사용자 검색 (자기 자신 제외) → ${r.data.users.length}명`);

  r = await call('/me', { headers: { origin: 'http://localhost:5173' }, token });
  assert.equal(r.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  r = await call('/me', { headers: { origin: 'https://evil.example' }, token });
  assert.equal(r.headers.get('access-control-allow-origin'), null);
  step('CORS 허용 출처만 통과');

  r = await call('/auth/logout', { method: 'POST', token });
  r = await call('/me', { token });
  assert.equal(r.status, 401);
  step('로그아웃 후 토큰 무효');

  let last;
  for (let i = 0; i < 11; i++) {
    last = await call('/auth/verify', { method: 'POST', body: { code: '111111' }, headers: { 'cf-connecting-ip': `rl-${tid}` } });
  }
  assert.equal(last.status, 429);
  step('코드 입력 시도 제한 → 429');

  // ---------- 2단계: 영업 기록 / 알림 ----------
  const login = async (telegramId, nickname) => {
    const { data } = await call('/dev/login-code', { method: 'POST', body: { telegramId } });
    const v = await call('/auth/verify', { method: 'POST', body: { code: data.code }, headers: { 'cf-connecting-ip': `l-${telegramId}` } });
    const t = v.data.token;
    const p = await call('/me', { method: 'PATCH', token: t, body: { nickname } });
    return { token: t, user: p.data.user };
  };
  const A = await login(`${tid}1`, '작성자');
  const B = await login(`${tid}2`, '동료');
  const C = await login(`${tid}3`, '외부인');

  r = await call('/catalog', { token: A.token });
  const { tools, questions } = r.data;
  assert.ok(tools.length > 0 && questions.length > 0, 'seed 데이터 필요: npm run db:seed:local');
  const q1 = questions.find((q) => q.category === 'Q1');
  const q2 = questions.find((q) => q.category === 'Q2');
  step(`카탈로그: 도구 ${tools.length}, 문항 ${questions.length}`);

  r = await call('/records', { method: 'POST', token: A.token, body: { peerIds: [B.user.id], phoneExchanged: true } });
  assert.equal(r.status, 400);
  step('도구 미선택 → 400');

  r = await call('/records', { method: 'POST', token: A.token, body: { peerIds: [999999], toolId: tools[0].id, phoneExchanged: true } });
  assert.equal(r.status, 400);
  step('없는 동료 → 400');

  r = await call('/records', {
    method: 'POST',
    token: A.token,
    body: {
      peerIds: [B.user.id, A.user.id],
      toolId: tools[0].id,
      phoneExchanged: true,
      customerInfo: '30대, 이사 예정',
      answers: [
        { questionId: q1.id, reason: '예산을 묻지 못함' },
        { questionId: q2.id, reason: '' },
      ],
    },
  });
  assert.equal(r.status, 201);
  const rec = r.data.record;
  assert.deepEqual(rec.peers.map((p) => p.id), [B.user.id]);
  assert.equal(rec.answers.length, 2);
  assert.equal(rec.answers[0].questionText, q1.text);
  step('기록 작성 (자기 자신은 동료에서 제외, 문항 스냅샷 저장)');

  r = await call('/notifications/unread-count', { token: B.token });
  assert.equal(r.data.count, 1);
  r = await call('/notifications', { token: B.token });
  assert.equal(r.data.items[0].recordId, rec.id);
  assert.equal(r.data.items[0].actor.id, A.user.id);
  step('동료 알림함에 알림 생성');

  r = await call('/records?scope=received', { token: B.token });
  assert.equal(r.data.total, 1);
  assert.equal(r.data.items[0].q1Count, 1);
  r = await call('/records?scope=written', { token: A.token });
  assert.equal(r.data.total, 1);
  r = await call('/records?scope=received', { token: A.token });
  assert.equal(r.data.total, 0);
  step('받은 평가 / 내가 쓴 기록 분리');

  const now = Date.now();
  r = await call(`/records/timestamps?scope=received&from=${now - 86400000}&to=${now + 86400000}`, { token: B.token });
  assert.equal(r.data.timestamps.length, 1);
  r = await call(`/records?scope=received&from=${now + 86400000}&to=${now + 2 * 86400000}`, { token: B.token });
  assert.equal(r.data.total, 0);
  step('날짜 범위 조회');

  r = await call(`/records/${rec.id}`, { token: B.token });
  assert.equal(r.status, 200);
  r = await call(`/records/${rec.id}`, { token: C.token });
  assert.equal(r.status, 404);
  step('상세: 동료 열람 가능, 무관한 사용자 404');

  r = await call(`/records/${rec.id}`, { method: 'PATCH', token: B.token, body: { toolId: tools[0].id, phoneExchanged: false } });
  assert.equal(r.status, 403);
  r = await call(`/records/${rec.id}`, {
    method: 'PATCH',
    token: A.token,
    body: { peerIds: [B.user.id, C.user.id], toolId: tools[0].id, phoneExchanged: false, answers: [] },
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.record.answers.length, 0);
  r = await call('/notifications/unread-count', { token: B.token });
  assert.equal(r.data.count, 1, '기존 동료에게는 중복 알림 없음');
  r = await call('/notifications/unread-count', { token: C.token });
  assert.equal(r.data.count, 1, '새로 추가된 동료에게만 알림');
  step('수정: 작성자만 가능, 새로 추가된 동료에게만 알림');

  r = await call('/stats/summary', { token: A.token });
  assert.deepEqual([r.data.sales, r.data.phoneExchanged], [1, 0]);
  r = await call('/stats/summary', { token: C.token });
  assert.equal(r.data.sales, 1);
  step('최근 7일 요약 (작성 + 참여)');

  await call('/notifications/read', { method: 'POST', token: B.token, body: {} });
  r = await call('/notifications/unread-count', { token: B.token });
  assert.equal(r.data.count, 0);
  step('알림 모두 읽음');

  r = await call('/push/public-key');
  assert.ok(r.data.publicKey, '.dev.vars 에 VAPID 키 필요');
  r = await call('/push/subscribe', { method: 'POST', token: B.token, body: { endpoint: 'http://insecure', keys: { p256dh: 'x', auth: 'y' } } });
  assert.equal(r.status, 400);
  step('푸시 공개키 제공, 잘못된 구독 거부');

  // ---------- 3단계: 관리자 ----------
  const ADM = await login('99999', '관리자');
  assert.equal(ADM.user.role, 'admin', '.dev.vars ADMIN_TELEGRAM_IDS 에 99999 필요');

  r = await call('/admin/catalog', { token: A.token });
  assert.equal(r.status, 403);
  r = await call('/admin/stats', { token: A.token });
  assert.equal(r.status, 403);
  step('일반 사용자 관리자 API → 403');

  // 도구: 추가 → 이름 변경 → 순서 변경 → 삭제(미사용=삭제, 사용중=비활성화)
  r = await call('/admin/tools', { method: 'POST', token: ADM.token, body: { name: '  테스트   도구 ' } });
  assert.equal(r.status, 201);
  const newTool = r.data.tool;
  assert.equal(newTool.name, '테스트 도구');
  r = await call(`/admin/tools/${newTool.id}`, { method: 'PATCH', token: ADM.token, body: { name: '테스트 도구2' } });
  assert.equal(r.data.tool.name, '테스트 도구2');
  r = await call('/admin/catalog', { token: ADM.token });
  const toolIds = r.data.tools.map((t) => t.id);
  r = await call('/admin/tools/reorder', { method: 'POST', token: ADM.token, body: { ids: [...toolIds].reverse() } });
  assert.equal(r.status, 200);
  r = await call('/admin/catalog', { token: ADM.token });
  assert.deepEqual(r.data.tools.map((t) => t.id), [...toolIds].reverse());
  r = await call('/admin/tools/reorder', { method: 'POST', token: ADM.token, body: { ids: toolIds.slice(1) } });
  assert.equal(r.status, 409);
  await call('/admin/tools/reorder', { method: 'POST', token: ADM.token, body: { ids: toolIds } });
  r = await call(`/admin/tools/${newTool.id}`, { method: 'DELETE', token: ADM.token });
  assert.equal(r.data.result, 'deleted');
  r = await call(`/admin/tools/${tools[0].id}`, { method: 'DELETE', token: ADM.token });
  assert.equal(r.data.result, 'deactivated');
  r = await call('/catalog', { token: A.token });
  assert.ok(!r.data.tools.some((t) => t.id === tools[0].id));
  await call(`/admin/tools/${tools[0].id}`, { method: 'PATCH', token: ADM.token, body: { isActive: true } });
  step('도구 추가·수정·순서·삭제(사용 중이면 비활성화)');

  r = await call('/admin/questions', { method: 'POST', token: ADM.token, body: { category: 'Q3', text: 'x' } });
  assert.equal(r.status, 400);
  r = await call('/admin/questions', { method: 'POST', token: ADM.token, body: { category: 'Q2', text: '마무리 멘트' } });
  const newQ = r.data.question;
  r = await call(`/admin/questions/${newQ.id}`, { method: 'PATCH', token: ADM.token, body: { text: '마무리 인사' } });
  assert.equal(r.data.question.text, '마무리 인사');
  r = await call(`/admin/questions/${newQ.id}`, { method: 'DELETE', token: ADM.token });
  assert.equal(r.data.result, 'deleted');
  step('문항 추가·수정·삭제, 잘못된 구분 거부');

  // 전체 기록 / 수정 / 분석
  r = await call(`/admin/records?userId=${B.user.id}`, { token: ADM.token });
  assert.equal(r.data.total, 1);
  r = await call(`/admin/records?toolId=${tools[0].id}&from=${now - 86400000}`, { token: ADM.token });
  assert.ok(r.data.total >= 1);
  r = await call(`/records/${rec.id}`, { token: ADM.token });
  assert.equal(r.status, 200);
  r = await call(`/records/${rec.id}`, {
    method: 'PATCH',
    token: ADM.token,
    body: { peerIds: [B.user.id, C.user.id], toolId: tools[0].id, phoneExchanged: true, customerInfo: '관리자 수정', answers: [{ questionId: q1.id, reason: '' }] },
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.record.author.id, A.user.id, '관리자가 수정해도 작성자는 유지');
  step('관리자: 사용자·도구·기간 필터, 타인 기록 열람·수정');

  r = await call(`/admin/stats?userId=${A.user.id}`, { token: ADM.token });
  assert.equal(r.data.totals.records, 1);
  assert.equal(r.data.totals.phoneExchanged, 1);
  const rowA = r.data.byUser.find((u) => u.user.id === A.user.id);
  const rowB = r.data.byUser.find((u) => u.user.id === B.user.id);
  assert.deepEqual([rowA.written, rowA.participated, rowB.written, rowB.participated], [1, 0, 0, 1]);
  assert.equal(r.data.byTool[0].tool.id, tools[0].id);
  assert.equal(r.data.byQuestion[0].questionId, q1.id);
  assert.equal(r.data.byDay.length, 1);
  assert.match(r.data.byDay[0].date, /^\d{4}-\d{2}-\d{2}$/);
  step('분석: 합계·사용자별·도구별·문항별·일별');

  // 권한
  r = await call(`/admin/users/${B.user.id}`, { method: 'PATCH', token: ADM.token, body: { role: 'admin' } });
  assert.equal(r.data.user.role, 'admin');
  r = await call('/admin/catalog', { token: B.token });
  assert.equal(r.status, 200);
  r = await call(`/admin/users/${B.user.id}`, { method: 'PATCH', token: ADM.token, body: { role: 'user' } });
  assert.equal(r.data.user.role, 'user');
  r = await call(`/admin/users/${ADM.user.id}`, { method: 'PATCH', token: ADM.token, body: { role: 'user' } });
  assert.equal(r.status, 409);
  step('권한 부여·해제, 환경설정 관리자 해제 거부');

  r = await call(`/admin/records/${rec.id}`, { method: 'DELETE', token: A.token });
  assert.equal(r.status, 403);
  r = await call(`/admin/records/${rec.id}`, { method: 'DELETE', token: ADM.token });
  assert.equal(r.status, 200);
  r = await call(`/records/${rec.id}`, { token: A.token });
  assert.equal(r.status, 404);
  r = await call('/notifications', { token: B.token });
  assert.ok(!r.data.items.some((n) => n.recordId === rec.id), '삭제된 기록의 알림도 정리');
  step('기록 삭제: 관리자만, 관련 알림 정리');

  // ---------- 4단계: 리포트 ----------
  r = await call('/records', {
    method: 'POST',
    token: A.token,
    body: {
      peerIds: [B.user.id],
      toolId: tools[0].id,
      phoneExchanged: true,
      answers: [{ questionId: q1.id, reason: '' }, { questionId: q2.id, reason: '' }],
    },
  });
  assert.equal(r.status, 201);
  await call('/me/settings', { method: 'PATCH', token: C.token, body: { reportDaily: false } });

  r = await call('/dev/run-reports', { method: 'POST', body: { kind: 'daily' } });
  const dailyB = r.data.messages.find((m) => m.userId === B.user.id);
  assert.ok(dailyB, 'B 에게 일일 리포트');
  assert.match(dailyB.text, /받은 평가 <b>1건<\/b> · 번호교환 1건/);
  assert.ok(dailyB.text.includes(`작성자#${A.user.tag} 1건`));
  assert.ok(dailyB.text.includes(q1.text) && dailyB.text.includes(q2.text));
  assert.ok(!r.data.messages.some((m) => m.userId === A.user.id), '받은 평가 없으면 일일 리포트 생략');
  assert.ok(!r.data.messages.some((m) => m.userId === C.user.id), '일일 리포트 OFF 사용자 제외');
  step('일일 리포트: 받은 평가 요약, 0건 생략, OFF 제외');

  r = await call('/dev/run-reports', { method: 'POST', body: { kind: 'daily', now: Date.now() + 86400000 } });
  assert.ok(!r.data.messages.some((m) => m.userId === B.user.id), '다음 날에는 포함되지 않음');
  r = await call('/dev/run-reports', { method: 'POST', body: { kind: 'weekly', now: Date.now() + 3 * 86400000 } });
  assert.match(r.data.messages.find((m) => m.userId === B.user.id).text, /최근 7일 받은 평가[\s\S]*1건/);
  const weeklyC = r.data.messages.find((m) => m.userId === C.user.id);
  assert.ok(weeklyC && weeklyC.text.includes('받은 평가가 없어요'), '주간 리포트는 0건이어도 발송');
  step('주간 리포트: 7일 범위, 0건도 발송 / 날짜 경계');

  r = await call('/telegram/webhook', {
    method: 'POST',
    headers: { 'X-Telegram-Bot-Api-Secret-Token': 'local-webhook-secret' },
    body: { message: { text: '/today', chat: { id: Number(`${tid}2`), type: 'private' }, from: { id: Number(`${tid}2`) } } },
  });
  assert.equal(r.status, 200);
  step('봇 /today 명령 처리');

  const sched = await worker.fetch('/__scheduled?cron=0+12+*+*+*');
  assert.equal(sched.status, 200, 'Cron 핸들러 실행');
  step('Cron(scheduled) 핸들러 실행');

  console.log('\nALL PASSED');
} finally {
  await worker.stop();
}
