import { useSyncExternalStore } from 'react';

/** Tailwind `md` breakpoint; below it the app uses its phone layout. */
export const MD_UP = '(min-width: 768px)';

export function matches(query: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(query).matches
    : true;
}

/** Reactive `window.matchMedia`. Returns true when matchMedia is unavailable (SSR, tests). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== 'function') return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => matches(query),
    () => true,
  );
}
