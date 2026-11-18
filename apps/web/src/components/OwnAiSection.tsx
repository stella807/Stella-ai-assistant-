import { useEffect, useState } from "react";
import { api, type OwnAiStatus } from "../api.ts";

/**
 * Safehubby's own AI model (Ollama on Railway): whether it is running, and a test question so the owner can
 * see it answer and how long it takes, from a phone, without reading server logs.
 */
export function OwnAiSection() {
  const [status, setStatus] = useState<OwnAiStatus | null>(null);
  const [question, setQuestion] = useState("Hola, ¿qué hace Safehubby?");
  const [answer, setAnswer] = useState<{ text: string; seconds: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => api.ownAiStatus().then((r) => setStatus(r.ollama)).catch((e) => setError(e instanceof Error ? e.message : "Could not check"));
  useEffect(() => { void load(); }, []);

  const test = async () => {
    setBusy(true);
    setError(null);
    setAnswer(null);
    try {
      const r = await api.ownAiTest(question);
      setAnswer(r);
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Our AI did not answer");
    } finally {
      setBusy(false);
    }
  };

  const line = (ok: boolean | undefined, yes: string, no: string) => <li>{ok ? "✓" : "✗"} {ok ? yes : no}</li>;

  return (
    <section className="card stack" aria-label="Our own AI">
      <h3 style={{ margin: 0 }}>Our own AI</h3>
      <p className="tiny muted" style={{ margin: 0 }}>
        Safehubby's own AI model runs on our Railway server, so its answers carry no per-message AI fee. If it is down or too
        slow, Claude answers instead, as long as the Claude key is still set.
      </p>
      {!status && !error && <p className="tiny muted">Checking…</p>}
      {status && !status.configured && (
        <p className="small" style={{ margin: 0 }}>
          Not set up yet. Follow deploy/ollama/README.md, then add <code>OLLAMA_URL</code> to the API service on Railway.
        </p>
      )}
      {status?.configured && (
        <ul className="small" style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
          {line(status.reachable, "The AI server is running", `The AI server is not answering${status.error ? ` (${status.error})` : ""}`)}
          {status.reachable && line(status.installed, `The model is downloaded: ${status.model}`, `The model is still downloading: ${status.model}`)}
          {status.reachable && status.installed && line(status.loaded, "Loaded and ready", "Not loaded yet: the first answer will take a few seconds longer")}
          <li className="tiny muted">Used for: {status.features === "all" ? "every AI feature" : status.features}</li>
        </ul>
      )}
      {status?.configured && (
        <>
          <div className="field">
            <label htmlFor="own-ai-q">Ask it a test question</label>
            <input id="own-ai-q" value={question} maxLength={300} onChange={(e) => setQuestion(e.target.value)} />
          </div>
          <button className="btn btn-primary" disabled={busy || !question.trim()} onClick={() => void test()}>
            {busy ? "Thinking… (up to a minute)" : "Ask"}
          </button>
        </>
      )}
      {answer && (
        <div className="card card-quiet stack" style={{ gap: 4 }}>
          <p className="small" style={{ margin: 0 }}>{answer.text}</p>
          <span className="tiny muted">Answered in {answer.seconds} seconds</span>
        </div>
      )}
      {error && <p className="tiny" role="alert">{error}</p>}
    </section>
  );
}
