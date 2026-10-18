import type { Context, Hono, MiddlewareHandler } from 'hono';
import type { Deps } from '../deps';
import { AppError, type User } from '../domain';
import { authenticate } from '../services/auth';

export type AppEnv = {
  Variables: { deps: Deps; user: User; tokenHash: string };
};

export type App = Hono<AppEnv>;
export type Ctx = Context<AppEnv>;

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const header = c.req.header('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const result = token ? await authenticate(c.get('deps'), token) : null;
  if (!result) throw new AppError(401, '로그인이 필요합니다.');
  c.set('user', result.user);
  c.set('tokenHash', result.tokenHash);
  await next();
};

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get('user').role !== 'admin') throw new AppError(403, '관리자 권한이 필요합니다.');
  await next();
};

export function clientKey(c: Ctx): string {
  return c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
}

export async function readJson(c: Ctx): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  } catch {
    throw new AppError(400, '잘못된 요청입니다.');
  }
}

/** 정수 쿼리 파라미터. 없으면 fallback, 범위 밖이면 400 */
export function intQuery(c: Ctx, name: string, fallback: number, min?: number, max?: number): number;
export function intQuery(c: Ctx, name: string, fallback: undefined, min?: number, max?: number): number | undefined;
export function intQuery(c: Ctx, name: string, fallback: number | undefined, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const raw = c.req.query(name);
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new AppError(400, `${name} 값이 올바르지 않아요.`);
  return n;
}

export function idParam(c: Ctx, name = 'id'): number {
  const n = Number(c.req.param(name));
  if (!Number.isInteger(n) || n <= 0) throw new AppError(404, '찾을 수 없어요.');
  return n;
}
