import { whatsappLink } from "@safehubby/core";
import { useLanguage } from "../i18n.tsx";
import { trustCopy } from "../app/trust-copy.ts";

/** Who comes, where, and what to do if something goes wrong: the first thing a family wants to know, above the plans. */
export function TrustSection() {
  const { language } = useLanguage();
  const lang = language === "es" ? "es" : "en";
  const copy = trustCopy(lang);
  return (
    <section className="card stack" aria-label={copy.heading}>
      <h2>{copy.heading}</h2>
      <div className="stack" style={{ gap: 10 }}>
        {copy.items.map((item) => (
          <div key={item.title} className="stack" style={{ gap: 2 }}>
            <strong className="small">{item.title}</strong>
            <p className="tiny muted" style={{ margin: 0 }}>{item.body}</p>
          </div>
        ))}
      </div>
      <a className="btn btn-block btn-ghost" href={whatsappLink(lang)} target="_blank" rel="noopener noreferrer">{copy.whatsapp}</a>
    </section>
  );
}
