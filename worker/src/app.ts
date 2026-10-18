// 플랫폼 독립 HTTP 앱 (Hono). Workers / Node 어디서든 같은 라우트를 사용한다.
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Deps } from './deps';
import { AppError } from './domain';
import { registerAccountRoutes } from './http/account';
import { registerAdminRoutes } from './http/admin';
import type { AppEnv } from './http/common';
import { registerNotificationRoutes } from './http/notifications';
import { registerRecordRoutes } from './http/records';

export type DepsFactory = (env: unknown, defer: (task: Promise<unknown>) => void) => Deps;

export function createApp(getDeps: DepsFactory) {
  const app = new Hono<AppEnv>();

  app.use('*', async (c, next) => {
    let defer: (task: Promise<unknown>) => void;
    try {
      const ctx = c.executionCtx;
      defer = (task) => ctx.waitUntil(task.catch((e) => console.error('deferred task failed', e)));
    } catch {
      // executionCtx 가 없는 런타임(Node 등): 응답과 무관하게 실행
      defer = (task) => void task.catch((e) => console.error('deferred task failed', e));
    }
    c.set('deps', getDeps(c.env, defer));
    await next();
  });

  app.use(
    '*',
    cors({
      origin: (origin, c) => (c.get('deps').config.allowedOrigins.includes(origin) ? origin : null),
      allowHeaders: ['Authorization', 'Content-Type'],
      allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      maxAge: 86400,
    }),
  );

  app.onError((err, c) => {
    if (err instanceof AppError) return c.json({ error: err.message }, err.status);
    console.error(err);
    return c.json({ error: '서버 오류가 발생했습니다.' }, 500);
  });

  app.get('/', (c) => c.json({ ok: true, service: 'sales-feedback-api' }));

  registerAccountRoutes(app);
  registerRecordRoutes(app);
  registerNotificationRoutes(app);
  registerAdminRoutes(app);

  return app;
}
