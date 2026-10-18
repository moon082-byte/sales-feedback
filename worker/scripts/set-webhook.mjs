// 사용법 (PowerShell):
//   $env:BOT_TOKEN="..."; $env:WEBHOOK_SECRET="..."; $env:WORKER_URL="https://sales-feedback-api.<sub>.workers.dev"; npm run set-webhook
const { BOT_TOKEN, WEBHOOK_SECRET, WORKER_URL } = process.env;
if (!BOT_TOKEN || !WEBHOOK_SECRET || !WORKER_URL) {
  console.error('BOT_TOKEN, WEBHOOK_SECRET, WORKER_URL 환경변수가 필요합니다.');
  process.exit(1);
}

const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    url: `${WORKER_URL.replace(/\/$/, '')}/telegram/webhook`,
    secret_token: WEBHOOK_SECRET,
    allowed_updates: ['message'],
    drop_pending_updates: true,
  }),
});
console.log(await res.json());

await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setMyCommands`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    commands: [
      { command: 'login', description: '웹앱 로그인 인증코드 받기' },
      { command: 'today', description: '오늘 받은 평가 요약' },
      { command: 'week', description: '최근 7일 받은 평가 요약' },
      { command: 'myid', description: '내 텔레그램 ID 확인' },
      { command: 'help', description: '도움말' },
    ],
  }),
});
