import { useLanguage } from "../i18n.tsx";

/** Thin gold line icons, one per door — the same stroke weight as the nav. */
const base = { width: 30, height: 30, viewBox: "0 0 32 32", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const Icons = {
  assistant: <svg {...base} aria-hidden="true"><path d="M5 23h22M8 22c0-7 3-10 8-10s8 3 8 10M16 9v3M13 9h6" /></svg>,
  errand: <svg {...base} aria-hidden="true"><path d="M7 11h18l-1.5 15h-15zM12 11a4 4 0 0 1 8 0" /><path d="M13 19l2.5 2.5L20 17" /></svg>,
  ride: <svg {...base} aria-hidden="true"><path d="M5 20l2-6c.4-1 1.2-1.6 2.3-1.6h13.4c1.1 0 1.9.6 2.3 1.6l2 6v5h-3v-2H8v2H5z" /><circle cx="9.5" cy="19" r="1" /><circle cx="22.5" cy="19" r="1" /></svg>,
  desk: <svg {...base} aria-hidden="true"><rect x="5" y="7" width="22" height="19" rx="3" /><path d="M5 13h22M11 4v5M21 4v5M12 20l3 3 6-6" /></svg>,
  club: <svg {...base} aria-hidden="true"><path d="M10 6l1.6 20h8.8L22 6z" /><path d="M10.6 14h10.8" /><path d="M3 22l9-4" strokeWidth="2" /></svg>,
  safety: <svg {...base} aria-hidden="true"><path d="M16 4l9 3.5v7c0 6-4 10.5-9 13-5-2.5-9-7-9-13v-7z" /><path d="M12 15.5l3 3 5-6" /></svg>,
};

/**
 * The first thing a stranger sees: a photograph, a quiet headline, and the
 * six things this app does. It sells nothing it does not do — each icon is a
 * door that exists inside.
 */
export function LuxuryHero({ onStart, onPrices }: { onStart: () => void; onPrices: () => void }) {
  const { t } = useLanguage();
  const doors = [
    { icon: Icons.assistant, label: t("lux.d1"), text: t("lux.d1t") },
    { icon: Icons.errand, label: t("lux.d2"), text: t("lux.d2t") },
    { icon: Icons.ride, label: t("lux.d3"), text: t("lux.d3t") },
    { icon: Icons.desk, label: t("lux.d4"), text: t("lux.d4t") },
    { icon: Icons.club, label: t("lux.d5"), text: t("lux.d5t") },
    { icon: Icons.safety, label: t("lux.d6"), text: t("lux.d6t") },
  ];
  return (
    <section className="lux" aria-label="Safehubby">
      <div className="lux-hero">
        <img className="lux-photo" src="/img/hero-luxury.jpg" alt="" width={976} height={560} />
        <div className="lux-shade" />
        <div className="lux-copy">
          <span className="lux-eyebrow">{t("lux.eyebrow")}</span>
          <h1 className="lux-title">{t("lux.title1")}<br />{t("lux.title2")}</h1>
          <p className="lux-sub">{t("lux.sub")}</p>
          <div className="lux-cta">
            <button className="lux-btn" onClick={onStart}>{t("lux.cta")} <span aria-hidden="true">→</span></button>
            <button className="lux-link" onClick={onPrices}>{t("lux.prices")}</button>
          </div>
        </div>
      </div>

      <ul className="lux-doors">
        {doors.map((d, i) => (
          <li key={d.label} style={{ ["--i" as string]: i }}>
            <span className="lux-icon">{d.icon}</span>
            <strong>{d.label}</strong>
            <span>{d.text}</span>
          </li>
        ))}
      </ul>
      <p className="lux-tagline">{t("lux.tagline")}</p>
    </section>
  );
}
