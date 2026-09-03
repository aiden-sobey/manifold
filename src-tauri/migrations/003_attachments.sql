CREATE TABLE IF NOT EXISTS attachments (
  id              TEXT PRIMARY KEY,
  message_id      TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  chat_id         TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,
  name            TEXT NOT NULL,
  mime            TEXT NOT NULL,
  size            INTEGER NOT NULL,
  rel_path        TEXT NOT NULL,
  width           INTEGER,
  height          INTEGER,
  text_content    TEXT,
  annotation_json TEXT,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS attachments_message ON attachments(message_id);
CREATE INDEX IF NOT EXISTS attachments_chat ON attachments(chat_id);
