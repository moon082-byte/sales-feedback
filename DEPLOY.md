# 배포 가이드

서버(Cloudflare Workers + D1)를 먼저 배포하고, 그 주소를 웹앱(GitHub Pages) 빌드에 넣는 순서로 진행합니다.
명령은 Windows PowerShell 기준입니다.

```
[텔레그램] ⇄ 웹훅 ⇄ [Cloudflare Worker + D1 + Cron] ⇄ API ⇄ [GitHub Pages 웹앱(PWA)]
```

> **아맞다 앱과 같은 Cloudflare·GitHub 계정을 쓴다면** 먼저 [9. 아맞다와 함께 운영할 때](#9-아맞다와-함께-운영할-때)를 읽어 주세요.

## 0. 준비물

- Node.js 20 이상 (권장 22)
- Cloudflare 계정 (무료 플랜으로 시작 가능)
- GitHub 계정. **무료 계정은 공개(public) 저장소에서만 GitHub Pages를 쓸 수 있습니다.**
  저장소에는 비밀값이 없으므로 공개해도 되지만, 비공개로 하려면 GitHub Pro 이상이 필요합니다.
- 텔레그램 앱

## 1. 텔레그램 봇 만들기

1. 텔레그램에서 **@BotFather** 를 열고 `/newbot` 을 보냅니다.
2. 봇 이름과 사용자명(`..._bot` 으로 끝나야 함)을 정합니다.
3. 받은 **봇 토큰**(`123456789:AA...`)과 **봇 사용자명**을 메모합니다. 토큰은 비밀번호처럼 다루세요.

## 2. 서버 배포 (Cloudflare Workers)

```powershell
cd C:\dev_sales\worker
npm ci
npx wrangler login
```

### 2-1. D1 데이터베이스 만들기

```powershell
npx wrangler d1 create sales-feedback
```

출력된 `database_id` 를 `worker/wrangler.toml` 의 `database_id` 에 붙여넣은 뒤 스키마를 적용합니다.

```powershell
npm run db:migrate:remote
```

> `seed/dev-seed.sql` 은 로컬 테스트용입니다. 운영 도구·문항은 관리자 화면에서 등록하세요.

### 2-2. 공개 설정값 (`wrangler.toml` 의 `[vars]`)

```powershell
npm run gen-vapid      # VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY 출력 (한 번만 생성해서 계속 사용)
```

| 이름 | 값 |
|---|---|
| `ALLOWED_ORIGINS` | 웹앱 출처. 예: `https://<github아이디>.github.io` (경로 없이) |
| `WEB_APP_URL` | 웹앱 전체 주소. 예: `https://<github아이디>.github.io/<저장소이름>/` |
| `ADMIN_TELEGRAM_IDS` | 관리자 텔레그램 숫자 ID (콤마 구분). 2-5에서 확인 후 입력 |
| `VAPID_PUBLIC_KEY` | `gen-vapid` 의 공개키 |
| `VAPID_SUBJECT` | `mailto:<연락받을 이메일>` |

선택 값: `TZ_OFFSET_MINUTES` (기본 540 = KST), `REPORT_MAX_SENDS` (기본 45, 아래 '운영' 참고)

### 2-3. 비밀값 (secret)

비밀값은 저장소에 커밋하지 않고 Cloudflare에만 저장합니다. 각 명령 실행 후 값을 붙여넣습니다.

```powershell
# 무작위 값 만들기 (TELEGRAM_WEBHOOK_SECRET, SESSION_PEPPER 용으로 각각 한 번씩)
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"

npx wrangler secret put BOT_TOKEN                # 1단계의 봇 토큰
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET  # 무작위 값
npx wrangler secret put SESSION_PEPPER           # 무작위 값 (바꾸면 모든 사용자가 다시 로그인해야 함)
npx wrangler secret put VAPID_PRIVATE_KEY        # gen-vapid 의 개인키
```

> ⚠️ `DEV_MODE` 는 운영 환경에 절대 설정하지 마세요. 설정하면 텔레그램 없이 로그인 코드를 발급하는 개발용 API가 열립니다.

### 2-4. 배포와 웹훅 연결

```powershell
npm run deploy
```

출력된 주소(`https://sales-feedback-api.<계정>.workers.dev`)를 메모하고 텔레그램 웹훅을 연결합니다.

```powershell
$env:BOT_TOKEN="봇 토큰"; $env:BOT_USERNAME="1단계의 봇 사용자명"; $env:WEBHOOK_SECRET="2-3의 TELEGRAM_WEBHOOK_SECRET"; $env:WORKER_URL="https://sales-feedback-api.<계정>.workers.dev"; npm run set-webhook
```

`웹훅 연결: ...` 과 `봇 명령 메뉴 등록 완료` 가 나오면 성공입니다.
다른 봇의 토큰이거나(사용자명 불일치), 이미 다른 서비스의 웹훅이 연결된 봇이면 아무것도 바꾸지 않고 중단합니다.

### 2-5. 관리자 지정

1. 봇에게 `/myid` 를 보내 내 텔레그램 ID를 확인합니다.
2. `wrangler.toml` 의 `ADMIN_TELEGRAM_IDS` 에 넣고 `npm run deploy` 로 다시 배포합니다.
3. 웹앱에서 **다시 로그인**하면 관리자가 됩니다. 이후 다른 관리자는 웹앱의 [설정 → 관리자 메뉴 → 사용자 권한]에서 지정할 수 있습니다.

## 3. 웹앱 배포 (GitHub Pages)

1. GitHub에서 새 저장소를 만듭니다 (예: `sales-feedback`). README 등은 추가하지 않습니다.
2. 로컬 저장소를 올립니다.
   ```powershell
   cd C:\dev_sales
   git remote add origin https://github.com/<github아이디>/<저장소이름>.git
   git push -u origin main
   ```
3. 저장소 **Settings → Pages → Build and deployment → Source** 를 **GitHub Actions** 로 바꿉니다.
4. **Settings → Secrets and variables → Actions → Variables** 탭에서 변수를 추가합니다.
   | 이름 | 값 |
   |---|---|
   | `VITE_API_BASE` | Workers 주소 (예: `https://sales-feedback-api.<계정>.workers.dev`) |
   | `VITE_BOT_USERNAME` | 봇 사용자명 (`@` 제외) |
5. **Actions → Deploy web (GitHub Pages) → Run workflow** 로 실행합니다. 이후에는 `web/` 이 바뀐 커밋을 push 할 때마다 자동 배포됩니다.
6. 완료되면 `https://<github아이디>.github.io/<저장소이름>/` 에서 열립니다. 이 주소가 2-2의 `WEB_APP_URL` / `ALLOWED_ORIGINS` 와 맞는지 확인하세요.

## 4. 사용 시작

1. 봇에게 `/login` → 받은 6자리 코드를 웹앱에 입력 → 닉네임 설정
2. 관리자: [설정 → 관리자 메뉴]에서 **도구**와 **평가 문항(Q1, Q2)** 을 먼저 등록
3. 홈 화면 추가와 푸시 알림
   - **iPhone (iOS 16.4 이상)**: Safari로 열기 → 공유 → **홈 화면에 추가** → 홈 화면 아이콘으로 실행 → [설정 → 푸시 알림] 켜기
   - **Android**: Chrome 메뉴 → **앱 설치** 또는 **홈 화면에 추가** → [설정 → 푸시 알림] 켜기
   - **PC Chrome**: [설정 → 푸시 알림] 켜기 → 브라우저의 알림 허용

## 5. 정기 리포트 (Cron)

- `wrangler.toml` 의 `crons = ["0 12 * * *"]` → **매일 21:00 KST** 실행
  - 일일 리포트: 오늘 받은 평가 요약. **받은 평가가 없는 날은 보내지 않습니다.**
  - 주간 리포트: **일요일**에 최근 7일 요약을 함께 발송 (0건이어도 발송)
  - 만료된 세션·로그인 코드 정리
- 사용자는 웹앱 [설정 → 텔레그램 알림]에서 일일/주간 리포트를 각각 켜고 끌 수 있고, 봇에게 `/today`, `/week` 를 보내 즉시 받아볼 수도 있습니다.
- 시간을 바꾸려면 cron 식(UTC 기준)을 고친 뒤 다시 배포합니다. 예: 매일 18:00 KST → `"0 9 * * *"`

## 6. 운영

| 작업 | 방법 |
|---|---|
| 실시간 로그 | `npx wrangler tail` |
| 백업 | `npx wrangler d1 export sales-feedback --remote --output backup.sql` |
| 스키마 변경 | `worker/migrations/0002_*.sql` 추가 → `npm run db:migrate:remote` → `npm run deploy` |
| 서버 재배포 | `npm run deploy`, 또는 GitHub Actions의 **Deploy worker**(아래) |
| 웹 재배포 | `main` 에 push (자동) |

**GitHub Actions로 서버 배포하기 (선택)**: Cloudflare 대시보드 → My Profile → API Tokens → "Edit Cloudflare Workers" 템플릿에 **D1 Edit** 권한을 추가해 토큰을 만들고,
저장소 Secrets에 `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` 를 등록합니다. 이후 Actions → Deploy worker → Run workflow (마이그레이션 적용 후 배포).

**무료 플랜 한도 (주요 항목)**
- Workers: 하루 100,000 요청, **호출 1회당 외부 요청 50개**
  → 리포트는 텔레그램 메시지 1건이 외부 요청 1개이므로, 한 번에 `REPORT_MAX_SENDS`(기본 45)명까지 보냅니다.
  초과분은 로그에 경고가 남고 발송되지 않습니다. 리포트 대상이 45명을 넘으면 Workers 유료 플랜($5/월, 한도 상향)으로 올리고 `REPORT_MAX_SENDS` 를 늘리세요.
- D1: 하루 읽기 500만 행, 쓰기 10만 행, 저장 5GB. 소규모 팀에서는 넉넉합니다.

## 7. 문제 해결

| 증상 | 확인할 것 |
|---|---|
| 웹앱에서 "네트워크에 연결할 수 없어요" / CORS 오류 | `ALLOWED_ORIGINS` 가 웹앱 출처와 정확히 같은지 (경로·끝 `/` 없이), `VITE_API_BASE` 가 맞는지 |
| Worker 주소가 404 / `error code: 1042` | `wrangler.toml` 에 `workers_dev = true` 가 있는지, `database_id` 가 `00000000-…` 이 아닌 실제 ID인지 (`npx wrangler d1 list`) 확인 후 `npm run deploy` |
| `npm ci` 후 wrangler 가 실행되지 않음 | 로컬 `npm run dev`(wrangler dev)를 끈 뒤 `npm ci` 를 다시 실행 (실행 중이면 파일이 잠겨 설치가 중간에 멈춤) |
| 봇이 응답하지 않음 | `https://api.telegram.org/bot<토큰>/getWebhookInfo` 에서 url·last_error_message 확인, `TELEGRAM_WEBHOOK_SECRET` 이 set-webhook 때와 같은지 |
| 푸시 알림 토글이 꺼져 있음 | iPhone은 홈 화면 앱에서만 지원, 브라우저 알림 권한 '차단' 여부, `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` 가 같은 쌍인지 |
| 관리자 메뉴가 안 보임 | `ADMIN_TELEGRAM_IDS` 반영 후 **다시 로그인**했는지 |
| 리포트가 안 옴 | 설정에서 리포트 ON 여부, 일일 리포트는 받은 평가가 0건이면 보내지 않음, `wrangler tail` 로 21시 로그 확인 |

## 8. 다른 플랫폼으로 이전 (Railway 등)

플랫폼 의존 코드는 `worker/src/index.ts`(진입점)와 `worker/src/repo/d1/`(DB 구현)뿐입니다.

1. **DB**: `repo/types.ts` 의 인터페이스를 새 DB로 구현합니다. SQL은 표준 SQLite 문법이라 SQLite(better-sqlite3)는 거의 그대로, Postgres는 `?` → `$1` 등 소폭 수정이 필요합니다.
   데이터는 `wrangler d1 export` 로 내보냅니다.
2. **진입점**: Node용 파일을 새로 만들어 `@hono/node-server` 로 `createApp((env, defer) => deps)` 를 띄웁니다. 환경변수는 `process.env` 를 `buildConfig()` 에 넘기면 됩니다.
3. **정기 작업**: `node-cron` 등으로 매일 21:00 KST에 `runDailyJobs(deps, Date.now())` 를 호출합니다.
4. 웹앱은 `VITE_API_BASE` 만 새 서버 주소로 바꾸면 됩니다.

## 9. 아맞다와 함께 운영할 때

같은 Cloudflare 계정과 같은 GitHub 계정(`moon082-byte`)에 두 앱을 함께 올려도 **데이터는 섞이지 않습니다.**
Worker는 자기 `wrangler.toml` 에 연결된 D1에만 접근할 수 있기 때문입니다.

| 항목 | 아맞다 | 영업 피드백 |
|---|---|---|
| Worker | `amatda-bot` | `sales-feedback-api` |
| D1 | `amatda-bot` | `sales-feedback` |
| 텔레그램 봇 | 아맞다 봇 | **새로 만든 별도 봇** |
| 웹앱 주소 | `moon082-byte.github.io/AMATDA/` | `moon082-byte.github.io/<이 저장소 이름>/` |
| 서비스워커·푸시 구독 | `/AMATDA/` 범위 | `/<이 저장소 이름>/` 범위 |
| 브라우저 저장소(localStorage) | `flutter.` 접두어 | `sales-feedback:` 접두어 |

### 꼭 지킬 것

1. **텔레그램 봇은 새로 만듭니다.** 아맞다 봇 토큰으로 웹훅을 설정하면 아맞다 봇이 이 서버로 연결돼 멈춥니다.
   `npm run set-webhook` 은 봇 사용자명이 다르거나 이미 다른 웹훅이 연결된 봇이면 중단하도록 되어 있습니다.
2. **`wrangler` 명령은 항상 `C:\dev_sales\worker` 에서 실행합니다.** `wrangler deploy`, `wrangler secret put` 은 현재 폴더의 `wrangler.toml` 에 적힌 Worker를 대상으로 합니다.
   아맞다 폴더(`AMATDA\bot`)에서 실행하면 아맞다 Worker가 바뀝니다. 실행 전에 출력되는 Worker 이름이 `sales-feedback-api` 인지 확인하세요.
3. **D1 명령에는 DB 이름 `sales-feedback` 을 씁니다.** 이 저장소의 npm 스크립트는 모두 이 이름으로 고정되어 있습니다.
4. **GitHub 저장소 이름을 `AMATDA` 와 다르게** 만듭니다 (예: `sales-feedback`). 같은 이름이면 웹앱 주소가 겹칩니다.
5. **Cloudflare의 workers.dev 하위 도메인(`amatda`)은 바꾸지 않습니다.** 이 앱 주소가 `sales-feedback-api.amatda.workers.dev` 가 되어 이름이 어색해도,
   하위 도메인을 바꾸면 아맞다 앱에 고정된 `amatda-bot.amatda.workers.dev` 주소가 깨집니다.

### 공유되는 것 (알고만 있으면 되는 것)

- **무료 플랜 한도는 계정 전체 합산입니다.** Workers 요청 수, D1 읽기·쓰기를 두 앱이 나눠 씁니다.
  아맞다는 1분마다, 이 앱은 하루 1번 Cron이 돌아 여유는 충분합니다. Cron은 계정당 5개 한도 중 2개를 씁니다.
  Cloudflare 대시보드 → Workers & Pages 에서 Worker별 사용량을 확인할 수 있습니다.
- **알림 권한은 웹 출처(`https://moon082-byte.github.io`) 단위입니다.** 브라우저에서 한쪽 앱의 알림을 '차단'하면 다른 앱도 차단됩니다.
  (홈 화면에 추가한 앱은 기기에 따라 앱별로 따로 관리되기도 합니다.)
- 두 Worker의 `ALLOWED_ORIGINS` 가 같은 출처를 허용하지만, 로그인 토큰이 서로 달라 상대 앱의 데이터에는 접근할 수 없습니다.

### 출처까지 완전히 분리하려면 (선택)

알림 권한과 브라우저 저장소까지 나누려면 웹 출처를 다르게 해야 합니다.
이 앱에 커스텀 도메인(예: `sales.내도메인.com`)을 연결하거나, 별도의 GitHub 조직(Organization) 계정으로 배포하세요.
이때 `ALLOWED_ORIGINS`, `WEB_APP_URL` 도 새 주소로 바꿉니다.
