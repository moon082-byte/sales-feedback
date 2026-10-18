// 서비스가 사용하는 의존성 묶음. 플랫폼별 진입점(Workers, Node 등)이 이것을 만들어 주입한다.
import type { TelegramClient } from './lib/telegram';
import type { WebPushSender } from './lib/webpush';
import type { Repos } from './repo/types';

export interface Config {
  sessionPepper: string;
  webhookSecret: string;
  adminTelegramIds: Set<string>;
  allowedOrigins: string[];
  webAppUrl: string;
  devMode: boolean;
  sessionTtlMs: number;
  loginCodeTtlMs: number;
  vapidPublicKey: string;
  /** 일별 집계·리포트 기준 시간대 (분). 기본 KST = 540 */
  tzOffsetMinutes: number;
}

export interface Deps {
  repos: Repos;
  config: Config;
  telegram: TelegramClient;
  /** VAPID 키가 설정되지 않았으면 null */
  push: WebPushSender | null;
  now: () => number;
  /** 응답 후에도 계속 실행할 비동기 작업 (Workers: waitUntil) */
  defer: (task: Promise<unknown>) => void;
}

const DAY = 24 * 60 * 60 * 1000;

export function buildConfig(env: Record<string, string | undefined>): Config {
  const list = (v?: string) =>
    (v ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  return {
    sessionPepper: env.SESSION_PEPPER ?? '',
    webhookSecret: env.TELEGRAM_WEBHOOK_SECRET ?? '',
    adminTelegramIds: new Set(list(env.ADMIN_TELEGRAM_IDS)),
    allowedOrigins: list(env.ALLOWED_ORIGINS),
    // 끝을 '/' 로 정규화 (링크는 `${webAppUrl}#/...` 형태로 만든다)
    webAppUrl: env.WEB_APP_URL ? env.WEB_APP_URL.replace(/\/?(#.*)?$/, '/') : '',
    devMode: env.DEV_MODE === '1',
    sessionTtlMs: 30 * DAY,
    loginCodeTtlMs: 5 * 60 * 1000,
    vapidPublicKey: env.VAPID_PUBLIC_KEY ?? '',
    tzOffsetMinutes: Number.isInteger(Number(env.TZ_OFFSET_MINUTES)) && env.TZ_OFFSET_MINUTES ? Number(env.TZ_OFFSET_MINUTES) : 540,
  };
}
