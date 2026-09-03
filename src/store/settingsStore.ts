import { create } from 'zustand';
import { load, type Store } from '@tauri-apps/plugin-store';
import type { ThinkingLevel } from '@/types/domain';

export type SendKey = 'enter' | 'mod-enter';

export interface Settings {
  defaultModelId: string;
  defaultThinking: ThinkingLevel;
  titleModelId: string;
  autoTitle: boolean;
  sendKey: SendKey;
  favouriteModelIds: string[];
  recentModelIds: string[];
  /** Set once the default favourites have been applied, so clearing them sticks. */
  favouritesSeeded: boolean;
}

export const DEFAULT_FAVOURITES = [
  'moonshotai/kimi-k3',
  '~deepseek/deepseek-v4-flash-latest',
  'openai/gpt-5.6-luna',
  '~anthropic/claude-opus-latest',
];

const DEFAULTS: Settings = {
  defaultModelId: 'anthropic/claude-sonnet-4.5',
  defaultThinking: 'medium',
  titleModelId: 'openai/gpt-oss-120b',
  autoTitle: true,
  sendKey: 'enter',
  favouriteModelIds: DEFAULT_FAVOURITES,
  recentModelIds: [],
  favouritesSeeded: true,
};

interface SettingsState {
  settings: Settings;
  loaded: boolean;
  init: () => Promise<void>;
  update: (patch: Partial<Settings>) => Promise<void>;
  toggleFavourite: (modelId: string) => Promise<void>;
  noteRecent: (modelId: string) => Promise<void>;
}

let store: Store | null = null;

export const useSettings = create<SettingsState>((set, get) => ({
  settings: DEFAULTS,
  loaded: false,

  init: async () => {
    store = await load('settings.json', { autoSave: true, defaults: {} });
    const saved = (await store.get<Partial<Settings>>('settings')) ?? {};
    const merged: Settings = { ...DEFAULTS, ...saved };
    // Previous default title model; move users who never changed it to the new default.
    if (saved.titleModelId === 'google/gemini-2.5-flash-lite') {
      merged.titleModelId = DEFAULTS.titleModelId;
      await store.set('settings', merged);
    }
    if (!saved.favouritesSeeded) {
      merged.favouriteModelIds = [
        ...DEFAULT_FAVOURITES,
        ...merged.favouriteModelIds.filter((id) => !DEFAULT_FAVOURITES.includes(id)),
      ];
      merged.favouritesSeeded = true;
      await store.set('settings', merged);
    }
    set({ settings: merged, loaded: true });
  },

  update: async (patch) => {
    const next = { ...get().settings, ...patch };
    set({ settings: next });
    await store?.set('settings', next);
  },

  toggleFavourite: async (modelId) => {
    const favs = get().settings.favouriteModelIds;
    const next = favs.includes(modelId) ? favs.filter((m) => m !== modelId) : [...favs, modelId];
    await get().update({ favouriteModelIds: next });
  },

  noteRecent: async (modelId) => {
    const recent = [modelId, ...get().settings.recentModelIds.filter((m) => m !== modelId)].slice(
      0,
      8,
    );
    await get().update({ recentModelIds: recent });
  },
}));
