import { useEffect, useState } from "react";
import { useLanguage } from "../i18n.tsx";
import { nightWords } from "../app/night-copy.ts";
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
 *
 * Reused as-is for the assistant portal (`EmployeePortal.tsx`), which needs
 * the exact same three-state logic for "a task just landed on you" instead
 * of "someone you're watching needs you" — only which endpoints it calls and
 * what the armed copy says differ, so those are the only two things made
 * into props rather than duplicating the whole panel.
 */
export interface PushArmPanelProps {
  statusApi?: () => Promise<{ devices: number; delivery: { mode: string } }>;
  registerApi?: (token: string, platform: string) => Promise<{ delivery: { mode: string } }>;
  title?: string;
  armedCopy?: string;
}

export function PushArmPanel({
  statusApi = api.pushStatus,
  registerApi = api.registerPushDevice,
  title: titleProp,
  armedCopy: armedCopyProp,
}: PushArmPanelProps) {
  const w = nightWords(useLanguage().language).push;
  const title = titleProp ?? w.title;
  const armedCopy = armedCopyProp ?? w.armed;
  const [state, setState] = useState<PushState | "idle">("idle");
  const [devices, setDevices] = useState<number | null>(null);
  const [deliveryMode, setDeliveryMode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    statusApi()
      .then((s) => { setDevices(s.devices); setDeliveryMode(s.delivery.mode); })
      .catch(() => {});
  }, [statusApi]);

  const arm = async () => {
    setBusy(true);
    try {
      const result = await registerForPush();
      setState(result.state);
      if (result.state === "registered" && result.token && result.platform) {
        const res = await registerApi(result.token, result.platform);
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
    <section className="card stack" aria-label={title}>
      <div className="row-between">
        <h3>{title}</h3>
        {armed && <span className={senderLive ? "pill pill-safe" : "pill pill-warn"}>
          {senderLive ? w.on : w.notSending}
        </span>}
      </div>

      {armed && senderLive && (
        <p className="small muted">{armedCopy}</p>
      )}

      {armed && !senderLive && (
        <div className="banner">
          {w.noSender[0]}<strong>{w.noSender[1]}</strong>{w.noSender[2]}<code>PUSH_API_URL</code>{w.noSender[3]}
        </div>
      )}

      {!armed && state === "unsupported" && (
        <div className="banner">{w.unsupported}</div>
      )}

      {!armed && state === "denied" && (
        <div className="banner banner-danger">{w.denied}</div>
      )}

      {!armed && (
        <button className="btn btn-primary btn-block" disabled={busy} onClick={arm}>
          {busy ? w.asking : w.arm}
        </button>
      )}

      <p className="tiny muted">{w.privacy}</p>
    </section>
  );
}
