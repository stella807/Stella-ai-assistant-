import { useState } from "react";
import { useLanguage } from "../i18n.tsx";
import { ClientDisclosures } from "./ClientDisclosures.tsx";
import { LegalDocumentView } from "./LegalDocumentView.tsx";
import { disclosureCopy } from "../app/disclosure-copy.ts";
import { cookiesCopy, refundCopy } from "../app/legal-copy.ts";

/**
 * What a stranger looks for below the fold, before they have any account:
 * a way to invest, a way to reach a human, and the legal links every
 * consumer app is expected to show. Rendered only on the signed-out
 * landing page (`LandingIntro.tsx`) — signed-in screens keep the one-line
 * safety disclaimer in `App.tsx`, which is a different audience with a
 * different footer.
 *
 * Terms of Service and Privacy Policy are drafts, written from what the app
 * does (apps/web/src/app/legal-copy.ts) and marked as drafts under legal
 * review at the top of each. They become final only when counsel has read
 * them; the open questions are in docs/legal-drafts.md.
 */
export function Footer() {
  const { t, language } = useLanguage();
  const [open, setOpen] = useState<"terms" | "privacy" | "refunds" | "cookies" | "press" | "disclosures" | null>(null);

  return (
    <footer className="stack" style={{ marginTop: 24 }}>
      <section className="card stack" aria-label={t("invest.heading")}>
        <h2>{t("invest.heading")}</h2>
        <p className="small">{t("invest.body")}</p>
        <a className="btn btn-ghost btn-block" href="mailto:contact@safehubby.com?subject=Investing">{t("invest.cta")}</a>
      </section>

      {/* Plain links rather than a wall of buttons: the people who need these
          know to look for them, and nobody else should have to read past them. */}
      <nav className="footer-links" aria-label={t("footer.contact")}>
        <a href="mailto:contact@safehubby.com">{t("footer.contact")}</a>
        <button className="linklike" aria-expanded={open === "press"} onClick={() => setOpen((o) => (o === "press" ? null : "press"))}>{t("footer.press")}</button>
        <button className="linklike" aria-expanded={open === "terms"} onClick={() => setOpen((o) => (o === "terms" ? null : "terms"))}>{t("footer.terms")}</button>
        <button className="linklike" aria-expanded={open === "disclosures"} onClick={() => setOpen((o) => (o === "disclosures" ? null : "disclosures"))}>{disclosureCopy(language === "es" ? "es" : "en", "").link}</button>
        <button className="linklike" aria-expanded={open === "refunds"} onClick={() => setOpen((o) => (o === "refunds" ? null : "refunds"))}>{refundCopy(language === "es" ? "es" : "en").title}</button>
        <button className="linklike" aria-expanded={open === "privacy"} onClick={() => setOpen((o) => (o === "privacy" ? null : "privacy"))}>{t("footer.privacy")}</button>
        <button className="linklike" aria-expanded={open === "cookies"} onClick={() => setOpen((o) => (o === "cookies" ? null : "cookies"))}>{cookiesCopy(language === "es" ? "es" : "en").title}</button>
      </nav>
      {/* Real links, not router pushes: each portal is its own area with its own sign-in. */}
      <nav className="footer-links footer-portals" aria-label={language === "es" ? "Portales" : "Portals"}>
        <a href="/careers">{t("app.careers")}</a>
        <a href="/employee">{t("footer.employeePortal")}</a>
        <a href="/master">{t("footer.ownerPortal")}</a>
      </nav>

      {open === "press" && <PressRelease />}
      {open === "disclosures" && <ClientDisclosures />}

      {(open === "terms" || open === "privacy" || open === "refunds" || open === "cookies") && <LegalDocumentView which={open} />}

      <p className="tiny muted" style={{ textAlign: "center" }}>
        {t("footer.copyright").replace("{year}", String(new Date().getFullYear()))}
      </p>
    </footer>
  );
}

/**
 * The press tab's actual content — a real release, not a placeholder, since
 * unlike Terms/Privacy this needs no lawyer's sign-off to publish. Kept in
 * its own component so `Footer` stays a footer rather than a place prose
 * accumulates.
 */
function PressRelease() {
  const { t } = useLanguage();
  return (
    <article className="card stack" aria-label={t("footer.press")}>
      <p className="tiny muted" style={{ margin: 0, letterSpacing: "0.05em" }}>{t("press.tag")}</p>
      <h3 style={{ margin: 0 }}>{t("press.headline")}</h3>
      <p className="small">{t("press.body1")}</p>
      <p className="small">{t("press.body2")}</p>
      <p className="small">{t("press.quote")}</p>
      <p className="small">{t("press.body3")}</p>
      <p className="tiny muted" style={{ margin: 0 }}>{t("press.boilerplate")}</p>
      <p className="tiny" style={{ margin: 0 }}>
        <strong>{t("press.contactLabel")}</strong> <a href="mailto:contact@safehubby.com?subject=Press">contact@safehubby.com</a>
      </p>
      <p className="tiny muted" style={{ margin: 0 }}>{t("press.kit")}</p>
    </article>
  );
}
