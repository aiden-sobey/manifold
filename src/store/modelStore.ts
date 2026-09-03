import { create } from 'zustand';
import { load } from '@tauri-apps/plugin-store';
import { listModels } from '@/lib/openrouter/client';
import type { OpenRouterModel } from '@/lib/openrouter/types';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface ModelState {
  models: OpenRouterModel[];
  byId: Map<string, OpenRouterModel>;
  loading: boolean;
  error: string | null;
  fetchedAt: number | null;
  init: () => Promise<void>;
  refresh: () => Promise<void>;
}

function index(models: OpenRouterModel[]) {
  return new Map(models.map((m) => [m.id, m]));
}

export const useModels = create<ModelState>((set, get) => ({
  models: [],
  byId: new Map(),
  loading: false,
  error: null,
  fetchedAt: null,

  init: async () => {
    try {
      const cache = await load('models-cache.json', { autoSave: false, defaults: {} });
      const cached = await cache.get<{ fetchedAt: number; models: OpenRouterModel[] }>('cache');
      if (cached?.models?.length) {
        set({ models: cached.models, byId: index(cached.models), fetchedAt: cached.fetchedAt });
      }
      if (!cached || Date.now() - cached.fetchedAt > CACHE_TTL_MS) await get().refresh();
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const models = (await listModels()).sort((a, b) => a.name.localeCompare(b.name));
      const fetchedAt = Date.now();
      set({ models, byId: index(models), fetchedAt, loading: false });
      const cache = await load('models-cache.json', { autoSave: false, defaults: {} });
      await cache.set('cache', { fetchedAt, models });
      await cache.save();
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  },
}));
