import { describe, expect, it } from 'vitest';
import { isDesktop, isMacDesktop, isMobile } from './platform';

describe('platform', () => {
  it('defaults to macOS desktop when TAURI_ENV_PLATFORM is unset (vitest)', () => {
    expect(isMobile).toBe(false);
    expect(isDesktop).toBe(true);
    expect(isMacDesktop).toBe(true);
  });
});
