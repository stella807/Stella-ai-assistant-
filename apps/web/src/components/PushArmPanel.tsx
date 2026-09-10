import { useEffect, useState } from "react";
import { api } from "../api.ts";
import { registerForPush, type PushState } from "../native/push.ts";

/**
 * Arming the watcher's phone.
 *
 * A guardian sitting up with the app closed is the normal case, not the edge
 * one, and until this exists a missed check-in is a row in a database nobody
 * reads until morning. So the panel is blunt about which of three situations
 * they are in, rather than showing a hopeful bell icon:
 *
 *  - the device is registered AND a sender is configured — they will be woken
 *  - the device is registered but no sender is configured — they will not be
 *  - this is a browser — web push is a separate integration that is not built
 *
 * The middle case is the one worth being loud about. Someone who believes
 * their phone will wake them and is wrong has been given false confidence by
 * a safety app, which is worse than being told plainly to keep the app open.
 */
export function PushArmPanel() {
  const [state, setState] = useState<PushState | "idle">("idle");
  const [devices, setDevices] = useState<number | null>(null);
  const [deliveryMode, setDeliveryMode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.pushStatus()
      .then((s) => { setDevices(s.devices); setDeliveryMode(s.delivery.mode); })
      .catch(() => {});
  }, []);

  const arm = async () => {
    setBusy(true);
    try {
      const result = await registerForPush();
      setState(result.state);
      if (result.state === "registered" && result.token && result.platform) {
        const res = await api.registerPushDevice(result.token, result.platform);
        setDeliveryMode(res.delivery.mode);
        setDevices((n) => (n ?? 0) + 1);
      }
    } catch {
      setState("denied");
    } finally {
      setBusy(false);
    }
  };

  const armed = (devices ?? 0) > 0;
  const senderLive = deliveryMode === "automatic";

  return (
    <section className="card stack" aria-label="Alerts on your phone">
      <div className="row-between">
        <h3>Alerts on your phone</h3>
        {armed && <span className={senderLive ? "pill pill-safe" : "pill pill-warn"}>
          {senderLive ? "On" : "Not sending"}
        </span>}
      </div>

      {armed && senderLive && (
        <p className="small muted">
          This phone will buzz for a missed check-in, a fast pace, or an SOS — even with the app closed.
          It stops the moment they stop sharing.
        </p>
      )}

      {armed && !senderLive && (
        <div className="banner">
          This phone is registered, but the server has no push sender configured, so <strong>nothing will
          actually reach you</strong>. Keep the app open tonight, or set <code>PUSH_API_URL</code> — see
          docs/push.md.
        </div>
      )}

      {!armed && state === "unsupported" && (
        <div className="banner">
          Push needs the installed app. In a browser this page only updates while it is open, so keep the
          tab open if you are watching tonight.
        </div>
      )}

      {!armed && state === "denied" && (
        <div className="banner banner-danger">
          Notifications are turned off for Safehubby. Turn them on in your phone&apos;s settings, or keep the
          app open.
        </div>
      )}

      {!armed && (
        <button className="btn btn-primary btn-block" disabled={busy} onClick={arm}>
          {busy ? "Asking…" : "Alert me on this phone"}
        </button>
      )}

      <p className="tiny muted">
        Alerts carry no address or map position — a lock screen is readable without unlocking the phone.
        The buzz tells you to look; the app shows you where.
      </p>
    </section>
  );
}
