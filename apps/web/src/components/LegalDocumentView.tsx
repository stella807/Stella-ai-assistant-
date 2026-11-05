import { serviceFeeFor } from "@safehubby/core";
import { privacyCopy, refundCopy, termsCopy, type LegalDocument } from "../app/legal-copy.ts";
import { useLanguage } from "../i18n.tsx";
import { money } from "../money.ts";

/** One legal document, read in full, with the draft notice at the top while counsel has not signed it off. */
export function LegalDocumentView({ which }: { which: "terms" | "privacy" | "refunds" }) {
  const { language } = useLanguage();
  const lang = language === "es" ? "es" : "en";
  // The extra-hour price is read from the function the booking is charged with, never typed.
  const doc: LegalDocument = which === "terms"
    ? termsCopy(lang, money(serviceFeeFor("wait-with-someone", false, 1, 1)))
    : which === "refunds" ? refundCopy(lang) : privacyCopy(lang);
  return (
    <article className="card stack" aria-label={doc.title}>
      <h3 style={{ margin: 0 }}>{doc.title}</h3>
      <div className="banner" role="note">{doc.draftNotice}</div>
      <p className="tiny muted" style={{ margin: 0 }}>{doc.updated}</p>
      <p className="small" style={{ margin: 0 }}>{doc.intro}</p>
      {doc.sections.map((s) => (
        <section key={s.heading} className="stack" style={{ gap: 4 }}>
          <strong className="small">{s.heading}</strong>
          {s.paragraphs.map((p) => <p key={p} className="small" style={{ margin: 0 }}>{p}</p>)}
        </section>
      ))}
      <p className="tiny muted" style={{ margin: 0 }}>{doc.contact}</p>
    </article>
  );
}
