/**
 * What a family asks first: who comes, where, and what to do if something goes wrong. Shown above the plans. Only what
 * is true today, and a test holds it to that: there is one assistant (the founder), the selfie swap is optional in the app,
 * and nothing here claims a network, 24/7 cover or a guarantee. The phone number lives in the contact line and the footer,
 * not here. The same words are on the static site in apps/site/src/content.ts.
 */
export interface TrustItem { title: string; body: string }
export interface TrustCopy { heading: string; items: TrustItem[]; whatsapp: string }

export function trustCopy(lang: "en" | "es"): TrustCopy {
  if (lang === "es") {
    return {
      heading: "Quién llega, dónde, y qué pasa si algo sale mal",
      whatsapp: "Escríbenos por WhatsApp",
      items: [
        { title: "Quién llega", body: "Ves la foto y una breve biografía de tu asistente y eliges quién va. Por ahora hay un solo asistente, el fundador; se sumarán más. Antes de encontrarse, cada uno puede compartir una selfie." },
        { title: "Dónde", body: "Todo Puerto Rico. Texas y Los Ángeles vienen después." },
        { title: "Si algo sale mal", body: "En una emergencia, llama primero al 911: no somos un servicio de emergencia. Para cualquier otra cosa, escríbenos por WhatsApp y te contesta una persona." },
        { title: "Si tu asistente se atrasa", body: "Te llama directamente, te explica el motivo y te da una hora aproximada de llegada." },
        { title: "Tu dinero", body: "Tu asistente nunca usa tu tarjeta: paga con una hecha para esa tarea, con tu tope. Puede negarse a cualquier cosa que no sea segura." },
      ],
    };
  }
  return {
    heading: "Who comes, where, and what happens if something goes wrong",
    whatsapp: "Message us on WhatsApp",
    items: [
      { title: "Who comes", body: "You see your assistant's photo and short bio and choose who comes. Right now there is one assistant, the founder; more will join. You can each share a selfie before you meet." },
      { title: "Where", body: "All of Puerto Rico. Texas and Los Angeles are next." },
      { title: "If something goes wrong", body: "In an emergency, call 911 first: we are not an emergency service. For anything else, message us on WhatsApp and a person answers." },
      { title: "If your assistant is running late", body: "They call you themselves, tell you why, and give an approximate arrival time." },
      { title: "Your money", body: "Your assistant never uses your own card: they pay with one made for that task, capped at your limit. They can say no to anything unsafe." },
    ],
  };
}
