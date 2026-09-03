CREATE TABLE IF NOT EXISTS system_usage (
  id          TEXT PRIMARY KEY,
  purpose     TEXT NOT NULL,          -- 'title'
  model_id    TEXT NOT NULL,
  usage_json  TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS system_usage_created ON system_usage(created_at);
