import { useState } from "react";
import { consentCopy } from "../app/consent-copy.ts";
import { useLanguage } from "../i18n.tsx";
import { ClientDisclosures } from "./ClientDisclosures.tsx";
import { LegalDocumentView } from "./LegalDocumentView.tsx";

/** The agree checkbox, with the three documents it names openable right under it. */
export function ConsentBox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  const { language } = useLanguage();
  const c = consentCopy(language === "es" ? "es" : "en");
  const [open, setOpen] = useState<"terms" | "privacy" | "disclosures" | null>(null);
  const toggle = (k: "terms" | "privacy" | "disclosures") => setOpen((o) => (o === k ? null : k));
  return (
    <div className="stack" style={{ gap: 6 }}>
      <label className="row small" style={{ gap: 8, alignItems: "flex-start" }}>
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: 3 }} />
        <span>{c.label}</span>
      </label>
      <nav className="footer-links" aria-label={c.terms}>
        <button type="button" className="linklike" aria-expanded={open === "terms"} onClick={() => toggle("terms")}>{c.terms}</button>
        <button type="button" className="linklike" aria-expanded={open === "privacy"} onClick={() => toggle("privacy")}>{c.privacy}</button>
        <button type="button" className="linklike" aria-expanded={open === "disclosures"} onClick={() => toggle("disclosures")}>{c.disclosures}</button>
      </nav>
      {(open === "terms" || open === "privacy") && <LegalDocumentView which={open} />}
      {open === "disclosures" && <ClientDisclosures />}
    </div>
  );
}
