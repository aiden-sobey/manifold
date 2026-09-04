import Database from '@tauri-apps/plugin-sql';
import type {
  Attachment,
  AttachmentKind,
  Chat,
  ChatMode,
  FinishReason,
  Lane,
  Message,
  SearchResult,
  ThinkingLevel,
  TitleSource,
  Usage,
} from '@/types/domain';

const DB_URL = 'sqlite:manifold.db';
let dbPromise: Promise<Database> | null = null;

export function db(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load(DB_URL).then(async (d) => {
      await d.execute('PRAGMA foreign_keys = ON');
      return d;
    });
  }
  return dbPromise;
}

interface ChatRow {
  id: string;
  title: string;
  title_source: TitleSource;
  model_id: string;
  thinking: ThinkingLevel;
  mode: ChatMode;
  lanes_json: string | null;
  created_at: number;
  updated_at: number;
}
interface MessageRow {
  id: string;
  chat_id: string;
  role: 'user' | 'assistant';
  content: string;
  reasoning: string | null;
  model_id: string | null;
  finish_reason: FinishReason | null;
  usage_json: string | null;
  lane: number | null;
  first_token_ms: number | null;
  total_ms: number | null;
  created_at: number;
}

const toChat = (r: ChatRow): Chat => ({
  id: r.id,
  title: r.title,
  titleSource: r.title_source,
  modelId: r.model_id,
  thinking: r.thinking,
  mode: r.mode ?? 'single',
  lanes: r.lanes_json ? (JSON.parse(r.lanes_json) as Lane[]) : null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toMessage = (r: MessageRow): Message => ({
  id: r.id,
  chatId: r.chat_id,
  role: r.role,
  content: r.content,
  reasoning: r.reasoning,
  modelId: r.model_id,
  finishReason: r.finish_reason,
  usage: r.usage_json ? (JSON.parse(r.usage_json) as Usage) : null,
  lane: r.lane,
  firstTokenMs: r.first_token_ms,
  totalMs: r.total_ms,
  createdAt: r.created_at,
});

export async function listChats(): Promise<Chat[]> {
  const rows = await (await db()).select<ChatRow[]>('SELECT * FROM chats ORDER BY updated_at DESC');
  return rows.map(toChat);
}

export async function insertChat(chat: Chat): Promise<void> {
  await (
    await db()
  ).execute(
    `INSERT INTO chats (id, title, title_source, model_id, thinking, mode, lanes_json, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      chat.id,
      chat.title,
      chat.titleSource,
      chat.modelId,
      chat.thinking,
      chat.mode,
      chat.lanes ? JSON.stringify(chat.lanes) : null,
      chat.createdAt,
      chat.updatedAt,
    ],
  );
}

export async function updateChat(
  id: string,
  patch: Partial<
    Pick<Chat, 'title' | 'titleSource' | 'modelId' | 'thinking' | 'mode' | 'lanes' | 'updatedAt'>
  >,
): Promise<void> {
  const sets: string[] = [];
  const args: unknown[] = [];
  const push = (col: string, v: unknown) => {
    args.push(v);
    sets.push(`${col} = $${args.length}`);
  };
  if (patch.title !== undefined) push('title', patch.title);
  if (patch.titleSource !== undefined) push('title_source', patch.titleSource);
  if (patch.modelId !== undefined) push('model_id', patch.modelId);
  if (patch.thinking !== undefined) push('thinking', patch.thinking);
  if (patch.mode !== undefined) push('mode', patch.mode);
  if (patch.lanes !== undefined)
    push('lanes_json', patch.lanes ? JSON.stringify(patch.lanes) : null);
  if (patch.updatedAt !== undefined) push('updated_at', patch.updatedAt);
  if (!sets.length) return;
  args.push(id);
  await (
    await db()
  ).execute(`UPDATE chats SET ${sets.join(', ')} WHERE id = $${args.length}`, args);
}

export async function deleteChat(id: string): Promise<void> {
  await (await db()).execute('DELETE FROM chats WHERE id = $1', [id]);
}

export async function listMessages(chatId: string): Promise<Message[]> {
  const d = await db();
  const [rows, atts] = await Promise.all([
    d.select<MessageRow[]>(
      'SELECT * FROM messages WHERE chat_id = $1 ORDER BY created_at ASC, rowid ASC',
      [chatId],
    ),
    listAttachmentsForChat(chatId),
  ]);
  const byMessage = new Map<string, Attachment[]>();
  for (const at of atts) {
    const list = byMessage.get(at.messageId) ?? [];
    list.push(at);
    byMessage.set(at.messageId, list);
  }
  return rows.map((r) => {
    const m = toMessage(r);
    const list = byMessage.get(m.id);
    return list ? { ...m, attachments: list } : m;
  });
}

// ---- attachments ----

interface AttachmentRow {
  id: string;
  message_id: string;
  chat_id: string;
  kind: AttachmentKind;
  name: string;
  mime: string;
  size: number;
  rel_path: string;
  width: number | null;
  height: number | null;
  text_content: string | null;
  annotation_json: string | null;
  created_at: number;
}

const toAttachment = (r: AttachmentRow): Attachment => ({
  id: r.id,
  messageId: r.message_id,
  chatId: r.chat_id,
  kind: r.kind,
  name: r.name,
  mime: r.mime,
  size: r.size,
  relPath: r.rel_path,
  width: r.width,
  height: r.height,
  textContent: r.text_content,
  annotation: r.annotation_json ? (JSON.parse(r.annotation_json) as unknown) : null,
  createdAt: r.created_at,
});

export async function listAttachmentsForChat(chatId: string): Promise<Attachment[]> {
  const rows = await (
    await db()
  ).select<AttachmentRow[]>(
    'SELECT * FROM attachments WHERE chat_id = $1 ORDER BY created_at ASC, rowid ASC',
    [chatId],
  );
  return rows.map(toAttachment);
}

export async function insertAttachment(a: Attachment): Promise<void> {
  await (
    await db()
  ).execute(
    `INSERT INTO attachments (id, message_id, chat_id, kind, name, mime, size, rel_path, width, height, text_content, annotation_json, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      a.id,
      a.messageId,
      a.chatId,
      a.kind,
      a.name,
      a.mime,
      a.size,
      a.relPath,
      a.width,
      a.height,
      a.textContent,
      a.annotation ? JSON.stringify(a.annotation) : null,
      a.createdAt,
    ],
  );
}

export async function updateAttachmentAnnotation(id: string, annotation: unknown): Promise<void> {
  await (
    await db()
  ).execute('UPDATE attachments SET annotation_json = $1 WHERE id = $2', [
    JSON.stringify(annotation),
    id,
  ]);
}

export async function insertMessage(m: Message): Promise<void> {
  await (
    await db()
  ).execute(
    `INSERT INTO messages (id, chat_id, role, content, reasoning, model_id, finish_reason, usage_json, lane, first_token_ms, total_ms, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      m.id,
      m.chatId,
      m.role,
      m.content,
      m.reasoning,
      m.modelId,
      m.finishReason,
      m.usage ? JSON.stringify(m.usage) : null,
      m.lane,
      m.firstTokenMs,
      m.totalMs,
      m.createdAt,
    ],
  );
}

export async function deleteMessage(id: string): Promise<void> {
  await (await db()).execute('DELETE FROM messages WHERE id = $1', [id]);
}

/** Compare mode: drop one column's replies (used by "continue with this model"). */
export async function deleteLaneMessages(chatId: string, lane: number): Promise<void> {
  await (
    await db()
  ).execute('DELETE FROM messages WHERE chat_id = $1 AND lane = $2', [chatId, lane]);
}

/** Compare mode: after continuing with one lane, its replies become ordinary single-mode replies. */
export async function clearLane(chatId: string): Promise<void> {
  await (await db()).execute('UPDATE messages SET lane = NULL WHERE chat_id = $1', [chatId]);
}

/** Turns free text into an FTS5 prefix query: each token quoted and suffixed with `*`. */
export function toFtsQuery(input: string): string {
  return input
    .split(/\s+/)
    .map((t) => t.replace(/"/g, '').trim())
    .filter(Boolean)
    .map((t) => `"${t}"*`)
    .join(' ');
}

export async function searchChats(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  const d = await db();
  const fts = toFtsQuery(q);
  const contentHits = fts
    ? await d.select<Array<{ chat_id: string; title: string; snippet: string; r: number }>>(
        `SELECT c.id AS chat_id, c.title AS title,
                snippet(messages_fts, 0, '‹', '›', '…', 14) AS snippet,
                min(rank) AS r
         FROM messages_fts JOIN chats c ON c.id = messages_fts.chat_id
         WHERE messages_fts MATCH $1
         GROUP BY c.id ORDER BY r LIMIT 50`,
        [fts],
      )
    : [];
  const titleHits = await d.select<Array<{ id: string; title: string }>>(
    `SELECT id, title FROM chats WHERE title LIKE $1 ORDER BY updated_at DESC LIMIT 50`,
    [`%${q}%`],
  );

  const seen = new Set<string>();
  const out: SearchResult[] = [];
  for (const t of titleHits) {
    seen.add(t.id);
    out.push({ chatId: t.id, title: t.title, snippet: null });
  }
  for (const h of contentHits) {
    if (seen.has(h.chat_id)) {
      const existing = out.find((o) => o.chatId === h.chat_id);
      if (existing) existing.snippet = h.snippet;
      continue;
    }
    seen.add(h.chat_id);
    out.push({ chatId: h.chat_id, title: h.title, snippet: h.snippet });
  }
  return out;
}

// ---- analytics ----

export type UsageSource = 'chat' | 'system';

export interface DailyModelRow {
  period: string; // YYYY-MM-DDTHH, local time (hour grain; coarser buckets are built in TS)
  source: UsageSource;
  model_id: string | null;
  replies: number;
  cost: number | null; // sum of charged cost over rows that have one
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  missing_cost: number; // rows in this group with no charged cost
  missing_prompt_tokens: number | null; // tokens belonging to those rows, for estimation
  missing_completion_tokens: number | null;
}

// Analytics read from the ledger, not from messages, so deleting a chat never erases spend.
const USAGE_UNION = `SELECT source, model_id, usage_json, created_at FROM usage_ledger`;

const SPEND_SELECT = `
  SELECT strftime('%Y-%m-%dT%H', created_at / 1000, 'unixepoch', 'localtime') AS period,
         source,
         model_id,
         COUNT(*) AS replies,
         SUM(json_extract(usage_json, '$.cost')) AS cost,
         SUM(json_extract(usage_json, '$.prompt_tokens')) AS prompt_tokens,
         SUM(json_extract(usage_json, '$.completion_tokens')) AS completion_tokens,
         SUM(json_extract(usage_json, '$.total_tokens')) AS total_tokens,
         SUM(CASE WHEN json_extract(usage_json, '$.cost') IS NULL THEN 1 ELSE 0 END) AS missing_cost,
         SUM(CASE WHEN json_extract(usage_json, '$.cost') IS NULL
                  THEN json_extract(usage_json, '$.prompt_tokens') END) AS missing_prompt_tokens,
         SUM(CASE WHEN json_extract(usage_json, '$.cost') IS NULL
                  THEN json_extract(usage_json, '$.completion_tokens') END) AS missing_completion_tokens
  FROM (${USAGE_UNION}) u`;

export async function spendByDayAndModel(sinceMs: number | null): Promise<DailyModelRow[]> {
  const d = await db();
  if (sinceMs === null) {
    return d.select<DailyModelRow[]>(
      `${SPEND_SELECT} GROUP BY period, source, model_id ORDER BY period ASC`,
    );
  }
  return d.select<DailyModelRow[]>(
    `${SPEND_SELECT} WHERE created_at >= $1 GROUP BY period, source, model_id ORDER BY period ASC`,
    [sinceMs],
  );
}

export interface UsageEntry {
  /** Message id for chat replies so re-recording is idempotent; any unique id for system calls. */
  id: string;
  source: UsageSource;
  purpose?: 'title' | 'greeting';
  modelId: string;
  chatId?: string;
  usage: Record<string, unknown>;
  createdAt?: number;
}

export async function insertUsage(entry: UsageEntry): Promise<void> {
  await (
    await db()
  ).execute(
    `INSERT OR IGNORE INTO usage_ledger (id, source, purpose, model_id, chat_id, usage_json, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      entry.id,
      entry.source,
      entry.purpose ?? null,
      entry.modelId,
      entry.chatId ?? null,
      JSON.stringify(entry.usage),
      entry.createdAt ?? Date.now(),
    ],
  );
}

export function insertSystemUsage(entry: {
  purpose: 'title' | 'greeting';
  modelId: string;
  usage: Record<string, unknown>;
}): Promise<void> {
  return insertUsage({ id: crypto.randomUUID(), source: 'system', ...entry });
}

export interface SpendTotalsRow {
  replies: number;
  cost: number | null;
  total_tokens: number | null;
  missing_cost: number;
  first_at: number | null;
}

export async function spendTotals(): Promise<SpendTotalsRow> {
  const rows = await (
    await db()
  ).select<SpendTotalsRow[]>(
    `SELECT COUNT(*) AS replies,
            SUM(json_extract(usage_json, '$.cost')) AS cost,
            SUM(json_extract(usage_json, '$.total_tokens')) AS total_tokens,
            SUM(CASE WHEN json_extract(usage_json, '$.cost') IS NULL THEN 1 ELSE 0 END) AS missing_cost,
            MIN(created_at) AS first_at
     FROM messages WHERE role = 'assistant' AND usage_json IS NOT NULL`,
  );
  return rows[0] ?? { replies: 0, cost: 0, total_tokens: 0, missing_cost: 0, first_at: null };
}
