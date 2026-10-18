// 로컬 개발용: 다른 사용자(김선배)로 로그인해 지정한 닉네임의 사용자를 태그한 기록을 만든다
//   node ./scripts/dev-sample.mjs <대상닉네임>   (wrangler dev 실행 중, DEV_MODE=1)
const API = process.env.API ?? 'http://localhost:8787';
const target = process.argv[2];
if (!target) {
  console.error('사용법: node ./scripts/dev-sample.mjs <대상닉네임>');
  process.exit(1);
}

const call = async (path, { method = 'GET', body, token } = {}) => {
  const res = await fetch(API + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(data)}`);
  return data;
};

const { code } = await call('/dev/login-code', { method: 'POST', body: { telegramId: '20002' } });
const { token } = await call('/auth/verify', { method: 'POST', body: { code } });
await call('/me', { method: 'PATCH', token, body: { nickname: '김선배' } });

const { users } = await call(`/users?q=${encodeURIComponent(target)}`, { token });
const peer = users.find((u) => u.nickname === target);
if (!peer) throw new Error(`사용자 없음: ${target}`);

const { tools, questions } = await call('/catalog', { token });
const q1 = questions.filter((q) => q.category === 'Q1');
const q2 = questions.filter((q) => q.category === 'Q2');
const { record } = await call('/records', {
  method: 'POST',
  token,
  body: {
    peerIds: [peer.id],
    toolId: tools[0]?.id ?? null,
    phoneExchanged: true,
    customerInfo: '40대 직장인, 다음 달 이사 예정.\n가족 4인, 거실 인테리어에 관심 많음.',
    answers: [
      { questionId: q1[0].id, reason: '예산 범위를 물어보지 못했어요' },
      { questionId: q1[1].id, reason: '' },
      { questionId: q2[1].id, reason: '설명할 때 시선이 자료에만 가 있었어요' },
    ],
  },
});
console.log(`기록 #${record.id} 생성 → ${peer.nickname}#${peer.tag}`);
