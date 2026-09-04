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
import { historyForLane, lastReplyForLane } from '@/lib/turns';
import type { PendingAttachment } from './attachmentDraftStore';
import type {
  Attachment,
  Chat,
  ChatMode,
  FinishReason,
  Lane,
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

/** Second lane default: most recent model that differs from lane 0, else another favourite, else lane 0. */
export function pickSecondModel(first: string): string {
  const { recentModelIds, favouriteModelIds } = useSettings.getState().settings;
  return (
    recentModelIds.find((id) => id !== first) ??
    favouriteModelIds.find((id) => id !== first) ??
    first
  );
}

interface ChatState {
  chats: Chat[];
  activeChatId: string | null;
  messages: Message[];
  /** Lane 0's model/thinking for the composer. Mirrors the active chat, or the defaults for a new chat. */
  draftModelId: string;
  draftThinking: ThinkingLevel;
  draftMode: ChatMode;
  /** Both lanes when draftMode is 'compare'. Lane 0 mirrors draftModelId/draftThinking. */
  draftLanes: Lane[];
  /** In-flight replies keyed by lane (0 for single mode). */
  streams: Map<number, AbortController>;
  streaming: boolean;
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
  setLane: (lane: number, patch: Partial<Lane>) => Promise<void>;
  enterCompareMode: () => void;
  exitCompareMode: () => void;
  continueWithLane: (lane: number) => Promise<void>;
  send: (text: string, attachments?: PendingAttachment[]) => Promise<void>;
  stop: () => void;
  regenerate: (lane?: number) => Promise<void>;
  setSearch: (q: string) => Promise<void>;
}

function patchMessage(messages: Message[], id: string, patch: Partial<Message>): Message[] {
  return messages.map((m) => (m.id === id ? { ...m, ...patch } : m));
}

function lanesFromDraft(get: Get): Lane[] {
  const { draftMode, draftLanes, draftModelId, draftThinking } = get();
  if (draftMode === 'compare' && draftLanes.length >= 2) return draftLanes;
  return [{ modelId: draftModelId, thinking: draftThinking }];
}

export const useChat = create<ChatState>((set, get) => ({
  chats: [],
  activeChatId: null,
  messages: [],
  draftModelId: '',
  draftThinking: 'medium',
  draftMode: 'single',
  draftLanes: [],
  streams: new Map(),
  streaming: false,
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
      draftMode: 'single',
      draftLanes: [],
    });
  },

  openChat: async (id) => {
    if (get().streaming) get().stop();
    useUi.getState().showChat();
    const chat = get().chats.find((c) => c.id === id);
    const messages = await db.listMessages(id);
    const lanes = chat?.mode === 'compare' && chat.lanes ? chat.lanes : [];
    set({
      activeChatId: id,
      messages,
      draftModelId: lanes[0]?.modelId ?? chat?.modelId ?? get().draftModelId,
      draftThinking: lanes[0]?.thinking ?? chat?.thinking ?? 'default',
      draftMode: chat?.mode ?? 'single',
      draftLanes: lanes,
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
    if (get().draftMode === 'compare') return get().setLane(0, { modelId });
    set({ draftModelId: modelId });
    const id = get().activeChatId;
    if (id) {
      await db.updateChat(id, { modelId });
      set((s) => ({ chats: s.chats.map((c) => (c.id === id ? { ...c, modelId } : c)) }));
    }
  },

  setDraftThinking: async (level) => {
    if (get().draftMode === 'compare') return get().setLane(0, { thinking: level });
    set({ draftThinking: level });
    const id = get().activeChatId;
    if (id) {
      await db.updateChat(id, { thinking: level });
      set((s) => ({ chats: s.chats.map((c) => (c.id === id ? { ...c, thinking: level } : c)) }));
    }
  },

  setLane: async (lane, patch) => {
    const lanes = get().draftLanes.map((l, i) => (i === lane ? { ...l, ...patch } : l));
    const first = lanes[0];
    set({
      draftLanes: lanes,
      ...(first ? { draftModelId: first.modelId, draftThinking: first.thinking } : {}),
    });
    const id = get().activeChatId;
    if (id && first) {
      await db.updateChat(id, { lanes, modelId: first.modelId, thinking: first.thinking });
      set((s) => ({
        chats: s.chats.map((c) =>
          c.id === id ? { ...c, lanes, modelId: first.modelId, thinking: first.thinking } : c,
        ),
      }));
    }
  },

  enterCompareMode: () => {
    if (get().activeChatId !== null || get().messages.length > 0) return;
    const { draftModelId, draftThinking } = get();
    set({
      draftMode: 'compare',
      draftLanes: [
        { modelId: draftModelId, thinking: draftThinking },
        { modelId: pickSecondModel(draftModelId), thinking: draftThinking },
      ],
    });
  },

  exitCompareMode: () => {
    if (get().activeChatId !== null || get().messages.length > 0) return;
    set({ draftMode: 'single', draftLanes: [] });
  },

  continueWithLane: async (lane) => {
    const { activeChatId, draftLanes, streaming } = get();
    const keep = draftLanes[lane];
    if (!activeChatId || streaming || !keep) return;
    for (let i = 0; i < draftLanes.length; i++) {
      if (i !== lane) await db.deleteLaneMessages(activeChatId, i);
    }
    await db.clearLane(activeChatId);
    await db.updateChat(activeChatId, {
      mode: 'single',
      lanes: null,
      modelId: keep.modelId,
      thinking: keep.thinking,
    });
    const messages = await db.listMessages(activeChatId);
    set((s) => ({
      messages,
      draftMode: 'single',
      draftLanes: [],
      draftModelId: keep.modelId,
      draftThinking: keep.thinking,
      chats: s.chats.map((c) =>
        c.id === activeChatId
          ? { ...c, mode: 'single', lanes: null, modelId: keep.modelId, thinking: keep.thinking }
          : c,
      ),
    }));
  },

  send: async (text, attachments = []) => {
    const content = text.trim();
    if ((!content && attachments.length === 0) || get().streaming) return;
    const now = Date.now();
    let chatId = get().activeChatId;
    const lanes = lanesFromDraft(get);
    const mode: ChatMode = lanes.length > 1 ? 'compare' : 'single';
    const first = lanes[0]!;

    if (!chatId) {
      const chat: Chat = {
        id: uuid(),
        title: fallbackTitle(content || attachments.map((a) => a.name).join(', ')),
        titleSource: 'fallback',
        modelId: first.modelId,
        thinking: first.thinking,
        mode,
        lanes: mode === 'compare' ? lanes : null,
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
      lane: null,
      firstTokenMs: null,
      totalMs: null,
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

    if (mode === 'compare') {
      await Promise.all(
        lanes.map((lane, i) => streamReply(chatId, i, lane.modelId, lane.thinking, set, get)),
      );
    } else {
      await streamReply(chatId, null, first.modelId, first.thinking, set, get);
    }
  },

  stop: () => {
    for (const c of get().streams.values()) c.abort();
  },

  regenerate: async (lane) => {
    const { messages, activeChatId, streaming, draftMode } = get();
    if (streaming || !activeChatId) return;
    const lanes = lanesFromDraft(get);
    const laneKey = draftMode === 'compare' ? (lane ?? 0) : null;
    const target = lanes[laneKey ?? 0];
    if (!target) return;
    const last = lastReplyForLane(messages, laneKey);
    if (last) {
      if (!last.streaming) await db.deleteMessage(last.id);
      set({ messages: messages.filter((m) => m.id !== last.id) });
    }
    await streamReply(activeChatId, laneKey, target.modelId, target.thinking, set, get);
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

function trackStream(set: Set, get: Get, lane: number | null, controller: AbortController | null) {
  const streams = new Map(get().streams);
  const key = lane ?? 0;
  if (controller) streams.set(key, controller);
  else streams.delete(key);
  set({ streams, streaming: streams.size > 0 });
}

/**
 * Streams one reply for one lane (null lane = single-mode chat). Owns its own abort controller
 * and placeholder message, so several can run concurrently for a comparison.
 */
async function streamReply(
  chatId: string,
  lane: number | null,
  modelId: string,
  thinking: ThinkingLevel,
  set: Set,
  get: Get,
) {
  const apiKey = await getApiKey();
  const model = useModels.getState().byId.get(modelId);
  const controller = new AbortController();
  const startedAt = performance.now();

  const placeholder: Message = {
    id: uuid(),
    chatId,
    role: 'assistant',
    content: '',
    reasoning: null,
    modelId,
    finishReason: null,
    usage: null,
    lane,
    firstTokenMs: null,
    totalMs: null,
    createdAt: Date.now(),
    streaming: true,
  };
  set((s) => ({ messages: [...s.messages, placeholder] }));
  trackStream(set, get, lane, controller);

  const fail = (error: string) => {
    set((s) => ({
      messages: patchMessage(s.messages, placeholder.id, {
        streaming: false,
        finishReason: 'error',
        error,
        totalMs: Math.round(performance.now() - startedAt),
      }),
    }));
    trackStream(set, get, lane, null);
  };

  if (!apiKey) {
    fail('No API key set. Open Settings to add your OpenRouter key.');
    return;
  }

  // This lane's context: all user turns plus its own earlier replies.
  const sendable = historyForLane(get().messages, lane).filter(
    (m) => !m.streaming && (m.content || m.attachments?.length) && m.finishReason !== 'error',
  );
  let history: ChatMessageParam[];
  try {
    history = await buildHistory(sendable, readAttachmentBytes);
  } catch (e) {
    fail(`Could not read an attachment: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  const plugins = pluginsFor(sendable, model, useSettings.getState().settings.pdfOcr);
  const lastUser = [...sendable].reverse().find((m) => m.role === 'user');

  let content = '';
  let reasoning = '';
  let usage: Record<string, unknown> | null = null;
  let finishReason: FinishReason = 'stop';
  let error: string | undefined;
  let firstTokenMs: number | null = null;

  // Batch store updates per animation frame so fast models don't re-render per token.
  let frame: number | null = null;
  const flush = () => {
    frame = null;
    set((s) => ({
      messages: patchMessage(s.messages, placeholder.id, {
        content,
        reasoning: reasoning || null,
        firstTokenMs,
      }),
    }));
  };
  const schedule = () => {
    if (frame === null) frame = requestAnimationFrame(flush);
  };
  const markFirstToken = () => {
    if (firstTokenMs === null) firstTokenMs = Math.round(performance.now() - startedAt);
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
          markFirstToken();
          content += ev.text;
          schedule();
          break;
        case 'reasoning':
          markFirstToken();
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
    firstTokenMs,
    totalMs: Math.round(performance.now() - startedAt),
    streaming: false,
    error,
  };

  // Persist whatever arrived, even on error/abort, unless there is literally nothing.
  if (content || reasoning) await db.insertMessage(final);
  // Spend is recorded in the ledger regardless, so deleting the chat later never erases it.
  if (usage) {
    void db.insertUsage({
      id: final.id,
      source: 'chat',
      modelId,
      chatId,
      usage,
      createdAt: final.createdAt,
    });
  }

  set((s) => ({ messages: patchMessage(s.messages, placeholder.id, final) }));
  trackStream(set, get, lane, null);

  const updatedAt = Date.now();
  await db.updateChat(chatId, { updatedAt });
  set((s) => ({
    chats: [...s.chats]
      .map((c) => (c.id === chatId ? { ...c, updatedAt } : c))
      .sort((a, b) => b.updatedAt - a.updatedAt),
  }));

  void useSettings.getState().noteRecent(modelId);

  // Titles come from lane 0 (or the only lane).
  if (finishReason !== 'error' && content && (lane === null || lane === 0)) {
    void maybeAutoTitle(chatId, content, apiKey, set, get);
  }
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
  const userTurns = get().messages.filter((m) => m.role === 'user').length;
  if (get().activeChatId === chatId && userTurns > 1) return;

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
