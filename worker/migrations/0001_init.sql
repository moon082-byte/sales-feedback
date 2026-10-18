-- 시간 값은 모두 Unix epoch milliseconds (INTEGER)

CREATE TABLE users (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id      TEXT    NOT NULL UNIQUE,
  telegram_chat_id TEXT,
  nickname         TEXT,
  tag              TEXT,
  role             TEXT    NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at       INTEGER NOT NULL,
  UNIQUE (nickname, tag)
);
CREATE INDEX idx_users_nickname ON users (nickname);

CREATE TABLE auth_codes (
  code_hash   TEXT    PRIMARY KEY,
  telegram_id TEXT    NOT NULL,
  chat_id     TEXT    NOT NULL,
  expires_at  INTEGER NOT NULL,
  used_at     INTEGER,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_auth_codes_telegram ON auth_codes (telegram_id);

CREATE TABLE sessions (
  token_hash   TEXT    PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions (user_id);

CREATE TABLE user_settings (
  user_id         INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  notify_telegram INTEGER NOT NULL DEFAULT 1,
  notify_push     INTEGER NOT NULL DEFAULT 0,
  report_daily    INTEGER NOT NULL DEFAULT 1,
  report_weekly   INTEGER NOT NULL DEFAULT 1,
  updated_at      INTEGER NOT NULL
);

CREATE TABLE push_subscriptions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  endpoint   TEXT    NOT NULL UNIQUE,
  p256dh     TEXT    NOT NULL,
  auth       TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_push_user ON push_subscriptions (user_id);

CREATE TABLE tools (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  is_active  INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE questions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  category   TEXT    NOT NULL CHECK (category IN ('Q1', 'Q2')),
  text       TEXT    NOT NULL,
  is_active  INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE records (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id       INTEGER NOT NULL REFERENCES users (id),
  tool_id         INTEGER REFERENCES tools (id),
  phone_exchanged INTEGER NOT NULL DEFAULT 0 CHECK (phone_exchanged IN (0, 1)),
  customer_info   TEXT    NOT NULL DEFAULT '',
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  updated_by      INTEGER REFERENCES users (id)
);
CREATE INDEX idx_records_created ON records (created_at);
CREATE INDEX idx_records_author ON records (author_id, created_at);
CREATE INDEX idx_records_tool ON records (tool_id, created_at);

CREATE TABLE record_peers (
  record_id INTEGER NOT NULL REFERENCES records (id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users (id),
  PRIMARY KEY (record_id, user_id)
);
CREATE INDEX idx_record_peers_user ON record_peers (user_id);

-- 체크된 문항만 저장. 문항이 나중에 수정돼도 기록이 보존되도록 문구를 스냅샷
CREATE TABLE record_answers (
  record_id     INTEGER NOT NULL REFERENCES records (id) ON DELETE CASCADE,
  question_id   INTEGER NOT NULL REFERENCES questions (id),
  category      TEXT    NOT NULL CHECK (category IN ('Q1', 'Q2')),
  question_text TEXT    NOT NULL,
  reason        TEXT    NOT NULL DEFAULT '',
  PRIMARY KEY (record_id, question_id)
);

CREATE TABLE notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type       TEXT    NOT NULL,
  record_id  INTEGER REFERENCES records (id) ON DELETE CASCADE,
  actor_id   INTEGER REFERENCES users (id),
  read_at    INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_notifications_user ON notifications (user_id, created_at);

CREATE TABLE rate_limits (
  key          TEXT    PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL
);
