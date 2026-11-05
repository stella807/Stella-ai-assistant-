import { serviceFeeFor } from "@safehubby/core";
import { disclosureCopy } from "../app/disclosure-copy.ts";
import { useLanguage } from "../i18n.tsx";
import { money } from "../money.ts";

/** The client disclosure policy, read in full. Shared by the signed-out footer and the signed-in one. */
export function ClientDisclosures() {
  const { language } = useLanguage();
  // The extra-hour price is read from the same function the booking is charged with, never typed.
  const copy = disclosureCopy(language === "es" ? "es" : "en", money(serviceFeeFor("wait-with-someone", false, 1, 1)));
  return (
    <article className="card stack" aria-label={copy.title}>
      <h3 style={{ margin: 0 }}>{copy.title}</h3>
      <p className="small muted" style={{ margin: 0 }}>{copy.intro}</p>
      {copy.sections.map((s) => (
        <section key={s.heading} className="stack" style={{ gap: 4 }}>
          <strong className="small">{s.heading}</strong>
          <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
            {s.points.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </section>
      ))}
      <p className="tiny muted" style={{ margin: 0 }}>{copy.contact}</p>
    </article>
  );
}
