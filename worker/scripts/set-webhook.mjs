// 텔레그램 웹훅 연결 + 봇 명령 메뉴 등록
// 사용법 (PowerShell):
//   $env:BOT_TOKEN="..."; $env:BOT_USERNAME="my_sales_bot"; $env:WEBHOOK_SECRET="..."; $env:WORKER_URL="https://sales-feedback-api.<sub>.workers.dev"; npm run set-webhook
//
// 안전장치: 같은 계정의 다른 봇(예: 아맞다)을 실수로 덮어쓰지 않도록
//   1) BOT_USERNAME 이 토큰의 실제 봇 사용자명과 같아야 하고
//   2) 봇에 이미 다른 주소의 웹훅이 연결돼 있으면 중단한다 (의도한 교체라면 FORCE=1)
const { BOT_TOKEN, BOT_USERNAME, WEBHOOK_SECRET, WORKER_URL, FORCE } = process.env;
if (!BOT_TOKEN || !BOT_USERNAME || !WEBHOOK_SECRET || !WORKER_URL) {
  console.error('BOT_TOKEN, BOT_USERNAME, WEBHOOK_SECRET, WORKER_URL 환경변수가 필요합니다.');
  process.exit(1);
}

const tg = async (method, body) => {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`${method} 실패: ${data.description}`);
  return data.result;
};

const fail = (msg) => {
  console.error(`\n중단: ${msg}`);
  process.exit(1);
};

const target = `${WORKER_URL.replace(/\/$/, '')}/telegram/webhook`;
let host;
try {
  host = new URL(target).hostname;
} catch {
  fail(`WORKER_URL 이 올바른 주소가 아닙니다: ${WORKER_URL}`);
}
if (host.startsWith('amatda-bot.')) fail('WORKER_URL 이 아맞다 봇 서버 주소입니다. 영업 피드백 Worker 주소를 입력하세요.');

const me = await tg('getMe');
console.log(`봇: @${me.username} (${me.first_name})`);
if (me.username.toLowerCase() !== BOT_USERNAME.replace(/^@/, '').toLowerCase()) {
  fail(`BOT_TOKEN 의 봇은 @${me.username} 인데 BOT_USERNAME 은 ${BOT_USERNAME} 입니다. 다른 봇의 토큰이 아닌지 확인하세요.`);
}

const info = await tg('getWebhookInfo');
if (info.url && info.url !== target && FORCE !== '1') {
  fail(
    `이 봇에는 이미 다른 웹훅이 연결돼 있습니다:\n  ${info.url}\n` +
      '다른 서비스(예: 아맞다)의 봇이라면 새 봇을 만들어 쓰세요. 의도한 교체라면 $env:FORCE="1" 로 다시 실행하세요.',
  );
}

await tg('setWebhook', {
  url: target,
  secret_token: WEBHOOK_SECRET,
  allowed_updates: ['message'],
  drop_pending_updates: true,
});
console.log(`웹훅 연결: ${target}`);

await tg('setMyCommands', {
  commands: [
    { command: 'login', description: '웹앱 로그인 인증코드 받기' },
    { command: 'today', description: '오늘 받은 평가 요약' },
    { command: 'week', description: '최근 7일 받은 평가 요약' },
    { command: 'myid', description: '내 텔레그램 ID 확인' },
    { command: 'help', description: '도움말' },
  ],
});
console.log('봇 명령 메뉴 등록 완료');
