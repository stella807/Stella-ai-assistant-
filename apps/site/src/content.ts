import {
  LAUNCH_DISCOUNT_RATE, LAUNCH_WINDOW_START, PA_HOURLY_RATE_CENTS,
  QUICK_TASK_ASSISTANT_PAYOUT_CENTS, SERVICE_LIVE_AT, releasedPlans,
  type Plan, type PlanId,
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
 * The three tiers the website sells.
 *
 * The ladder has seven rungs and runs to $60,000 a month. All seven are real
 * and all seven are sold — in the app, to somebody who has already decided
 * they want this. Printing them side by side on a landing page does not read
 * as choice, it reads as a different company than the one the headline
 * describes, and it leaves the reader doing arithmetic instead of calling.
 *
 * One free, one paid, one for a household. Everything above that is a
 * conversation, and the page says so in a line rather than in four cards.
 */
export const FEATURED_PLAN_IDS: PlanId[] = ["free", "premium-basic", "family"];

/** Featured tiers, in ladder order, minus anything still behind a flag. */
export function featuredPlans(): Plan[] {
  return releasedPlans().filter((p) => FEATURED_PLAN_IDS.includes(p.id));
}

export interface Service {
  title: string;
  body: string;
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
  services: Service[];

  pricingHeading: string;
  perMonth: string;
  seatsOne: string;
  seatsMany: (n: number) => string;
  freeLabel: string;
  /** Short, site-owned. The core blurbs are in-app feature lists; a landing
   *  page needs a sentence, not a manifest. Prices still come from core. */
  planBlurbs: Partial<Record<PlanId, string>>;
  morePlans: string;
  pricingNote: string;

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
    heroTitle: "Someone is watching out for the people you love.",
    heroBody:
      "A parent living alone. A husband who drives overnight. Safehubby sends a real person — for an errand, for a ride home, or just to sit with someone until they are steady.",
    heroCta: "Start free",
    heroCtaNote: "No card. No contract.",

    whatHeading: "What we do",
    services: [
      { title: "Grab something", body: "One thing, collected and brought over. A coffee, a prescription." },
      { title: "Run an errand", body: "Groceries, the bank, the pharmacy — one trip, at a spending cap you set." },
      { title: "Arrange a ride", body: "We book it and watch it, at the provider's real rate." },
      { title: "Wait with someone", body: "A vetted assistant who comes and stays. A hospital wait, a bad night." },
      { title: "Check on someone", body: "Someone goes and looks, then tells you." },
      { title: "Check-ins and SOS", body: "A guardian is alerted the moment a check-in is missed." },
    ],

    pricingHeading: "What it costs",
    perMonth: "/month",
    seatsOne: "1 person",
    seatsMany: (n) => `Up to ${n} people`,
    freeLabel: "Always free",
    planBlurbs: {
      free: "Location sharing, check-ins, SOS, ride booking and a quick errand. The safety basics are never behind a paywall.",
      "premium-basic": "Everything Free does, plus an assistant who runs errands, waits with someone, and goes to check on them for you.",
      family: "The same service for a whole household, on one account.",
    },
    morePlans: "Larger households and full concierge tiers are in the app.",
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
    heroTitle: "Alguien está pendiente de las personas que quieres.",
    heroBody:
      "Un padre que vive solo. Un esposo que maneja de noche. Safehubby envía a una persona de verdad — para una diligencia, para un viaje a casa, o simplemente para acompañar a alguien hasta que esté bien.",
    heroCta: "Empieza gratis",
    heroCtaNote: "Sin tarjeta. Sin contrato.",

    whatHeading: "Lo que hacemos",
    services: [
      { title: "Traer algo", body: "Una cosa, recogida y entregada. Un café, una receta." },
      { title: "Hacer una diligencia", body: "La compra, el banco, la farmacia — un viaje, con el tope de gasto que pongas." },
      { title: "Coordinar un viaje", body: "Lo reservamos y lo seguimos, a la tarifa real del proveedor." },
      { title: "Acompañar a alguien", body: "Un asistente verificado que llega y se queda. Una espera en el hospital, una mala noche." },
      { title: "Pasar a ver a alguien", body: "Alguien va, mira, y te dice." },
      { title: "Registros y SOS", body: "Un guardián recibe alerta en el momento en que se falla un registro." },
    ],

    pricingHeading: "Cuánto cuesta",
    perMonth: "/mes",
    seatsOne: "1 persona",
    seatsMany: (n) => `Hasta ${n} personas`,
    freeLabel: "Siempre gratis",
    planBlurbs: {
      free: "Ubicación compartida, registros, SOS, viajes y una diligencia rápida. Lo básico de seguridad nunca se cobra.",
      "premium-basic": "Todo lo de Free, más un asistente que hace diligencias, acompaña, y pasa a ver a alguien por ti.",
      family: "El mismo servicio para todo un hogar, en una sola cuenta.",
    },
    morePlans: "Hogares más grandes y los niveles de concierge completo están en la app.",
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
