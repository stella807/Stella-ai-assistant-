import type { ProviderStatus } from "./fulfillment.ts";

/**
 * Text-message alerts.
 *
 * The same discipline `push.ts` follows, for the same reasons: a text can be
 * read by whoever is holding the phone without unlocking it, so what goes in
 * one is the least that gets the person to open the app — never a location, an
 * amount, or anything medical. And nobody is texted until they have said, in
 * their own words, that they want to be: a number typed into a form by someone
 * else is not consent, and texting it anyway is both unkind and, in the US,
 * regulated (the TCPA). Opting out is one call and takes effect immediately.
 *
 * Nothing here sends anything. The port is the seam; the adapter that talks
 * to a provider lives in the API app.
 */

export interface SmsMessage {
  /** E.164, as `normalizePhone` produces it. */
  to: string;
  body: string;
}

export interface SmsPort {
  readonly status: ProviderStatus;
  send(messages: SmsMessage[]): Promise<{ sent: number }>;
}

export type TextLanguage = "en" | "es";

export interface TextContact {
  phone: string;
  language: TextLanguage;
  consentedAt: string;
  optedOutAt?: string;
}

/**
 * North American numbers (Puerto Rico is +1) typed any way people type them,
 * or an international number written with its +. Anything else is refused
 * rather than guessed at — a text to a wrong number is a stranger's phone.
 */
export function normalizePhone(raw: string): string | null {
  const text = raw.trim();
  if (!/^\+?[\d\s().-]+$/.test(text)) return null;
  const digits = text.replace(/\D/g, "");
  if (text.startsWith("+")) {
    if (digits.startsWith("1")) return digits.length === 11 ? `+${digits}` : null;
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export function registerTextContact(input: {
  phone: string;
  consent: boolean;
  language: TextLanguage;
  now: Date;
}): TextContact {
  if (!input.consent) throw new Error("Please agree to receive text alerts first.");
  const phone = normalizePhone(input.phone);
  if (!phone) throw new Error("That phone number does not look right.");
  return {
    phone,
    language: input.language === "es" ? "es" : "en",
    consentedAt: input.now.toISOString(),
  };
}

export function optOut(contact: TextContact, now: Date): TextContact {
  return { ...contact, optedOutAt: now.toISOString() };
}

/** Whether this person may be texted right now. */
export function canText(contact: TextContact | undefined): contact is TextContact {
  return contact !== undefined && contact.optedOutAt === undefined;
}

export const TEXT_ALERT_KINDS = [
  "assistant-new-task",
  "assistant-message",
  "customer-reply",
  "customer-spend-request",
  "customer-task-done",
  "guardian-sos",
  "guardian-missed-checkin",
  "owner-application",
] as const;

export type TextAlertKind = (typeof TEXT_ALERT_KINDS)[number];

/** A name goes into a text that someone else will read; it never carries a
 *  link, a line break or a control character along with it. */
function safeName(name: string | undefined, fallback: string): string {
  const cleaned = [...(name ?? "")]
    .map((ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? " " : ch))
    .join("")
    .split(/\s+/)
    .filter((word) => word && !/https?|:\/\/|www\./i.test(word))
    .join(" ")
    .slice(0, 30)
    .trim();
  return cleaned || fallback;
}

const COPY: Record<TextAlertKind, Record<TextLanguage, (n: string) => string>> = {
  "assistant-new-task": {
    en: () => "Safehubby: you have a new request. Open the employee portal to see it.",
    es: () => "Safehubby: tienes una solicitud nueva. Abre el portal de empleados para verla.",
  },
  "assistant-message": {
    en: (n) => `Safehubby: ${n} sent you a message. Open the employee portal to reply.`,
    es: (n) => `Safehubby: ${n} te envió un mensaje. Abre el portal de empleados para responder.`,
  },
  "customer-reply": {
    en: (n) => `Safehubby: ${n} answered your message. Open the app to read it.`,
    es: (n) => `Safehubby: ${n} respondió tu mensaje. Abre la app para leerlo.`,
  },
  "customer-spend-request": {
    en: (n) => `Safehubby: ${n} is asking you to approve a purchase. Open the app.`,
    es: (n) => `Safehubby: ${n} te pide aprobar una compra. Abre la app.`,
  },
  "customer-task-done": {
    en: (n) => `Safehubby: ${n} marked your request done. Open the app to see the details.`,
    es: (n) => `Safehubby: ${n} marcó tu solicitud como completada. Abre la app para ver los detalles.`,
  },
  "guardian-sos": {
    en: (n) => `Safehubby: ${n} raised an SOS. Open the app now.`,
    es: (n) => `Safehubby: ${n} activó un SOS. Abre la app ahora.`,
  },
  "guardian-missed-checkin": {
    en: (n) => `Safehubby: ${n} missed a check-in. Open the app.`,
    es: (n) => `Safehubby: ${n} no hizo su check-in. Abre la app.`,
  },
  "owner-application": {
    en: () => "Safehubby: a new job application came in. Open the owner portal to review it.",
    es: () => "Safehubby: llegó una nueva solicitud de empleo. Abre el portal del dueño para revisarla.",
  },
};

export function composeText(kind: TextAlertKind, vars: { name?: string }, language: TextLanguage): string {
  const fallback = language === "es" ? "Tu contacto" : "Someone";
  return COPY[kind][language](safeName(vars.name, fallback));
}
