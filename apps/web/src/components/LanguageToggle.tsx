import { useLanguage } from "../i18n.tsx";

/** EN | ES, for the customer app's header and the assistants' portal alike. */
export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();
  return (
    <div className="row" style={{ gap: 2 }} aria-label={language === "es" ? "Idioma" : "Language"}>
      <button
        className="btn btn-sm btn-ghost"
        aria-pressed={language === "en"}
        style={language === "en" ? { fontWeight: 700 } : undefined}
        onClick={() => setLanguage("en")}
      >
        EN
      </button>
      <button
        className="btn btn-sm btn-ghost"
        aria-pressed={language === "es"}
        style={language === "es" ? { fontWeight: 700 } : undefined}
        onClick={() => setLanguage("es")}
      >
        ES
      </button>
    </div>
  );
}
