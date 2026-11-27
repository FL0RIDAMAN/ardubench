// Dark / light theme, like Betaflight Configurator's sun/moon toggle.
// The choice is remembered in this browser; dark is the default.
const KEY = 'ardubench-theme';

export function getTheme() {
  try { return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'; } catch { return 'dark'; }
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(KEY, theme); } catch { /* private window: just don't remember */ }
}
