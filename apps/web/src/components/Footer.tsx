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
  const [open, setOpen] = useState<"terms" | "privacy" | "press" | null>(null);

  return (
    <footer className="stack" style={{ marginTop: 24 }}>
      <section className="card stack" aria-label={t("invest.heading")}>
        <h2>{t("invest.heading")}</h2>
        <p className="small">{t("invest.body")}</p>
        <a className="btn btn-ghost btn-block" href="mailto:invest@safehubby.app">{t("invest.cta")}</a>
      </section>

      <nav className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "center" }} aria-label={t("footer.contact")}>
        <a className="btn btn-sm btn-ghost" href="mailto:hello@safehubby.app">{t("footer.contact")}</a>
        <button
          className="btn btn-sm btn-ghost" aria-expanded={open === "press"}
          onClick={() => setOpen((o) => (o === "press" ? null : "press"))}
        >
          {t("footer.press")}
        </button>
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

      {open === "press" && <PressRelease />}

      {(open === "terms" || open === "privacy") && (
        <p className="tiny muted" style={{ textAlign: "center" }}>
          {t(open === "terms" ? "footer.termsPending" : "footer.privacyPending")}
        </p>
      )}

      <PaymentBadges />

      <p className="tiny muted" style={{ textAlign: "center" }}>
        {t("footer.copyright").replace("{year}", String(new Date().getFullYear()))}
      </p>
    </footer>
  );
}

/**
 * The trust-badge row most sites put at the bottom — real methods the
 * payment screen offers (see `TABS` in PaymentMethodCard.tsx), not logos
 * borrowed for the look of legitimacy. Plain text rather than brand marks:
 * the actual Visa/Mastercard/Apple/PayPal logos are trademarked assets this
 * app has no license to reproduce, and a lookalike icon reads worse than an
 * honest label once anyone looks closely.
 *
 * The card networks come first because they are the path that is fully
 * wired; the rest are offered on the payment screen, which states per
 * method what is still needed before it can be completed. A badge here is a
 * claim about what Safehubby takes, so it must not run ahead of that screen
 * — if an option is ever dropped there, drop it here too.
 */
function PaymentBadges() {
  const { t } = useLanguage();
  const methods = [
    "Visa", "Mastercard", "Amex", "Discover",
    "Apple Pay", "Google Pay", "Link",
    "Klarna", "Amazon Pay", "Cash App Pay",
    "PayPal", "Venmo", "ATH Móvil",
  ];
  return (
    <div className="stack" style={{ gap: 6, alignItems: "center" }}>
      <p className="tiny muted" style={{ margin: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {t("footer.paymentsAccepted")}
      </p>
      <div className="row" style={{ gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
        {methods.map((m) => <span key={m} className="pill payment-badge">{m}</span>)}
      </div>
      <p className="tiny muted" style={{ margin: 0 }}>{t("footer.paymentsSecured")}</p>
    </div>
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
        <strong>{t("press.contactLabel")}</strong> <a href="mailto:press@safehubby.app">press@safehubby.app</a>
      </p>
      <p className="tiny muted" style={{ margin: 0 }}>{t("press.kit")}</p>
    </article>
  );
}
