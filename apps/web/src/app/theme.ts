export type Theme = "dark" | "light";

export const THEME_KEY = "safehubby-theme";
/** The colour of the phone's browser bar for each theme. */
export const THEME_BAR: Record<Theme, string> = { dark: "#0b1020", light: "#f6f1e7" };

/**
 * Dark unless someone has chosen light. The app is dark on purpose (it is used
 * late at night), so the device's own setting is deliberately not followed:
 * light is something a person turns on, not something they are handed.
 */
export function parseTheme(stored: string | null | undefined): Theme {
  return stored === "light" ? "light" : "dark";
}

export function readTheme(): Theme {
  try { return parseTheme(window.localStorage.getItem(THEME_KEY)); } catch { return "dark"; }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.background = theme === "light" ? "#f6f1e7" : "#0a0e1a";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_BAR[theme]);
  try { window.localStorage.setItem(THEME_KEY, theme); } catch { /* private mode: the choice lasts until the page closes */ }
}
