import { useState } from "react";
import { applyTheme, readTheme, type Theme } from "../app/theme.ts";
import { useLanguage } from "../i18n.tsx";

/** Dark / light, beside the language switch. The page has already been set to the saved theme before React starts. */
export function ThemeToggle() {
  const { language } = useLanguage();
  const [theme, setTheme] = useState<Theme>(() => readTheme());
  const next: Theme = theme === "dark" ? "light" : "dark";
  const label = language === "es"
    ? (next === "light" ? "Cambiar a modo claro" : "Cambiar a modo oscuro")
    : (next === "light" ? "Switch to light mode" : "Switch to dark mode");
  return (
    <button
      className="btn btn-sm btn-ghost theme-toggle"
      aria-label={label}
      title={label}
      onClick={() => { applyTheme(next); setTheme(next); }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {theme === "dark"
          ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>
          : <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />}
      </svg>
    </button>
  );
}
