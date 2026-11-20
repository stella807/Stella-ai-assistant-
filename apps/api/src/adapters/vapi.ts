/**
 * Sofía's phone checks, through Vapi (vapi.ai): one outbound call with an assistant made for that call, asking one business one
 * question, then reading the result. Plan and rules: docs/phone-checks.md.
 *
 *   POST {base}/call            { phoneNumberId, customer: { number }, assistant: {...} }   Authorization: Bearer VAPI_API_KEY
 *   GET  {base}/call/{id}       status, endedReason, analysis.structuredData
 *   GET  {base}/phone-number    the account's numbers; provider "vapi" is a free Vapi number, which cannot call out
 *
 * Read when used, so a redeploy or a test never runs on what the process booted with. With no key nothing is called.
 */
const key = () => process.env.VAPI_API_KEY?.trim();
const base = () => (process.env.VAPI_API_BASE ?? "https://api.vapi.ai").replace(/\/$/, "");
const TIMEOUT_MS = 10_000;

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
let fetcher: Fetcher = (url, init) => fetch(url, init);
/** For tests: replace the network. Called with nothing, it goes back to the real one. */
export const setVapiFetcher = (f?: Fetcher) => { fetcher = f ?? ((url, init) => fetch(url, init)); };

export const vapiConfigured = () => Boolean(key());
export const vapiRequires = "VAPI_API_KEY in Railway's variables (the private key from the Vapi dashboard), and a Twilio, Telnyx or Vonage number imported into Vapi: free Vapi numbers cannot call out. Optional: VAPI_PHONE_NUMBER_ID to choose which number calls.";

export type Lang = "es" | "en";
export interface CallRequest { phoneNumberId: string; to: string; item: string; place: string; lang: Lang }

const VOICES: Record<Lang, string> = { es: "es-PR-KarinaNeural", en: "en-US-JennyNeural" };

/** The call Vapi is asked to make. Exported so its shape is tested without a network call. */
export function callBody({ phoneNumberId, to, item, place, lang }: CallRequest) {
  const es = lang === "es";
  const firstMessage = es
    ? `Buenas. Le habla Sofía, la asistente automatizada de Safehubby. Llamo de parte de un cliente con una sola pregunta: ¿tienen ${item} en existencia hoy? Si prefiere no contestarle a una asistente automatizada, no hay problema y cuelgo.`
    : `Hello. This is Sofia, Safehubby's automated assistant. I'm calling for a client with one question: do you have ${item} in stock today? If you'd rather not talk to an automated assistant, that's fine and I'll hang up.`;
  const system = [
    `You are Sofía, Safehubby's automated phone assistant, calling ${place} in Puerto Rico for a client. Speak ${es ? "Spanish (Puerto Rico)" : "English"}, briefly and politely.`,
    `Your only goal: find out whether they have "${item}" in stock today. Ask nothing else, and never give or ask for names, addresses, health details or payment.`,
    "If you reach a phone menu or a recording (for example \"press 1\", \"marque 1\", hold music), say nothing and end the call right away.",
    "If the person does not want to talk to an automated assistant, or asks you to stop, thank them and end the call.",
    "Once you have the answer, thank them and end the call. Never pretend to be a person; if asked, say you are an automated assistant.",
  ].join(" ");
  return {
    phoneNumberId,
    customer: { number: to },
    assistant: {
      name: "Sofía",
      firstMessage,
      endCallMessage: es ? "Muchas gracias, que tenga buen día." : "Thank you, have a good day.",
      maxDurationSeconds: 300,
      artifactPlan: { recordingEnabled: false },
      model: { provider: "openai", model: process.env.VAPI_MODEL?.trim() || "gpt-4.1-mini", messages: [{ role: "system", content: system }], tools: [{ type: "endCall" }] },
      voice: { provider: "azure", voiceId: process.env[`VAPI_VOICE_${lang.toUpperCase()}`]?.trim() || VOICES[lang] },
      transcriber: { provider: "deepgram", model: "nova-3", language: "multi" },
      analysisPlan: {
        summaryPrompt: "In one sentence: did a person answer, and is the item in stock today?",
        structuredDataPrompt: `From the call, record whether a person (not a menu or a recording) answered, and whether they said "${item}" is in stock today.`,
        structuredDataSchema: {
          type: "object",
          properties: {
            reachedPerson: { type: "boolean", description: "A person answered, not a phone menu or a recording." },
            inStock: { type: "string", enum: ["yes", "no", "unknown"], description: "What the person said about the item today." },
            notes: { type: "string", description: "Anything useful they added, in a few words: how many, when it comes in. No names." },
          },
          required: ["reachedPerson", "inStock"],
        },
      },
    },
  };
}

export interface VapiNumber { id: string; provider?: string; number?: string }

/** The number to call from: the chosen one, or the first imported one. A free Vapi number (provider "vapi") cannot call out. */
export function usableCaller(numbers: VapiNumber[], chosen?: string): { id: string; number: string; provider: string } | null {
  const pick = chosen ? numbers.find((n) => n.id === chosen) : numbers.find((n) => n.provider && n.provider !== "vapi");
  if (!pick || !pick.provider || pick.provider === "vapi") return null;
  return { id: pick.id, number: pick.number ?? "", provider: pick.provider };
}

/** What a call came to: not done yet, or done with "yes" / "no" (a person answered and said) or null (no clear answer). */
export function phoneCheckResult(call: any): { done: false } | { done: true; answer: "yes" | "no" | null; notes: string } {
  if (call?.status !== "ended") return { done: false };
  const data = call?.analysis?.structuredData;
  const notes = typeof data?.notes === "string" ? data.notes.replace(/\s+/g, " ").trim().slice(0, 200) : "";
  if (!data) return { done: true, answer: null, notes: `No answer (${String(call?.endedReason ?? "ended").slice(0, 60)}).` };
  if (data.reachedPerson !== true) return { done: true, answer: null, notes: "No person answered." };
  return { done: true, answer: data.inStock === "yes" || data.inStock === "no" ? data.inStock : null, notes: notes || (data.inStock === "unknown" ? "They could not say." : "") };
}

async function vapi(path: string, init: RequestInit = {}): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetcher(`${base()}${path}`, { ...init, signal: controller.signal, headers: { authorization: `Bearer ${key()}`, "content-type": "application/json", ...(init.headers as Record<string, string> | undefined) } });
    const text = await res.text();
    let body: any = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { message: text.slice(0, 200) }; }
    if (!res.ok) throw new Error(`Vapi ${res.status}: ${String(body?.message ?? body?.error ?? "").slice(0, 200)}`);
    return body;
  } finally { clearTimeout(timer); }
}

export const listNumbers = async (): Promise<VapiNumber[]> => {
  const body = await vapi("/phone-number?limit=100");
  return (Array.isArray(body) ? body : Array.isArray(body?.results) ? body.results : []).map((n: any) => ({ id: String(n.id), provider: n.provider, number: n.number }));
};
export const startCall = async (req: CallRequest): Promise<{ id: string; status: string }> => {
  const body = await vapi("/call", { method: "POST", body: JSON.stringify(callBody(req)) });
  const call = Array.isArray(body?.results) ? body.results[0] : body;
  return { id: String(call?.id ?? ""), status: String(call?.status ?? "queued") };
};
export const getCall = (id: string) => vapi(`/call/${encodeURIComponent(id)}`);
