import { create } from 'zustand';
import { load, type Store } from '@tauri-apps/plugin-store';
import type { ImageOptions, ThinkingLevel } from '@/types/domain';

export type SendKey = 'enter' | 'mod-enter';

export interface Settings {
  defaultModelId: string;
  transcriptionModelId: string;
  defaultThinking: ThinkingLevel;
  titleModelId: string;
  autoTitle: boolean;
  /** Use Mistral OCR ($2 / 1000 pages) for PDFs instead of free text extraction / native reading. */
  pdfOcr: boolean;
  /** Offer replies OpenRouter's web search and web fetch tools, on models that support tools. */
  webAccess: boolean;
  sendKey: SendKey;
  favouriteModelIds: string[];
  recentModelIds: string[];
  /** Set once the default favourites have been applied, so clearing them sticks. */
  favouritesSeeded: boolean;
  favouriteImageModelIds: string[];
  recentImageModelIds: string[];
  imageOptions: ImageOptions;
}

/** Image model for image turns when none has been used yet. */
export const DEFAULT_IMAGE_MODEL_ID = 'black-forest-labs/flux.2-pro';

export const DEFAULT_FAVOURITES = [
  'moonshotai/kimi-k3',
  '~deepseek/deepseek-v4-flash-latest',
  'openai/gpt-5.6-luna',
  '~anthropic/claude-opus-latest',
];

const DEFAULTS: Settings = {
  defaultModelId: 'anthropic/claude-sonnet-4.5',
  transcriptionModelId: 'openai/whisper-large-v3-turbo',
  defaultThinking: 'medium',
  titleModelId: 'openai/gpt-oss-120b',
  autoTitle: true,
  pdfOcr: false,
  webAccess: true,
  sendKey: 'enter',
  favouriteModelIds: DEFAULT_FAVOURITES,
  recentModelIds: [],
  favouritesSeeded: true,
  favouriteImageModelIds: [
    DEFAULT_IMAGE_MODEL_ID,
    'google/gemini-nano-banana-2.1',
    'openai/gpt-image-2',
    'bytedance-seed/seedream-5-0-lite',
  ],
  recentImageModelIds: [],
  imageOptions: { aspectRatio: null, resolution: null, quality: null, count: 1 },
};

interface SettingsState {
  settings: Settings;
  loaded: boolean;
  init: () => Promise<void>;
  update: (patch: Partial<Settings>) => Promise<void>;
  toggleFavourite: (modelId: string) => Promise<void>;
  noteRecent: (modelId: string) => Promise<void>;
  toggleFavouriteImage: (modelId: string) => Promise<void>;
  noteRecentImage: (modelId: string) => Promise<void>;
}

const toggled = (list: string[], id: string) =>
  list.includes(id) ? list.filter((m) => m !== id) : [...list, id];
const withRecent = (list: string[], id: string) =>
  [id, ...list.filter((m) => m !== id)].slice(0, 8);

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
    await get().update({ favouriteModelIds: toggled(get().settings.favouriteModelIds, modelId) });
  },

  noteRecent: async (modelId) => {
    await get().update({ recentModelIds: withRecent(get().settings.recentModelIds, modelId) });
  },

  toggleFavouriteImage: async (modelId) => {
    await get().update({
      favouriteImageModelIds: toggled(get().settings.favouriteImageModelIds, modelId),
    });
  },

  noteRecentImage: async (modelId) => {
    await get().update({
      recentImageModelIds: withRecent(get().settings.recentImageModelIds, modelId),
    });
  },
}));
