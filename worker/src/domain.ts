// 플랫폼·DB와 무관한 도메인 타입

export type Role = 'user' | 'admin';

export interface User {
  id: number;
  telegramId: string;
  telegramChatId: string | null;
  nickname: string | null;
  tag: string | null;
  role: Role;
  createdAt: number;
}

export interface UserSettings {
  notifyTelegram: boolean;
  notifyPush: boolean;
  reportDaily: boolean;
  reportWeekly: boolean;
}

export interface PublicUser {
  id: number;
  nickname: string | null;
  tag: string | null;
  role: Role;
}

export function toPublicUser(u: User): PublicUser {
  return { id: u.id, nickname: u.nickname, tag: u.tag, role: u.role };
}

export type QuestionCategory = 'Q1' | 'Q2';

export interface Tool {
  id: number;
  name: string;
  isActive: boolean;
  sortOrder: number;
}

export interface Question {
  id: number;
  category: QuestionCategory;
  text: string;
  isActive: boolean;
  sortOrder: number;
}

export interface RecordAnswer {
  questionId: number;
  category: QuestionCategory;
  questionText: string;
  reason: string;
}

export interface RecordSummary {
  id: number;
  createdAt: number;
  updatedAt: number;
  author: PublicUser;
  tool: { id: number; name: string } | null;
  phoneExchanged: boolean;
  /** 목록에서는 앞부분만, 상세에서는 전체 */
  customerInfo: string;
  peers: PublicUser[];
  q1Count: number;
  q2Count: number;
}

export interface RecordDetail extends RecordSummary {
  answers: RecordAnswer[];
}

export interface NotificationItem {
  id: number;
  type: string;
  recordId: number | null;
  actor: PublicUser | null;
  readAt: number | null;
  createdAt: number;
}

export interface Analytics {
  totals: { records: number; phoneExchanged: number; authors: number };
  byUser: { user: PublicUser; written: number; participated: number; phoneExchanged: number }[];
  byTool: { tool: { id: number; name: string } | null; records: number; phoneExchanged: number }[];
  byQuestion: { questionId: number; category: QuestionCategory; text: string; count: number }[];
  /** date = 서비스 시간대 기준 YYYY-MM-DD */
  byDay: { date: string; records: number; phoneExchanged: number }[];
}

export function displayName(u: { nickname: string | null; tag: string | null }): string {
  return `${u.nickname ?? '알 수 없음'}#${u.tag ?? '0000'}`;
}

export class AppError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409 | 429 | 500,
    message: string,
  ) {
    super(message);
  }
}
