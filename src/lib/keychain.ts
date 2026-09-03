import { invoke } from '@tauri-apps/api/core';

// Cache the in-flight promise, not just the resolved value, so overlapping
// reads during startup share a single keychain access (and a single prompt).
let pending: Promise<string | null> | null = null;

export function getApiKey(): Promise<string | null> {
  if (!pending) {
    pending = invoke<string | null>('get_api_key')
      .then((k) => k ?? null)
      .catch((e: unknown) => {
        pending = null;
        throw e;
      });
  }
  return pending;
}

export async function setApiKey(key: string): Promise<void> {
  await invoke('set_api_key', { key });
  pending = Promise.resolve(key.trim() ? key.trim() : null);
}
