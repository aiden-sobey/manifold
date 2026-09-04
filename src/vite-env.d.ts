/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set by the Tauri CLI: 'darwin' | 'windows' | 'linux' | 'android' | 'ios'. */
  readonly TAURI_ENV_PLATFORM?: string;
}
