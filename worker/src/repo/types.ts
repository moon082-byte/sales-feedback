// 저장소 인터페이스. 서비스 계층은 이 인터페이스에만 의존한다.
// 다른 DB(Postgres 등)로 이전할 때는 이 인터페이스의 구현체만 새로 작성하면 된다.
import type {
  Analytics,
  NotificationItem,
  PublicUser,
  Question,
  QuestionCategory,
  RecordAnswer,
  RecordDetail,
  RecordSummary,
  Role,
  Tool,
  User,
  UserSettings,
} from '../domain';

export interface NotifyTarget {
  id: number;
  chatId: string | null;
  notifyTelegram: boolean;
  notifyPush: boolean;
}

export interface ReportTarget {
  id: number;
  chatId: string;
  nickname: string;
  tag: string;
}

/** 특정 사용자가 동료로 태그되어 받은 평가 요약 */
export interface ReceivedDigest {
  count: number;
  phoneExchanged: number;
  authors: { user: PublicUser; count: number }[];
  questions: { category: QuestionCategory; text: string; count: number }[];
}

export interface UserRepo {
  /** 해당 리포트를 켜 두었고 텔레그램 chat id 가 있는 사용자 */
  findReportTargets(kind: 'daily' | 'weekly'): Promise<ReportTarget[]>;
  findById(id: number): Promise<User | null>;
  findByTelegramId(telegramId: string): Promise<User | null>;
  /** 닉네임이 설정된 사용자만 반환 */
  findActiveByIds(ids: number[]): Promise<User[]>;
  findNotifyTargets(ids: number[]): Promise<NotifyTarget[]>;
  create(input: { telegramId: string; telegramChatId: string; role: Role; now: number }): Promise<User>;
  updateChatId(id: number, chatId: string): Promise<void>;
  updateRole(id: number, role: Role): Promise<void>;
  /** (nickname, tag) 조합이 이미 있으면 false */
  updateProfile(id: number, nickname: string, tag: string): Promise<boolean>;
  isNicknameTagTaken(nickname: string, tag: string): Promise<boolean>;
  search(input: { nickname: string; tag?: string; excludeId?: number; limit: number }): Promise<User[]>;
  /** 닉네임이 설정된 전체 사용자 */
  listAll(): Promise<User[]>;
  countAdmins(): Promise<number>;
}

export interface AuthCodeRepo {
  /** code_hash 충돌 시 false */
  create(input: { codeHash: string; telegramId: string; chatId: string; expiresAt: number; now: number }): Promise<boolean>;
  /** 유효한 코드면 사용 처리하고 소유자 정보를 반환 (원자적) */
  consume(codeHash: string, now: number): Promise<{ telegramId: string; chatId: string } | null>;
  deleteForTelegram(telegramId: string): Promise<void>;
  deleteExpired(now: number): Promise<void>;
}

export interface SessionRepo {
  create(input: { tokenHash: string; userId: number; expiresAt: number; now: number }): Promise<void>;
  findValid(tokenHash: string, now: number): Promise<{ user: User; lastUsedAt: number } | null>;
  touch(tokenHash: string, now: number, expiresAt: number): Promise<void>;
  delete(tokenHash: string): Promise<void>;
}

export interface SettingsRepo {
  ensure(userId: number, now: number): Promise<void>;
  get(userId: number): Promise<UserSettings>;
  update(userId: number, patch: Partial<UserSettings>, now: number): Promise<UserSettings>;
}

export interface RateLimitRepo {
  /** 윈도우 내 누적 횟수(이번 호출 포함)를 반환 */
  hit(key: string, windowMs: number, now: number): Promise<number>;
}

/** 기록에서 사용 중인 항목은 지우지 않고 비활성화 */
export type DeleteResult = 'deleted' | 'deactivated' | 'not_found';

export interface CatalogRepo {
  listTools(activeOnly: boolean): Promise<Tool[]>;
  listQuestions(activeOnly: boolean): Promise<Question[]>;
  createTool(name: string, now: number): Promise<Tool>;
  updateTool(id: number, patch: { name?: string; isActive?: boolean }): Promise<Tool | null>;
  deleteTool(id: number): Promise<DeleteResult>;
  /** ids 순서대로 sort_order 재배치 */
  reorderTools(ids: number[]): Promise<void>;
  createQuestion(category: QuestionCategory, text: string, now: number): Promise<Question>;
  updateQuestion(id: number, patch: { text?: string; isActive?: boolean }): Promise<Question | null>;
  deleteQuestion(id: number): Promise<DeleteResult>;
  reorderQuestions(ids: number[]): Promise<void>;
}

/** 지정한 조건은 모두 AND. 시간은 [from, to) */
export interface RecordFilter {
  authorId?: number;
  peerId?: number;
  /** 작성자이거나 동료로 태그된 기록 */
  participantId?: number;
  toolId?: number;
  from?: number;
  to?: number;
}

export interface RecordWriteInput {
  toolId: number | null;
  phoneExchanged: boolean;
  customerInfo: string;
  peerIds: number[];
  answers: RecordAnswer[];
}

export interface RecordRepo {
  create(input: RecordWriteInput & { authorId: number; now: number }): Promise<number>;
  update(id: number, input: RecordWriteInput & { updatedBy: number; now: number }): Promise<void>;
  findById(id: number): Promise<RecordDetail | null>;
  list(filter: RecordFilter, limit: number, offset: number): Promise<{ items: RecordSummary[]; total: number }>;
  timestamps(filter: RecordFilter, limit: number): Promise<number[]>;
  stats(filter: RecordFilter): Promise<{ count: number; phoneExchanged: number }>;
  delete(id: number): Promise<boolean>;
  /** 기간 [from, to) 내 받은 평가를 받은 사람(user id)별로 요약 */
  receivedDigests(from: number, to: number): Promise<Map<number, ReceivedDigest>>;
  /** tzOffsetMinutes: 일별 집계 기준 시간대 (KST = 540) */
  analytics(filter: RecordFilter, tzOffsetMinutes: number): Promise<Analytics>;
}

export interface NotificationRepo {
  createMany(items: { userId: number; type: string; recordId: number | null; actorId: number | null }[], now: number): Promise<void>;
  list(userId: number, limit: number, offset: number): Promise<{ items: NotificationItem[]; total: number }>;
  unreadCount(userId: number): Promise<number>;
  /** ids 생략 시 전체 읽음 */
  markRead(userId: number, ids: number[] | undefined, now: number): Promise<void>;
}

export interface PushSubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushRepo {
  upsert(userId: number, sub: PushSubscriptionRow, now: number): Promise<void>;
  remove(userId: number, endpoint: string): Promise<void>;
  removeByEndpoint(endpoint: string): Promise<void>;
  listForUser(userId: number): Promise<PushSubscriptionRow[]>;
}

export interface MaintenanceRepo {
  /** 만료 세션·로그인 코드·오래된 rate limit 기록 정리 */
  cleanup(now: number): Promise<void>;
}

export interface Repos {
  maintenance: MaintenanceRepo;
  users: UserRepo;
  authCodes: AuthCodeRepo;
  sessions: SessionRepo;
  settings: SettingsRepo;
  rateLimits: RateLimitRepo;
  catalog: CatalogRepo;
  records: RecordRepo;
  notifications: NotificationRepo;
  push: PushRepo;
}
