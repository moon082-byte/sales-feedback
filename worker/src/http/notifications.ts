// 알림함, Web Push 구독
import { AppError } from '../domain';
import { intQuery, readJson, requireAuth, type App } from './common';

const B64URL = /^[A-Za-z0-9_-]+$/;

export function registerNotificationRoutes(app: App) {
  app.get('/notifications', requireAuth, async (c) => {
    const page = intQuery(c, 'page', 1, 1);
    const pageSize = intQuery(c, 'pageSize', 20, 1, 50);
    const { items, total } = await c
      .get('deps')
      .repos.notifications.list(c.get('user').id, pageSize, (page - 1) * pageSize);
    return c.json({ items, total, page, pageSize });
  });

  app.get('/notifications/unread-count', requireAuth, async (c) => {
    const count = await c.get('deps').repos.notifications.unreadCount(c.get('user').id);
    return c.json({ count });
  });

  /** body.ids 생략 시 전체 읽음 */
  app.post('/notifications/read', requireAuth, async (c) => {
    const body = await readJson(c);
    let ids: number[] | undefined;
    if (body.ids !== undefined) {
      if (!Array.isArray(body.ids) || !body.ids.every((n) => Number.isInteger(n)) || body.ids.length > 100) {
        throw new AppError(400, 'ids 값이 올바르지 않아요.');
      }
      ids = body.ids as number[];
    }
    const deps = c.get('deps');
    await deps.repos.notifications.markRead(c.get('user').id, ids, deps.now());
    return c.json({ ok: true });
  });

  app.get('/push/public-key', (c) => {
    const key = c.get('deps').config.vapidPublicKey;
    return c.json({ publicKey: key || null });
  });

  app.post('/push/subscribe', requireAuth, async (c) => {
    const deps = c.get('deps');
    if (!deps.push) throw new AppError(400, '서버에 푸시 알림이 설정되지 않았어요.');
    const body = await readJson(c);
    const keys = (body.keys ?? {}) as Record<string, unknown>;
    const endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
    const p256dh = typeof keys.p256dh === 'string' ? keys.p256dh : '';
    const auth = typeof keys.auth === 'string' ? keys.auth : '';
    let valid = false;
    try {
      valid = new URL(endpoint).protocol === 'https:' && B64URL.test(p256dh) && B64URL.test(auth) && endpoint.length < 1000;
    } catch {
      valid = false;
    }
    if (!valid) throw new AppError(400, '구독 정보가 올바르지 않아요.');
    await deps.repos.push.upsert(c.get('user').id, { endpoint, p256dh, auth }, deps.now());
    return c.json({ ok: true });
  });

  app.delete('/push/subscribe', requireAuth, async (c) => {
    const body = await readJson(c);
    if (typeof body.endpoint === 'string') await c.get('deps').repos.push.remove(c.get('user').id, body.endpoint);
    return c.json({ ok: true });
  });
}
