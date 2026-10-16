import { useEffect, useState } from "react";
import { api } from "../api.ts";

/**
 * Connecting Revolut Business, for the assistants' task cards and their pay.
 * Revolut sends the owner back here with a one-time code; it is handed to the
 * server straight away and removed from the address bar.
 */
export function RevolutConnect() {
  const [state, setState] = useState<Awaited<ReturnType<typeof api.masterRevolut>> | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const returned = params.get("state");
    const finish = code && returned
      ? api.masterRevolutConnect(code, returned)
        .then(() => setMessage("Revolut Business is connected."))
        .catch((e) => setMessage(e instanceof Error ? e.message : "Could not connect Revolut."))
        .finally(() => window.history.replaceState(null, "", window.location.pathname))
      : Promise.resolve();
    void finish.then(() => api.masterRevolut().then(setState).catch(() => {}));
  }, []);

  if (!state) return message ? <p className="small">{message}</p> : null;

  return (
    <section className="card stack">
      <h3>Revolut Business</h3>
      {state.connected
        ? <p className="small">Connected — task cards and assistant pay go through Revolut.</p>
        : state.configured
          ? <a className="btn btn-primary btn-block" href={state.connectUrl}>Connect Revolut Business</a>
          : <p className="small muted">{state.requires}</p>}
      {message && <div className="banner">{message}</div>}
    </section>
  );
}
