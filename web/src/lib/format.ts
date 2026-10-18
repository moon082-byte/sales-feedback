import type { PublicUser } from '../api/client';

export function displayName(u: Pick<PublicUser, 'nickname' | 'tag'>): string {
  return `${u.nickname ?? '알 수 없음'}#${u.tag ?? '0000'}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function formatDateTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatTime(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 방금 전 / n분 전 / n시간 전 / 날짜 */
export function formatRelative(ms: number, now = Date.now()): string {
  const diff = Math.max(0, now - ms);
  if (diff < 60_000) return '방금 전';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  return formatDateTime(ms);
}

/** 로컬 기준 하루 범위 [from, to) */
export function dayRange(key: string): { from: number; to: number } {
  const [y, m, d] = key.split('-').map(Number);
  return { from: new Date(y, m - 1, d).getTime(), to: new Date(y, m - 1, d + 1).getTime() };
}
