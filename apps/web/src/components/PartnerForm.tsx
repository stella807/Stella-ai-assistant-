import { useState, type FormEvent } from "react";
import { api } from "../api.ts";
import { useLanguage } from "../i18n.tsx";
import { PopupCard } from "./PopupCard.tsx";

/**
 * The "Become a partner" request: company, contact name, email, and what the
 * company does. No account needed. On success the form gives way to a thank-you
 * that says where the answer will go.
 */
export function PartnerForm({ onClose }: { onClose: () => void }) {
  const { t, language } = useLanguage();
  const [form, setForm] = useState({ company: "", name: "", email: "", about: "", website: "" });
  const [state, setState] = useState<"editing" | "sending" | "sent">("editing");
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setState("sending");
    setError(null);
    try {
      await api.partnerInquiry({ ...form, language: language === "es" ? "es" : "en" });
      setState("sent");
    } catch (err) {
      // The server names the missing field in English; in Spanish, the general message reads better.
      setError(language === "es" || !(err instanceof Error) ? t("partner.error") : err.message);
      setState("editing");
    }
  };

  const header = <strong style={{ fontSize: 18 }}>{t("partner.title")}</strong>;

  if (state === "sent") {
    return (
      <PopupCard label={t("partner.title")} onClose={onClose} header={header}
        footer={<button className="btn btn-primary btn-block" onClick={onClose}>{t("partner.close")}</button>}>
        <p className="partner-thanks">{t("partner.thanks").replace("{email}", form.email.trim())}</p>
      </PopupCard>
    );
  }

  return (
    <PopupCard label={t("partner.title")} onClose={onClose} header={header}>
      <form className="stack partner-form" onSubmit={submit} noValidate={false}>
        <p className="small muted" style={{ margin: 0 }}>{t("partner.intro")}</p>
        <div className="field">
          <label htmlFor="pf-company">{t("partner.company")}</label>
          <input id="pf-company" required minLength={2} maxLength={120} autoComplete="organization" value={form.company} onChange={set("company")} />
        </div>
        <div className="field">
          <label htmlFor="pf-name">{t("partner.name")}</label>
          <input id="pf-name" required minLength={2} maxLength={80} autoComplete="name" value={form.name} onChange={set("name")} />
        </div>
        <div className="field">
          <label htmlFor="pf-email">{t("partner.email")}</label>
          <input id="pf-email" type="email" required maxLength={254} autoComplete="email" inputMode="email" value={form.email} onChange={set("email")} />
        </div>
        <div className="field">
          <label htmlFor="pf-about">{t("partner.about")}</label>
          <textarea id="pf-about" required minLength={10} maxLength={2000} rows={4} value={form.about} onChange={set("about")} />
          <span className="tiny muted">{t("partner.aboutHint")}</span>
        </div>
        {/* Hidden from people; a bot that fills it in is ignored by the server. */}
        <input className="partner-trap" tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.website} onChange={set("website")} />
        {error && <div className="banner banner-danger" role="alert">{error}</div>}
        <div className="row" style={{ gap: 10 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t("partner.cancel")}</button>
          <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={state === "sending"}>
            {state === "sending" ? t("partner.sending") : t("partner.send")}
          </button>
        </div>
      </form>
    </PopupCard>
  );
}
