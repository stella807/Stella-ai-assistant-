import { useLanguage } from "../i18n.tsx";
import { familyCopy } from "../app/family-copy.ts";

/** Right under the hero: what Safehubby does for a parent in Puerto Rico, before the jets and the yachts. */
export function FamilySection({ onStart, onPrices }: { onStart: () => void; onPrices: () => void }) {
  const { language } = useLanguage();
  const copy = familyCopy(language === "es" ? "es" : "en");
  return (
    <section className="show-section family" aria-labelledby="family-title">
      <p className="show-kicker">{copy.kicker}</p>
      <h2 id="family-title" className="show-title">{copy.heading}</h2>
      <p className="family-lead">{copy.lead}</p>
      <ul className="family-list">
        {copy.items.map((item) => (
          <li key={item.title}>
            <strong>{item.title}</strong>
            <span>{item.body}</span>
          </li>
        ))}
      </ul>
      <div className="family-cta">
        <button className="btn btn-primary btn-block" onClick={onStart}>{copy.cta} <span aria-hidden="true">→</span></button>
        <button className="btn btn-block btn-ghost" onClick={onPrices}>{copy.prices}</button>
      </div>
    </section>
  );
}
