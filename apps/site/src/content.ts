import {
  CLUB_BASE_DUES_CENTS, CLUB_EXPERIENCES, ERRAND_MILEAGE_CENTS, ERRAND_REFERENCE_CAP_CENTS, ERRAND_TIERS, INCLUDED_GRABS_PER_MONTH, LAUNCH_DISCOUNT_RATE,
  LAUNCH_WINDOW_END, MIN_BOOKED_HOURS, PA_HOURLY_RATE_CENTS,
  SERVICE_LIVE_AT, customerServiceFeeFor, duesForCents, errandFeeCents, errandPayoutCents, isHourlyCategory, isQuickTaskEligible,
  OPEN_POSITIONS, isEnabled, releasedPlans, type ConciergeCategory, type ErrandTierId, type Plan, type PlanId,
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
export const ORIGIN = process.env.SITE_ORIGIN ?? "https://safehubby.com";

/** Where a visitor goes to actually sign up. The app, not this site. Set
 *  `APP_URL` at build time to point it at wherever the app is running — the
 *  address is not baked in, because it changes when the domain arrives. */
export const APP_URL = process.env.APP_URL ?? "https://safehubby.com";

/** The job application, in the app — no account needed. A hash link, which
 *  the app reads on load (apps/web/src/app/entry-route.ts), so a person lands
 *  on the form rather than on a landing page built for customers. */
export const CAREERS_URL = `${APP_URL.replace(/\/$/, "")}/#careers`;

/**
 * Where to reach a person. An email, not a phone number — chosen by the owner.
 *
 * It sits in the header on every page rather than only in a contact section,
 * so somebody who is worried does not have to scroll a sales page to find a
 * human. One route only: two ways to reach somebody is two decisions for a
 * reader who is already worried about a parent.
 *
 * A plain address in a page will be scraped by spam harvesters. That is the
 * price of it being a link anybody can tap; a contact form would need a
 * server, which this site deliberately does not have.
 */
export const CONTACT_EMAIL = "contact@safehubby.com";

/** A link that opens the reader's mail app. */
export function mailtoHref(address: string): string {
  return `mailto:${address.trim()}`;
}

/** +1 (787) 555-0147, from 17875550147. Falls back to a plain + form for
 *  anything that is not a NANP number. Only the WhatsApp line uses it now. */
export function formatPhone(digits: string): string {
  const d = digits.replace(/\D/g, "");
  const m = /^1(\d{3})(\d{3})(\d{4})$/.exec(d);
  return m ? `+1 (${m[1]}) ${m[2]}-${m[3]}` : `+${d}`;
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
/** Family and Free are the plan names that change in Spanish. */
const PLAN_NAMES_ES: Partial<Record<PlanId, string>> = { family: "Familia", free: "Gratis" };

export function planNameIn(plan: Plan, lang: Lang): string {
  return lang === "es" ? PLAN_NAMES_ES[plan.id] ?? plan.name : plan.name;
}

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
    planId: ERRAND_ENTRY_PLAN,
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
export const TIER_REFERENCE_CAP_CENTS = ERRAND_REFERENCE_CAP_CENTS;

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

/** The cheapest plan that can order an errand. Free's errands are paused
 *  (the `free-errands` flag), so the lowest price on this page is a paid
 *  plan's — and the page says so rather than quoting one nobody can get. */
export const ERRAND_ENTRY_PLAN: PlanId = "premium-basic";

/** How many no-fee grabs the entry plan gets a month, for the copy. */
export const INCLUDED_GRABS_ENTRY = INCLUDED_GRABS_PER_MONTH[ERRAND_ENTRY_PLAN] ?? 0;

/** The Wingman Club's dues, as the span they actually move across: a flat
 *  base plus whatever that month's experience costs at the negotiated rate. */
export function clubDuesRangeCents(): { base: number; low: number; high: number } {
  const dues = CLUB_EXPERIENCES.map((e) => duesForCents(e));
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
  /** The label on the thing that reveals the address, in the header and in
   *  the contact section. The address itself is not on the page until asked for. */
  contactLabel: string;
  contactShow: string;
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
const discountUntil = (lang: Lang) => formatDate(LAUNCH_WINDOW_END, lang);
const discountPercent = Math.round(LAUNCH_DISCOUNT_RATE * 100);
const paRate = money(PA_HOURLY_RATE_CENTS);
const tierPays = ERRAND_TIERS.map((t) => errandPayoutCents(t.id));
/** What an errand runner is paid per task, as the span the four sizes cover. */
const errandPayRange = `${money(Math.min(...tierPays))} to ${money(Math.max(...tierPays))}`;
const errandMileage = money(ERRAND_MILEAGE_CENTS);

/** Whether errand runners are being hired. The hiring page advertises a job
 *  only while it is open: with runners on hold, its pay line would pull in
 *  applicants for a role nobody is hiring. Personal assistants, who cover
 *  errands too, are the role to point people at. */
export const ERRAND_RUNNERS_HIRING = OPEN_POSITIONS["errand-runner"] > 0;

/**
 * The insurance promise, said only when it is true. Liability cover for the
 * people we hire is a promise to somebody deciding whether to take a job, and
 * until a policy is bound (`insurance-in-place`) there is nothing behind it.
 * These return their text when cover is in place and nothing when it is not,
 * so the sentence around them reads correctly either way.
 */
const insuredEn = (text: string): string => (isEnabled("insurance-in-place") ? text : "");
const insuredEs = (text: string): string => (isEnabled("insurance-in-place") ? text : "");

const DISCLAIMER = {
  en: "Safehubby LLC is in formation. Safehubby is not an emergency service and never tells anyone they are safe to drive. In an emergency, call your local emergency number first.",
  es: "Safehubby LLC está en proceso de formación. Safehubby no es un servicio de emergencia y nunca le dice a nadie que puede manejar. En una emergencia, llama primero al número de emergencias de tu área.",
} as const;

/** The number of plans on offer, in words — the page says "Six plans", and the
 *  count follows whatever is on the shelf rather than being typed. */
const PLAN_COUNT_WORDS: Record<Lang, string[]> = {
  en: ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"],
  es: ["Ningún", "Un", "Dos", "Tres", "Cuatro", "Cinco", "Seis", "Siete", "Ocho", "Nueve", "Diez"],
};

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
      "A juice, a phone charger, a blanket — to a hospital room, or to a house where somebody lives alone. Safehubby sends a real person, at a spend cap you set. From one errand to a full concierge desk.",
    heroCta: "Get started",
    heroCtaNote: `No contract. Live since ${liveDate("en")}, with a free trial before your first charge.`,

    whatHeading: "What we do",
    tiersHeading: "Errands, by size",
    tiersNote: `The fee covers the runner's time and travel. Shown for a ${money(TIER_REFERENCE_CAP_CENTS)} purchase; it rises slightly with a bigger one, because the card charges more on it. You pay for the item at cost.`,
    minutesLabel: "min",
    whatLede:
      "The person we built this for is in a hospital bed at nine at night, thirsty, with nobody to ask. Everything here starts from that.",
    services: [
      { title: "Grab something", category: "grab-something", body: `A juice, a charger, a blanket — bought and brought to your room or your door. You pay for the item; ${INCLUDED_GRABS_ENTRY} a month come with no service fee on Premium, more on every plan above it.` },
      { title: "Run an errand", category: "run-errand", body: "Groceries, the bank, the pharmacy — one trip, at a spending cap you set." },
      { title: "Wait with someone", category: "wait-with-someone", body: "A vetted assistant who comes and stays. A hospital wait, a bad night." },
      { title: "Check on someone", category: "check-in-person", body: "Someone goes and looks, then tells you." },
      { title: "Arrange a ride", priceNote: "At the provider's own rate", body: "We book it and watch it — no markup on the fare." },
      { title: "Check-ins and SOS", priceNote: "On every plan", body: "A guardian is alerted the moment a check-in is missed." },
    ],

    pricingHeading: "What it costs",
    pricingLede: `${PLAN_COUNT_WORDS.en[releasedPlans().length]} plans, from everyday help to a desk that answers 24/7. Swipe across.`,
    perMonth: "/month",
    seatsOne: "1 person",
    seatsMany: (n) => `Up to ${n} people`,
    freeLabel: "Always free",
    planBlurbs: {
      free: "Check-ins, location sharing, SOS and ride booking. The safety basics are never behind a paywall. Errands start with Premium.",
      "premium-basic": `Errands from a juice to a shopping trip — ${INCLUDED_GRABS_ENTRY} one-item grabs a month with no service fee — and an assistant who waits with someone or checks on them.`,
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
    clubDues: "{base} a month to run the club and help cover event costs, plus that month's outing at exactly what the venue charges us. In practice {low} to {high}, depending on the pick.",
    clubPerk: "A cigar and a drink of your choice at every event, whatever the month lands on. Folded into the group rate, never an extra line.",
    clubRotation: "In the rotation:",
    pricingNote:
      `Safehubby is live as of ${liveDate("en")}. Sign up before ${discountUntil("en")} and keep ${discountPercent}% off your first year.`,

    contactHeading: "Write to us",
    contactBody: "Questions, press, or a family who needs something sooner rather than later.",

    workLink: "Work with us",
    contactLabel: "Contact",
    contactShow: "Show email address",
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
      "Un jugo, un cargador, una frisa — a un cuarto de hospital, o a una casa donde alguien vive solo. Safehubby envía a una persona de verdad, con el tope de gasto que tú pongas. Desde una diligencia hasta un servicio de concierge completo.",
    heroCta: "Empezar",
    heroCtaNote: `Sin contrato. En servicio desde el ${liveDate("es")}, con una prueba gratis antes del primer cobro.`,

    whatHeading: "Lo que hacemos",
    tiersHeading: "Diligencias, por tamaño",
    tiersNote: `El cargo cubre el tiempo y el viaje de quien lo hace. Se muestra para una compra de ${money(TIER_REFERENCE_CAP_CENTS)}; sube un poco con una compra mayor, porque la tarjeta cobra más. El artículo lo pagas al costo.`,
    minutesLabel: "min",
    whatLede:
      "La persona para quien hicimos esto está en una cama de hospital a las nueve de la noche, con sed, y no tiene a quién pedirle. Todo aquí sale de ahí.",
    services: [
      { title: "Traer algo", category: "grab-something", body: `Un jugo, un cargador, una frisa — comprado y llevado a tu cuarto o a tu puerta. Pagas el artículo; ${INCLUDED_GRABS_ENTRY} al mes van sin cargo por servicio en Premium, y más en cada plan superior.` },
      { title: "Hacer una diligencia", category: "run-errand", body: "La compra, el banco, la farmacia — un viaje, con el tope de gasto que pongas." },
      { title: "Acompañar a alguien", category: "wait-with-someone", body: "Un asistente verificado que llega y se queda. Una espera en el hospital, una mala noche." },
      { title: "Pasar a ver a alguien", category: "check-in-person", body: "Alguien va, mira, y te dice." },
      { title: "Coordinar un viaje", priceNote: "A la tarifa del proveedor", body: "Lo reservamos y lo seguimos — sin recargo sobre la tarifa." },
      { title: "Registros y SOS", priceNote: "En todos los planes", body: "Un guardián recibe alerta en el momento en que se falla un registro." },
    ],

    pricingHeading: "Cuánto cuesta",
    pricingLede: `${PLAN_COUNT_WORDS.es[releasedPlans().length]} planes, desde la ayuda de todos los días hasta un servicio que contesta 24/7. Desliza.`,
    perMonth: "/mes",
    seatsOne: "1 persona",
    seatsMany: (n) => `Hasta ${n} personas`,
    freeLabel: "Siempre gratis",
    planBlurbs: {
      free: "Registros, ubicación compartida, SOS y viajes. Lo básico de seguridad nunca se cobra. Los encargos empiezan con Premium.",
      "premium-basic": `Diligencias desde un jugo hasta un viaje de compras — ${INCLUDED_GRABS_ENTRY} compras de un artículo al mes sin cargo por servicio — y un asistente que acompaña a alguien o pasa a verlo.`,
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
    clubDues: "{base} al mes para manejar el club y ayudar a cubrir los costos de los eventos, más la actividad de ese mes a exactamente lo que nos cobra el lugar. En la práctica entre {low} y {high}, según la que toque.",
    clubPerk: "Un cigarro y un trago de tu elección en cada evento, sea cual sea la actividad del mes. Va incluido en la tarifa de grupo, nunca como un cargo aparte.",
    clubRotation: "En la rotación:",
    pricingNote:
      `Safehubby está en servicio desde el ${liveDate("es")}. Regístrate antes del ${discountUntil("es")} y quédate con ${discountPercent}% de descuento el primer año.`,

    contactHeading: "Escríbenos",
    contactBody: "Preguntas, prensa, o una familia que necesita algo pronto.",

    workLink: "Trabaja con nosotros",
    contactLabel: "Contacto",
    contactShow: "Mostrar correo electrónico",
    disclaimer: DISCLAIMER.es,
    footerNote: "Tu ubicación y tu historial son tuyos. Nunca se venden, y nunca se usan para publicidad dirigida.",
  },
};

export const WORK_COPY: Record<Lang, WorkCopy> = {
  en: {
    htmlLang: "en",
    title: "Work with Safehubby — one flat rate, every market",
    description:
      `${paRate} an hour for personal assistants in Puerto Rico, Texas and Los Angeles.${insuredEn(" Liability insurance from day one.")}`,
    otherLang: { href: "/es/trabajo/", label: "Español" },
    heading: "Work with us",
    lede:
      "One flat rate in every market we operate in. We do not pay somebody less for the same job because of where they live.",
    rate: `${paRate} an hour for a personal assistant`,
    errand: `${errandPayRange} per errand for errand runners, by size, plus ${errandMileage} a mile${insuredEn(", and liability insurance for everyone on the roster from day one")}.`,
    cta: "See open roles",
    back: "Safehubby",
  },
  es: {
    htmlLang: "es",
    title: "Trabaja con Safehubby — la misma tarifa en todos los mercados",
    description:
      `${paRate} por hora para asistentes personales en Puerto Rico, Texas y Los Ángeles.${insuredEs(" Seguro de responsabilidad civil desde el primer día.")}`,
    otherLang: { href: "/work/", label: "English" },
    heading: "Trabaja con nosotros",
    lede:
      "La misma tarifa en todos los mercados donde operamos. No le pagamos menos a nadie por el mismo trabajo según dónde viva.",
    rate: `${paRate} por hora para asistente personal`,
    errand: `${errandPayRange} por diligencia para quienes las hacen, según el tamaño, más ${errandMileage} por milla${insuredEs(", y seguro de responsabilidad civil para todo el equipo desde el primer día")}.`,
    cta: "Ver puestos disponibles",
    back: "Safehubby",
  },
};
