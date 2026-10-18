import type { PublicUser, QuestionCategory, RecordAnswer, RecordSummary, Role } from '../../domain';
import type { NotificationRepo, PushRepo, RecordFilter, RecordRepo, RecordWriteInput } from '../types';
import { placeholders, publicUser } from './util';

interface SummaryRow {
  id: number;
  created_at: number;
  updated_at: number;
  phone_exchanged: number;
  customer_info: string;
  author_id: number;
  author_nickname: string | null;
  author_tag: string | null;
  author_role: Role;
  tool_id: number | null;
  tool_name: string | null;
  q1_count: number;
  q2_count: number;
}

const summarySelect = (fullText: boolean) => `
  SELECT r.id, r.created_at, r.updated_at, r.phone_exchanged,
         ${fullText ? 'r.customer_info' : 'substr(r.customer_info, 1, 120)'} AS customer_info,
         r.author_id, a.nickname AS author_nickname, a.tag AS author_tag, a.role AS author_role,
         r.tool_id, t.name AS tool_name,
         (SELECT COUNT(*) FROM record_answers x WHERE x.record_id = r.id AND x.category = 'Q1') AS q1_count,
         (SELECT COUNT(*) FROM record_answers x WHERE x.record_id = r.id AND x.category = 'Q2') AS q2_count
  FROM records r
  JOIN users a ON a.id = r.author_id
  LEFT JOIN tools t ON t.id = r.tool_id`;

const PEER_EXISTS = 'EXISTS (SELECT 1 FROM record_peers rp WHERE rp.record_id = r.id AND rp.user_id = ?)';

function buildWhere(f: RecordFilter): { sql: string; params: unknown[] } {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.authorId !== undefined) {
    where.push('r.author_id = ?');
    params.push(f.authorId);
  }
  if (f.peerId !== undefined) {
    where.push(PEER_EXISTS);
    params.push(f.peerId);
  }
  if (f.participantId !== undefined) {
    where.push(`(r.author_id = ? OR ${PEER_EXISTS})`);
    params.push(f.participantId, f.participantId);
  }
  if (f.toolId !== undefined) {
    where.push('r.tool_id = ?');
    params.push(f.toolId);
  }
  if (f.from !== undefined) {
    where.push('r.created_at >= ?');
    params.push(f.from);
  }
  if (f.to !== undefined) {
    where.push('r.created_at < ?');
    params.push(f.to);
  }
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

function mapSummary(r: SummaryRow): RecordSummary {
  return {
    id: r.id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    author: publicUser(r.author_id, r.author_nickname, r.author_tag, r.author_role),
    tool: r.tool_id !== null && r.tool_name !== null ? { id: r.tool_id, name: r.tool_name } : null,
    phoneExchanged: r.phone_exchanged === 1,
    customerInfo: r.customer_info,
    peers: [],
    q1Count: r.q1_count,
    q2Count: r.q2_count,
  };
}

async function attachPeers(db: D1Database, items: RecordSummary[]): Promise<void> {
  if (!items.length) return;
  const { results } = await db
    .prepare(
      `SELECT p.record_id, u.id, u.nickname, u.tag, u.role FROM record_peers p JOIN users u ON u.id = p.user_id
       WHERE p.record_id IN (${placeholders(items.length)}) ORDER BY u.nickname, u.tag`,
    )
    .bind(...items.map((i) => i.id))
    .all<{ record_id: number; id: number; nickname: string | null; tag: string | null; role: Role }>();
  const byRecord = new Map<number, PublicUser[]>();
  for (const r of results) {
    const list = byRecord.get(r.record_id) ?? [];
    list.push(publicUser(r.id, r.nickname, r.tag, r.role));
    byRecord.set(r.record_id, list);
  }
  for (const item of items) item.peers = byRecord.get(item.id) ?? [];
}

function childStatements(db: D1Database, recordId: number, input: RecordWriteInput): D1PreparedStatement[] {
  return [
    ...input.peerIds.map((uid) =>
      db.prepare('INSERT INTO record_peers (record_id, user_id) VALUES (?, ?)').bind(recordId, uid),
    ),
    ...input.answers.map((a) =>
      db
        .prepare('INSERT INTO record_answers (record_id, question_id, category, question_text, reason) VALUES (?, ?, ?, ?, ?)')
        .bind(recordId, a.questionId, a.category, a.questionText, a.reason),
    ),
  ];
}

export function createRecordRepo(db: D1Database): RecordRepo {
  return {
    async create(input) {
      const row = await db
        .prepare(
          `INSERT INTO records (author_id, tool_id, phone_exchanged, customer_info, created_at, updated_at, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        )
        .bind(input.authorId, input.toolId, input.phoneExchanged ? 1 : 0, input.customerInfo, input.now, input.now, input.authorId)
        .first<{ id: number }>();
      const id = row!.id;
      const children = childStatements(db, id, input);
      if (children.length) {
        try {
          await db.batch(children);
        } catch (e) {
          await db.prepare('DELETE FROM records WHERE id = ?').bind(id).run();
          throw e;
        }
      }
      return id;
    },

    async update(id, input) {
      // batch 는 하나의 트랜잭션으로 실행된다
      await db.batch([
        db
          .prepare('UPDATE records SET tool_id = ?, phone_exchanged = ?, customer_info = ?, updated_at = ?, updated_by = ? WHERE id = ?')
          .bind(input.toolId, input.phoneExchanged ? 1 : 0, input.customerInfo, input.now, input.updatedBy, id),
        db.prepare('DELETE FROM record_peers WHERE record_id = ?').bind(id),
        db.prepare('DELETE FROM record_answers WHERE record_id = ?').bind(id),
        ...childStatements(db, id, input),
      ]);
    },

    async findById(id) {
      const row = await db.prepare(`${summarySelect(true)} WHERE r.id = ?`).bind(id).first<SummaryRow>();
      if (!row) return null;
      const summary = mapSummary(row);
      await attachPeers(db, [summary]);
      const { results } = await db
        .prepare(
          `SELECT ra.question_id, ra.category, ra.question_text, ra.reason
           FROM record_answers ra LEFT JOIN questions q ON q.id = ra.question_id
           WHERE ra.record_id = ? ORDER BY ra.category, COALESCE(q.sort_order, 0), ra.question_id`,
        )
        .bind(id)
        .all<{ question_id: number; category: QuestionCategory; question_text: string; reason: string }>();
      const answers: RecordAnswer[] = results.map((a) => ({
        questionId: a.question_id,
        category: a.category,
        questionText: a.question_text,
        reason: a.reason,
      }));
      return { ...summary, answers };
    },

    async list(filter, limit, offset) {
      const { sql, params } = buildWhere(filter);
      const [rows, count] = await Promise.all([
        db
          .prepare(`${summarySelect(false)} ${sql} ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?`)
          .bind(...params, limit, offset)
          .all<SummaryRow>(),
        db.prepare(`SELECT COUNT(*) AS n FROM records r ${sql}`).bind(...params).first<{ n: number }>(),
      ]);
      const items = rows.results.map(mapSummary);
      await attachPeers(db, items);
      return { items, total: count?.n ?? 0 };
    },

    async timestamps(filter, limit) {
      const { sql, params } = buildWhere(filter);
      const { results } = await db
        .prepare(`SELECT r.created_at FROM records r ${sql} ORDER BY r.created_at LIMIT ?`)
        .bind(...params, limit)
        .all<{ created_at: number }>();
      return results.map((r) => r.created_at);
    },

    async stats(filter) {
      const { sql, params } = buildWhere(filter);
      const r = await db
        .prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(r.phone_exchanged), 0) AS p FROM records r ${sql}`)
        .bind(...params)
        .first<{ n: number; p: number }>();
      return { count: r?.n ?? 0, phoneExchanged: r?.p ?? 0 };
    },

    async delete(id) {
      const r = await db.prepare('DELETE FROM records WHERE id = ? RETURNING id').bind(id).first();
      return r !== null;
    },

    async analytics(filter, tzOffsetMinutes) {
      const { sql, params } = buildWhere(filter);
      const offsetSec = tzOffsetMinutes * 60;
      const [totals, written, participated, byTool, byQuestion, byDay] = await db.batch<Record<string, unknown>>([
        db
          .prepare(
            `SELECT COUNT(*) AS records, COALESCE(SUM(r.phone_exchanged), 0) AS phone, COUNT(DISTINCT r.author_id) AS authors
             FROM records r ${sql}`,
          )
          .bind(...params),
        db
          .prepare(
            `SELECT r.author_id AS user_id, COUNT(*) AS n, COALESCE(SUM(r.phone_exchanged), 0) AS phone
             FROM records r ${sql} GROUP BY r.author_id`,
          )
          .bind(...params),
        db
          .prepare(
            `SELECT p.user_id AS user_id, COUNT(*) AS n
             FROM record_peers p JOIN records r ON r.id = p.record_id ${sql} GROUP BY p.user_id`,
          )
          .bind(...params),
        db
          .prepare(
            `SELECT r.tool_id, t.name AS tool_name, COUNT(*) AS n, COALESCE(SUM(r.phone_exchanged), 0) AS phone
             FROM records r LEFT JOIN tools t ON t.id = r.tool_id ${sql}
             GROUP BY r.tool_id ORDER BY n DESC`,
          )
          .bind(...params),
        db
          .prepare(
            `SELECT ra.question_id, ra.category, COALESCE(q.text, MAX(ra.question_text)) AS text, COUNT(*) AS n
             FROM record_answers ra JOIN records r ON r.id = ra.record_id LEFT JOIN questions q ON q.id = ra.question_id
             ${sql} GROUP BY ra.question_id ORDER BY n DESC, ra.question_id`,
          )
          .bind(...params),
        db
          .prepare(
            `SELECT date(r.created_at / 1000 + ?, 'unixepoch') AS day, COUNT(*) AS n, COALESCE(SUM(r.phone_exchanged), 0) AS phone
             FROM records r ${sql} GROUP BY day ORDER BY day`,
          )
          .bind(offsetSec, ...params),
      ]);

      // 사용자별: 작성 + 동료 참여를 합치고 사용자 정보를 붙인다
      type Row = Record<string, number | string | null>;
      const counts = new Map<number, { written: number; participated: number; phoneExchanged: number }>();
      const entry = (id: number) => {
        let e = counts.get(id);
        if (!e) counts.set(id, (e = { written: 0, participated: 0, phoneExchanged: 0 }));
        return e;
      };
      for (const r of written.results as Row[]) {
        const e = entry(r.user_id as number);
        e.written = r.n as number;
        e.phoneExchanged = r.phone as number;
      }
      for (const r of participated.results as Row[]) entry(r.user_id as number).participated = r.n as number;

      const ids = [...counts.keys()];
      const users = ids.length
        ? (
            await db
              .prepare(`SELECT id, nickname, tag, role FROM users WHERE id IN (${placeholders(ids.length)})`)
              .bind(...ids)
              .all<{ id: number; nickname: string | null; tag: string | null; role: Role }>()
          ).results
        : [];
      const userById = new Map(users.map((u) => [u.id, publicUser(u.id, u.nickname, u.tag, u.role)]));

      const t = (totals.results[0] ?? {}) as Row;
      return {
        totals: { records: (t.records as number) ?? 0, phoneExchanged: (t.phone as number) ?? 0, authors: (t.authors as number) ?? 0 },
        byUser: ids
          .map((id) => ({ user: userById.get(id) ?? publicUser(id, null, null, 'user'), ...counts.get(id)! }))
          .sort((a, b) => b.written + b.participated - (a.written + a.participated) || b.written - a.written),
        byTool: (byTool.results as Row[]).map((r) => ({
          tool: r.tool_id !== null && r.tool_name !== null ? { id: r.tool_id as number, name: r.tool_name as string } : null,
          records: r.n as number,
          phoneExchanged: r.phone as number,
        })),
        byQuestion: (byQuestion.results as Row[]).map((r) => ({
          questionId: r.question_id as number,
          category: r.category as QuestionCategory,
          text: r.text as string,
          count: r.n as number,
        })),
        byDay: (byDay.results as Row[]).map((r) => ({ date: r.day as string, records: r.n as number, phoneExchanged: r.phone as number })),
      };
    },
  };
}

export function createNotificationRepo(db: D1Database): NotificationRepo {
  return {
    async createMany(items, now) {
      if (!items.length) return;
      await db.batch(
        items.map((n) =>
          db
            .prepare('INSERT INTO notifications (user_id, type, record_id, actor_id, created_at) VALUES (?, ?, ?, ?, ?)')
            .bind(n.userId, n.type, n.recordId, n.actorId, now),
        ),
      );
    },
    async list(userId, limit, offset) {
      const [rows, count] = await Promise.all([
        db
          .prepare(
            `SELECT n.id, n.type, n.record_id, n.read_at, n.created_at,
                    a.id AS actor_id, a.nickname AS actor_nickname, a.tag AS actor_tag, a.role AS actor_role
             FROM notifications n LEFT JOIN users a ON a.id = n.actor_id
             WHERE n.user_id = ? ORDER BY n.created_at DESC, n.id DESC LIMIT ? OFFSET ?`,
          )
          .bind(userId, limit, offset)
          .all<{
            id: number;
            type: string;
            record_id: number | null;
            read_at: number | null;
            created_at: number;
            actor_id: number | null;
            actor_nickname: string | null;
            actor_tag: string | null;
            actor_role: Role;
          }>(),
        db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ?').bind(userId).first<{ n: number }>(),
      ]);
      return {
        items: rows.results.map((r) => ({
          id: r.id,
          type: r.type,
          recordId: r.record_id,
          actor: r.actor_id !== null ? publicUser(r.actor_id, r.actor_nickname, r.actor_tag, r.actor_role) : null,
          readAt: r.read_at,
          createdAt: r.created_at,
        })),
        total: count?.n ?? 0,
      };
    },
    async unreadCount(userId) {
      const r = await db
        .prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL')
        .bind(userId)
        .first<{ n: number }>();
      return r?.n ?? 0;
    },
    async markRead(userId, ids, now) {
      if (ids === undefined) {
        await db.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').bind(now, userId).run();
      } else if (ids.length) {
        await db
          .prepare(`UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL AND id IN (${placeholders(ids.length)})`)
          .bind(now, userId, ...ids)
          .run();
      }
    },
  };
}

export function createPushRepo(db: D1Database): PushRepo {
  return {
    async upsert(userId, sub, now) {
      await db
        .prepare(
          `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
        )
        .bind(userId, sub.endpoint, sub.p256dh, sub.auth, now)
        .run();
    },
    async remove(userId, endpoint) {
      await db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?').bind(userId, endpoint).run();
    },
    async removeByEndpoint(endpoint) {
      await db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(endpoint).run();
    },
    async listForUser(userId) {
      const { results } = await db
        .prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?')
        .bind(userId)
        .all<{ endpoint: string; p256dh: string; auth: string }>();
      return results;
    },
  };
}
