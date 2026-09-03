import { create } from 'zustand';
import { load } from '@tauri-apps/plugin-store';
import { shortName } from '@/lib/modelName';
import { getApiKey } from '@/lib/keychain';
import { localDayKey } from '@/lib/analytics';
import { FALLBACK_GREETING, generateGreetings, type Greeting } from '@/lib/greeting';
import { useChat } from './chatStore';
import { useModels } from './modelStore';
import { useSettings } from './settingsStore';

interface Cache {
  date: string; // local YYYY-MM-DD the set was generated for
  items: Greeting[];
  index: number; // next item to show
}

interface GreetingState {
  current: Greeting;
  /** Load today's set (generating if stale) and advance to the next greeting. */
  next: () => Promise<void>;
}

let cache: Cache | null = null;
let inflight: Promise<void> | null = null;
let lastAttempt = 0;
const RETRY_COOLDOWN_MS = 60 * 60 * 1000;

async function store() {
  return load('greetings.json', { autoSave: true, defaults: {} });
}

async function refreshIfStale(): Promise<void> {
  const today = localDayKey(new Date());
  if (!cache) cache = (await (await store()).get<Cache>('cache')) ?? null;
  if (cache && cache.date === today && cache.items.length > 0) return;

  // A failed or empty generation waits an hour before trying again, so a broken reply
  // does not cost a call on every new chat.
  if (Date.now() - lastAttempt < RETRY_COOLDOWN_MS) return;
  const apiKey = await getApiKey();
  const { chats } = useChat.getState();
  if (!apiKey || chats.length === 0) return;
  lastAttempt = Date.now();

  const { settings } = useSettings.getState();
  const byId = useModels.getState().byId;
  const nameOf = (id: string) => (byId.get(id) ? shortName(byId.get(id)!.name) : id);
  const now = Date.now();
  const weekAgo = now - 7 * 86_400_000;
  const usedRecently = new Set(chats.filter((c) => c.updatedAt >= weekAgo).map((c) => c.modelId));

  const items = await generateGreetings(
    apiKey,
    settings.titleModelId,
    byId.get(settings.titleModelId),
    {
      recentChats: chats.slice(0, 10).map((c) => ({
        title: c.title,
        model: nameOf(c.modelId),
        daysAgo: Math.max(0, Math.floor((now - c.updatedAt) / 86_400_000)),
      })),
      chatsThisWeek: chats.filter((c) => c.createdAt >= weekAgo).length,
      favouriteModels: settings.favouriteModelIds.map(nameOf),
      unusedFavourites: settings.favouriteModelIds
        .filter((id) => !usedRecently.has(id))
        .map(nameOf),
    },
  );
  if (items.length === 0) return;
  cache = { date: today, items, index: 0 };
  await (await store()).set('cache', cache);
}

export const useGreeting = create<GreetingState>((set) => ({
  current: FALLBACK_GREETING,
  next: async () => {
    if (!inflight) inflight = refreshIfStale().finally(() => (inflight = null));
    await inflight;
    if (!cache || cache.items.length === 0) {
      set({ current: FALLBACK_GREETING });
      return;
    }
    const item = cache.items[cache.index % cache.items.length] ?? FALLBACK_GREETING;
    cache.index = (cache.index + 1) % cache.items.length;
    await (await store()).set('cache', cache);
    set({ current: item });
  },
}));
