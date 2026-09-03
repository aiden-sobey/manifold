CREATE TABLE IF NOT EXISTS chats (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  title_source  TEXT NOT NULL DEFAULT 'fallback',
  model_id      TEXT NOT NULL,
  thinking      TEXT NOT NULL DEFAULT 'default',
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id            TEXT PRIMARY KEY,
  chat_id       TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  role          TEXT NOT NULL,
  content       TEXT NOT NULL,
  reasoning     TEXT,
  model_id      TEXT,
  finish_reason TEXT,
  usage_json    TEXT,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_chat_created ON messages(chat_id, created_at);

CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  content, chat_id UNINDEXED, message_id UNINDEXED, tokenize='porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, content, chat_id, message_id)
  VALUES (new.rowid, new.content, new.chat_id, new.id);
END;
CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
  DELETE FROM messages_fts WHERE rowid = old.rowid;
END;
CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE OF content ON messages BEGIN
  UPDATE messages_fts SET content = new.content WHERE rowid = old.rowid;
END;
