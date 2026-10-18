# 영업 피드백

영업 기록과 동료 피드백 웹앱 (GitHub Pages PWA) + Cloudflare Workers API / 텔레그램 봇.

```
web/     React + Vite PWA (HashRouter, GitHub Pages)
worker/  Hono API on Cloudflare Workers + D1
  src/app.ts        플랫폼 독립 HTTP 앱 (라우트는 src/http/)
  src/services/     비즈니스 로직 (인증, 기록, 알림, 리포트, 관리자)
  src/jobs/         정기 작업 (Cron: 일일/주간 리포트, 정리)
  src/repo/types.ts 저장소 인터페이스  ← 이전 시 구현체만 교체
  src/repo/d1/      D1 구현체
  src/index.ts      Workers 진입점 (유일한 플랫폼 의존 파일)
```

## 로컬 개발

```bash
cd worker
npm install
cp .dev.vars.example .dev.vars        # DEV_MODE=1 포함
npm run db:migrate:local
npm run db:seed:local                 # 예시 도구/문항
npm run smoke                         # API 스모크 테스트
npm run dev                           # http://localhost:8787

cd ../web
npm install
cp .env.example .env.local
npm run dev                           # http://localhost:5173
```

### 테스트 / 개발 보조 스크립트 (worker/)

| 명령 | 내용 |
|---|---|
| `npm run smoke` | 인증·기록·알림·관리자·리포트·Cron API 스모크 테스트 (로컬 D1 사용) |
| `node scripts/webpush-test.mjs` | Web Push 암호화(aes128gcm)·VAPID 서명 검증 |
| `node scripts/dev-sample.mjs <닉네임>` | 다른 사용자로 해당 닉네임을 태그한 샘플 기록 생성 (dev 서버 실행 중) |
| `npm run gen-vapid` | VAPID 키쌍 생성 (로컬은 `.dev.vars` 에 추가) |

로컬에서는 로그인 화면의 **개발용 코드 발급** 버튼으로 텔레그램 없이 로그인할 수 있습니다
(`DEV_MODE=1` 일 때만 동작, 배포 환경에는 설정하지 않음).
리포트 내용은 발송 없이 미리 볼 수 있습니다:

```bash
npm run report:preview -- weekly 닉네임
```

## 배포

[DEPLOY.md](DEPLOY.md) 참고. 비밀값(`BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `SESSION_PEPPER`, `VAPID_PRIVATE_KEY`)은
`wrangler secret put` 으로만 등록하고 저장소에는 넣지 않습니다.
