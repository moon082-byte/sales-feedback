// Cloudflare Workers 진입점. 플랫폼 의존 코드는 이 파일에만 둔다.
import { createApp } from './app';
import { buildConfig, type Deps } from './deps';
import { createTelegramClient } from './lib/telegram';
import { createWebPushSender } from './lib/webpush';
import { createD1Repos } from './repo/d1';

export interface Env {
  DB: D1Database;
  BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  SESSION_PEPPER: string;
  ALLOWED_ORIGINS: string;
  ADMIN_TELEGRAM_IDS: string;
  WEB_APP_URL: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  DEV_MODE?: string;
}

function buildDeps(env: Env, defer: Deps['defer']): Deps {
  if (!env.SESSION_PEPPER) throw new Error('SESSION_PEPPER secret is not set');
  const config = buildConfig(env as unknown as Record<string, string | undefined>);
  return {
    repos: createD1Repos(env.DB),
    config,
    telegram: createTelegramClient(env.BOT_TOKEN),
    push:
      env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY
        ? createWebPushSender({
            publicKey: env.VAPID_PUBLIC_KEY,
            privateKey: env.VAPID_PRIVATE_KEY,
            subject: env.VAPID_SUBJECT || 'mailto:admin@example.com',
          })
        : null,
    now: () => Date.now(),
    defer,
  };
}

const app = createApp((env, defer) => buildDeps(env as Env, defer));

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;
