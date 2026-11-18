import { useEffect, useState } from "react";
import { ASSISTANT_LANGUAGES, ASSISTANT_TONES, type BusinessAssistant, type BusinessConversation } from "@safehubby/core";
import { api, type BizMe } from "../api.ts";

const TONE_LABEL = { friendly: "Friendly", professional: "Professional", casual: "Casual", formal: "Formal" } as const;
const LANG_LABEL = { en: "English", es: "Spanish", both: "Both (matches the visitor)" } as const;

function Shell({ title, onSignOut, children }: { title?: string; onSignOut?: () => void; children: React.ReactNode }) {
  return (
    <div className="app stack">
      <div className="row-between">
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>{title ?? "Safehubby Business"}</h1>
          <p className="tiny muted" style={{ margin: 0 }}>Your AI employee</p>
        </div>
        {onSignOut && <button className="btn btn-sm btn-ghost" onClick={onSignOut}>Sign out</button>}
      </div>
      {children}
    </div>
  );
}

/** A business's own portal: set up its AI employee, try it, read what visitors asked, and copy the chat box code. */
export function BusinessScreen() {
  const [me, setMe] = useState<BizMe | null>(null);
  const [state, setState] = useState<"checking" | "out" | "in">("checking");
  const load = () => api.bizMe().then((r) => { setMe(r.business); setState("in"); }).catch(() => setState("out"));
  useEffect(() => { void load(); }, []);

  if (state === "checking") return <Shell><p className="small muted">Loading…</p></Shell>;
  if (state === "out" || !me) return <SignIn onSignedIn={() => void load()} />;
  return (
    <Shell title={me.name} onSignOut={() => { void api.bizLogout().finally(() => { setMe(null); setState("out"); }); }}>
      <Dashboard me={me} onSaved={setMe} />
    </Shell>
  );
}

function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setError(null);
    try { await api.bizLogin(key.trim()); onSignedIn(); } catch (e) { setError(e instanceof Error ? e.message : "Could not sign in"); } finally { setBusy(false); }
  };
  return (
    <Shell>
      <div className="card stack">
        <h2>Sign in with your key</h2>
        <p className="small muted">Safehubby sent you one key when your account was made. Lost it? Ask Safehubby for a new one.</p>
        <div className="field">
          <label htmlFor="biz-key">Your key</label>
          <input id="biz-key" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void submit(); }} />
        </div>
        <button className="btn btn-primary btn-block" disabled={busy || !key.trim()} onClick={() => void submit()}>Sign in</button>
        {error && <div className="banner banner-danger" role="alert">{error}</div>}
      </div>
    </Shell>
  );
}

function Dashboard({ me, onSaved }: { me: BizMe; onSaved: (b: BizMe) => void }) {
  const [tab, setTab] = useState<"assistant" | "try" | "chats" | "embed">("assistant");
  const tabs = [["assistant", "Assistant"], ["try", "Try it"], ["chats", "Conversations"], ["embed", "Website"]] as const;
  return (
    <>
      <p className="small" style={{ margin: 0 }}>
        {me.usage.used} of {me.messageLimit} answers used in {me.usage.month}. Past the limit, visitors are sent to your contact details.
      </p>
      <nav className="master-tabs" role="tablist" aria-label="Sections">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>
      {tab === "assistant" && <AssistantForm me={me} onSaved={onSaved} />}
      {tab === "try" && <TryIt />}
      {tab === "chats" && <Conversations />}
      {tab === "embed" && <Embed me={me} onSaved={onSaved} />}
    </>
  );
}

function AssistantForm({ me, onSaved }: { me: BizMe; onSaved: (b: BizMe) => void }) {
  const [a, setA] = useState<BusinessAssistant>(me.assistant);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof BusinessAssistant>(k: K, v: BusinessAssistant[K]) => setA({ ...a, [k]: v });

  const save = async () => {
    setMsg(null); setError(null);
    try { const r = await api.bizSaveAssistant(a, me.allowedOrigins); onSaved(r.business); setA(r.business.assistant); setMsg("Saved."); }
    catch (e) { setError(e instanceof Error ? e.message : "That did not save"); }
  };

  return (
    <section className="card stack" aria-label="Your assistant">
      <p className="tiny muted" style={{ margin: 0 }}>
        Your assistant answers only from what you write here, and tells visitors it is an AI. When it has no answer it sends them to the contact details
        you give. Write prices exactly as you want them said.
      </p>
      <div className="field"><label htmlFor="a-name">Assistant name</label><input id="a-name" value={a.name} maxLength={40} onChange={(e) => set("name", e.target.value)} /></div>
      <div className="row" style={{ gap: 8 }}>
        <div className="field grow"><label htmlFor="a-tone">Tone</label>
          <select id="a-tone" value={a.tone} onChange={(e) => set("tone", e.target.value as BusinessAssistant["tone"])}>
            {ASSISTANT_TONES.map((t) => <option key={t} value={t}>{TONE_LABEL[t]}</option>)}</select></div>
        <div className="field grow"><label htmlFor="a-lang">Language</label>
          <select id="a-lang" value={a.language} onChange={(e) => set("language", e.target.value as BusinessAssistant["language"])}>
            {ASSISTANT_LANGUAGES.map((l) => <option key={l} value={l}>{LANG_LABEL[l]}</option>)}</select></div>
      </div>
      <div className="field"><label htmlFor="a-welcome">First message visitors see</label><input id="a-welcome" value={a.welcome} maxLength={200} onChange={(e) => set("welcome", e.target.value)} /></div>
      <div className="field"><label htmlFor="a-about">About your business</label><textarea id="a-about" rows={4} value={a.about} maxLength={1500} onChange={(e) => set("about", e.target.value)} /></div>
      <div className="field"><label htmlFor="a-hours">Opening hours</label><input id="a-hours" value={a.hours} maxLength={300} onChange={(e) => set("hours", e.target.value)} /></div>
      <div className="field"><label htmlFor="a-esc">How to reach a person (when the assistant can't help)</label>
        <input id="a-esc" placeholder="Call 787-555-0100 or write hola@example.com" value={a.escalation} maxLength={300} onChange={(e) => set("escalation", e.target.value)} /></div>

      <h3 className="small" style={{ margin: "6px 0 0" }}>Services and prices</h3>
      {a.services.map((s, i) => (
        <div key={i} className="card card-quiet stack" style={{ gap: 6 }}>
          <div className="row" style={{ gap: 8 }}>
            <input aria-label={`Service ${i + 1} name`} placeholder="Service" value={s.name} maxLength={80} onChange={(e) => set("services", a.services.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <input aria-label={`Service ${i + 1} price`} placeholder="Price" value={s.price ?? ""} maxLength={40} onChange={(e) => set("services", a.services.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} />
          </div>
          <input aria-label={`Service ${i + 1} details`} placeholder="Details (optional)" value={s.description ?? ""} maxLength={300} onChange={(e) => set("services", a.services.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
          <button className="btn btn-sm btn-ghost" onClick={() => set("services", a.services.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      <button className="btn btn-sm" disabled={a.services.length >= 30} onClick={() => set("services", [...a.services, { name: "" }])}>Add a service</button>

      <h3 className="small" style={{ margin: "6px 0 0" }}>Questions people ask</h3>
      {a.faqs.map((f, i) => (
        <div key={i} className="card card-quiet stack" style={{ gap: 6 }}>
          <input aria-label={`Question ${i + 1}`} placeholder="Question" value={f.q} maxLength={200} onChange={(e) => set("faqs", a.faqs.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))} />
          <textarea aria-label={`Answer ${i + 1}`} rows={2} placeholder="Answer" value={f.a} maxLength={800} onChange={(e) => set("faqs", a.faqs.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} />
          <button className="btn btn-sm btn-ghost" onClick={() => set("faqs", a.faqs.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      <button className="btn btn-sm" disabled={a.faqs.length >= 50} onClick={() => set("faqs", [...a.faqs, { q: "", a: "" }])}>Add a question</button>

      {error && <p className="tiny" role="alert">{error}</p>}
      {msg && <p className="tiny" role="status">{msg}</p>}
      <button className="btn btn-primary btn-block" disabled={!a.name.trim()} onClick={() => void save()}>Save</button>
    </section>
  );
}

function TryIt() {
  const [q, setQ] = useState("");
  const [log, setLog] = useState<{ who: "me" | "bot"; text: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    const text = q.trim(); if (text.length < 2) return;
    setQ(""); setBusy(true); setLog((l) => [...l, { who: "me", text }]);
    try { const r = await api.bizTestQuestion(text); setLog((l) => [...l, { who: "bot", text: r.answer }]); }
    catch (e) { setLog((l) => [...l, { who: "bot", text: e instanceof Error ? e.message : "That did not work" }]); }
    finally { setBusy(false); }
  };
  return (
    <section className="card stack" aria-label="Try your assistant">
      <p className="tiny muted" style={{ margin: 0 }}>Ask it what a customer would. Tests are not saved and do not use your monthly answers. Save your changes first.</p>
      {log.map((m, i) => <p key={i} className="small" style={{ margin: 0, whiteSpace: "pre-wrap" }}><strong>{m.who === "me" ? "You" : "Assistant"}:</strong> {m.text}</p>)}
      <div className="field"><label htmlFor="try-q">Your question</label>
        <input id="try-q" value={q} maxLength={500} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void send(); }} /></div>
      <button className="btn btn-primary" disabled={busy || q.trim().length < 2} onClick={() => void send()}>{busy ? "Thinking… (up to a minute)" : "Ask"}</button>
    </section>
  );
}

function Conversations() {
  const [rows, setRows] = useState<BusinessConversation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.bizConversations().then((r) => setRows(r.conversations)).catch((e) => setError(e instanceof Error ? e.message : "Could not load")); }, []);
  if (!rows) return error ? <p className="tiny" role="alert">{error}</p> : <p className="tiny muted">Loading…</p>;
  return (
    <section className="card stack" aria-label="Conversations">
      <p className="tiny muted" style={{ margin: 0 }}>What visitors asked and what the assistant said, newest first. Questions marked "sent to you" had no answer in your facts: add them to your assistant.</p>
      {rows.length === 0 && <p className="tiny muted" style={{ margin: 0 }}>No conversations yet.</p>}
      {rows.map((c) => (
        <div key={c.id} className="card card-quiet stack" style={{ gap: 4 }}>
          <span className="tiny muted">{new Date(c.at).toLocaleString()}{c.source === "handoff" ? " · sent to you" : ""}</span>
          <p className="small" style={{ margin: 0 }}><strong>Visitor:</strong> {c.question}</p>
          <p className="small" style={{ margin: 0 }}><strong>Assistant:</strong> {c.answer}</p>
        </div>
      ))}
    </section>
  );
}

function Embed({ me, onSaved }: { me: BizMe; onSaved: (b: BizMe) => void }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const code = `<script src="${origin}/widget.js" data-business="${me.id}" async></script>`;
  const [sites, setSites] = useState(me.allowedOrigins.join("\n"));
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const save = async () => {
    setMsg(null); setError(null);
    try { const r = await api.bizSaveAssistant(me.assistant, sites.split(/\s+/).filter(Boolean)); onSaved(r.business); setMsg("Saved."); }
    catch (e) { setError(e instanceof Error ? e.message : "That did not save"); }
  };
  return (
    <section className="card stack" aria-label="Put it on your website">
      <p className="small" style={{ margin: 0 }}>Paste this on every page of your website, just before the closing &lt;/body&gt; tag. A chat button appears at the bottom right.</p>
      <textarea readOnly rows={3} value={code} aria-label="Chat box code" onFocus={(e) => e.currentTarget.select()} />
      <button className="btn btn-sm" onClick={() => { void navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}>{copied ? "Copied" : "Copy the code"}</button>
      <div className="field">
        <label htmlFor="sites">Websites allowed to show it (one per line, optional)</label>
        <textarea id="sites" rows={3} placeholder="https://yourbusiness.com" value={sites} onChange={(e) => setSites(e.target.value)} />
      </div>
      <p className="tiny muted" style={{ margin: 0 }}>Leave this empty and any website could show your assistant and use up your monthly answers. We suggest listing your own.</p>
      {error && <p className="tiny" role="alert">{error}</p>}
      {msg && <p className="tiny" role="status">{msg}</p>}
      <button className="btn btn-primary" onClick={() => void save()}>Save</button>
    </section>
  );
}
