export type AndroidBackAction =
  'close-settings' | 'consume-required-settings' | 'close-sidebar' | 'close-analytics' | 'exit';

interface AndroidBackState {
  settingsOpen: boolean;
  settingsRequired: boolean;
  sidebarOpen: boolean;
  narrowViewport: boolean;
  analyticsOpen: boolean;
}

export function getAndroidBackAction(state: AndroidBackState): AndroidBackAction {
  if (state.settingsOpen) {
    return state.settingsRequired ? 'consume-required-settings' : 'close-settings';
  }
  if (state.sidebarOpen && state.narrowViewport) return 'close-sidebar';
  if (state.analyticsOpen) return 'close-analytics';
  return 'exit';
}
