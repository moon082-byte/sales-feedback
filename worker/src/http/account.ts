// 인증, 텔레그램 웹훅, 내 정보, 사용자 검색
import { toPublicUser, type UserSettings } from '../domain';
import { timingSafeEqual } from '../lib/crypto';
import { issueLoginCode, logout, verifyLoginCode } from '../services/auth';
import { handleTelegramUpdate } from '../services/bot';
import { runReports } from '../services/reports';
import { searchUsers, setNickname } from '../services/users';
import { clientKey, readJson, requireAuth, type App } from './common';

export function registerAccountRoutes(app: App) {
  app.post('/telegram/webhook', async (c) => {
    const deps = c.get('deps');
    const secret = c.req.header('X-Telegram-Bot-Api-Secret-Token') ?? '';
    if (!deps.config.webhookSecret || !timingSafeEqual(secret, deps.config.webhookSecret)) {
      return c.json({ error: 'forbidden' }, 403);
    }
    await handleTelegramUpdate(deps, await c.req.json());
    return c.json({ ok: true });
  });

  app.post('/auth/verify', async (c) => {
    const body = await readJson(c);
    const { token, user } = await verifyLoginCode(c.get('deps'), String(body.code ?? '').trim(), clientKey(c));
    return c.json({ token, user: toPublicUser(user) });
  });

  app.post('/auth/logout', requireAuth, async (c) => {
    await logout(c.get('deps'), c.get('tokenHash'));
    return c.json({ ok: true });
  });

  // 로컬 개발 전용: 텔레그램 없이 로그인 코드 발급 (DEV_MODE=1 일 때만 존재)
  app.post('/dev/login-code', async (c) => {
    const deps = c.get('deps');
    if (!deps.config.devMode) return c.json({ error: 'not found' }, 404);
    const body = await readJson(c);
    const telegramId = String(body.telegramId ?? '10001');
    const code = await issueLoginCode(deps, { telegramId, chatId: telegramId });
    return c.json({ code });
  });

  // 로컬 개발 전용: 리포트를 즉시 실행. dryRun 이면 발송 없이 메시지 내용을 반환
  app.post('/dev/run-reports', async (c) => {
    const deps = c.get('deps');
    if (!deps.config.devMode) return c.json({ error: 'not found' }, 404);
    const body = await readJson(c);
    const kind = body.kind === 'weekly' ? 'weekly' : 'daily';
    const now = typeof body.now === 'number' ? body.now : deps.now();
    return c.json(await runReports(deps, kind, now, { dryRun: body.dryRun !== false }));
  });

  app.get('/me', requireAuth, async (c) => {
    const user = c.get('user');
    const settings = await c.get('deps').repos.settings.get(user.id);
    return c.json({ user: toPublicUser(user), settings });
  });

  app.patch('/me', requireAuth, async (c) => {
    const body = await readJson(c);
    const user = await setNickname(c.get('deps'), c.get('user'), body.nickname);
    return c.json({ user: toPublicUser(user) });
  });

  app.patch('/me/settings', requireAuth, async (c) => {
    const body = await readJson(c);
    const patch: Partial<UserSettings> = {};
    for (const key of ['notifyTelegram', 'notifyPush', 'reportDaily', 'reportWeekly'] as const) {
      if (typeof body[key] === 'boolean') patch[key] = body[key] as boolean;
    }
    const deps = c.get('deps');
    const settings = await deps.repos.settings.update(c.get('user').id, patch, deps.now());
    return c.json({ settings });
  });

  app.get('/users', requireAuth, async (c) => {
    const users = await searchUsers(c.get('deps'), c.get('user'), c.req.query('q') ?? '');
    return c.json({ users: users.map(toPublicUser) });
  });
}
