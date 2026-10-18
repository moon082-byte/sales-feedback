import type { Deps } from '../deps';
import { AppError, type User } from '../domain';
import { randomDigits, randomToken, sha256Hex } from '../lib/crypto';

const VERIFY_LIMIT = { max: 10, windowMs: 10 * 60 * 1000 };
const ISSUE_LIMIT = { max: 5, windowMs: 10 * 60 * 1000 };
const TOUCH_INTERVAL_MS = 24 * 60 * 60 * 1000;

const hashSecret = (deps: Deps, value: string) => sha256Hex(`${deps.config.sessionPepper}:${value}`);

/** 텔레그램 사용자에게 1회용 로그인 코드를 발급. 이전에 발급된 코드는 무효화 */
export async function issueLoginCode(deps: Deps, input: { telegramId: string; chatId: string }): Promise<string> {
  const now = deps.now();
  const hits = await deps.repos.rateLimits.hit(`issue:${input.telegramId}`, ISSUE_LIMIT.windowMs, now);
  if (hits > ISSUE_LIMIT.max) throw new AppError(429, '잠시 후 다시 시도해 주세요.');

  await deps.repos.authCodes.deleteForTelegram(input.telegramId);
  await deps.repos.authCodes.deleteExpired(now);

  for (let i = 0; i < 5; i++) {
    const code = randomDigits(6);
    const ok = await deps.repos.authCodes.create({
      codeHash: await hashSecret(deps, code),
      telegramId: input.telegramId,
      chatId: input.chatId,
      expiresAt: now + deps.config.loginCodeTtlMs,
      now,
    });
    if (ok) {
      // 이미 가입한 사용자는 chat id를 최신으로 유지
      const existing = await deps.repos.users.findByTelegramId(input.telegramId);
      if (existing && existing.telegramChatId !== input.chatId) {
        await deps.repos.users.updateChatId(existing.id, input.chatId);
      }
      return code;
    }
  }
  throw new AppError(500, '코드 발급에 실패했습니다. 다시 시도해 주세요.');
}

/** 로그인 코드를 검증하고 세션 토큰을 발급. 첫 로그인이면 사용자를 생성 */
export async function verifyLoginCode(
  deps: Deps,
  code: string,
  clientKey: string,
): Promise<{ token: string; user: User }> {
  const now = deps.now();
  const hits = await deps.repos.rateLimits.hit(`verify:${clientKey}`, VERIFY_LIMIT.windowMs, now);
  if (hits > VERIFY_LIMIT.max) throw new AppError(429, '시도 횟수를 초과했습니다. 10분 후 다시 시도해 주세요.');

  if (!/^\d{6}$/.test(code)) throw new AppError(400, '6자리 숫자 코드를 입력해 주세요.');
  const owner = await deps.repos.authCodes.consume(await hashSecret(deps, code), now);
  if (!owner) throw new AppError(400, '코드가 올바르지 않거나 만료되었습니다.');

  const shouldBeAdmin = deps.config.adminTelegramIds.has(owner.telegramId);
  let user = await deps.repos.users.findByTelegramId(owner.telegramId);
  if (!user) {
    user = await deps.repos.users.create({
      telegramId: owner.telegramId,
      telegramChatId: owner.chatId,
      role: shouldBeAdmin ? 'admin' : 'user',
      now,
    });
  } else if (shouldBeAdmin && user.role !== 'admin') {
    await deps.repos.users.updateRole(user.id, 'admin');
    user = { ...user, role: 'admin' };
  }
  await deps.repos.settings.ensure(user.id, now);

  const token = randomToken();
  await deps.repos.sessions.create({
    tokenHash: await hashSecret(deps, token),
    userId: user.id,
    expiresAt: now + deps.config.sessionTtlMs,
    now,
  });
  return { token, user };
}

/** Bearer 토큰으로 사용자 확인. 하루 이상 지난 세션은 만료일을 연장(슬라이딩) */
export async function authenticate(deps: Deps, token: string): Promise<{ user: User; tokenHash: string } | null> {
  const now = deps.now();
  const tokenHash = await hashSecret(deps, token);
  const found = await deps.repos.sessions.findValid(tokenHash, now);
  if (!found) return null;
  if (now - found.lastUsedAt > TOUCH_INTERVAL_MS) {
    await deps.repos.sessions.touch(tokenHash, now, now + deps.config.sessionTtlMs);
  }
  return { user: found.user, tokenHash };
}

export async function logout(deps: Deps, tokenHash: string): Promise<void> {
  await deps.repos.sessions.delete(tokenHash);
}
