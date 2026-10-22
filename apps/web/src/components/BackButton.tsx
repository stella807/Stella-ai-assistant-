import { useLanguage } from "../i18n.tsx";

/** A visible way back to the previous screen, for anyone who does not think
 *  of the browser's own Back button (which works too — see App.tsx). */
export function BackButton({ onBack }: { onBack: () => void }) {
  const { t } = useLanguage();
  return (
    <button className="btn btn-sm btn-ghost back-button" onClick={onBack} aria-label={t("nav.back")}>
      ← {t("nav.back")}
    </button>
  );
}
