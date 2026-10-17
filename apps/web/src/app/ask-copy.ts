/**
 * The words on Get help and Ask an assistant, in English and Spanish. The
 * choice names come from core in English; Spanish names are kept here by id,
 * falling back to the English one for anything new.
 */
export type Lang = "en" | "es";

const WORDS = {
  en: {
    kicker: "Your assistant", title: "Get help", ask: "Ask an assistant", need: "What do you need?",
    send: "Send it", placeholder: "Tell your assistant what you need…", deskPlaceholder: "Book the dentist, any afternoon after the 12th",
    tabs: { concierge: "Send an assistant", ride: "Rides", club: "Wingman Club", elite: "Elite desk" } as Record<string, string>,
  },
  es: {
    kicker: "Tu asistente", title: "Pide ayuda", ask: "Pídele a un asistente", need: "¿Qué necesitas?",
    send: "Enviar", placeholder: "Dile a tu asistente lo que necesitas…", deskPlaceholder: "Saca cita con el dentista, cualquier tarde después del 12",
    tabs: { concierge: "Envía un asistente", ride: "Viajes", club: "Wingman Club", elite: "Escritorio Elite" } as Record<string, string>,
  },
};

const ES_LABELS: Record<string, string> = {
  "wait-with-someone": "Acompañar a alguien",
  "check-in-person": "Visitar a alguien",
  "book-and-buy": "Reservar o comprar",
  "airport-pickup": "Recogido en el aeropuerto",
  "grab-something": "Traer algo",
  "run-errand": "Hacer un mandado",
  appointment: "Sacar una cita",
  reminder: "Recordatorio",
  message: "Escribir o enviar algo",
  research: "Buscar información",
  paperwork: "Trámites",
};

export const askWords = (lang: Lang) => WORDS[lang];

/** A choice's name in the customer's language. */
export function choiceLabel(id: string, english: string, lang: Lang): string {
  return lang === "es" ? ES_LABELS[id] ?? english : english;
}
