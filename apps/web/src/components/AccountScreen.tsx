import { useState } from "react";
import { api, type Account } from "../api.ts";
import { PaymentMethodCard } from "./PaymentMethodCard.tsx";
import { ShareCard } from "./ShareCard.tsx";

/**
 * Account settings: export and deletion.
 *
 * Deletion is required by App Store guideline 5.1.1(v) and by the right to
 * erasure. It is real deletion, not deactivation, and the export sits directly
 * above it so taking your data with you is the obvious step before leaving.
 */
export function AccountScreen({ account, onDeleted }: { account: Account; onDeleted: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exported, setExported] = useState<string | null>(null);

  const doExport = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await api.exportAccount();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `safehubby-${account.displayName.toLowerCase().replace(/\s+/g, "-")}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExported("Downloaded. It includes your full location history in the clear — keep it somewhere safe.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not export");
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.deleteAccount(password, confirm);
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the account");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div>
        <h2>Account</h2>
        <p className="small muted">{account.displayName} · {account.email}</p>
      </div>

      <PaymentMethodCard />

      {/* Above the export-and-delete block on purpose: those two are the
          leaving path, and an invite sitting under them reads as a parting
          gift. */}
      <ShareCard />

      <section className="card">
        <h3>Take your data</h3>
        <p className="small muted">
          Everything Safehubby holds about you, as a file: nights, drink logs, check-ins, sharing,
          crews, games, points and your full location history.
        </p>
        <button className="btn btn-block" disabled={busy} onClick={doExport}>Download my data</button>
        {exported && <div className="banner banner-safe">{exported}</div>}
      </section>

      <section className="card">
        <h3>Delete my account</h3>
        <p className="small">
          This deletes your account and everything on it — permanently, not hidden. Anyone watching you
          loses access immediately. <strong>Your location history cannot be recovered.</strong>
        </p>
        <p className="tiny muted">
          Crews and games you shared with other people stay standing for them, with you removed.
        </p>

        {!armed ? (
          <button className="btn btn-block btn-ghost" onClick={() => setArmed(true)}>
            I want to delete my account
          </button>
        ) : (
          <>
            <div className="field">
              <label htmlFor="pw-del">Your password</label>
              <input id="pw-del" type="password" autoComplete="current-password"
                value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="confirm-del">Type DELETE to confirm</label>
              <input id="confirm-del" value={confirm} autoCapitalize="characters"
                onChange={(e) => setConfirm(e.target.value)} />
            </div>
            <div className="row">
              <button className="btn grow" disabled={busy} onClick={() => { setArmed(false); setPassword(""); setConfirm(""); }}>
                Keep my account
              </button>
              <button className="btn btn-danger grow"
                disabled={busy || !password || confirm.trim().toUpperCase() !== "DELETE"}
                onClick={doDelete}>
                Delete permanently
              </button>
            </div>
          </>
        )}

        {error && <div className="banner banner-danger">{error}</div>}
      </section>
    </div>
  );
}
