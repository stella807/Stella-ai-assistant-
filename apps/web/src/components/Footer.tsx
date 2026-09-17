import { useState } from "react";
import { useLanguage } from "../i18n.tsx";

/**
 * What a stranger looks for below the fold, before they have any account:
 * a way to invest, a way to reach a human, and the legal links every
 * consumer app is expected to show. Rendered only on the signed-out
 * landing page (`LandingIntro.tsx`) — signed-in screens keep the one-line
 * safety disclaimer in `App.tsx`, which is a different audience with a
 * different footer.
 *
 * Terms of Service and Privacy Policy have no real text yet — drafting
 * both is the lawyer role's actual job (see docs/job-listings.md, section
 * 6), not something to invent here. The links stay, honestly: clicking
 * either says plainly that it is still being finalized, with a real address
 * to write to, rather than linking to a page that does not exist or, worse,
 * a fabricated policy nobody actually reviewed.
 */
export function Footer() {
  const { t } = useLanguage();
  const [open, setOpen] = useState<"terms" | "privacy" | null>(null);

  return (
    <footer className="stack" style={{ marginTop: 24 }}>
      <section className="card stack" aria-label={t("invest.heading")}>
        <h2>{t("invest.heading")}</h2>
        <p className="small">{t("invest.body")}</p>
        <a className="btn btn-ghost btn-block" href="mailto:invest@safehubby.app">{t("invest.cta")}</a>
      </section>

      <nav className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "center" }} aria-label={t("footer.contact")}>
        <a className="btn btn-sm btn-ghost" href="mailto:hello@safehubby.app">{t("footer.contact")}</a>
        <a className="btn btn-sm btn-ghost" href="mailto:press@safehubby.app">{t("footer.press")}</a>
        <button
          className="btn btn-sm btn-ghost" aria-expanded={open === "terms"}
          onClick={() => setOpen((o) => (o === "terms" ? null : "terms"))}
        >
          {t("footer.terms")}
        </button>
        <button
          className="btn btn-sm btn-ghost" aria-expanded={open === "privacy"}
          onClick={() => setOpen((o) => (o === "privacy" ? null : "privacy"))}
        >
          {t("footer.privacy")}
        </button>
      </nav>

      {open && (
        <p className="tiny muted" style={{ textAlign: "center" }}>
          {t(open === "terms" ? "footer.termsPending" : "footer.privacyPending")}
        </p>
      )}

      <p className="tiny muted" style={{ textAlign: "center" }}>
        {t("footer.copyright").replace("{year}", String(new Date().getFullYear()))}
      </p>
    </footer>
  );
}
