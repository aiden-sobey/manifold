/**
 * Build-time platform constant. The Tauri CLI exports `TAURI_ENV_PLATFORM` to the frontend
 * build (see `envPrefix` in vite.config.ts); it is undefined under plain Vite and vitest,
 * where we assume desktop.
 *
 * Use this for *capability* decisions (keychain, window drag, native dialogs). Layout
 * decisions should use the viewport via `useMediaQuery` so a narrow desktop window still works.
 */
const platform = import.meta.env.TAURI_ENV_PLATFORM ?? 'darwin';

export const isMobile = platform === 'android' || platform === 'ios';
export const isDesktop = !isMobile;
/** macOS desktop draws traffic lights over our title strip and needs a spacer for them. */
export const isMacDesktop = platform === 'darwin';
