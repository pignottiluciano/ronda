// Theme preference: 'system' follows prefers-color-scheme; the others force it via data-theme.
// The same key is read before paint by the inline script in index.astro.

const KEY = 'ronda.theme';
const THEMES = ['system', 'light', 'dark'] as const;
type Theme = (typeof THEMES)[number];

const isTheme = (value: unknown): value is Theme => THEMES.includes(value as Theme);

function readTheme(): Theme {
  try {
    const value = localStorage.getItem(KEY);
    return isTheme(value) ? value : 'system';
  } catch {
    return 'system';
  }
}

function applyTheme(theme: Theme) {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  toggle.dataset.current = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Cosmetic preference: if storage is blocked it just won't persist.
  }
}

const toggle = document.getElementById('theme-toggle') as HTMLButtonElement;
const menu = document.getElementById('theme-menu') as HTMLElement;

const current = readTheme();
toggle.dataset.current = current;
menu.querySelector<HTMLInputElement>(`input[value="${current}"]`)!.checked = true;

menu.addEventListener('change', (event) => {
  const { value } = event.target as HTMLInputElement;
  if (isTheme(value)) applyTheme(value);
});

// Popovers render in the top layer, so anchor the menu under its button by hand.
menu.addEventListener('beforetoggle', (event) => {
  if ((event as ToggleEvent).newState !== 'open') return;
  const rect = toggle.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 8}px`;
  menu.style.right = `${document.documentElement.clientWidth - rect.right}px`;
});
