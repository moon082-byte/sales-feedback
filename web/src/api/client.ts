export type Role = 'user' | 'admin';

export interface PublicUser {
  id: number;
  nickname: string | null;
  tag: string | null;
  role: Role;
}

export interface UserSettings {
  notifyTelegram: boolean;
  notifyPush: boolean;
  reportDaily: boolean;
  reportWeekly: boolean;
}

export type QuestionCategory = 'Q1' | 'Q2';

export interface Tool {
  id: number;
  name: string;
}

export interface Question {
  id: number;
  category: QuestionCategory;
  text: string;
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
  tool: Tool | null;
  phoneExchanged: boolean;
  customerInfo: string;
  peers: PublicUser[];
  q1Count: number;
  q2Count: number;
}

export interface RecordDetail extends RecordSummary {
  answers: RecordAnswer[];
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface NotificationItem {
  id: number;
  type: string;
  recordId: number | null;
  actor: PublicUser | null;
  readAt: number | null;
  createdAt: number;
}

export interface AdminTool extends Tool {
  isActive: boolean;
  sortOrder: number;
}

export interface AdminQuestion extends Question {
  isActive: boolean;
  sortOrder: number;
}

export interface Analytics {
  totals: { records: number; phoneExchanged: number; authors: number };
  byUser: { user: PublicUser; written: number; participated: number; phoneExchanged: number }[];
  byTool: { tool: Tool | null; records: number; phoneExchanged: number }[];
  byQuestion: { questionId: number; category: QuestionCategory; text: string; count: number }[];
  byDay: { date: string; records: number; phoneExchanged: number }[];
}

export function qs(params: Record<string, string | number | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

const BASE =((import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:8787').replace(/\/$/, '');
const TOKEN_KEY = 'session_token';

export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* 저장 불가 환경: 이번 탭에서만 유지 */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* noop */
    }
  },
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const AUTH_EXPIRED_EVENT = 'auth:expired';

export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, '네트워크에 연결할 수 없어요.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) {
      tokenStore.clear();
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
    throw new ApiError(res.status, (data as { error?: string }).error ?? '요청을 처리하지 못했어요.');
  }
  return data as T;
}
