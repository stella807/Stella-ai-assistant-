import { useEffect, useState } from "react";
import {
  permissionCopy, permissionState, requestPermission, settingsPath, shouldPrime,
  type PermissionName, type PermissionState,
} from "../native/permissions.ts";

/**
 * Wraps anything that needs the camera or the microphone.
 *
 * Three states, and the third is the one that matters. Granted renders the
 * feature. Un-asked shows what the permission is for and a button that
 * triggers the OS prompt — so the system dialog lands on someone who already
 * knows why. Denied stops pretending the button will work and says where the
 * switch is instead, because on iOS the OS will not ask a second time.
 *
 * `onReady` is deliberately not called on mount. The permission is requested
 * by a tap, never by a screen appearing: a prompt nobody triggered is the one
 * most likely to be refused, and a refusal here is permanent.
 */
export function PermissionGate({ name, children, compact }: {
  name: PermissionName;
  children: React.ReactNode;
  /** Renders as a single line rather than a card, for use inside a form. */
  compact?: boolean;
}) {
  const [state, setState] = useState<PermissionState | null>(null);
  const [busy, setBusy] = useState(false);
  const copy = permissionCopy(name);

  useEffect(() => {
    let alive = true;
    permissionState(name).then((s) => { if (alive) setState(s); });
    return () => { alive = false; };
  }, [name]);

  // Still checking. Render nothing rather than flashing a permission prompt
  // at someone who has already granted it.
  if (state === null) return null;

  if (state === "granted") return <>{children}</>;

  // No camera or microphone on this device at all. Not a refusal, so it must
  // not be dressed up as one — there is no Settings switch that fixes it.
  if (state === "unavailable") {
    return (
      <p className="tiny muted" style={{ margin: 0 }}>
        This device has no {name === "camera" ? "camera" : "microphone"} available.
      </p>
    );
  }

  if (state === "denied") {
    return (
      <div className={compact ? "stack" : "card stack"} style={{ gap: 6 }}>
        <strong className="small">{name === "camera" ? "Camera is off" : "Microphone is off"}</strong>
        <p className="tiny muted" style={{ margin: 0 }}>{copy.recovery}</p>
        <p className="tiny muted" style={{ margin: 0 }}>{settingsPath(name)}</p>
      </div>
    );
  }

  // Un-asked. On the web the browser's own prompt is recoverable by
  // reloading, so there is no reason to put a screen in front of it — ask on
  // the first real use instead.
  if (!shouldPrime(state)) return <>{children}</>;

  const ask = async () => {
    setBusy(true);
    setState(await requestPermission(name));
    setBusy(false);
  };

  return (
    <div className={compact ? "stack" : "card stack"} style={{ gap: 8 }}>
      <strong className="small">{name === "camera" ? "Allow the camera" : "Allow the microphone"}</strong>
      <p className="tiny muted" style={{ margin: 0 }}>{copy.prime}</p>
      <button className="btn btn-sm btn-primary" disabled={busy} onClick={ask}>
        {busy ? "Asking…" : "Continue"}
      </button>
    </div>
  );
}
