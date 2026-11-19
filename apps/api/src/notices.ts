/**
 * What changed at Safehubby, and where the hurricane-season calendar stands. Every agent polls with its own `since`, so any
 * number of agents can follow it and nothing is kept per agent. These are notices about what Safehubby publishes and the
 * calendar, never weather forecasts or official warnings.
 */
export type Words = { en: string; es: string };
export interface Notice { id: string; at: string; kind: "new" | "season"; title: Words; text: Words }

const w = (en: string, es: string): Words => ({ en, es });

/** Added by hand, newest last, each with the date it took effect. */
export const NOTICES: Notice[] = [
  {
    id: "book-delegating", at: "2026-11-19T00:00:00Z", kind: "new",
    title: w("New book: Delegating Real-World Tasks", "Libro nuevo: Delegating Real-World Tasks"),
    text: w("A playbook for agents that hand work to human helpers. Every book now opens with a quick reference for agents: rules, a request to fill in and stop signs.",
      "Una guía para agentes que le encargan trabajo a personas. Cada libro ahora abre con una referencia rápida para agentes: reglas, un pedido para llenar y señales de parar."),
  },
  {
    id: "store-check-alerts-approval", at: "2026-11-19T00:00:00Z", kind: "new",
    title: w("New in the agent store: request check, this alerts feed and the approval page", "Nuevo en la tienda para agentes: revisión de pedidos, este aviso de cambios y la página de aprobación"),
    text: w("The request check says what a request is missing before you send it to a person. The approval page is plain text an agent can show the person it works for. Both are listed in the catalog.",
      "La revisión de pedidos dice qué le falta a un pedido antes de enviarlo a una persona. La página de aprobación es texto que un agente puede mostrarle a la persona para la que trabaja. Ambas están en el catálogo."),
  },
  {
    id: "live-answers", at: "2026-11-19T00:00:00Z", kind: "new",
    title: w("New: live answers, read from official sources when you ask", "Nuevo: respuestas en vivo, leídas de fuentes oficiales cuando usted pregunta"),
    text: w("Active storm and flood alerts for Puerto Rico from the National Weather Service, and delays, ground programs and closures at US and Puerto Rico airports from the FAA. Each answer names its source and the time it was read. If a source cannot be reached you are not charged.",
      "Alertas activas de tormentas e inundaciones para Puerto Rico del Servicio Nacional de Meteorología, y retrasos, programas en tierra y cierres en aeropuertos de EE. UU. y Puerto Rico de la FAA. Cada respuesta indica su fuente y la hora en que se leyó. Si no se puede alcanzar la fuente, no se cobra."),
  },
  {
    id: "live-answers-price", at: "2026-11-19T23:00:00Z", kind: "new",
    title: w("Live answers now cover much more, at $0.25", "Las respuestas en vivo ahora cubren mucho más, a $0.25"),
    text: w("Weather answers now bundle the satellite, tropical storms, power across the island and Puerto Rico's airports; airport answers add signs of delays before they are posted and a year of on-time history. Weather and airport answers are $0.25; a power question alone stays $0.10. You are still not charged when there is no answer.",
      "Las respuestas del tiempo ahora incluyen el satélite, las tormentas tropicales, la luz en toda la isla y los aeropuertos de Puerto Rico; las de aeropuertos añaden señales de retrasos antes de que se anuncien y un año de historial de puntualidad. Tiempo y aeropuertos cuestan $0.25; una pregunta solo de luz sigue a $0.10. Si no hay respuesta, no se cobra."),
  },
];

const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** The Atlantic hurricane season: June 1 to November 30. */
export function seasonOn(now: Date) {
  const y = now.getUTCFullYear();
  const start = day(y, 6, 1), end = day(y, 11, 30);
  const inSeason = now >= start && now < new Date(end.getTime() + 86_400_000);
  const nextStart = now < start ? start : day(y + 1, 6, 1);
  return inSeason
    ? { inSeason, startsOn: iso(start), endsOn: iso(end), daysLeft: Math.floor((end.getTime() - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / 86_400_000) }
    : { inSeason, startsOn: iso(nextStart), endsOn: iso(day(nextStart.getUTCFullYear(), 11, 30)) };
}

/** The most recent season boundary, as a notice, so an agent that has not asked since then is told. */
function boundaryNotice(now: Date): Notice {
  const y = now.getUTCFullYear();
  const opened = day(y, 6, 1), closed = day(y, 12, 1);
  if (now >= closed) return {
    id: `season-closed-${y}`, at: closed.toISOString(), kind: "season",
    title: w(`The ${y} Atlantic hurricane season has ended`, `La temporada de huracanes del Atlántico de ${y} terminó`),
    text: w("The season ran June 1 to November 30. Storms are less likely after it, not impossible. For any storm, follow the National Weather Service and local officials.",
      "La temporada fue del 1 de junio al 30 de noviembre. Las tormentas son menos probables después, pero no imposibles. Ante cualquier tormenta, siga al Servicio Nacional de Meteorología y a las autoridades locales."),
  };
  if (now >= opened) return {
    id: `season-open-${y}`, at: opened.toISOString(), kind: "season",
    title: w(`The ${y} Atlantic hurricane season is under way`, `La temporada de huracanes del Atlántico de ${y} está en curso`),
    text: w("The season runs June 1 to November 30. When planning travel for someone, ask about storm insurance and the lodging's storm plan. For any storm, follow the National Weather Service and local officials.",
      "La temporada va del 1 de junio al 30 de noviembre. Al planear un viaje para alguien, pregunte por el seguro contra tormentas y el plan del alojamiento. Ante cualquier tormenta, siga al Servicio Nacional de Meteorología y a las autoridades locales."),
  };
  return {
    id: `season-closed-${y - 1}`, at: day(y - 1, 12, 1).toISOString(), kind: "season",
    title: w(`The ${y - 1} Atlantic hurricane season has ended`, `La temporada de huracanes del Atlántico de ${y - 1} terminó`),
    text: w("The next season starts June 1.", "La próxima temporada empieza el 1 de junio."),
  };
}

/** Everything newer than `since` (or everything, with none), oldest first. */
export function noticesSince(now: Date, since?: Date): Notice[] {
  const all = [...NOTICES, boundaryNotice(now)].filter((n) => new Date(n.at) <= now);
  return all.filter((n) => !since || new Date(n.at) > since).sort((a, b) => a.at.localeCompare(b.at));
}
