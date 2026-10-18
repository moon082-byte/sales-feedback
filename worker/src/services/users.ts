import type { Deps } from '../deps';
import { AppError, type User } from '../domain';
import { randomDigits } from '../lib/crypto';

const NICKNAME_RE = /^[가-힣a-zA-Z0-9_]{2,12}$/;

export function validateNickname(raw: unknown): string {
  const nickname = typeof raw === 'string' ? raw.trim() : '';
  if (!NICKNAME_RE.test(nickname)) {
    throw new AppError(400, '닉네임은 2~12자의 한글, 영문, 숫자, _ 만 사용할 수 있어요.');
  }
  return nickname;
}

/** 닉네임 설정/변경. 기존 태그를 유지할 수 있으면 유지하고, 아니면 빈 태그를 새로 배정 */
export async function setNickname(deps: Deps, user: User, raw: unknown): Promise<User> {
  const nickname = validateNickname(raw);
  if (user.nickname === nickname && user.tag) return user;

  const candidates: string[] = [];
  if (user.tag) candidates.push(user.tag);
  for (let i = 0; i < 30; i++) candidates.push(randomDigits(4));

  for (const tag of candidates) {
    if (await deps.repos.users.isNicknameTagTaken(nickname, tag)) continue;
    if (await deps.repos.users.updateProfile(user.id, nickname, tag)) {
      return { ...user, nickname, tag };
    }
  }
  throw new AppError(409, '이 닉네임은 사용자가 너무 많아요. 다른 닉네임을 선택해 주세요.');
}

/** "홍길동" 또는 "홍길동#12" 형태 검색 */
export async function searchUsers(deps: Deps, me: User, rawQuery: string): Promise<User[]> {
  const q = rawQuery.trim();
  if (!q) return [];
  const [nickname, tag] = q.split('#');
  if (!nickname) return [];
  return deps.repos.users.search({
    nickname,
    tag: tag && /^\d{1,4}$/.test(tag) ? tag : undefined,
    excludeId: me.id,
    limit: 20,
  });
}
