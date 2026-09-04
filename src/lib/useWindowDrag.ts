import type { MouseEvent } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isDesktop } from '@/lib/platform';

const INTERACTIVE = 'button, a, input, textarea, select, [role="button"], [data-no-drag]';

/**
 * Returns a mousedown handler that starts a native window drag when the user
 * grabs empty space in a title-bar-like region. Double-click toggles maximise.
 * No-op on mobile, where there is no native window to drag.
 */
export function useWindowDrag() {
  return (e: MouseEvent<HTMLElement>) => {
    if (!isDesktop || e.button !== 0) return;
    if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
    e.preventDefault();
    const win = getCurrentWindow();
    if (e.detail === 2) void win.toggleMaximize();
    else void win.startDragging();
  };
}
