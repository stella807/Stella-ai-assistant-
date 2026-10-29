import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api.ts";
import { useLanguage } from "../i18n.tsx";

/**
 * "Ask Safehubby": a round chat bubble that answers questions about pricing and
 * how it works, by typing or by voice. The answers come from the server, which
 * builds them from the live prices (see packages/core site-chat.ts); this is
 * only the window onto it. Voice uses the browser's own speech recognition and
 * synthesis, so where those are missing it is a plain text chat.
 */

type Turn = { role: "user" | "assistant"; content: string; error?: boolean };

const WORDS = {
  en: {
    open: "Ask Safehubby", teaser: "Questions? Ask me", title: "Ask Safehubby", close: "Close",
    placeholder: "Ask about pricing or how it works", send: "Send", mic: "Speak your question", micStop: "Stop listening",
    listening: "Listening…", thinking: "Thinking…", read: "Read answers aloud",
    note: "AI assistant. It can be wrong, and it is not for emergencies: call 911.", voiceNote: "Voice uses your browser's speech service.",
    hello: "Hi! I can answer questions about Safehubby's prices and how it works. What would you like to know?",
    offline: "I could not reach the assistant. You can email contact@safehubby.com and a person will answer.",
    denied: "The microphone is blocked for this site. Allow it in your browser settings, or type your question.",
    ideas: ["How much does it cost?", "How does Safehubby work?", "How does the Wingman Club work?", "How does an errand work?"],
    speech: "en-US",
  },
  es: {
    open: "Pregunta a Safehubby", teaser: "¿Dudas? Pregúntame", title: "Pregunta a Safehubby", close: "Cerrar",
    placeholder: "Pregunta por los precios o cómo funciona", send: "Enviar", mic: "Di tu pregunta", micStop: "Dejar de escuchar",
    listening: "Escuchando…", thinking: "Pensando…", read: "Leer las respuestas en voz alta",
    note: "Asistente de IA. Puede equivocarse y no es para emergencias: llama al 911.", voiceNote: "La voz usa el servicio de voz de tu navegador.",
    hello: "¡Hola! Puedo responder preguntas sobre los precios de Safehubby y cómo funciona. ¿Qué quieres saber?",
    offline: "No pude comunicarme con el asistente. Escribe a contact@safehubby.com y una persona te contestará.",
    denied: "El micrófono está bloqueado para este sitio. Permítelo en los ajustes del navegador o escribe tu pregunta.",
    ideas: ["¿Cuánto cuesta?", "¿Cómo funciona Safehubby?", "¿Cómo funciona el Wingman Club?", "¿Cómo funciona un mandado?"],
    speech: "es-PR",
  },
} as const;

const TEASER_KEY = "sh_chat_teaser";
const safeStore = {
  get: () => { try { return sessionStorage.getItem(TEASER_KEY) === "1"; } catch { return false; } },
  set: () => { try { sessionStorage.setItem(TEASER_KEY, "1"); } catch { /* blocked storage: it will show again next load */ } },
};

// The two browser speech APIs are not in TypeScript's DOM lib everywhere.
type Recognizer = {
  lang: string; interimResults: boolean; maxAlternatives: number; start(): void; stop(): void;
  onresult: ((e: any) => void) | null; onerror: ((e: any) => void) | null; onend: (() => void) | null;
};
const recognitionCtor = (): (new () => Recognizer) | null =>
  typeof window === "undefined" ? null : ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null);
const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window && typeof (window as any).SpeechSynthesisUtterance === "function";

export function SiteChatBubble() {
  const { language } = useLanguage();
  const w = WORDS[language === "es" ? "es" : "en"];
  const [open, setOpen] = useState(false);
  const [teaser, setTeaser] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [readAloud, setReadAloud] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<Recognizer | null>(null);
  const Recognition = recognitionCtor();

  useEffect(() => {
    if (safeStore.get()) return;
    const t = setTimeout(() => setTeaser(true), 4000);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [turns, busy]);

  const stopSpeaking = () => { if (canSpeak()) window.speechSynthesis.cancel(); };
  const stopListening = () => { setListening(false); try { recRef.current?.stop(); } catch { /* already stopped */ } };
  const close = () => { setOpen(false); stopListening(); stopSpeaking(); };
  const openIt = () => { setOpen(true); setTeaser(false); safeStore.set(); };

  const speak = (reply: string, force: boolean) => {
    if (!canSpeak() || !(readAloud || force)) return;
    stopSpeaking();
    const u = new (window as any).SpeechSynthesisUtterance(reply);
    u.lang = w.speech;
    window.speechSynthesis.speak(u);
  };

  const ask = async (raw: string, spoken: boolean) => {
    const q = raw.trim();
    if (!q || busy) return;
    const history: Turn[] = [...turns.filter((t) => !t.error), { role: "user", content: q }];
    setTurns([...turns, { role: "user", content: q }]);
    setText("");
    setBusy(true);
    try {
      const { reply } = await api.siteChat(history.slice(-12).map(({ role, content }) => ({ role, content })));
      setTurns((t) => [...t, { role: "assistant", content: reply }]);
      // Someone who spoke gets spoken to; someone who typed gets silence unless they asked for it.
      if (spoken && canSpeak()) setReadAloud(true);
      speak(reply, spoken);
    } catch (e) {
      // The server's own sentence names the email when it is busy or not set up; anything else gets the plain fallback.
      const known = e instanceof ApiError && [429, 502, 503].includes(e.status) ? e.message : w.offline;
      setTurns((t) => [...t, { role: "assistant", content: known, error: true }]);
    } finally {
      setBusy(false);
    }
  };

  const toggleMic = () => {
    if (listening) return stopListening();
    if (!Recognition) return;
    stopSpeaking();
    const rec = new Recognition();
    recRef.current = rec;
    rec.lang = w.speech;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    let heard = "";
    rec.onresult = (ev) => {
      let t = "";
      for (let i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript;
      heard = t;
      setText(t);
    };
    rec.onerror = (ev) => {
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") setTurns((t) => [...t, { role: "assistant", content: w.denied, error: true }]);
      heard = "";
    };
    rec.onend = () => { setListening(false); if (heard.trim()) void ask(heard, true); };
    setListening(true);
    try { rec.start(); } catch { setListening(false); }
  };

  if (!open) {
    return (
      <>
        {teaser && <button type="button" className="chat-teaser" onClick={openIt}>{w.teaser}</button>}
        <button type="button" className="chat-launcher" aria-haspopup="dialog" aria-label={w.open} onClick={openIt}>
          <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
            <path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="currentColor" />
          </svg>
        </button>
      </>
    );
  }

  return (
    <section className="chat-panel" role="dialog" aria-label={w.title} onKeyDown={(e) => { if (e.key === "Escape") close(); }}>
      <div className="chat-head">
        <strong>{w.title}</strong>
        <button type="button" className="chat-close" aria-label={w.close} onClick={close}>×</button>
      </div>
      <div className="chat-log" role="log" aria-live="polite" ref={logRef}>
        <p className="chat-msg chat-bot">{w.hello}</p>
        {turns.map((t, i) => (
          <p key={i} className={`chat-msg ${t.role === "user" ? "chat-user" : "chat-bot"}${t.error ? " chat-error" : ""}`}>{t.content}</p>
        ))}
        {busy && <p className="chat-msg chat-bot chat-wait">{w.thinking}</p>}
      </div>
      {turns.length === 0 && (
        <div className="chat-ideas">
          {w.ideas.map((q) => <button key={q} type="button" className="chat-idea" onClick={() => void ask(q, false)}>{q}</button>)}
        </div>
      )}
      <form className="chat-form" onSubmit={(e) => { e.preventDefault(); void ask(text, false); }}>
        <input className="chat-input" type="text" maxLength={500} autoComplete="off" autoFocus value={text}
          onChange={(e) => setText(e.target.value)} placeholder={listening ? w.listening : w.placeholder} aria-label={w.placeholder} />
        {Recognition && (
          <button type="button" className={`chat-mic${listening ? " on" : ""}`} aria-label={listening ? w.micStop : w.mic} onClick={toggleMic}>🎤</button>
        )}
        <button type="submit" className="chat-send" disabled={busy}>{w.send}</button>
      </form>
      <div className="chat-foot">
        {canSpeak() && (
          <label className="chat-read">
            <input type="checkbox" checked={readAloud} onChange={(e) => { setReadAloud(e.target.checked); if (!e.target.checked) stopSpeaking(); }} /> {w.read}
          </label>
        )}
        <p className="chat-note">{w.note}{Recognition ? ` ${w.voiceNote}` : ""}</p>
      </div>
    </section>
  );
}
