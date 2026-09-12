import { useState } from "react";
import { api } from "../api.ts";
import { useLanguage } from "../i18n.tsx";

/**
 * "Tell me when it's running."
 *
 * The honest offer during the pre-launch window. Somebody who finds Safehubby
 * before go-live cannot use it, and a sign-up button is the wrong thing to
 * put in front of them on its own — this is the thing that is actually useful
 * to them.
 *
 * The success message comes from the API rather than being written here,
 * because only the server knows whether a mail provider is configured, and
 * the one sentence this component must never say on its own is "check your
 * inbox". See adapters/email.ts.
 */
export function NewsletterSignup({ source = "landing" }: { source?: string }) {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ note: string; alreadyOnList: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.joinNewsletter({ email, source });
      setDone({ note: res.note, alreadyOnList: res.alreadyOnList });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("news.failed"));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <section className="card stack">
        <h2>{done.alreadyOnList ? t("news.already") : t("news.thanks")}</h2>
        <p className="small muted" style={{ margin: 0 }}>{done.note}</p>
      </section>
    );
  }

  return (
    <section className="card stack">
      <h2>{t("news.heading")}</h2>
      <p className="small muted" style={{ margin: 0 }}>{t("news.body")}</p>

      <div className="field">
        <label htmlFor="news-email">{t("auth.email")}</label>
        <input id="news-email" type="email" autoComplete="email" value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && email.trim()) submit(); }} />
      </div>

      <button className="btn btn-primary btn-block" disabled={busy || !email.trim()} onClick={submit}>
        {t("news.cta")}
      </button>

      {error && <div className="banner banner-danger">{error}</div>}
      <p className="tiny muted" style={{ margin: 0 }}>{t("news.privacy")}</p>
    </section>
  );
}
