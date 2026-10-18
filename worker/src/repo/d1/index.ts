import type { UserSettings } from '../../domain';
import type { Repos } from '../types';
import { createCatalogRepo } from './catalog';
import { createNotificationRepo, createPushRepo, createRecordRepo } from './records';
import { isUniqueViolation, mapUser, placeholders, USER_COLS, type UserRow } from './util';

const SETTINGS_COLUMNS: Record<keyof UserSettings, string> = {
  notifyTelegram: 'notify_telegram',
  notifyPush: 'notify_push',
  reportDaily: 'report_daily',
  reportWeekly: 'report_weekly',
};

export function createD1Repos(db: D1Database): Repos {
  return {
    users: {
      async findById(id) {
        const r = await db.prepare(`SELECT ${USER_COLS} FROM users u WHERE u.id = ?`).bind(id).first<UserRow>();
        return r ? mapUser(r) : null;
      },
      async findByTelegramId(telegramId) {
        const r = await db
          .prepare(`SELECT ${USER_COLS} FROM users u WHERE u.telegram_id = ?`)
          .bind(telegramId)
          .first<UserRow>();
        return r ? mapUser(r) : null;
      },
      async findActiveByIds(ids) {
        if (!ids.length) return [];
        const { results } = await db
          .prepare(`SELECT ${USER_COLS} FROM users u WHERE u.nickname IS NOT NULL AND u.id IN (${placeholders(ids.length)})`)
          .bind(...ids)
          .all<UserRow>();
        return results.map(mapUser);
      },
      async findNotifyTargets(ids) {
        if (!ids.length) return [];
        const { results } = await db
          .prepare(
            `SELECT u.id, u.telegram_chat_id, COALESCE(s.notify_telegram, 1) AS nt, COALESCE(s.notify_push, 0) AS np
             FROM users u LEFT JOIN user_settings s ON s.user_id = u.id WHERE u.id IN (${placeholders(ids.length)})`,
          )
          .bind(...ids)
          .all<{ id: number; telegram_chat_id: string | null; nt: number; np: number }>();
        return results.map((r) => ({
          id: r.id,
          chatId: r.telegram_chat_id,
          notifyTelegram: r.nt === 1,
          notifyPush: r.np === 1,
        }));
      },
      async findReportTargets(kind) {
        const col = kind === 'daily' ? 'report_daily' : 'report_weekly';
        const { results } = await db
          .prepare(
            `SELECT u.id, u.telegram_chat_id, u.nickname, u.tag FROM users u
             LEFT JOIN user_settings s ON s.user_id = u.id
             WHERE u.nickname IS NOT NULL AND u.telegram_chat_id IS NOT NULL AND COALESCE(s.${col}, 1) = 1
             ORDER BY u.id`,
          )
          .all<{ id: number; telegram_chat_id: string; nickname: string; tag: string }>();
        return results.map((r) => ({ id: r.id, chatId: r.telegram_chat_id, nickname: r.nickname, tag: r.tag }));
      },
      async listAll() {
        const { results } = await db
          .prepare(`SELECT ${USER_COLS} FROM users u WHERE u.nickname IS NOT NULL ORDER BY u.nickname, u.tag`)
          .all<UserRow>();
        return results.map(mapUser);
      },
      async countAdmins() {
        const r = await db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").first<{ n: number }>();
        return r?.n ?? 0;
      },
      async create({ telegramId, telegramChatId, role, now }) {
        const r = await db
          .prepare(
            `INSERT INTO users (telegram_id, telegram_chat_id, role, created_at) VALUES (?, ?, ?, ?)
             RETURNING id, telegram_id, telegram_chat_id, nickname, tag, role, created_at`,
          )
          .bind(telegramId, telegramChatId, role, now)
          .first<UserRow>();
        return mapUser(r!);
      },
      async updateChatId(id, chatId) {
        await db.prepare('UPDATE users SET telegram_chat_id = ? WHERE id = ?').bind(chatId, id).run();
      },
      async updateRole(id, role) {
        await db.prepare('UPDATE users SET role = ? WHERE id = ?').bind(role, id).run();
      },
      async updateProfile(id, nickname, tag) {
        try {
          await db.prepare('UPDATE users SET nickname = ?, tag = ? WHERE id = ?').bind(nickname, tag, id).run();
          return true;
        } catch (e) {
          if (isUniqueViolation(e)) return false;
          throw e;
        }
      },
      async isNicknameTagTaken(nickname, tag) {
        const r = await db.prepare('SELECT 1 AS x FROM users WHERE nickname = ? AND tag = ?').bind(nickname, tag).first();
        return r !== null;
      },
      async search({ nickname, tag, excludeId, limit }) {
        const where = ['u.nickname IS NOT NULL', "u.nickname LIKE ? ESCAPE '\\'"];
        const params: unknown[] = [`%${nickname.replace(/[\\%_]/g, (m) => '\\' + m)}%`];
        if (tag) {
          where.push('u.tag LIKE ?');
          params.push(`${tag}%`);
        }
        if (excludeId !== undefined) {
          where.push('u.id != ?');
          params.push(excludeId);
        }
        params.push(limit);
        const { results } = await db
          .prepare(`SELECT ${USER_COLS} FROM users u WHERE ${where.join(' AND ')} ORDER BY u.nickname, u.tag LIMIT ?`)
          .bind(...params)
          .all<UserRow>();
        return results.map(mapUser);
      },
    },

    authCodes: {
      async create({ codeHash, telegramId, chatId, expiresAt, now }) {
        try {
          await db
            .prepare('INSERT INTO auth_codes (code_hash, telegram_id, chat_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
            .bind(codeHash, telegramId, chatId, expiresAt, now)
            .run();
          return true;
        } catch (e) {
          if (isUniqueViolation(e)) return false;
          throw e;
        }
      },
      async consume(codeHash, now) {
        const r = await db
          .prepare(
            `UPDATE auth_codes SET used_at = ?
             WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?
             RETURNING telegram_id, chat_id`,
          )
          .bind(now, codeHash, now)
          .first<{ telegram_id: string; chat_id: string }>();
        return r ? { telegramId: r.telegram_id, chatId: r.chat_id } : null;
      },
      async deleteForTelegram(telegramId) {
        await db.prepare('DELETE FROM auth_codes WHERE telegram_id = ?').bind(telegramId).run();
      },
      async deleteExpired(now) {
        await db.prepare('DELETE FROM auth_codes WHERE expires_at <= ? OR used_at IS NOT NULL').bind(now).run();
      },
    },

    sessions: {
      async create({ tokenHash, userId, expiresAt, now }) {
        await db
          .prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_used_at) VALUES (?, ?, ?, ?, ?)')
          .bind(tokenHash, userId, now, expiresAt, now)
          .run();
      },
      async findValid(tokenHash, now) {
        const r = await db
          .prepare(
            `SELECT ${USER_COLS}, s.last_used_at FROM sessions s JOIN users u ON u.id = s.user_id
             WHERE s.token_hash = ? AND s.expires_at > ?`,
          )
          .bind(tokenHash, now)
          .first<UserRow & { last_used_at: number }>();
        return r ? { user: mapUser(r), lastUsedAt: r.last_used_at } : null;
      },
      async touch(tokenHash, now, expiresAt) {
        await db
          .prepare('UPDATE sessions SET last_used_at = ?, expires_at = ? WHERE token_hash = ?')
          .bind(now, expiresAt, tokenHash)
          .run();
      },
      async delete(tokenHash) {
        await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
      },
    },

    settings: {
      async ensure(userId, now) {
        await db
          .prepare('INSERT INTO user_settings (user_id, updated_at) VALUES (?, ?) ON CONFLICT (user_id) DO NOTHING')
          .bind(userId, now)
          .run();
      },
      async get(userId) {
        const r = await db
          .prepare('SELECT notify_telegram, notify_push, report_daily, report_weekly FROM user_settings WHERE user_id = ?')
          .bind(userId)
          .first<Record<string, number>>();
        return {
          notifyTelegram: (r?.notify_telegram ?? 1) === 1,
          notifyPush: (r?.notify_push ?? 0) === 1,
          reportDaily: (r?.report_daily ?? 1) === 1,
          reportWeekly: (r?.report_weekly ?? 1) === 1,
        };
      },
      async update(userId, patch, now) {
        const sets: string[] = [];
        const params: unknown[] = [];
        for (const [key, col] of Object.entries(SETTINGS_COLUMNS) as [keyof UserSettings, string][]) {
          if (typeof patch[key] === 'boolean') {
            sets.push(`${col} = ?`);
            params.push(patch[key] ? 1 : 0);
          }
        }
        if (sets.length) {
          await db
            .prepare(`UPDATE user_settings SET ${sets.join(', ')}, updated_at = ? WHERE user_id = ?`)
            .bind(...params, now, userId)
            .run();
        }
        return this.get(userId);
      },
    },

    rateLimits: {
      async hit(key, windowMs, now) {
        const resetBefore = now - windowMs;
        const r = await db
          .prepare(
            `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
             ON CONFLICT (key) DO UPDATE SET
               count = CASE WHEN window_start < ? THEN 1 ELSE count + 1 END,
               window_start = CASE WHEN window_start < ? THEN excluded.window_start ELSE window_start END
             RETURNING count`,
          )
          .bind(key, now, resetBefore, resetBefore)
          .first<{ count: number }>();
        return r?.count ?? 1;
      },
    },

    maintenance: {
      async cleanup(now) {
        await db.batch([
          db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
          db.prepare('DELETE FROM auth_codes WHERE expires_at <= ? OR used_at IS NOT NULL').bind(now),
          db.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(now - 24 * 60 * 60 * 1000),
        ]);
      },
    },

    catalog: createCatalogRepo(db),
    records: createRecordRepo(db),
    notifications: createNotificationRepo(db),
    push: createPushRepo(db),
  };
}
