import { API_ES } from "./server-es-api.ts";
import { CORE_ES } from "./server-es-core.ts";

/**
 * The API and core speak English. Their sentences reach the screen two ways —
 * in responses (plan notes, charge lines, errors) and through constants the
 * app imports from core (plan descriptions, errand sizes, game rules) — and
 * this is where both become Spanish for a Spanish reader.
 *
 * Exact sentences come from the generated tables beside this file; sentences
 * with a number, a date or a name in them are matched by pattern below. A
 * sentence nobody has translated yet stays English rather than breaking, and
 * test/server-es.test.ts fails for the core constants that would show it.
 */
export type Lang = "en" | "es";

const EXACT: Record<string, string> = {
  ...CORE_ES,
  ...API_ES,
  // Names too short for the extractor that builds the tables.
  "Check-ins": "Chequeos", SOS: "SOS", Subscription: "Suscripción", Delivery: "Entrega",
  "First Worried Text": "Primer mensaje preocupado", "Check-In Roulette": "Ruleta de chequeos",
  "Last One Standing": "El último en pie", "Ride Home Race": "Carrera a casa", "Open Mic": "Micrófono abierto",
  Margarita: "Margarita", "Spirit, neat": "Licor, solo", Water: "Agua", "Soda / mocktail": "Refresco / mocktail",
  Coffee: "Café", "Can't be woken": "No se despierta", "Owners' dinner": "Cena con los dueños", Skydiving: "Paracaídas",
  // The Free plan's description is assembled from pieces, one per flag.
  "For one person. Location sharing, check-ins, drink count, SOS, ride booking and secure transport at the provider's real rate, and quick errands — grab something (up to $20) or run an errand. Always free — safety basics are not a paywall.":
    "Para una persona. Compartir ubicación, chequeos, conteo de bebidas, SOS, reserva de viajes y transporte seguro a la tarifa real del proveedor, y mandados rápidos: traer algo (hasta $20) o hacer un mandado. Siempre gratis: lo básico de seguridad no se cobra.",
  "For one person. Location sharing, check-ins, drink count, SOS, ride booking and secure transport at the provider's real rate. Always free — safety basics are not a paywall.":
    "Para una persona. Compartir ubicación, chequeos, conteo de bebidas, SOS, reserva de viajes y transporte seguro a la tarifa real del proveedor. Siempre gratis: lo básico de seguridad no se cobra.",
};

const MONTHS: Record<string, string> = {
  Jan: "ene", Feb: "feb", Mar: "mar", Apr: "abr", May: "may", Jun: "jun",
  Jul: "jul", Aug: "ago", Sep: "sept", Oct: "oct", Nov: "nov", Dec: "dic",
};

/** "Dec 12, 2026", "Sat Dec 12 2026" and "Dec 12" as the server writes them. */
function spanishDate(text: string): string {
  return text
    .replace(/\b(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2}) (\d{4})\b/g,
      (_, m: string, d: string, y: string) => `${Number(d)} de ${MONTHS[m]} de ${y}`)
    .replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2}), (\d{4})\b/g,
      (_, m: string, d: string, y: string) => `${d} de ${MONTHS[m]} de ${y}`)
    .replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2})\b/g,
      (_, m: string, d: string) => `${d} de ${MONTHS[m]}`);
}

const STATUS: Record<string, string> = {
  "in-progress": "en curso", completed: "completada", canceled: "cancelada", cancelled: "cancelada",
  declined: "rechazada", approved: "aprobada", open: "abierta", pending: "pendiente", requested: "pedida",
};
const status = (s: string) => STATUS[s] ?? s;
/** A label from the tables (a category, a feature, a basket), or itself. */
const label = (s: string) => EXACT[s] ?? s;

const CREDENTIAL: Record<string, string> = {
  "liability insurance": "del seguro de responsabilidad civil",
  "firearms licence": "de la licencia de armas",
  "security-guard licence": "de la licencia de guardia de seguridad",
};
const credential = (s: string) => CREDENTIAL[s] ?? s;

/** Lower-cased emergency signs, as the 911 script joins them. */
const lowerLabel = (s: string) => {
  const hit = Object.entries(EXACT).find(([k]) => k.toLowerCase() === s);
  return hit ? hit[1].toLowerCase() : s;
};

type Rule = [RegExp, (...g: string[]) => string];
const PATTERNS: Rule[] = [
  // ---- the plan and its charges
  [/^Free trial — first charge on (.+)\. Cancel before then and you are not billed\.$/, (d) => `Prueba gratis: el primer cobro es el ${spanishDate(d)}. Si cancelas antes, no se te cobra.`],
  [/^Canceled — your plan stays on until (.+), then goes back to free\.$/, (d) => `Cancelado: tu plan sigue activo hasta el ${spanishDate(d)} y luego vuelve a Gratis.`],
  [/^Payment did not go through\. Your features are still on; update your card to keep them past (.+)\.$/, (d) => `El pago no se completó. Tus funciones siguen activas; actualiza tu tarjeta para mantenerlas después del ${spanishDate(d)}.`],
  [/^Renews (.+)\.$/, (d) => `Se renueva el ${spanishDate(d)}.`],
  [/^Free for (\d+) days\. Nothing has been charged — the first payment is on (.+)\.$/, (n, d) => `Gratis por ${n} días. No se ha cobrado nada; el primer pago es el ${spanishDate(d)}.`],
  [/^Plan changed\. (\$[\d,.]+) charged to your card, with any unused part of the old period credited\.$/, (a) => `Plan cambiado. Se cobraron ${a} a tu tarjeta, con crédito por la parte no usada del período anterior.`],
  [/^Plan changed\. (\$[\d,.]+) is due through the store's billing; confirm the purchase to finish\.$/, (a) => `Plan cambiado. Se deben ${a} por la facturación de la tienda; confirma la compra para terminar.`],
  [/^(.+) (monthly|annual) — (\$[\d,.]+) credit applied$/, (p, c, a) => `${p} ${c === "annual" ? "anual" : "mensual"}: crédito de ${a} aplicado`],
  [/^(.+) \((yearly|monthly)\) — paid through Stripe$/, (p, c) => `${p} (${c === "yearly" ? "anual" : "mensual"}), pagado con Stripe`],
  [/^(.+) renewal — paid through Stripe$/, (p) => `Renovación de ${p}, pagada con Stripe`],
  [/^(.+) — launch-party discount (\$[\d,.]+) off$/, (d, a) => `${d}: descuento de la fiesta de lanzamiento de ${a}`],
  [/^Launch party: sign up before (.+) and take (.+) off your first year\.$/, (d, p) => `Fiesta de lanzamiento: inscríbete antes del ${spanishDate(d)} y llévate ${p} de descuento en tu primer año.`],
  [/^Launch party opens (.+): (.+) off your first year for everyone who joins in the window\.$/, (d, p) => `La fiesta de lanzamiento abre el ${spanishDate(d)}: ${p} de descuento en el primer año para todos los que se unan en ese período.`],
  [/^Basic is for members (\d+) and over\. Add your ID to join it\.$/, (n) => `El plan Básico es para socios de ${n} años o más. Añade tu identificación para unirte.`],
  [/^Basic is for members (\d+) and over\.$/, (n) => `El plan Básico es para socios de ${n} años o más.`],
  [/^Stripe could not stop billing your plan, so nothing was changed\.(.*)$/, (rest) => `Stripe no pudo detener el cobro de tu plan, así que no se cambió nada.${rest}`],
  [/^Elite spending allowance — (.+)$/, (m) => `Fondo de gastos Elite: ${m}`],
  // ---- bookings
  [/^Your plan does not include "(.+)"\. Upgrade to unlock it\.$/, (f) => `Tu plan no incluye "${label(f)}". Mejora tu plan para tenerlo.`],
  [/^"(.+)" is part of the extended menu, included with Premium Plus and Family\. Upgrade to unlock it\.$/, (b) => `"${label(b)}" es parte del menú ampliado, incluido en Premium Plus y Familia. Mejora tu plan para tenerlo.`],
  [/^"(.+)" costs more than your cap\. Raise the cap or pick a smaller basket\.$/, (b) => `"${label(b)}" cuesta más que tu límite. Sube el límite o escoge una canasta más pequeña.`],
  [/^Personal concierge is only available in (.+) for now\.$/, (m) => `Por ahora, el concierge personal solo está disponible en ${m.replace(/ and /g, " y ")}.`],
  [/^Safehubby's dispatch service starts on (.+)\. You're signed up and nothing is being charged until then — check-ins, location sharing and SOS work now\.$/, (d) => `El servicio de despacho de Safehubby empieza el ${spanishDate(d)}. Ya estás inscrito y no se cobra nada hasta entonces; los chequeos, compartir ubicación y SOS ya funcionan.`],
  [/^(.+) does not operate where you are right now\.$/, (p) => `${p} no opera donde estás ahora mismo.`],
  [/^Your balance \((\$[\d,.]+)\) does not cover (\$[\d,.]+)\. Add money to it, or add a card\.$/, (b, t) => `Tu balance (${b}) no cubre ${t}. Añádele dinero o añade una tarjeta.`],
  [/^That is all (\d+) of this month's included tasks\. The count resets on the 1st — or a bigger plan carries more\.$/, (n) => `Esas son las ${n} tareas incluidas de este mes. El conteo vuelve a empezar el día 1, o un plan más grande trae más.`],
  [/^This task is already (.+)\.$/, (s) => `Esta tarea ya está ${status(s)}.`],
  [/^This task is (.+) — its card has already been cancelled\.$/, (s) => `Esta tarea está ${status(s)}; su tarjeta ya se canceló.`],
  [/^That purchase is already (.+)\.$/, (s) => `Esa compra ya está ${status(s)}.`],
  [/^No receipt or explanation for (\$[\d,.]+) of spend on this task\.$/, (a) => `No hay recibo ni explicación para ${a} gastados en esta tarea.`],
  [/^Secure transport to (.+)$/, (p) => `Transporte seguro a ${p === "your drop-off" ? "tu destino" : p}`],
  [/^Ride to (.+)$/, (p) => `Viaje a ${p === "home" ? "casa" : p}`],
  [/^(.+) joined with your code$/, (n) => `${n} se unió con tu código`],
  [/^(.+) is full — every seat is already RSVP'd\.$/, (e) => `${label(e)} está lleno: ya todos los asientos están confirmados.`],
  [/^(.+) did not quote this one\. The desk will come back to you\.$/, (d) => `${d} no cotizó este. El servicio te contestará.`],
  [/^(.+) does not cover this one\. The desk will come back to you\.$/, (d) => `${d} no cubre este. El servicio te contestará.`],
  [/^You pay the supplier directly\. Safehubby is paid (\d+)% by them, disclosed up front\.$/, (p) => `Le pagas directamente al proveedor. El proveedor le paga a Safehubby un ${p}%, informado desde el principio.`],
  [/^(.+) isn't eligible for the quick-task discount\.$/, (c) => `${label(c)} no tiene el descuento de tarea rápida.`],
  // ---- the assistants' pay against their market (market-pay.ts)
  [/^Above the top of the (.+) range for this work \((\$\d+-\$\d+)\/hr\)\.$/, (m, r) => `Por encima del tope del rango de ${m} para este trabajo (${r}/h).`],
  [/^In the high-end (.+) range for this work \((\$\d+-\$\d+)\/hr\)\.$/, (m, r) => `En la parte alta del rango de ${m} para este trabajo (${r}/h).`],
  [/^Above the typical (.+) rate \((\$\d+-\$\d+)\/hr\)\.$/, (m, r) => `Por encima de la tarifa típica de ${m} (${r}/h).`],
  [/^(.+) is priced per task, not by the hour\.$/, (c) => `${label(c)} se cobra por tarea, no por hora.`],
  [/^(.+) does not track a flight\.$/, (c) => `${label(c)} no sigue un vuelo.`],
  [/^(.+) is not dispatched for that kind of task\.$/, (n) => `A ${n} no se le envía a ese tipo de tarea.`],
  [/^Book between ([\d.]+) and ([\d.]+) hours\.$/, (a, b) => `Reserva entre ${a} y ${b} horas.`],
  [/^A task can cover between 1 and (\d+) people\.$/, (n) => `Una tarea puede cubrir de 1 a ${n} personas.`],
  [/^Load at least (\$[\d,.]+) onto the card\.$/, (a) => `Carga por lo menos ${a} a la tarjeta.`],
  [/^Spend cap must be between (\$[\d,.]+) and (\$[\d,.]+)\.$/, (a, b) => `El límite de gasto tiene que estar entre ${a} y ${b}.`],
  [/^That is more than what is left of the spend cap \((\$[\d,.]+)\)\.$/, (a) => `Eso es más de lo que queda del límite de gasto (${a}).`],
  [/^Comfortable with up to (\d+) at once — room for (\d+) more$/, (a, b) => `Acepta hasta ${a} a la vez; hay espacio para ${b} más`],
  [/^Set a spending cap between \$0\.01 and (\$[\d,.]+)\.$/, (a) => `Pon un límite de gasto entre $0.01 y ${a}.`],
  // ---- limits and lengths
  [/^Keep the task description under (\d+) characters\.$/, (n) => `La descripción de la tarea tiene que tener menos de ${n} caracteres.`],
  [/^Keep the explanation under (\d+) characters\.$/, (n) => `La explicación tiene que tener menos de ${n} caracteres.`],
  [/^Keep the brief under (\d+) characters\.$/, (n) => `El pedido tiene que tener menos de ${n} caracteres.`],
  [/^Keep a message under (\d+) characters\.$/, (n) => `El mensaje tiene que tener menos de ${n} caracteres.`],
  [/^Keep it under (\d+) characters\.$/, (n) => `Tiene que tener menos de ${n} caracteres.`],
  [/^Voice messages are capped at (\d+) seconds — keep it short\.$/, (n) => `Las notas de voz tienen un máximo de ${n} segundos; que sea corta.`],
  [/^Load at least (\$[\d,.]+) at a time\.$/, (a) => `Añade por lo menos ${a} cada vez.`],
  [/^Load at most (\$[\d,.]+) at a time\.$/, (a) => `Añade como máximo ${a} cada vez.`],
  [/^Your balance can hold at most (\$[\d,.]+)\.$/, (a) => `Tu balance puede tener como máximo ${a}.`],
  [/^Enter a weight between ([\d.]+)kg and ([\d.]+)kg\.$/, (a, b) => `Escribe un peso entre ${a} kg y ${b} kg.`],
  [/^The body-water ratio must be between ([\d.]+) and ([\d.]+)\.$/, (a, b) => `La proporción de agua corporal tiene que estar entre ${a} y ${b}.`],
  [/^Set a drink limit between 1 and (\d+)\.$/, (n) => `Pon un límite de bebidas entre 1 y ${n}.`],
  [/^Grant length must be between 0 and (\d+) hours\.$/, (n) => `El permiso tiene que durar entre 0 y ${n} horas.`],
  [/^A crew can run for up to (\d+) hours\.$/, (n) => `Un grupo puede durar hasta ${n} horas.`],
  [/^A crew tops out at (\d+) people\.$/, (n) => `Un grupo tiene un máximo de ${n} personas.`],
  [/^Enter a vehicle year between (\d+) and (\d+)\.$/, (a, b) => `Escribe un año de vehículo entre ${a} y ${b}.`],
  [/^Enter (\d+) hours a week or fewer\.$/, (n) => `Escribe ${n} horas a la semana o menos.`],
  [/^(.+) needs at least (\d+) players\.$/, (g, n) => `${label(g)} necesita por lo menos ${n} jugadores.`],
  [/^Cover has to be at least (\d+) hours?\.$/, (n) => `La cobertura tiene que ser de por lo menos ${n} ${n === "1" ? "hora" : "horas"}.`],
  [/^A shift has to be at least (\d+) hours?\.$/, (n) => `Un turno tiene que ser de por lo menos ${n} ${n === "1" ? "hora" : "horas"}.`],
  [/^We do not plan cover longer than (\d+) days\. For more than that you want a care agency, not a rota of bookings\.$/, (n) => `No planificamos coberturas de más de ${n} días. Para más tiempo te conviene una agencia de cuidado, no una rotación de reservas.`],
  // ---- credentials
  [/^Enter the (.+) number\.$/, (l) => `Escribe el número ${credential(l)}.`],
  [/^Enter who issued the (.+)\.$/, (l) => `Escribe quién emitió ${credential(l).replace(/^del /, "el ").replace(/^de la /, "la ")}.`],
  [/^Enter when the (.+) expires\.$/, (l) => `Escribe cuándo vence ${credential(l).replace(/^del /, "el ").replace(/^de la /, "la ")}.`],
  [/^That (.+) has already expired\.$/, (l) => `Ese documento ${credential(l)} ya venció.`],
  [/^Attach a copy of the (.+) — a PDF or a clear photo\.$/, (l) => `Adjunta una copia ${credential(l)}: un PDF o una foto clara.`],
  // ---- the night
  [/^Drink count reached (\d+), the limit you both agreed on\.$/, (n) => `El conteo de bebidas llegó a ${n}, el límite que acordaron.`],
  [/^(\d+)\+ drinks in the last hour\. That's a fast pace\.$/, (n) => `${n}+ bebidas en la última hora. Es un ritmo rápido.`],
  [/^They are: (.+)\.$/, (list) => `Tiene esto: ${list.split(", ").map(lowerLabel).join(", ")}.`],
  [/^They've had roughly (\d+) standard drinks over about (\d+) hours\.$/, (d, h) => `Se ha tomado más o menos ${d} bebidas estándar en unas ${h} horas.`],
  [/^At best, roughly (.+) before this is likely back near zero\. Only time does this — nothing on this list speeds it up\.$/, (h) =>
    `En el mejor de los casos, unas ${h.replace(/(\d+) minutes/, "$1 minutos").replace(/(\d+) hours?/, (_, n: string) => `${n} ${n === "1" ? "hora" : "horas"}`)} hasta que probablemente vuelva cerca de cero. Solo el tiempo lo logra; nada de esta lista lo acelera.`],
  [/^(\d+) min ago$/, (n) => `hace ${n} min`],
  [/^(\d+) hours ago$/, (n) => `hace ${n} horas`],
  // ---- flights
  [/^Cancelled — check with (.+) before heading to the airport\.$/, (a) => `Cancelado: consulta con ${a} antes de salir para el aeropuerto.`],
  [/^Diverted — this flight is not landing at (.+)\.$/, (x) => `Desviado: este vuelo no va a aterrizar en ${x}.`],
  [/^Landed (\d+) min ago\.$/, (n) => `Aterrizó hace ${n} min.`],
  [/^In the air, running ~(\d+) min late — now landing ~(.+)\.$/, (n, t) => `En el aire, unos ${n} min tarde; ahora aterriza a eso de las ${t}.`],
  [/^In the air, on time — landing ~(.+)\.$/, (t) => `En el aire, a tiempo; aterriza a eso de las ${t}.`],
  [/^Not departed yet — delayed ~(\d+) min\.$/, (n) => `Todavía no ha salido; atrasado unos ${n} min.`],
  [/^(.+) is cancelled\. Check with (.+) before anyone heads to (.+)\.$/, (f, a, x) => `${f} está cancelado. Consulta con ${a} antes de que alguien salga para ${x}.`],
  [/^(.+) has been diverted and is not landing at (.+)\.$/, (f, x) => `${f} fue desviado y no va a aterrizar en ${x}.`],
  [/^(.+) has landed at (.+)$/, (f, x) => `${f} aterrizó en ${x}`],
  [/^(.+) is running (\d+) min later — now landing around (.+)$/, (f, n, t) => `${f} viene ${n} min más tarde; ahora aterriza a eso de las ${t}`],
  [/^(.+) is arriving (\d+) min early — now landing around (.+)$/, (f, n, t) => `${f} llega ${n} min antes; ahora aterriza a eso de las ${t}`],
  [/^(.+) has moved to gate (.+) at (.+)\.$/, (f, g, x) => `${f} cambió a la puerta ${g} en ${x}.`],
  [/^(.+) has moved to Terminal (.+) at (.+)\.$/, (f, t, x) => `${f} cambió a la terminal ${t} en ${x}.`],
];

/**
 * A charge line for a booked task: "<category> — <the customer's note>
 * (<fee terms>)", cut at 160 characters. The note is the customer's own words
 * and stays as written; the category and the fee terms are ours. Each term is
 * matched on its own, because the cut can land in the middle of the list.
 */
const FEE_TERMS: [RegExp, string][] = [
  [/no service fee — included in your plan/, "sin cargo de servicio: incluido en tu plan"],
  [/(\$[\d,.]+) paid by your plan's errand credit/, "$1 pagados con el crédito de mandados de tu plan"],
  [/([\d.]+) hr included in your plan/, "$1 h incluidas en tu plan"],
  [/(\$[\d,.]+) service fee included/, "cargo de servicio de $1 incluido"],
  [/(\$[\d,.]+) service fee/, "cargo de servicio de $1"],
  [/, paid from your balance/, ", pagado de tu balance"],
];
function taskChargeLine(text: string): string | null {
  const dash = text.indexOf(" — ");
  if (dash < 0) return null;
  const category = text.slice(0, dash);
  if (!(category in CORE_ES)) return null;
  let rest = text.slice(dash);
  const open = rest.lastIndexOf(" (");
  if (open >= 0) {
    let terms = rest.slice(open);
    for (const [re, es] of FEE_TERMS) terms = terms.replace(re, es);
    rest = rest.slice(0, open) + terms;
  }
  return CORE_ES[category] + rest;
}

/** Spanish for one sentence the server or core wrote, or null if none is known. */
export function spanishFor(text: string): string | null {
  const exact = EXACT[text];
  if (exact !== undefined) return exact;
  for (const [re, to] of PATTERNS) {
    const m = re.exec(text);
    if (m) return to(...m.slice(1));
  }
  return taskChargeLine(text);
}

/** A sentence in the reader's language: unchanged in English, or when no Spanish is known. */
export function localized(text: string, lang: Lang): string {
  return lang === "es" ? spanishFor(text) ?? text : text;
}

/**
 * Every sentence in a response, in the reader's language. Only whole strings
 * that match a known sentence change, so ids, statuses, amounts and what
 * people typed pass through untouched; long strings (photos, voice clips) are
 * skipped without being read.
 */
export function localizeDeep<T>(value: T, lang: Lang): T {
  if (lang !== "es") return value;
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return v.length > 600 ? v : spanishFor(v) ?? v;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) out[k] = walk(x);
      return out;
    }
    return v;
  };
  return walk(value) as T;
}
