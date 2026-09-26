import { useEffect, useRef, useState, type FormEvent } from "react";
import { MAX_STELLA_MESSAGE, recentStellaTurns, type StellaTurn } from "@safehubby/core";
import { api } from "../api.ts";
import { useLanguage, type TranslationKey } from "../i18n.tsx";

/** A turn as shown on screen: a safety script is styled as one, so it never reads as small talk. */
interface ChatMessage extends StellaTurn {
  safety?: boolean;
}

const STORAGE_KEY = "safehubby-stella-chat";
const SUGGESTIONS: TranslationKey[] = ["stella.suggest.pace", "stella.suggest.home", "stella.suggest.water"];

/**
 * Per-tab session storage, not local: a chat about someone's night should
 * not still be sitting on the phone next week, and switching tabs mid-night
 * should not wipe it either. Any storage failure just means no memory.
 */
function loadChat(): ChatMessage[] {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((m) => typeof m?.text === "string") : [];
  } catch {
    return [];
  }
}

function saveChat(messages: ChatMessage[]): void {
  try { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages)); } catch { /* nowhere to keep it */ }
}

export function StellaScreen() {
  const { t } = useLanguage();
  const [messages, setMessages] = useState<ChatMessage[]>(loadChat);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.stellaStatus()
      .then((s) => setConfigured(s.mode === "automatic"))
      .catch(() => setConfigured(null));
  }, []);

  useEffect(() => { saveChat(messages); }, [messages]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [messages.length, sending]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    const next: ChatMessage[] = [...messages, { role: "user", text: trimmed }];
    setMessages(next);
    setDraft("");
    setError(null);
    setSending(true);
    try {
      // The server only sees role and text — the safety flag is display state.
      const history = recentStellaTurns(next.map(({ role, text }) => ({ role, text })));
      const reply = await api.stellaSend(history);
      setMessages((current) => [...current, { role: "assistant", text: reply.text, safety: reply.source === "safety" }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Stella couldn't answer just now.");
    } finally {
      setSending(false);
    }
  };

  const onSubmit = (e: FormEvent) => { e.preventDefault(); void send(draft); };

  return (
    <section className="stella stack" aria-label="Stella">
      <div className="card card-hero stella-intro">
        <div className="row">
          <span className="stella-avatar" aria-hidden="true">✦</span>
          <p className="small">{t("stella.intro")}</p>
        </div>
        {messages.length > 0 && (
          <button className="btn btn-sm btn-ghost stella-clear" onClick={() => { setMessages([]); setError(null); }}>
            {t("stella.clear")}
          </button>
        )}
      </div>

      {configured === false && <div className="banner">{t("stella.offline")}</div>}

      <div className="stella-thread" role="log" aria-live="polite">
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user" ? "stella-bubble stella-bubble-user"
                : m.safety ? "stella-bubble stella-bubble-safety" : "stella-bubble"
            }
          >
            {m.safety && <strong className="stella-safety-label">{t("stella.safetyLabel")}</strong>}
            {m.text}
          </div>
        ))}
        {sending && <div className="stella-bubble stella-typing tiny">{t("stella.thinking")}</div>}
        {error && <div className="banner banner-danger" role="alert">{error}</div>}
        <div ref={endRef} />
      </div>

      {messages.length === 0 && (
        <div className="row wrap stella-suggestions">
          {SUGGESTIONS.map((key) => (
            <button key={key} className="btn btn-sm btn-ghost" disabled={sending} onClick={() => void send(t(key))}>
              {t(key)}
            </button>
          ))}
        </div>
      )}

      <form className="stella-composer" onSubmit={onSubmit}>
        <input
          aria-label={t("stella.placeholder")}
          placeholder={t("stella.placeholder")}
          value={draft}
          maxLength={MAX_STELLA_MESSAGE}
          onChange={(e) => setDraft(e.target.value)}
          enterKeyHint="send"
        />
        <button className="btn btn-primary" type="submit" disabled={sending || !draft.trim()}>
          {t("stella.send")}
        </button>
      </form>

      <p className="tiny">{t("stella.disclaimer")}</p>
    </section>
  );
}
