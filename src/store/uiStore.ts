import { create } from 'zustand';

export type View = 'chat' | 'analytics';

interface UiState {
  view: View;
  showAnalytics: () => void;
  showChat: () => void;
  toggleAnalytics: () => void;
}

export const useUi = create<UiState>((set, get) => ({
  view: 'chat',
  showAnalytics: () => set({ view: 'analytics' }),
  showChat: () => set({ view: 'chat' }),
  toggleAnalytics: () => set({ view: get().view === 'analytics' ? 'chat' : 'analytics' }),
}));
