import { create } from 'zustand';
import * as db from '@/lib/db';
import { getApiKey } from '@/lib/keychain';
import { OpenRouterError, streamChat } from '@/lib/openrouter/client';
import { toReasoningParam } from '@/lib/openrouter/reasoning';
import type { ChatMessageParam } from '@/lib/openrouter/types';
import { fallbackTitle, generateTitle } from '@/lib/titling';
import { buildHistory, pluginsFor } from '@/lib/attachments/content';
import {
  readAttachmentBytes,
  relPathFor,
  removeChatAttachments,
  writeAttachmentBytes,
} from '@/lib/attachments/storage';
import type { PendingAttachment } from './attachmentDraftStore';
import type {
  Attachment,
  Chat,
  FinishReason,
  Message,
  SearchResult,
  ThinkingLevel,
} from '@/types/domain';
import { useModels } from './modelStore';
import { useSettings } from './settingsStore';
import { useUi } from './uiStore';
import { useBalance } from './balanceStore';

const uuid = () => crypto.randomUUID();

/** Model for a new chat: the last one used, else the cheapest favourite, else the configured fallback. */
export function pickDefaultModel(): string {
  const { recentModelIds, favouriteModelIds, defaultModelId } = useSettings.getState().settings;
  const byId = useModels.getState().byId;
  const recent = recentModelIds[0];
  if (recent) return recent;
  const cheapest = favouriteModelIds
    .map((id) => byId.get(id))
    .filter((m): m is NonNullable<typeof m> => Boolean(m))
    .sort(
      (a, b) => Number(a.pricing?.prompt ?? Infinity) - Number(b.pricing?.prompt ?? Infinity),
    )[0];
  return cheapest?.id ?? favouriteModelIds[0] ?? defaultModelId;
}

interface ChatState {
  chats: Chat[];
  activeChatId: string | null;
  messages: Message[];
  /** Model/thinking for the composer. Mirrors the active chat, or the defaults for a new chat. */
  draftModelId: string;
  draftThinking: ThinkingLevel;
  streaming: boolean;
  abort: AbortController | null;
  searchQuery: string;
  searchResults: SearchResult[];
  loaded: boolean;

  init: () => Promise<void>;
  newChat: () => void;
  openChat: (id: string) => Promise<void>;
  deleteChat: (id: string) => Promise<void>;
  renameChat: (id: string, title: string) => Promise<void>;
  setDraftModel: (modelId: string) => Promise<void>;
  setDraftThinking: (level: ThinkingLevel) => Promise<void>;
  send: (text: string, attachments?: PendingAttachment[]) => Promise<void>;
  stop: () => void;
  regenerate: () => Promise<void>;
  setSearch: (q: string) => Promise<void>;
}

function updateLast(messages: Message[], patch: Partial<Message>): Message[] {
  const last = messages[messages.length - 1];
  if (!last) return messages;
  return [...messages.slice(0, -1), { ...last, ...patch }];
}

export const useChat = create<ChatState>((set, get) => ({
  chats: [],
  activeChatId: null,
  messages: [],
  draftModelId: '',
  draftThinking: 'medium',
  streaming: false,
  abort: null,
  searchQuery: '',
  searchResults: [],
  loaded: false,

  init: async () => {
    const chats = await db.listChats();
    const { defaultThinking } = useSettings.getState().settings;
    set({ chats, loaded: true, draftModelId: pickDefaultModel(), draftThinking: defaultThinking });
  },

  newChat: () => {
    if (get().streaming) get().stop();
    useUi.getState().showChat();
    void useBalance.getState().refresh();
    const { defaultThinking } = useSettings.getState().settings;
    set({
      activeChatId: null,
      messages: [],
      draftModelId: pickDefaultModel(),
      draftThinking: defaultThinking,
    });
  },

  openChat: async (id) => {
    if (get().streaming) get().stop();
    useUi.getState().showChat();
    const chat = get().chats.find((c) => c.id === id);
    const messages = await db.listMessages(id);
    set({
      activeChatId: id,
      messages,
      draftModelId: chat?.modelId ?? get().draftModelId,
      draftThinking: chat?.thinking ?? 'default',
    });
  },

  deleteChat: async (id) => {
    await db.deleteChat(id);
    removeChatAttachments(id).catch(() => undefined);
    set((s) => ({ chats: s.chats.filter((c) => c.id !== id) }));
    if (get().activeChatId === id) get().newChat();
    if (get().searchQuery) await get().setSearch(get().searchQuery);
  },

  renameChat: async (id, title) => {
    const t = title.trim();
    if (!t) return;
    await db.updateChat(id, { title: t, titleSource: 'manual' });
    set((s) => ({
      chats: s.chats.map((c) => (c.id === id ? { ...c, title: t, titleSource: 'manual' } : c)),
    }));
  },

  setDraftModel: async (modelId) => {
    set({ draftModelId: modelId });
    const id = get().activeChatId;
    if (id) {
      await db.updateChat(id, { modelId });
      set((s) => ({ chats: s.chats.map((c) => (c.id === id ? { ...c, modelId } : c)) }));
    }
  },

  setDraftThinking: async (level) => {
    set({ draftThinking: level });
    const id = get().activeChatId;
    if (id) {
      await db.updateChat(id, { thinking: level });
      set((s) => ({ chats: s.chats.map((c) => (c.id === id ? { ...c, thinking: level } : c)) }));
    }
  },

  send: async (text, attachments = []) => {
    const content = text.trim();
    if ((!content && attachments.length === 0) || get().streaming) return;
    const now = Date.now();
    let chatId = get().activeChatId;
    const modelId = get().draftModelId;
    const thinking = get().draftThinking;

    if (!chatId) {
      const chat: Chat = {
        id: uuid(),
        title: fallbackTitle(content || attachments.map((a) => a.name).join(', ')),
        titleSource: 'fallback',
        modelId,
        thinking,
        createdAt: now,
        updatedAt: now,
      };
      await db.insertChat(chat);
      chatId = chat.id;
      set((s) => ({ chats: [chat, ...s.chats], activeChatId: chat.id, messages: [] }));
    }

    const userMsg: Message = {
      id: uuid(),
      chatId,
      role: 'user',
      content,
      reasoning: null,
      modelId: null,
      finishReason: null,
      usage: null,
      createdAt: now,
    };
    await db.insertMessage(userMsg);

    const stored: Attachment[] = [];
    for (const a of attachments) {
      const relPath = relPathFor(chatId, a.id, a.ext);
      await writeAttachmentBytes(relPath, a.bytes);
      const row: Attachment = {
        id: a.id,
        messageId: userMsg.id,
        chatId,
        kind: a.kind,
        name: a.name,
        mime: a.mime,
        size: a.size,
        relPath,
        width: a.width,
        height: a.height,
        textContent: a.textContent,
        annotation: null,
        createdAt: now,
      };
      await db.insertAttachment(row);
      stored.push(row);
    }
    if (stored.length) userMsg.attachments = stored;
    set((s) => ({ messages: [...s.messages, userMsg] }));

    // Title the chat from the first message right away, in parallel with the reply.
    // Very short openers wait for the reply so the title has something to go on.
    if (get().messages.length === 1 && content.length >= 20) {
      void getApiKey().then((key) => {
        if (key) void maybeAutoTitle(chatId, null, key, set, get);
      });
    }

    await runCompletion(chatId, modelId, thinking, set, get);
  },

  stop: () => {
    get().abort?.abort();
  },

  regenerate: async () => {
    const { messages, activeChatId, streaming, draftModelId, draftThinking } = get();
    if (streaming || !activeChatId) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant') return;
    if (!last.streaming) await db.deleteMessage(last.id);
    set({ messages: messages.slice(0, -1) });
    await runCompletion(activeChatId, draftModelId, draftThinking, set, get);
  },

  setSearch: async (q) => {
    set({ searchQuery: q });
    if (!q.trim()) {
      set({ searchResults: [] });
      return;
    }
    const results = await db.searchChats(q);
    if (get().searchQuery === q) set({ searchResults: results });
  },
}));

type Set = (fn: Partial<ChatState> | ((s: ChatState) => Partial<ChatState>)) => void;
type Get = () => ChatState;

async function runCompletion(
  chatId: string,
  modelId: string,
  thinking: ThinkingLevel,
  set: Set,
  get: Get,
) {
  const apiKey = await getApiKey();
  const model = useModels.getState().byId.get(modelId);
  const controller = new AbortController();

  const placeholder: Message = {
    id: uuid(),
    chatId,
    role: 'assistant',
    content: '',
    reasoning: null,
    modelId,
    finishReason: null,
    usage: null,
    createdAt: Date.now(),
    streaming: true,
  };
  set((s) => ({ messages: [...s.messages, placeholder], streaming: true, abort: controller }));

  if (!apiKey) {
    set((s) => ({
      messages: updateLast(s.messages, {
        streaming: false,
        finishReason: 'error',
        error: 'No API key set. Open Settings to add your OpenRouter key.',
      }),
      streaming: false,
      abort: null,
    }));
    return;
  }

  const sendable = get().messages.filter(
    (m) => !m.streaming && (m.content || m.attachments?.length) && m.finishReason !== 'error',
  );
  let history: ChatMessageParam[];
  try {
    history = await buildHistory(sendable, readAttachmentBytes);
  } catch (e) {
    set((s) => ({
      messages: updateLast(s.messages, {
        streaming: false,
        finishReason: 'error',
        error: `Could not read an attachment: ${e instanceof Error ? e.message : String(e)}`,
      }),
      streaming: false,
      abort: null,
    }));
    return;
  }
  const plugins = pluginsFor(sendable, model, useSettings.getState().settings.pdfOcr);
  const lastUser = [...sendable].reverse().find((m) => m.role === 'user');

  let content = '';
  let reasoning = '';
  let usage: Record<string, unknown> | null = null;
  let finishReason: FinishReason = 'stop';
  let error: string | undefined;

  // Batch store updates per animation frame so fast models don't re-render per token.
  let frame: number | null = null;
  const flush = () => {
    frame = null;
    set((s) => ({
      messages: updateLast(s.messages, { content, reasoning: reasoning || null }),
    }));
  };
  const schedule = () => {
    if (frame === null) frame = requestAnimationFrame(flush);
  };

  try {
    const stream = streamChat(
      apiKey,
      {
        model: modelId,
        messages: history,
        reasoning: toReasoningParam(thinking, model),
        plugins,
      },
      controller.signal,
    );
    for await (const ev of stream) {
      switch (ev.type) {
        case 'content':
          content += ev.text;
          schedule();
          break;
        case 'reasoning':
          reasoning += ev.text;
          schedule();
          break;
        case 'usage':
          usage = ev.usage;
          break;
        case 'annotations': {
          // Attach parsed-PDF annotations to the PDFs on the last user turn so later turns skip re-parsing.
          const pdfs = (lastUser?.attachments ?? []).filter(
            (a) => a.kind === 'pdf' && !a.annotation,
          );
          for (const ann of ev.annotations) {
            if (ann.type !== 'file') continue;
            const target =
              pdfs.find((a) => a.name === ann.file?.name) ??
              (pdfs.length === 1 ? pdfs[0] : undefined);
            if (!target) continue;
            target.annotation = ann;
            void db.updateAttachmentAnnotation(target.id, ann);
          }
          break;
        }
        case 'done':
          finishReason = (ev.finishReason as FinishReason | null) ?? 'stop';
          break;
        case 'error':
          finishReason = 'error';
          error = ev.message;
          break;
      }
    }
  } catch (e) {
    if (controller.signal.aborted) {
      finishReason = 'aborted';
    } else {
      finishReason = 'error';
      error = e instanceof OpenRouterError ? e.message : e instanceof Error ? e.message : String(e);
    }
  }
  if (controller.signal.aborted) finishReason = 'aborted';
  if (frame !== null) cancelAnimationFrame(frame);

  const final: Message = {
    ...placeholder,
    content,
    reasoning: reasoning || null,
    usage,
    finishReason,
    streaming: false,
    error,
  };

  // Persist whatever arrived, even on error/abort, unless there is literally nothing.
  if (content || reasoning) await db.insertMessage(final);
  const persisted = Boolean(content || reasoning);

  set((s) => ({
    messages: persisted
      ? updateLast(s.messages, final)
      : updateLast(s.messages, { ...final, id: placeholder.id }),
    streaming: false,
    abort: null,
  }));

  const updatedAt = Date.now();
  await db.updateChat(chatId, { updatedAt });
  set((s) => ({
    chats: [...s.chats]
      .map((c) => (c.id === chatId ? { ...c, updatedAt } : c))
      .sort((a, b) => b.updatedAt - a.updatedAt),
  }));

  void useSettings.getState().noteRecent(modelId);

  if (finishReason !== 'error' && content) void maybeAutoTitle(chatId, content, apiKey, set, get);
}

/** `reply` is null when titling early from the first user message alone. */
async function maybeAutoTitle(
  chatId: string,
  reply: string | null,
  apiKey: string,
  set: Set,
  get: Get,
) {
  const { settings } = useSettings.getState();
  if (!settings.autoTitle) return;
  const chat = get().chats.find((c) => c.id === chatId);
  if (!chat || chat.titleSource !== 'fallback') return;
  const assistantCount = get().messages.filter(
    (m) => m.role === 'assistant' && !m.streaming,
  ).length;
  if (get().activeChatId === chatId && assistantCount > 1) return;

  const firstUser = get().messages.find((m) => m.role === 'user')?.content ?? '';
  const titleModel = useModels.getState().byId.get(settings.titleModelId);
  const title = await generateTitle(
    apiKey,
    settings.titleModelId,
    titleModel,
    firstUser,
    reply ?? '',
  );
  if (!title) return;

  const current = get().chats.find((c) => c.id === chatId);
  if (!current || current.titleSource !== 'fallback') return;
  await db.updateChat(chatId, { title, titleSource: 'auto' });
  set((s) => ({
    chats: s.chats.map((c) => (c.id === chatId ? { ...c, title, titleSource: 'auto' } : c)),
  }));
}
