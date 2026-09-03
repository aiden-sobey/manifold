-- Spend ledger, independent of chats: survives chat deletion.
CREATE TABLE IF NOT EXISTS usage_ledger (
  id          TEXT PRIMARY KEY,       -- message id for chat replies, own id for system calls
  source      TEXT NOT NULL,          -- 'chat' | 'system'
  purpose     TEXT,                   -- system: 'title' | 'greeting'
  model_id    TEXT,
  chat_id     TEXT,                   -- informational only; no FK so deletion does not cascade
  usage_json  TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS usage_ledger_created ON usage_ledger(created_at);

-- Backfill from what exists today. Idempotent via INSERT OR IGNORE on the primary key.
INSERT OR IGNORE INTO usage_ledger (id, source, purpose, model_id, chat_id, usage_json, created_at)
  SELECT id, 'chat', NULL, model_id, chat_id, usage_json, created_at
  FROM messages WHERE role = 'assistant' AND usage_json IS NOT NULL;
INSERT OR IGNORE INTO usage_ledger (id, source, purpose, model_id, chat_id, usage_json, created_at)
  SELECT id, 'system', purpose, model_id, NULL, usage_json, created_at
  FROM system_usage;
