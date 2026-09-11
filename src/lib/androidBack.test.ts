import { describe, expect, it } from 'vitest';
import { getAndroidBackAction } from './androidBack';

const root = {
  settingsOpen: false,
  settingsRequired: false,
  sidebarOpen: false,
  narrowViewport: true,
  analyticsOpen: false,
};

describe('getAndroidBackAction', () => {
  it('closes stacked UI in priority order', () => {
    expect(
      getAndroidBackAction({ ...root, settingsOpen: true, sidebarOpen: true, analyticsOpen: true }),
    ).toBe('close-settings');
    expect(getAndroidBackAction({ ...root, sidebarOpen: true, analyticsOpen: true })).toBe(
      'close-sidebar',
    );
    expect(getAndroidBackAction({ ...root, analyticsOpen: true })).toBe('close-analytics');
  });

  it('consumes Back without closing required settings', () => {
    expect(getAndroidBackAction({ ...root, settingsOpen: true, settingsRequired: true })).toBe(
      'consume-required-settings',
    );
  });

  it('does not close an in-flow wide sidebar', () => {
    expect(
      getAndroidBackAction({
        ...root,
        sidebarOpen: true,
        narrowViewport: false,
        analyticsOpen: true,
      }),
    ).toBe('close-analytics');
  });

  it('exits at the root', () => {
    expect(getAndroidBackAction(root)).toBe('exit');
  });
});
