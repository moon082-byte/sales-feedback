import type { PublicUser, Role, User } from '../../domain';

export interface UserRow {
  id: number;
  telegram_id: string;
  telegram_chat_id: string | null;
  nickname: string | null;
  tag: string | null;
  role: Role;
  created_at: number;
}

export const USER_COLS = 'u.id, u.telegram_id, u.telegram_chat_id, u.nickname, u.tag, u.role, u.created_at';

export function mapUser(r: UserRow): User {
  return {
    id: r.id,
    telegramId: r.telegram_id,
    telegramChatId: r.telegram_chat_id,
    nickname: r.nickname,
    tag: r.tag,
    role: r.role,
    createdAt: r.created_at,
  };
}

export function publicUser(id: number, nickname: string | null, tag: string | null, role: Role): PublicUser {
  return { id, nickname, tag, role };
}

export function isUniqueViolation(e: unknown): boolean {
  return e instanceof Error && /UNIQUE constraint failed/i.test(e.message);
}

export const placeholders = (n: number) => Array(n).fill('?').join(', ');
