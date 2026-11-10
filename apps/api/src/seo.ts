import {
  STAFF_ROLE_ES, alternateSiteRoute, indexableSiteRoutes, isPrivateSitePath, siteRouteFor, sitePathFor,
  type SiteLang, type SiteRoute, type StaffRole,
} from "@safehubby/core";

/**
 * What a search engine is told about each address, and what it can read
 * there before any JavaScript runs.
 *
 * The app is one page that draws itself in the browser, so on its own every
 * address would hand a crawler the same empty shell with the same title.
 * This builds, per address: a title and description in that page's language,
 * the one canonical address and its twin in the other language, structured
 * data, and a plain-HTML version of the page's main content that the app
 * replaces the moment it starts.
 *
 * Two rules. **Numbers come from the caller** (prices, pay, openings: the
 * same figures the app shows), never typed here, so this cannot advertise a
 * stale price. **The words say what the page says**: the static content is
 * the landing page's own headline and services, not extra text written for
 * robots, because showing a crawler something a visitor does not get is how
 * a site gets penalised.
 */
export interface SeoRole {
  id: StaffRole;
  label: string;
  description: string;
  /** What the job pays, in a sentence, per language. */
  pay: string;
  payEs: string;
  /** Seats still open. A job with none gets no listing. */
  openings: number;
}

export interface SeoFacts {
  /** The site's own address, no trailing slash. */
  origin: string;
  /** Plans a visitor can see today, cheapest first, without Elite. */
  plans: { name: string; monthlyCents: number; seats: number }[];
  /** What a customer pays for an hour of an assistant, and of an armed bodyguard. */
  hourlyCents: number;
  armedHourlyCents: number;
  /** The smallest errand's fee, and a full hospital day. */
  errandFromCents: number;
  hospitalDayCents: number;
  /** Where the service runs, as written for a reader. */
  markets: string[];
  roles: SeoRole[];
  /** YYYY-MM-DD the jobs were posted. */
  hiringOpenedOn: string;
}

export interface SeoPage {
  status: 200 | 404;
  lang: SiteLang;
  title: string;
  description: string;
  robots: string;
  /** Absolute. Absent on pages that are not to be indexed. */
  canonical?: string;
  alternates: { hreflang: string; href: string }[];
  jsonLd: unknown[];
  /** Static HTML for inside the app's root element. */
  body: string;
  /** An image the page shows first, worth fetching early. */
  preloadImage?: string;
}

const HERO_IMAGE = "/img/hero-luxury.jpg";
const CONTACT_EMAIL = "contact@safehubby.com";

const escapeHtml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** JSON for a script tag: a "<" inside a string must not be able to close the tag. */
const jsonForScript = (value: unknown): string => JSON.stringify(value).replace(/</g, "\\u003c");

const money = (cents: number): string =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;

/** "A, B and C" / "A, B y C". */
function listOf(items: string[], lang: SiteLang): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} ${lang === "es" ? "y" : "and"} ${items[items.length - 1]}`;
}

/** Cut at a word, for a description a results page will not chop mid-word. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 30)).replace(/[\s,;:.]+$/, "")}…`;
}

const roleLabel = (role: SeoRole, lang: SiteLang) => (lang === "es" ? STAFF_ROLE_ES[role.id].label : role.label);
const roleDescription = (role: SeoRole, lang: SiteLang) => (lang === "es" ? STAFF_ROLE_ES[role.id].description : role.description);
const rolePay = (role: SeoRole, lang: SiteLang) => (lang === "es" ? role.payEs : role.pay);

/* ---------------------------------------------------------------------------
   Words. The home page's are the landing page's own (apps/web i18n: lux.*).
   ------------------------------------------------------------------------ */

const WORDS = {
  en: {
    homeTitle: "Personal concierge & assistants in Puerto Rico | Safehubby",
    homeDescription: "Safehubby sends a trusted personal assistant, errand runner or ride in Puerto Rico. Check-ins, location sharing and SOS are free. You set the spending limit.",
    eyebrow: "Assistants · Errands · Rides",
    h1: "Someone you trust, wherever they're needed.",
    sub: "A personal assistant for the people you love, and for the evenings you want done right. You set the limit; you are never charged past it.",
    doorsHeading: "What Safehubby does",
    doors: [
      ["Assistants", "Stay with someone, check on them, book and buy for you."],
      ["Errands", "A juice, a charger, a blanket — brought to the room."],
      ["Rides", "Booked for you, with the price shown first."],
      ["Handled for you", "Appointments, reminders, calls and emails."],
      ["Safety", "Check-ins, location sharing and SOS, always free."],
    ],
    pricesHeading: "What it costs",
    planLine: (name: string, price: string, seats: number) => `${name}: ${price}${seats > 1 ? `, covers ${seats} people` : ""}`,
    free: "free",
    perMonth: (price: string) => `${price} a month`,
    servicePrices: (f: SeoFacts) => [
      `An errand, from ${money(f.errandFromCents)} plus what is bought, under a spending limit you set.`,
      `A personal assistant, ${money(f.hourlyCents)} an hour once your plan's included hours are used.`,
      `A full hospital day with a caretaker, ${money(f.hospitalDayCents)}.`,
      `An armed bodyguard, ${money(f.armedHourlyCents)} an hour.`,
    ],
    whereHeading: "Where",
    where: (markets: string) => `Safehubby serves ${markets}.`,
    workHeading: "Work with Safehubby",
    workLink: "See the open jobs",
    driveLink: "Drive for Safehubby",
    otherLanguage: "Español",
    contact: "Contact",
    disclaimer: "Safehubby is not an emergency service. In an emergency, call your local emergency number first.",
    careersTitle: "Jobs in Puerto Rico: personal assistants & more | Safehubby",
    careersDescription: "Safehubby is hiring: personal assistants, hospital caretakers, errand runners, bodyguards and more. The pay is published before you apply.",
    careersH1: "Jobs at Safehubby",
    careersLead: (markets: string) => `Safehubby is hiring in ${markets}. What each job pays is published here, before you apply. Applying needs no account.`,
    openings: (n: number) => (n === 1 ? "1 opening" : `${n} openings`),
    jobTitle: (label: string) => `${label} jobs in Puerto Rico | Safehubby`,
    jobH1: (label: string) => `${label} at Safehubby`,
    payLabel: "Pay",
    whereLabel: "Where",
    requirementsLabel: "To apply",
    requirements: "A firearms licence, consent to a background check, and a short note on your experience. Bodyguards also need a security-guard licence.",
    apply: "Apply now",
    allJobs: "All open jobs",
    driveTitle: "Driver jobs in Puerto Rico | Drive for Safehubby",
    driveDescription: "Drive people home with Safehubby: standard or secure transport, on a per-trip rate published before you apply.",
    driveH1: "Drive for Safehubby",
    driveRequirements: "A valid driver's licence, your vehicle's make, model, year and plate, and consent to a background check.",
    notFoundTitle: "Page not found | Safehubby",
    notFound: "This page does not exist.",
    home: "Go to Safehubby",
  },
  es: {
    homeTitle: "Concierge y asistentes personales en Puerto Rico | Safehubby",
    homeDescription: "Safehubby te envía un asistente personal, un mensajero o un viaje de confianza en Puerto Rico. Chequeos, ubicación y SOS gratis. Tú pones el límite de gasto.",
    eyebrow: "Asistentes · Mandados · Viajes",
    h1: "Alguien de confianza, donde más lo necesitas.",
    sub: "Un asistente personal para quienes quieres, y para las noches que quieres bien hechas. Tú pones el límite; nunca se cobra de más.",
    doorsHeading: "Qué hace Safehubby",
    doors: [
      ["Asistentes", "Acompaña a alguien, lo visita, reserva y compra por ti."],
      ["Mandados", "Un jugo, un cargador, una cobija — hasta la habitación."],
      ["Viajes", "Los reservamos por ti, con el precio por delante."],
      ["Resuelto por ti", "Citas, recordatorios, llamadas y correos."],
      ["Seguridad", "Chequeos, ubicación y SOS, siempre gratis."],
    ],
    pricesHeading: "Cuánto cuesta",
    planLine: (name: string, price: string, seats: number) => `${name}: ${price}${seats > 1 ? `, cubre a ${seats} personas` : ""}`,
    free: "gratis",
    perMonth: (price: string) => `${price} al mes`,
    servicePrices: (f: SeoFacts) => [
      `Un mandado, desde ${money(f.errandFromCents)} más lo que se compre, con un límite de gasto que tú fijas.`,
      `Un asistente personal, ${money(f.hourlyCents)} la hora cuando se acaban las horas incluidas de tu plan.`,
      `Un día completo de hospital con un cuidador, ${money(f.hospitalDayCents)}.`,
      `Un guardaespaldas armado, ${money(f.armedHourlyCents)} la hora.`,
    ],
    whereHeading: "Dónde",
    where: (markets: string) => `Safehubby da servicio en ${markets}.`,
    workHeading: "Trabaja con Safehubby",
    workLink: "Ver los empleos disponibles",
    driveLink: "Maneja con Safehubby",
    otherLanguage: "English",
    contact: "Contacto",
    disclaimer: "Safehubby no es un servicio de emergencia. En una emergencia, llama primero a tu número de emergencia local.",
    careersTitle: "Empleos en Puerto Rico: asistentes personales y más | Safehubby",
    careersDescription: "Safehubby está contratando: asistentes personales, cuidadores en hospital, mensajeros, guardaespaldas y más. La paga se publica antes de solicitar.",
    careersH1: "Empleos en Safehubby",
    careersLead: (markets: string) => `Safehubby está contratando en ${markets}. Lo que paga cada empleo está publicado aquí, antes de solicitar. Para solicitar no necesitas una cuenta.`,
    openings: (n: number) => (n === 1 ? "1 plaza" : `${n} plazas`),
    jobTitle: (label: string) => `Empleo de ${label} en Puerto Rico | Safehubby`,
    jobH1: (label: string) => `${label} en Safehubby`,
    payLabel: "Paga",
    whereLabel: "Dónde",
    requirementsLabel: "Para solicitar",
    requirements: "Una licencia de armas, tu consentimiento para una verificación de antecedentes y una nota breve sobre tu experiencia. Los guardaespaldas también necesitan licencia de guardia de seguridad.",
    apply: "Solicitar ahora",
    allJobs: "Todos los empleos disponibles",
    driveTitle: "Empleo de chofer en Puerto Rico | Maneja con Safehubby",
    driveDescription: "Lleva a la gente a casa con Safehubby: transporte estándar o seguro, con una tarifa por viaje publicada antes de solicitar.",
    driveH1: "Maneja con Safehubby",
    driveRequirements: "Una licencia de conducir vigente, la marca, el modelo, el año y la tablilla de tu vehículo, y tu consentimiento para una verificación de antecedentes.",
    notFoundTitle: "Página no encontrada | Safehubby",
    notFound: "Esta página no existe.",
    home: "Ir a Safehubby",
  },
} as const;

/* ---------------------------------------------------------------------------
   Structured data
   ------------------------------------------------------------------------ */

const organization = (f: SeoFacts) => ({
  "@type": "Organization",
  "@id": `${f.origin}/#organization`,
  name: "Safehubby",
  url: `${f.origin}/`,
  logo: `${f.origin}/apple-touch-icon.png`,
  email: CONTACT_EMAIL,
  areaServed: f.markets,
});

function homeJsonLd(f: SeoFacts, lang: SiteLang, description: string): unknown[] {
  const offers = f.plans.map((p) => ({
    "@type": "Offer",
    name: p.name,
    price: (p.monthlyCents / 100).toFixed(2),
    priceCurrency: "USD",
    ...(p.monthlyCents > 0 ? {
      priceSpecification: { "@type": "UnitPriceSpecification", price: (p.monthlyCents / 100).toFixed(2), priceCurrency: "USD", unitCode: "MON" },
    } : {}),
  }));
  return [{
    "@context": "https://schema.org",
    "@graph": [
      organization(f),
      { "@type": "WebSite", "@id": `${f.origin}/#website`, name: "Safehubby", url: `${f.origin}/`, inLanguage: ["en", "es"], publisher: { "@id": `${f.origin}/#organization` } },
      {
        "@type": "Service",
        name: lang === "es" ? "Concierge y asistentes personales" : "Personal concierge and assistants",
        serviceType: lang === "es" ? "Asistente personal, mandados y transporte" : "Personal assistant, errands and rides",
        description,
        provider: { "@id": `${f.origin}/#organization` },
        areaServed: f.markets,
        ...(offers.length > 0 ? { offers } : {}),
      },
    ],
  }];
}

/** Where each market is, as a postal address a job listing can carry. Unknown markets are left out, not guessed. */
const MARKET_ADDRESS: Record<string, { addressLocality?: string; addressRegion: string; addressCountry: string }> = {
  "Puerto Rico": { addressRegion: "PR", addressCountry: "US" },
  Texas: { addressRegion: "TX", addressCountry: "US" },
  "Los Angeles": { addressLocality: "Los Angeles", addressRegion: "CA", addressCountry: "US" },
};

/** An hourly figure at the start of a pay sentence ("$35.00 an hour…"), or nothing. Per-task pay is described, not turned into a wage. */
function hourlyPay(pay: string): number | undefined {
  const m = /^\$(\d+(?:\.\d{2})?) an hour/.exec(pay);
  return m ? Number(m[1]) : undefined;
}

function jobJsonLd(f: SeoFacts, role: SeoRole, lang: SiteLang, url: string, requirements: string): unknown[] {
  // Only a job with a seat open is a job to list.
  if (role.openings <= 0) return [];
  const w = WORDS[lang];
  const locations = f.markets.map((m) => MARKET_ADDRESS[m]).filter((a) => a !== undefined)
    .map((address) => ({ "@type": "Place", address: { "@type": "PostalAddress", ...address } }));
  if (locations.length === 0) return [];
  const hourly = hourlyPay(role.pay);
  return [{
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: roleLabel(role, lang),
    description: [
      `<p>${escapeHtml(roleDescription(role, lang))}</p>`,
      `<p><strong>${escapeHtml(w.payLabel)}:</strong> ${escapeHtml(rolePay(role, lang))}.</p>`,
      `<p><strong>${escapeHtml(w.requirementsLabel)}:</strong> ${escapeHtml(requirements)}</p>`,
    ].join(""),
    datePosted: f.hiringOpenedOn,
    hiringOrganization: { "@type": "Organization", name: "Safehubby", sameAs: `${f.origin}/`, logo: `${f.origin}/apple-touch-icon.png` },
    jobLocation: locations,
    identifier: { "@type": "PropertyValue", name: "Safehubby", value: role.id },
    directApply: true,
    url,
    inLanguage: lang,
    ...(hourly !== undefined ? {
      baseSalary: { "@type": "MonetaryAmount", currency: "USD", value: { "@type": "QuantitativeValue", value: hourly, unitText: "HOUR" } },
    } : {}),
  }];
}

/* ---------------------------------------------------------------------------
   Static content
   ------------------------------------------------------------------------ */

const link = (href: string, text: string) => `<a href="${escapeHtml(href)}">${escapeHtml(text)}</a>`;
const items = (lines: string[]) => `<ul>${lines.map((l) => `<li>${l}</li>`).join("")}</ul>`;

function shell(lang: SiteLang, otherHref: string | undefined, inner: string): string {
  const w = WORDS[lang];
  const other = otherHref ? ` · ${link(otherHref, w.otherLanguage)}` : "";
  return `<div class="seo-shell"><p class="seo-brand"><strong>Safehubby</strong>${other}</p>${inner}</div>`;
}

function homeBody(f: SeoFacts, route: SiteRoute): string {
  const w = WORDS[route.lang];
  const markets = listOf(f.markets, route.lang);
  const plans = f.plans.map((p) => escapeHtml(w.planLine(p.name, p.monthlyCents === 0 ? w.free : w.perMonth(money(p.monthlyCents)), p.seats)));
  return shell(route.lang, alternateSiteRoute(route, route.lang === "en" ? "es" : "en").path, [
    `<p class="seo-eyebrow">${escapeHtml(w.eyebrow)}</p>`,
    `<h1>${escapeHtml(w.h1)}</h1>`,
    `<p>${escapeHtml(w.sub)}</p>`,
    `<h2>${escapeHtml(w.doorsHeading)}</h2>`,
    items(w.doors.map(([name, text]) => `<strong>${escapeHtml(name)}</strong>: ${escapeHtml(text)}`)),
    `<h2>${escapeHtml(w.pricesHeading)}</h2>`,
    items([...plans, ...w.servicePrices(f).map(escapeHtml)]),
    `<h2>${escapeHtml(w.whereHeading)}</h2>`,
    `<p>${escapeHtml(w.where(markets))}</p>`,
    `<h2>${escapeHtml(w.workHeading)}</h2>`,
    `<p>${link(sitePathFor("careers", route.lang), w.workLink)} · ${link(sitePathFor("drive", route.lang), w.driveLink)}</p>`,
    `<p>${escapeHtml(w.contact)}: ${link(`mailto:${CONTACT_EMAIL}`, CONTACT_EMAIL)}</p>`,
    `<p class="seo-small">${escapeHtml(w.disclaimer)}</p>`,
  ].join(""));
}

/** Jobs that are open come first; the driver job is listed by its own page. */
const listedRoles = (f: SeoFacts) => f.roles.filter((r) => r.id !== "driver").sort((a, b) => Number(b.openings > 0) - Number(a.openings > 0));

function careersBody(f: SeoFacts, route: SiteRoute): string {
  const w = WORDS[route.lang];
  const jobs = listedRoles(f).map((r) => [
    `<h3>${link(sitePathFor("job", route.lang, r.id), roleLabel(r, route.lang))}${r.openings > 0 ? ` <small>(${escapeHtml(w.openings(r.openings))})</small>` : ""}</h3>`,
    `<p>${escapeHtml(roleDescription(r, route.lang))}</p>`,
    `<p><strong>${escapeHtml(w.payLabel)}:</strong> ${escapeHtml(rolePay(r, route.lang))}.</p>`,
  ].join(""));
  return shell(route.lang, alternateSiteRoute(route, route.lang === "en" ? "es" : "en").path, [
    `<h1>${escapeHtml(w.careersH1)}</h1>`,
    `<p>${escapeHtml(w.careersLead(listOf(f.markets, route.lang)))}</p>`,
    ...jobs,
    `<p>${link(sitePathFor("drive", route.lang), w.driveLink)} · ${link(sitePathFor("home", route.lang), w.home)}</p>`,
  ].join(""));
}

function jobBody(f: SeoFacts, route: SiteRoute, role: SeoRole): string {
  const w = WORDS[route.lang];
  return shell(route.lang, alternateSiteRoute(route, route.lang === "en" ? "es" : "en").path, [
    `<h1>${escapeHtml(w.jobH1(roleLabel(role, route.lang)))}</h1>`,
    `<p>${escapeHtml(roleDescription(role, route.lang))}</p>`,
    `<p><strong>${escapeHtml(w.payLabel)}:</strong> ${escapeHtml(rolePay(role, route.lang))}.</p>`,
    `<p><strong>${escapeHtml(w.whereLabel)}:</strong> ${escapeHtml(listOf(f.markets, route.lang))}.</p>`,
    `<p><strong>${escapeHtml(w.requirementsLabel)}:</strong> ${escapeHtml(w.requirements)}</p>`,
    `<p>${link(sitePathFor("careers", route.lang), w.allJobs)} · ${link(sitePathFor("home", route.lang), w.home)}</p>`,
  ].join(""));
}

function driveBody(f: SeoFacts, route: SiteRoute, role: SeoRole | undefined): string {
  const w = WORDS[route.lang];
  return shell(route.lang, alternateSiteRoute(route, route.lang === "en" ? "es" : "en").path, [
    `<h1>${escapeHtml(w.driveH1)}</h1>`,
    `<p>${escapeHtml(w.driveDescription)}</p>`,
    ...(role ? [`<p><strong>${escapeHtml(w.payLabel)}:</strong> ${escapeHtml(rolePay(role, route.lang))}.</p>`] : []),
    `<p><strong>${escapeHtml(w.whereLabel)}:</strong> ${escapeHtml(listOf(f.markets, route.lang))}.</p>`,
    `<p><strong>${escapeHtml(w.requirementsLabel)}:</strong> ${escapeHtml(w.driveRequirements)}</p>`,
    `<p>${link(sitePathFor("careers", route.lang), w.allJobs)} · ${link(sitePathFor("home", route.lang), w.home)}</p>`,
  ].join(""));
}

/* ---------------------------------------------------------------------------
   One page
   ------------------------------------------------------------------------ */

const OG_LOCALE: Record<SiteLang, string> = { en: "en_US", es: "es_PR" };

function alternatesFor(f: SeoFacts, route: SiteRoute): SeoPage["alternates"] {
  const en = `${f.origin}${alternateSiteRoute(route, "en").path}`;
  const es = `${f.origin}${alternateSiteRoute(route, "es").path}`;
  return [{ hreflang: "en", href: en }, { hreflang: "es", href: es }, { hreflang: "x-default", href: en }];
}

export function seoPageFor(pathname: string, f: SeoFacts): SeoPage {
  const route = siteRouteFor(pathname);
  if (!route) {
    // The signed-in areas are real pages that are nobody's search result.
    if (isPrivateSitePath(pathname)) {
      return { status: 200, lang: "en", title: "Safehubby", description: "", robots: "noindex, nofollow", alternates: [], jsonLd: [], body: "" };
    }
    const w = WORDS.en;
    return {
      status: 404, lang: "en", title: w.notFoundTitle, description: "", robots: "noindex", alternates: [], jsonLd: [],
      body: shell("en", undefined, `<h1>${escapeHtml(w.notFound)}</h1><p>${link("/", w.home)}</p>`),
    };
  }
  const w = WORDS[route.lang];
  const canonical = `${f.origin}${route.path}`;
  const base = { status: 200 as const, lang: route.lang, robots: "index, follow", canonical, alternates: alternatesFor(f, route) };

  if (route.page === "home") {
    return { ...base, title: w.homeTitle, description: w.homeDescription, jsonLd: homeJsonLd(f, route.lang, w.homeDescription), body: homeBody(f, route), preloadImage: HERO_IMAGE };
  }
  if (route.page === "careers") {
    return { ...base, title: w.careersTitle, description: w.careersDescription, jsonLd: [], body: careersBody(f, route) };
  }
  if (route.page === "drive") {
    const driver = f.roles.find((r) => r.id === "driver");
    return {
      ...base, title: w.driveTitle, description: w.driveDescription,
      jsonLd: driver ? jobJsonLd(f, driver, route.lang, canonical, w.driveRequirements) : [], body: driveBody(f, route, driver),
    };
  }
  const role = f.roles.find((r) => r.id === route.role);
  // A job the caller does not list is not on offer: the address is real, the page is not.
  if (!role) return seoPageFor("/__missing__", f);
  const label = roleLabel(role, route.lang);
  return {
    ...base,
    title: w.jobTitle(label),
    description: clip(`${roleDescription(role, route.lang)} ${rolePay(role, route.lang)}.`, 160),
    jsonLd: jobJsonLd(f, role, route.lang, canonical, w.requirements),
    body: jobBody(f, route, role),
  };
}

/* ---------------------------------------------------------------------------
   Into the HTML
   ------------------------------------------------------------------------ */

export function renderSeoHead(page: SeoPage, origin: string): string {
  const image = `${origin}${HERO_IMAGE}`;
  const tags = [
    `<title>${escapeHtml(page.title)}</title>`,
    ...(page.description ? [`<meta name="description" content="${escapeHtml(page.description)}" />`] : []),
    `<meta name="robots" content="${escapeHtml(page.robots)}" />`,
    ...(page.canonical ? [`<link rel="canonical" href="${escapeHtml(page.canonical)}" />`] : []),
    ...page.alternates.map((a) => `<link rel="alternate" hreflang="${escapeHtml(a.hreflang)}" href="${escapeHtml(a.href)}" />`),
    ...(page.preloadImage ? [`<link rel="preload" as="image" href="${escapeHtml(page.preloadImage)}" fetchpriority="high" />`] : []),
    ...(page.canonical ? [
      `<meta property="og:type" content="website" />`,
      `<meta property="og:site_name" content="Safehubby" />`,
      `<meta property="og:title" content="${escapeHtml(page.title)}" />`,
      `<meta property="og:description" content="${escapeHtml(page.description)}" />`,
      `<meta property="og:url" content="${escapeHtml(page.canonical)}" />`,
      `<meta property="og:locale" content="${OG_LOCALE[page.lang]}" />`,
      `<meta property="og:locale:alternate" content="${OG_LOCALE[page.lang === "en" ? "es" : "en"]}" />`,
      `<meta property="og:image" content="${escapeHtml(image)}" />`,
      `<meta property="og:image:width" content="976" />`,
      `<meta property="og:image:height" content="560" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:title" content="${escapeHtml(page.title)}" />`,
      `<meta name="twitter:description" content="${escapeHtml(page.description)}" />`,
      `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
    ] : []),
    ...page.jsonLd.map((data) => `<script type="application/ld+json">${jsonForScript(data)}</script>`),
  ];
  return tags.join("\n    ");
}

const HEAD_OPEN = "<!--seo:head-->";
const HEAD_CLOSE = "<!--/seo:head-->";
const BODY_OPEN = "<!--seo:body-->";
const BODY_CLOSE = "<!--/seo:body-->";

function between(html: string, open: string, close: string, replacement: string): string {
  const start = html.indexOf(open);
  const end = html.indexOf(close);
  if (start < 0 || end < start) return html;
  return `${html.slice(0, start)}${open}${replacement}${html.slice(end)}`;
}

/**
 * The app's HTML with one page's tags and content put in. A build without
 * the markers (an older index.html) comes back untouched rather than broken.
 */
export function applySeo(template: string, page: SeoPage, origin: string): string {
  if (!template.includes(HEAD_OPEN) || !template.includes(BODY_OPEN)) return template;
  let html = template.replace(/<html lang="[a-zA-Z-]*"/, `<html lang="${page.lang}"`);
  html = between(html, HEAD_OPEN, HEAD_CLOSE, `\n    ${renderSeoHead(page, origin)}\n    `);
  return between(html, BODY_OPEN, BODY_CLOSE, page.body);
}

/** Every indexable address, each with its twin in the other language. */
export function sitemapXml(f: SeoFacts): string {
  const open = f.roles.filter((r) => r.openings > 0).map((r) => r.id);
  const urls = indexableSiteRoutes(open).map((route) => {
    const alternates = alternatesFor(f, route)
      .map((a) => `<xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${escapeHtml(a.href)}"/>`).join("");
    return `<url><loc>${escapeHtml(`${f.origin}${route.path}`)}</loc>${alternates}</url>`;
  });
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">`,
    ...urls,
    `</urlset>`,
  ].join("\n") + "\n";
}
