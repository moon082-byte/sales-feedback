// 로컬 개발용: 리포트를 발송 없이 미리 보기 (wrangler dev 실행 중, DEV_MODE=1)
//   npm run report:preview -- daily|weekly [닉네임]
const API = process.env.API ?? 'http://localhost:8787';
const kind = process.argv[2] === 'weekly' ? 'weekly' : 'daily';
const nickname = process.argv[3];

const res = await fetch(`${API}/dev/run-reports`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ kind, dryRun: true }),
});
const data = await res.json();
if (!res.ok) throw new Error(JSON.stringify(data));
console.log(`[${kind}] 대상 ${data.targets}명 · 발송 ${data.sent} · 생략 ${data.skipped}\n`);

let users = [];
if (nickname) {
  const { code } = await (await fetch(`${API}/dev/login-code`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json();
  const { token } = await (await fetch(`${API}/auth/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) })).json();
  users = (await (await fetch(`${API}/users?q=${encodeURIComponent(nickname)}`, { headers: { authorization: `Bearer ${token}` } })).json()).users;
}
const ids = new Set(users.map((u) => u.id));
for (const m of data.messages) {
  if (nickname && !ids.has(m.userId)) continue;
  console.log(`── user #${m.userId}\n${m.text}\n`);
}
