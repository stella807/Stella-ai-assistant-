import {
  LAUNCH_DISCOUNT_RATE, LAUNCH_WINDOW_START, PA_HOURLY_RATE_CENTS,
  QUICK_TASK_ASSISTANT_PAYOUT_CENTS, SERVICE_LIVE_AT, releasedPlans, type Plan,
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
 * Nothing here is rendered for a plan the app has not released: `plansFor`
 * reads `releasedPlans()`, so a tier held behind a flag cannot be advertised
 * by accident.
 */

export type Lang = "en" | "es";
export const LANGS: Lang[] = ["en", "es"];

/** The canonical origin, used for hreflang and the sitemap. Overridden by
 *  SITE_ORIGIN once a real domain exists. */
export const ORIGIN = process.env.SITE_ORIGIN ?? "https://safehubby-app-production.up.railway.app";

/** Where a visitor goes to actually sign up. The app, not this site. */
export const APP_URL = "https://safehubby-app-production.up.railway.app";
export const CONTACT_EMAIL = "ceo@safehubby.com";

/**
 * The WhatsApp business number, digits only with country code (a Puerto Rico
 * line is `1787…` or `1939…`). Empty until there is a real one, and the
 * contact section simply omits WhatsApp while it is — printing a dead
 * `wa.me` link is worse than offering only email, because the reader cannot
 * tell it failed.
 *
 * WhatsApp is carried as its own channel rather than as a phone number
 * because in Puerto Rico it is the one most people actually answer.
 */
export const WHATSAPP = (process.env.SITE_WHATSAPP ?? "").replace(/\D/g, "");

/** The click-to-chat link WhatsApp itself documents. */
export function whatsappHref(digits: string): string {
  return `https://wa.me/${digits.replace(/\D/g, "")}`;
}

/** +1 (787) 555-0147, from 17875550147. Falls back to a plain + form for
 *  anything that is not a NANP number. */
export function whatsappLabel(digits: string): string {
  const d = digits.replace(/\D/g, "");
  const m = /^1(\d{3})(\d{3})(\d{4})$/.exec(d);
  return m ? `+1 (${m[1]}) ${m[2]}-${m[3]}` : `+${d}`;
}

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

/** Released plans only — see the module doc. */
export function plansFor(): Plan[] {
  return releasedPlans();
}

export interface Service {
  title: string;
  body: string;
}

export interface Copy {
  htmlLang: string;
  title: string;
  description: string;
  nav: { what: string; pricing: string; work: string; contact: string };
  heroEyebrow: string;
  heroTitle: string;
  heroBody: string;
  heroCta: string;
  heroCtaNote: string;
  otherLang: { href: string; label: string };

  whatHeading: string;
  whatLede: string;
  services: Service[];

  whoHeading: string;
  whoBody: string[];

  pricingHeading: string;
  pricingLede: string;
  perMonth: string;
  seatsOne: string;
  seatsMany: (n: number) => string;
  freeLabel: string;
  discountNote: string;

  workHeading: string;
  workLede: string;
  workRate: string;
  workErrand: string;
  workCta: string;

  whenHeading: string;
  whenBody: string;

  contactHeading: string;
  contactBody: string;
  whatsappLabel: string;

  disclaimer: string;
  footerNote: string;
}

const liveDate = (lang: Lang) => formatDate(SERVICE_LIVE_AT, lang);
const openDate = (lang: Lang) => formatDate(LAUNCH_WINDOW_START, lang);
const discountPercent = Math.round(LAUNCH_DISCOUNT_RATE * 100);
const paRate = money(PA_HOURLY_RATE_CENTS);
const quickTask = money(QUICK_TASK_ASSISTANT_PAYOUT_CENTS["grab-something"] ?? 0);

export const COPY: Record<Lang, Copy> = {
  en: {
    htmlLang: "en",
    title: "Safehubby — get home safe, never alone",
    description:
      "Someone checks on the people you love. An errand run, a ride arranged, a person who comes and stays. Serving Puerto Rico, Texas and Los Angeles.",
    nav: { what: "What it is", pricing: "Pricing", work: "Work with us", contact: "Contact" },
    heroEyebrow: "Puerto Rico · Texas · Los Angeles",
    heroTitle: "Someone is watching out for the people you love.",
    heroBody:
      "A parent living alone. A husband who drives overnight. Anybody who should not have to face a bad moment by themselves. Safehubby sends a real person — for an errand, for a ride home, or just to sit with someone until they are steady.",
    heroCta: "Start free",
    heroCtaNote: "No card. No contract. The safety basics are never behind a paywall.",
    otherLang: { href: "/es/", label: "Español" },

    whatHeading: "What it actually does",
    whatLede:
      "Not an app that texts you to be careful. A person who shows up, at a spend limit you set, with the whole thing recorded so you know what happened.",
    services: [
      {
        title: "Grab something",
        body: "One named thing, collected and brought over. The coffee somebody cannot go out for. A prescription from the pharmacy counter.",
      },
      {
        title: "Run an errand",
        body: "The groceries, the bank, the hardware store. An open list within one trip, at a spending cap you decide before anyone leaves.",
      },
      {
        title: "Arrange a ride",
        body: "We book it and watch it — including secure transport where it runs, at the provider's real rate rather than a markup.",
      },
      {
        title: "Wait with someone",
        body: "A vetted assistant who comes and stays. For a hospital wait, a bad night, or a day that should not be spent alone.",
      },
      {
        title: "Check on someone",
        body: "Someone goes and looks, then tells you. For the call that did not get answered and the silence you cannot read from far away.",
      },
      {
        title: "Check-ins and SOS",
        body: "Scheduled check-ins with a guardian who is alerted the moment one is missed — not the next morning.",
      },
    ],

    whoHeading: "Who this is for",
    whoBody: [
      "We built it for the widower who has nobody to ask, and for the daughter three time zones away who has run out of ways to be sure.",
      "Most people find us for one small thing — a coffee, a pharmacy run, a ride — and stay because somebody finally answers.",
    ],

    pricingHeading: "What it costs",
    pricingLede: "One person, one household, or a full concierge desk. Cancel any time.",
    perMonth: "/month",
    seatsOne: "1 person",
    seatsMany: (n) => `Up to ${n} people`,
    freeLabel: "Always free",
    discountNote:
      `Sign up from ${openDate("en")} and keep ${discountPercent}% off your first year. Paying annually saves more.`,

    workHeading: "Work with us",
    workLede:
      "One flat rate in every market we operate in. We do not pay somebody less for the same job because of where they live.",
    workRate: `${paRate} an hour for a personal assistant`,
    workErrand: `${quickTask} per quick task for errand runners, and liability insurance for everyone on the roster from day one.`,
    workCta: "See open roles",

    whenHeading: "When it starts",
    whenBody:
      `Sign-ups open ${openDate("en")}. Service goes live ${liveDate("en")}, and nobody is charged for a day before that — the run-up is spent hiring and insuring the people who do the work.`,

    contactHeading: "Get in touch",
    contactBody: "Questions, press, or a family who needs something sooner rather than later.",
    whatsappLabel: "WhatsApp",

    disclaimer:
      "Safehubby LLC is in formation. Safehubby is not an emergency service and never tells anyone they are safe to drive. In an emergency, call your local emergency number first.",
    footerNote: "Your location and check-in history are yours. They are never sold, and never used for ad targeting.",
  },

  es: {
    htmlLang: "es",
    title: "Safehubby — llega a casa seguro, nunca solo",
    description:
      "Alguien pasa a ver a las personas que quieres. Una diligencia, un viaje coordinado, alguien que se queda un rato. Puerto Rico, Texas y Los Ángeles.",
    nav: { what: "Qué es", pricing: "Precios", work: "Trabaja con nosotros", contact: "Contacto" },
    heroEyebrow: "Puerto Rico · Texas · Los Ángeles",
    heroTitle: "Alguien está pendiente de las personas que quieres.",
    heroBody:
      "Un padre que vive solo. Un esposo que maneja de noche. Cualquiera que no debería pasar un mal momento por su cuenta. Safehubby envía a una persona de verdad — para una diligencia, para un viaje a casa, o simplemente para acompañar a alguien hasta que esté bien.",
    heroCta: "Empieza gratis",
    heroCtaNote: "Sin tarjeta. Sin contrato. Lo básico de seguridad nunca se cobra.",
    otherLang: { href: "/", label: "English" },

    whatHeading: "Lo que realmente hace",
    whatLede:
      "No es una app que te escribe para que tengas cuidado. Es una persona que llega, con el límite de gasto que tú pongas, y todo queda registrado para que sepas qué pasó.",
    services: [
      {
        title: "Traer algo",
        body: "Una cosa específica, recogida y entregada. El café por el que alguien no puede salir. Una receta del mostrador de la farmacia.",
      },
      {
        title: "Hacer una diligencia",
        body: "La compra, el banco, la ferretería. Una lista abierta dentro de un mismo viaje, con un tope de gasto que decides antes de que nadie salga.",
      },
      {
        title: "Coordinar un viaje",
        body: "Lo reservamos y lo seguimos — incluyendo transporte seguro donde opera, a la tarifa real del proveedor y no a una tarifa inflada.",
      },
      {
        title: "Acompañar a alguien",
        body: "Un asistente verificado que llega y se queda. Para una espera en el hospital, una mala noche, o un día que no debería pasarse solo.",
      },
      {
        title: "Pasar a ver a alguien",
        body: "Alguien va, mira, y te dice. Para la llamada que nadie contestó y el silencio que no puedes interpretar desde lejos.",
      },
      {
        title: "Registros y SOS",
        body: "Registros programados, con un guardián que recibe alerta en el momento en que se falla uno — no a la mañana siguiente.",
      },
    ],

    whoHeading: "Para quién es",
    whoBody: [
      "Lo hicimos para el viudo que no tiene a quién pedirle, y para la hija a tres husos horarios de distancia que ya no sabe cómo asegurarse.",
      "La mayoría nos encuentra por algo pequeño — un café, una ida a la farmacia, un viaje — y se queda porque por fin alguien contesta.",
    ],

    pricingHeading: "Cuánto cuesta",
    pricingLede: "Una persona, un hogar, o un servicio de concierge completo. Cancela cuando quieras.",
    perMonth: "/mes",
    seatsOne: "1 persona",
    seatsMany: (n) => `Hasta ${n} personas`,
    freeLabel: "Siempre gratis",
    discountNote:
      `Regístrate desde el ${openDate("es")} y quédate con ${discountPercent}% de descuento el primer año. Pagando anual ahorras más.`,

    workHeading: "Trabaja con nosotros",
    workLede:
      "La misma tarifa en todos los mercados donde operamos. No le pagamos menos a nadie por el mismo trabajo según dónde viva.",
    workRate: `${paRate} por hora para asistente personal`,
    workErrand: `${quickTask} por tarea rápida para quienes hacen diligencias, y seguro de responsabilidad civil para todo el equipo desde el primer día.`,
    workCta: "Ver puestos disponibles",

    whenHeading: "Cuándo empieza",
    whenBody:
      `Los registros abren el ${openDate("es")}. El servicio arranca el ${liveDate("es")}, y a nadie se le cobra ni un día antes de eso — esos meses se dedican a contratar y asegurar a las personas que hacen el trabajo.`,

    contactHeading: "Escríbenos",
    contactBody: "Preguntas, prensa, o una familia que necesita algo pronto.",
    whatsappLabel: "WhatsApp",

    disclaimer:
      "Safehubby LLC está en proceso de formación. Safehubby no es un servicio de emergencia y nunca le dice a nadie que puede manejar. En una emergencia, llama primero al número de emergencias de tu área.",
    footerNote: "Tu ubicación y tu historial son tuyos. Nunca se venden, y nunca se usan para publicidad dirigida.",
  },
};
