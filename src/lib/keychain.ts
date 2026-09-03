import { invoke } from '@tauri-apps/api/core';

type Account = 'openrouter' | 'openrouter-management';

// Cache in-flight promises so overlapping startup reads share one keychain access (and one prompt).
const pending = new Map<Account, Promise<string | null>>();

function read(account: Account): Promise<string | null> {
  let p = pending.get(account);
  if (!p) {
    p = invoke<string | null>('get_api_key', { account })
      .then((k) => k ?? null)
      .catch((e: unknown) => {
        pending.delete(account);
        throw e;
      });
    pending.set(account, p);
  }
  return p;
}

async function write(account: Account, key: string): Promise<void> {
  await invoke('set_api_key', { key, account });
  pending.set(account, Promise.resolve(key.trim() ? key.trim() : null));
}

export const getApiKey = () => read('openrouter');
export const setApiKey = (key: string) => write('openrouter', key);
/** Optional OpenRouter management key, used only to read the account credit balance. */
export const getManagementKey = () => read('openrouter-management');
export const setManagementKey = (key: string) => write('openrouter-management', key);
