import Database from '@tauri-apps/plugin-sql';
import type {
  Chat,
  FinishReason,
  Message,
  SearchResult,
  ThinkingLevel,
  TitleSource,
  Usage,
} from '@/types/domain';

const DB_URL = 'sqlite:chat_harness.db';
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
  created_at: number;
}

const toChat = (r: ChatRow): Chat => ({
  id: r.id,
  title: r.title,
  titleSource: r.title_source,
  modelId: r.model_id,
  thinking: r.thinking,
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
    `INSERT INTO chats (id, title, title_source, model_id, thinking, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      chat.id,
      chat.title,
      chat.titleSource,
      chat.modelId,
      chat.thinking,
      chat.createdAt,
      chat.updatedAt,
    ],
  );
}

export async function updateChat(
  id: string,
  patch: Partial<Pick<Chat, 'title' | 'titleSource' | 'modelId' | 'thinking' | 'updatedAt'>>,
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
  const rows = await (
    await db()
  ).select<MessageRow[]>(
    'SELECT * FROM messages WHERE chat_id = $1 ORDER BY created_at ASC, rowid ASC',
    [chatId],
  );
  return rows.map(toMessage);
}

export async function insertMessage(m: Message): Promise<void> {
  await (
    await db()
  ).execute(
    `INSERT INTO messages (id, chat_id, role, content, reasoning, model_id, finish_reason, usage_json, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      m.id,
      m.chatId,
      m.role,
      m.content,
      m.reasoning,
      m.modelId,
      m.finishReason,
      m.usage ? JSON.stringify(m.usage) : null,
      m.createdAt,
    ],
  );
}

export async function deleteMessage(id: string): Promise<void> {
  await (await db()).execute('DELETE FROM messages WHERE id = $1', [id]);
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

const USAGE_UNION = `
  SELECT 'chat' AS source, model_id, usage_json, created_at
  FROM messages WHERE role = 'assistant' AND usage_json IS NOT NULL
  UNION ALL
  SELECT 'system' AS source, model_id, usage_json, created_at
  FROM system_usage`;

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

export async function insertSystemUsage(entry: {
  purpose: 'title';
  modelId: string;
  usage: Record<string, unknown>;
}): Promise<void> {
  await (
    await db()
  ).execute(
    `INSERT INTO system_usage (id, purpose, model_id, usage_json, created_at) VALUES ($1, $2, $3, $4, $5)`,
    [crypto.randomUUID(), entry.purpose, entry.modelId, JSON.stringify(entry.usage), Date.now()],
  );
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
