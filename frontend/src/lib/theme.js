import { useCallback, useSyncExternalStore } from 'react';

// Colour theme: follow the system, or force light/dark. The choice lives in localStorage;
// index.html applies it before the first paint so the page never flashes in the wrong theme.
export const THEMES = ['system', 'light', 'dark'];
export const THEME_LABEL = { system: 'System', light: 'Hell', dark: 'Dunkel' };
const KEY = 'theme';
// Browser bar colours, matching --color-canvas of each theme (tokens.css).
const BAR_COLOR = { light: '#f5f5f7', dark: '#0b0b0f' };
const listeners = new Set();

function read() {
  try {
    const value = localStorage.getItem(KEY);
    return THEMES.includes(value) ? value : 'system';
  } catch {
    return 'system';
  }
}

let current = typeof window === 'undefined' ? 'system' : read();

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    const own = meta.media?.includes('dark') ? 'dark' : 'light';
    meta.content = BAR_COLOR[theme === 'system' ? own : theme];
  }
}

export function setTheme(theme) {
  try {
    if (theme === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // Private mode: the choice simply lasts for this page view.
  }
  applyTheme(theme);
  current = theme;
  listeners.forEach((l) => l());
}

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, () => current, () => 'system');
  const cycle = useCallback(() => setTheme(THEMES[(THEMES.indexOf(current) + 1) % THEMES.length]), []);
  return { theme, setTheme, cycle };
}
