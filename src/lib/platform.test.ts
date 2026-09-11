import { describe, expect, it } from 'vitest';
import { isAndroid, isDesktop, isMacDesktop, isMobile } from './platform';

describe('platform', () => {
  it('defaults to macOS desktop when TAURI_ENV_PLATFORM is unset (vitest)', () => {
    expect(isAndroid).toBe(false);
    expect(isMobile).toBe(false);
    expect(isDesktop).toBe(true);
    expect(isMacDesktop).toBe(true);
  });
});
