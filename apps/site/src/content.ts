import {
  CLUB_BASE_DUES_CENTS, CLUB_EXPERIENCES, ERRAND_TIERS, INCLUDED_GRABS_PER_MONTH, LAUNCH_DISCOUNT_RATE,
  LAUNCH_WINDOW_START, MIN_BOOKED_HOURS, PA_HOURLY_RATE_CENTS, QUICK_TASK_ASSISTANT_PAYOUT_CENTS,
  SERVICE_LIVE_AT, customerServiceFeeFor, duesForCents, errandFeeCents, isHourlyCategory, isQuickTaskEligible,
  releasedPlans, type ConciergeCategory, type ErrandTierId, type Plan, type PlanId,
} from "@safehubby/core";

/**
 * The marketing site's copy, and the facts it is not allowed to invent.
 *
 * The split matters. **Prices and dates come from `@safehubby/core`** —
 * they are the things that have changed repeatedly and that a stale
 * marketing page would misrepresent to somebody about to pay. Prose lives
 * here, because marketing language is not the same as an in-app label and
 * pretending otherwise produces a website that reads like a settings screen.
 *
 * Nothing here is rendered for a plan the app has not released: `featuredPlans`
 * filters `releasedPlans()`, so a tier held behind a flag cannot be advertised
 * by accident.
 */

export type Lang = "en" | "es";
export const LANGS: Lang[] = ["en", "es"];

/** The canonical origin, used for hreflang and the sitemap. Overridden by
 *  SITE_ORIGIN once a real domain exists. */
export const ORIGIN = process.env.SITE_ORIGIN ?? "https://safehubby-app-production.up.railway.app";

/** Where a visitor goes to actually sign up. The app, not this site. */
export const APP_URL = "https://safehubby-app-production.up.railway.app";

/**
 * The number to call, digits only with country code.
 *
 * It sits in the header on every page rather than only in a contact section,
 * because the reader this site is written for is often somebody's 78-year-old
 * father who will phone before he reads — and a daughter who is already
 * worried should not have to scroll a sales page to find a human.
 */
export const PHONE = "19392450171";

/** +1 (939) 245-0171, from 19392450171. Falls back to a plain + form for
 *  anything that is not a NANP number. */
export function formatPhone(digits: string): string {
  const d = digits.replace(/\D/g, "");
  const m = /^1(\d{3})(\d{3})(\d{4})$/.exec(d);
  return m ? `+1 (${m[1]}) ${m[2]}-${m[3]}` : `+${d}`;
}

/** A dialable link, so tapping it on a phone starts the call. */
export function phoneHref(digits: string): string {
  return `tel:+${digits.replace(/\D/g, "")}`;
}

/**
 * The WhatsApp business number, digits only with country code (a Puerto Rico
 * line is `1787…` or `1939…`). Empty until there is a real one, and the
 * contact section simply omits WhatsApp while it is — printing a dead
 * `wa.me` link is worse than offering only a phone number, because the reader
 * cannot tell it failed.
 */
export const WHATSAPP = (process.env.SITE_WHATSAPP ?? "").replace(/\D/g, "");

/** The click-to-chat link WhatsApp itself documents. */
export function whatsappHref(digits: string): string {
  return `https://wa.me/${digits.replace(/\D/g, "")}`;
}

/** The same formatting as a phone number — it is one. */
export const whatsappLabel = formatPhone;

export function money(cents: number): string {
  if (cents === 0) return "$0";
  return cents % 100 === 0
    ? `$${(cents / 100).toLocaleString("en-US")}`
    : `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(iso: string, lang: Lang): string {
  return new Date(iso).toLocaleDateString(lang === "es" ? "es-PR" : "en-US", {
    year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
  });
}

/**
 * Every tier the app has released, in ladder order.
 *
 * All of them, on purpose. The ladder runs from free to $60,000 a month and
 * that span *is* the product: the same company brings a $3 juice to a
 * hospital room and charters a jet, and a reader who only ever sees the
 * bottom three has been told a smaller story than the true one.
 *
 * The earlier version of this page showed three and hid the rest, which
 * solved the wrong problem — seven cards stacked vertically was a wall, but
 * the fix for a wall is to lay it sideways, not to knock most of it down.
 * They render as a swipeable rail; see `.plan-rail` in render.ts.
 */
export function featuredPlans(): Plan[] {
  return releasedPlans();
}

export interface Service {
  title: string;
  body: string;
  /** Which concierge category this is, so the price on the page comes from
   *  the rate card rather than from a number somebody typed into marketing
   *  copy and forgot to update. Absent where there is no per-task price. */
  category?: ConciergeCategory;
  /** What to say instead, where there is no price of ours to quote. */
  priceNote?: string;
}

/**
 * The cheapest this task can be: one person, the shortest bookable length,
 * the quick-task rate where the category qualifies, and a free account's
 * first grab of the month — which is $0, because the plan includes it.
 *
 * It is a floor, not a quote — the page says "from". The real number depends
 * on plan, hours, headcount and what is left of the month's allowance, and is
 * worked out by the same function the app charges with, which is the point
 * of reading it from core here.
 */
export function startingPriceCents(category: ConciergeCategory): number {
  const errand = isQuickTaskEligible(category);
  return customerServiceFeeFor({
    planId: "free",
    category,
    quickTask: errand,
    // The smallest errand, at the reference spend below.
    ...(errand ? { errandTier: "in-building" as const, spendCapCents: TIER_REFERENCE_CAP_CENTS } : {}),
    hours: isHourlyCategory(category) ? MIN_BOOKED_HOURS : undefined,
    usedThisMonth: 0,
  });
}

/** The purchase the page quotes errand fees against. The fee rises a little
 *  with a bigger item — the card charges more on it — so the page says what
 *  it assumed rather than implying one number fits every purchase. */
export const TIER_REFERENCE_CAP_CENTS = 2_000;

export interface TierRow { id: ErrandTierId; label: string; example: string; minutes: number; feeCents: number }

const TIER_WORDS: Record<Lang, Record<ErrandTierId, { label: string; example: string }>> = {
  en: {
    "in-building": { label: "In the building", example: "A soda or snack from the cafeteria or gift shop" },
    "nearby-store": { label: "Nearby store", example: "A phone charger, snacks, toiletries" },
    "shopping-trip": { label: "Shopping trip", example: "A blanket, clothes, a few stops" },
    "wait-in-line": { label: "Wait in line", example: "A restaurant order or a pharmacy line" },
  },
  es: {
    "in-building": { label: "Dentro del edificio", example: "Un refresco o un bocadillo de la cafetería o la tienda" },
    "nearby-store": { label: "Tienda cercana", example: "Un cargador, bocadillos, artículos de aseo" },
    "shopping-trip": { label: "Viaje de compras", example: "Una frisa, ropa, varias paradas" },
    "wait-in-line": { label: "Hacer fila", example: "Un pedido de restaurante o la fila de la farmacia" },
  },
};

/** The four errand sizes with their fees, from the same functions the app
 *  charges with — never typed in here. */
export function errandTierRows(lang: Lang): TierRow[] {
  return ERRAND_TIERS.map((t) => ({
    id: t.id, minutes: t.minutes, ...TIER_WORDS[lang][t.id],
    feeCents: errandFeeCents(t.id, TIER_REFERENCE_CAP_CENTS),
  }));
}

/** How many no-fee grabs a free account gets a month, for the copy. */
export const FREE_INCLUDED_GRABS = INCLUDED_GRABS_PER_MONTH.free ?? 0;

/** The Wingman Club's dues, as the span they actually move across: a flat
 *  base plus whatever that month's experience costs at the negotiated rate. */
export function clubDuesRangeCents(): { base: number; low: number; high: number } {
  const dues = CLUB_EXPERIENCES.map(duesForCents);
  return { base: CLUB_BASE_DUES_CENTS, low: Math.min(...dues), high: Math.max(...dues) };
}

/** Every experience in the rotation, newest naming from core. */
export function clubExperiences(): string[] {
  return CLUB_EXPERIENCES.map((e) => e.label);
}

export interface Copy {
  htmlLang: string;
  title: string;
  description: string;
  otherLang: { href: string; label: string };
  workHref: string;

  heroEyebrow: string;
  heroTitle: string;
  heroBody: string;
  heroCta: string;
  heroCtaNote: string;

  whatHeading: string;
  /** Who this is actually for, in one sentence, before the list of services. */
  whatLede: string;
  tiersHeading: string;
  tiersNote: string;
  minutesLabel: string;
  services: Service[];

  pricingHeading: string;
  pricingLede: string;
  perMonth: string;
  seatsOne: string;
  seatsMany: (n: number) => string;
  freeLabel: string;
  /** Short, site-owned. The core blurbs are in-app feature lists; a landing
   *  page needs a sentence, not a manifest. Prices still come from core. */
  planBlurbs: Partial<Record<PlanId, string>>;
  morePlans: string;
  pricingNote: string;
  /** "from", as in "from $5" — a floor, never a quote. */
  fromLabel: string;

  clubHeading: string;
  clubBody: string;
  clubDues: string;
  clubPerk: string;
  clubRotation: string;

  contactHeading: string;
  contactBody: string;

  workLink: string;
  disclaimer: string;
  footerNote: string;
}

/** The hiring page. Its own page because it is its own audience: somebody
 *  deciding whether to trust us with their father has no use for our payroll,
 *  and somebody looking for work should not have to read a sales pitch. */
export interface WorkCopy {
  htmlLang: string;
  title: string;
  description: string;
  otherLang: { href: string; label: string };
  heading: string;
  lede: string;
  rate: string;
  errand: string;
  cta: string;
  back: string;
}

const liveDate = (lang: Lang) => formatDate(SERVICE_LIVE_AT, lang);
const openDate = (lang: Lang) => formatDate(LAUNCH_WINDOW_START, lang);
const discountPercent = Math.round(LAUNCH_DISCOUNT_RATE * 100);
const paRate = money(PA_HOURLY_RATE_CENTS);
const quickTask = money(QUICK_TASK_ASSISTANT_PAYOUT_CENTS["grab-something"] ?? 0);

const DISCLAIMER = {
  en: "Safehubby LLC is in formation. Safehubby is not an emergency service and never tells anyone they are safe to drive. In an emergency, call your local emergency number first.",
  es: "Safehubby LLC está en proceso de formación. Safehubby no es un servicio de emergencia y nunca le dice a nadie que puede manejar. En una emergencia, llama primero al número de emergencias de tu área.",
} as const;

export const COPY: Record<Lang, Copy> = {
  en: {
    htmlLang: "en",
    title: "Safehubby — get home safe, never alone",
    description:
      "Someone checks on the people you love. An errand run, a ride arranged, a person who comes and stays. Serving Puerto Rico, Texas and Los Angeles.",
    otherLang: { href: "/es/", label: "Español" },
    workHref: "/work/",

    heroEyebrow: "Puerto Rico · Texas · Los Angeles",
    heroTitle: "Someone will bring it to you.",
    heroBody:
      "A juice, a phone charger, a blanket — to a hospital room, or to a house where somebody lives alone. Safehubby sends a real person, at a spend cap you set. Free to start, all the way up to a full concierge desk.",
    heroCta: "Start free",
    heroCtaNote: `No contract. Your first ${FREE_INCLUDED_GRABS} runs a month have no service fee — you pay only for what we buy.`,

    whatHeading: "What we do",
    tiersHeading: "Errands, by size",
    tiersNote: `The fee covers the runner's time and travel. Shown for a ${money(TIER_REFERENCE_CAP_CENTS)} purchase; it rises slightly with a bigger one, because the card charges more on it. You pay for the item at cost.`,
    minutesLabel: "min",
    whatLede:
      "The person we built this for is in a hospital bed at nine at night, thirsty, with nobody to ask. Everything here starts from that.",
    services: [
      { title: "Grab something", category: "grab-something", body: `A juice, a charger, a blanket — bought and brought to your room or your door. You pay for the item; ${FREE_INCLUDED_GRABS} a month come with no fee on the free plan, more on every paid one.` },
      { title: "Run an errand", category: "run-errand", body: "Groceries, the bank, the pharmacy — one trip, at a spending cap you set." },
      { title: "Wait with someone", category: "wait-with-someone", body: "A vetted assistant who comes and stays. A hospital wait, a bad night." },
      { title: "Check on someone", category: "check-in-person", body: "Someone goes and looks, then tells you." },
      { title: "Arrange a ride", priceNote: "At the provider's own rate", body: "We book it and watch it — no markup on the fare." },
      { title: "Check-ins and SOS", priceNote: "Free on every plan", body: "A guardian is alerted the moment a check-in is missed." },
    ],

    pricingHeading: "What it costs",
    pricingLede: "Seven ways in, from a juice brought to your room for the price of the juice, to a desk that answers 24/7. Swipe across.",
    perMonth: "/month",
    seatsOne: "1 person",
    seatsMany: (n) => `Up to ${n} people`,
    freeLabel: "Always free",
    planBlurbs: {
      free: `Someone brings you one thing — a juice, a charger — up to $20, with no fee on ${FREE_INCLUDED_GRABS} a month. Plus check-ins, SOS and ride booking.`,
      "premium-basic": "An assistant who runs the errand, waits with someone, or goes to check on them for you.",
      "premium-plus": "Everything Premium does, for two people, with no ceiling on what goes on the card.",
      family: "The same service for a whole household, on one account.",
      elite: "A desk that answers 24/7, a concierge physician's retainer included, and jet, villa and yacht booking.",
      "elite-signature": "The same desk for two, with fifty hours a month of an assistant who knows your household.",
      "elite-private": "A named team, two hundred hours a month, and a doctor who comes to the house.",
    },
    morePlans: "Every plan cancels in one tap, from the app.",
    fromLabel: "from",

    clubHeading: "The Wingman Club",
    clubBody:
      "An add-on, on top of whichever plan you are on. One membership, and once a month the club's pick is revealed — the same outing for everybody that month, booked as a group at a rate none of you would get at the door.",
    clubDues: "{base} a month, plus that month's outing at exactly what the venue charges us. In practice {low} to {high}, depending on the pick.",
    clubPerk: "A cigar and a drink of your choice at every event, whatever the month lands on. Folded into the group rate, never an extra line.",
    clubRotation: "In the rotation:",
    pricingNote:
      `Sign-ups open ${openDate("en")}. Service goes live ${liveDate("en")}, and nobody is charged a day before that. Sign up early and keep ${discountPercent}% off your first year.`,

    contactHeading: "Talk to a person",
    contactBody: "Questions, press, or a family who needs something sooner rather than later.",

    workLink: "Work with us",
    disclaimer: DISCLAIMER.en,
    footerNote: "Your location and check-in history are yours. Never sold, never used for ad targeting.",
  },

  es: {
    htmlLang: "es",
    title: "Safehubby — llega a casa seguro, nunca solo",
    description:
      "Alguien pasa a ver a las personas que quieres. Una diligencia, un viaje coordinado, alguien que se queda un rato. Puerto Rico, Texas y Los Ángeles.",
    otherLang: { href: "/", label: "English" },
    workHref: "/es/trabajo/",

    heroEyebrow: "Puerto Rico · Texas · Los Ángeles",
    heroTitle: "Alguien te lo lleva.",
    heroBody:
      "Un jugo, un cargador, una frisa — a un cuarto de hospital, o a una casa donde alguien vive solo. Safehubby envía a una persona de verdad, con el tope de gasto que tú pongas. Empieza gratis, y llega hasta un servicio de concierge completo.",
    heroCta: "Empieza gratis",
    heroCtaNote: `Sin contrato. Tus primeras ${FREE_INCLUDED_GRABS} al mes no llevan cargo por servicio — pagas solo lo que compramos.`,

    whatHeading: "Lo que hacemos",
    tiersHeading: "Diligencias, por tamaño",
    tiersNote: `El cargo cubre el tiempo y el viaje de quien lo hace. Se muestra para una compra de ${money(TIER_REFERENCE_CAP_CENTS)}; sube un poco con una compra mayor, porque la tarjeta cobra más. El artículo lo pagas al costo.`,
    minutesLabel: "min",
    whatLede:
      "La persona para quien hicimos esto está en una cama de hospital a las nueve de la noche, con sed, y no tiene a quién pedirle. Todo aquí sale de ahí.",
    services: [
      { title: "Traer algo", category: "grab-something", body: `Un jugo, un cargador, una frisa — comprado y llevado a tu cuarto o a tu puerta. Pagas el artículo; ${FREE_INCLUDED_GRABS} al mes van sin cargo en el plan gratis, y más en cada plan pagado.` },
      { title: "Hacer una diligencia", category: "run-errand", body: "La compra, el banco, la farmacia — un viaje, con el tope de gasto que pongas." },
      { title: "Acompañar a alguien", category: "wait-with-someone", body: "Un asistente verificado que llega y se queda. Una espera en el hospital, una mala noche." },
      { title: "Pasar a ver a alguien", category: "check-in-person", body: "Alguien va, mira, y te dice." },
      { title: "Coordinar un viaje", priceNote: "A la tarifa del proveedor", body: "Lo reservamos y lo seguimos — sin recargo sobre la tarifa." },
      { title: "Registros y SOS", priceNote: "Gratis en todos los planes", body: "Un guardián recibe alerta en el momento en que se falla un registro." },
    ],

    pricingHeading: "Cuánto cuesta",
    pricingLede: "Siete maneras de entrar, desde un jugo llevado a tu cuarto por lo que cuesta el jugo, hasta un servicio que contesta 24/7. Desliza.",
    perMonth: "/mes",
    seatsOne: "1 persona",
    seatsMany: (n) => `Hasta ${n} personas`,
    freeLabel: "Siempre gratis",
    planBlurbs: {
      free: `Alguien te trae una cosa — un jugo, un cargador — hasta $20, sin cargo ${FREE_INCLUDED_GRABS} veces al mes. Más registros, SOS y viajes.`,
      "premium-basic": "Un asistente que hace la diligencia, acompaña a alguien, o pasa a verlo por ti.",
      "premium-plus": "Todo lo de Premium, para dos personas, sin tope en lo que va en la tarjeta.",
      family: "El mismo servicio para todo un hogar, en una sola cuenta.",
      elite: "Un servicio que contesta 24/7, el retainer de un médico concierge incluido, y reservas de jet, villa y yate.",
      "elite-signature": "El mismo servicio para dos, con cincuenta horas al mes de un asistente que conoce tu hogar.",
      "elite-private": "Un equipo asignado, doscientas horas al mes, y un médico que va a la casa.",
    },
    morePlans: "Todos los planes se cancelan con un toque, desde la app.",
    fromLabel: "desde",

    clubHeading: "El Wingman Club",
    clubBody:
      "Un añadido, sobre el plan que ya tengas. Una sola membresía, y una vez al mes se revela la actividad del club — la misma para todos ese mes, reservada en grupo a un precio que ninguno conseguiría por su cuenta.",
    clubDues: "{base} al mes, más la actividad de ese mes a exactamente lo que nos cobra el lugar. En la práctica entre {low} y {high}, según la que toque.",
    clubPerk: "Un cigarro y un trago de tu elección en cada evento, sea cual sea la actividad del mes. Va incluido en la tarifa de grupo, nunca como un cargo aparte.",
    clubRotation: "En la rotación:",
    pricingNote:
      `Los registros abren el ${openDate("es")}. El servicio arranca el ${liveDate("es")}, y a nadie se le cobra ni un día antes. Regístrate temprano y quédate con ${discountPercent}% de descuento el primer año.`,

    contactHeading: "Habla con una persona",
    contactBody: "Preguntas, prensa, o una familia que necesita algo pronto.",

    workLink: "Trabaja con nosotros",
    disclaimer: DISCLAIMER.es,
    footerNote: "Tu ubicación y tu historial son tuyos. Nunca se venden, y nunca se usan para publicidad dirigida.",
  },
};

export const WORK_COPY: Record<Lang, WorkCopy> = {
  en: {
    htmlLang: "en",
    title: "Work with Safehubby — one flat rate, every market",
    description:
      `${paRate} an hour for personal assistants in Puerto Rico, Texas and Los Angeles. Liability insurance from day one.`,
    otherLang: { href: "/es/trabajo/", label: "Español" },
    heading: "Work with us",
    lede:
      "One flat rate in every market we operate in. We do not pay somebody less for the same job because of where they live.",
    rate: `${paRate} an hour for a personal assistant`,
    errand: `${quickTask} per quick task for errand runners, and liability insurance for everyone on the roster from day one.`,
    cta: "See open roles",
    back: "Safehubby",
  },
  es: {
    htmlLang: "es",
    title: "Trabaja con Safehubby — la misma tarifa en todos los mercados",
    description:
      `${paRate} por hora para asistentes personales en Puerto Rico, Texas y Los Ángeles. Seguro de responsabilidad civil desde el primer día.`,
    otherLang: { href: "/work/", label: "English" },
    heading: "Trabaja con nosotros",
    lede:
      "La misma tarifa en todos los mercados donde operamos. No le pagamos menos a nadie por el mismo trabajo según dónde viva.",
    rate: `${paRate} por hora para asistente personal`,
    errand: `${quickTask} por tarea rápida para quienes hacen diligencias, y seguro de responsabilidad civil para todo el equipo desde el primer día.`,
    cta: "Ver puestos disponibles",
    back: "Safehubby",
  },
};
