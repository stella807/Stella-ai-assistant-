/**
 * Safehubby's WhatsApp line. One number for the site, the app and the search
 * pages, so a visitor never finds two different ways to reach us.
 *
 * Links go to wa.me, WhatsApp's own click-to-chat address: a plain link, no
 * script, so it works under the site's content security policy and on phones
 * that do not have the app (WhatsApp shows its web page instead).
 */
export const WHATSAPP_NUMBER = "19392450171";

/** The number as people read it. */
export const WHATSAPP_DISPLAY = "+1 (939) 245-0171";

const GREETING = {
  en: "Hi! I'd like to know more about Safehubby.",
  es: "¡Hola! Quiero saber más sobre Safehubby.",
} as const;

/** A wa.me link that opens a chat with the first message already written, in the visitor's language. */
export function whatsappLink(lang: "en" | "es"): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(GREETING[lang])}`;
}
