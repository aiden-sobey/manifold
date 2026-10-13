import { create } from 'zustand';
import { load } from '@tauri-apps/plugin-store';
import { imageModelPrices, listImageModels } from '@/lib/openrouter/client';
import type { ImageModel, ImagePriceLine } from '@/lib/openrouter/types';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/** Price lookups are one request per model; keep a handful in flight at once. */
const PRICE_CONCURRENCY = 6;

interface ImageModelState {
  models: ImageModel[];
  byId: Map<string, ImageModel>;
  loading: boolean;
  error: string | null;
  fetchedAt: number | null;
  /** Prices by model id, fetched on demand for the session. Empty when a lookup failed. */
  prices: Map<string, ImagePriceLine[]>;
  init: () => Promise<void>;
  refresh: () => Promise<void>;
  loadPrices: (ids: string[]) => Promise<void>;
}

function index(models: ImageModel[]) {
  return new Map(models.map((m) => [m.id, m]));
}

const inFlight = new Set<string>();

export const useImageModels = create<ImageModelState>((set, get) => ({
  models: [],
  byId: new Map(),
  loading: false,
  error: null,
  fetchedAt: null,
  prices: new Map(),

  init: async () => {
    try {
      const cache = await load('image-models-cache.json', { autoSave: false, defaults: {} });
      const cached = await cache.get<{ fetchedAt: number; models: ImageModel[] }>('cache');
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
      const models = (await listImageModels()).sort((a, b) => a.name.localeCompare(b.name));
      const fetchedAt = Date.now();
      set({ models, byId: index(models), fetchedAt, loading: false });
      const cache = await load('image-models-cache.json', { autoSave: false, defaults: {} });
      await cache.set('cache', { fetchedAt, models });
      await cache.save();
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  },

  loadPrices: async (ids) => {
    const queue = ids.filter((id) => !get().prices.has(id) && !inFlight.has(id));
    queue.forEach((id) => inFlight.add(id));
    const worker = async () => {
      for (let id = queue.shift(); id; id = queue.shift()) {
        const lines = await imageModelPrices(id).catch(() => []);
        inFlight.delete(id);
        set((s) => ({ prices: new Map(s.prices).set(id, lines) }));
      }
    };
    await Promise.all(Array.from({ length: PRICE_CONCURRENCY }, worker));
  },
}));
