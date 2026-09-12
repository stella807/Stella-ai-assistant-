import { useEffect, useState } from "react";
import { api, type ShareInvite } from "../api.ts";
import { launchNote } from "../launch.ts";
import { useLanguage } from "../i18n.tsx";

/**
 * The share sheet: one code, one link, and the count of people who have used
 * it.
 *
 * `navigator.share` is the whole point on a phone — it hands the invite to
 * whichever app the person actually talks to their friends in, which is not
 * something we can guess. But it does not exist on most desktop browsers and
 * it rejects when the user dismisses the sheet, so copy-to-clipboard is a
 * peer path rather than an error state: both buttons are always offered, and
 * a dismissed share sheet is silent rather than an error the user has to
 * dismiss again.
 */
export function ShareCard() {
  const { t, language } = useLanguage();
  const [invite, setInvite] = useState<ShareInvite | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.share().then(setInvite).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const share = async () => {
    if (!invite) return;
    try {
      await navigator.share({ title: "Safehubby", text: invite.message, url: invite.url });
    } catch {
      // AbortError when the sheet is dismissed, NotAllowedError when the
      // gesture has gone stale. Neither is worth telling anyone about — the
      // copy button is right there.
    }
  };

  const copy = async () => {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(`${invite.message}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setError(t("share.copyFailed"));
    }
  };

  if (error) return <div className="banner banner-danger">{error}</div>;
  if (!invite) return null;

  return (
    <section className="card stack">
      <h2>{t("share.heading")}</h2>
      <p className="small muted" style={{ margin: 0 }}>{t("share.body")}</p>

      <div className="share-code" aria-label={t("share.yourCode")}>
        <span className="tiny muted">{t("share.yourCode")}</span>
        <strong>{invite.code}</strong>
      </div>

      <div className="row" style={{ gap: 8 }}>
        {canShare && (
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={share}>
            {t("share.shareCta")}
          </button>
        )}
        <button className={canShare ? "btn" : "btn btn-primary"} style={{ flex: 1 }} onClick={copy}>
          {copied ? t("share.copied") : t("share.copyCta")}
        </button>
      </div>

      {/* Zero is worth stating rather than hiding: the point of the number is
          that it moves, and a card that only appears once it is non-zero
          never tells anyone it exists. */}
      <p className="tiny muted" style={{ margin: 0 }}>
        {invite.joined === 1 ? t("share.joinedOne") : t("share.joinedMany").replace("{n}", String(invite.joined))}
      </p>

      {invite.launch.phase !== "closed" && (
        <p className="tiny" style={{ margin: 0 }}>{launchNote(invite.launch, t, language)}</p>
      )}
    </section>
  );
}
