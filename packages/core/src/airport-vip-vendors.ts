import type { VendorSeed } from "./vendors.ts";

/**
 * Airport VIP, meet-and-greet and concierge services, by city, in Puerto Rico, the US and the rest
 * of the world: partners a Safehubby assistant could book for a member who is flying. Researched
 * on 2026-11-15.
 *
 * Only company-wide contacts are here. A phone or email is set where the company published it on
 * its own site, or in a government or airport-operator document; each one found any other way is
 * left out of those fields and said in the notes to confirm. Several providers block automated
 * visits, and those were not forced: their pages show no contact here.
 *
 * Filing: Puerto Rico in the default list, the US in the United States list, everything else in
 * the Worldwide list. The ids of those lists are written out here because vendors.ts, which owns
 * them, imports this file; vendors.test.ts checks they match.
 */
const US_LIST = "list-united-states";
const WORLD_LIST = "list-worldwide";

const listFor = (country: string): string | undefined =>
  country === "Puerto Rico" ? undefined : country === "United States" ? US_LIST : WORLD_LIST;

type Entry = {
  id: string; provider: string; city: string; country: string; offers: string; url: string; notes: string;
  phone?: string; email?: string; label?: string;
};

const seed = (e: Entry): VendorSeed => ({
  id: `vnd-avip-${e.id}`,
  ...(listFor(e.country) ? { listId: listFor(e.country)! } : {}),
  name: `${e.provider}${e.label ? ` (${e.label})` : ""} · ${e.city}`,
  category: "airport-vip",
  area: e.country === "Worldwide" ? "Worldwide" : `${e.city}, ${e.country}`,
  offers: e.offers,
  sourceUrl: e.url,
  notes: e.notes,
  ...(e.phone ? { phone: e.phone } : {}),
  ...(e.email ? { email: e.email } : {}),
});

/* ---- Jodogo Airport Assist Services: one company contact for every airport page on its site. ---- */
export const JODOGO_CONTACT = { phone: "+1 (325) 225 5550", email: "airportassist@jodogo.com" };
const JODOGO_SITE = "https://www.jodogoairportassist.com";
const JODOGO_NOTE = "Provider: Jodogo Airport Assist Services (jodogoairportassist.com). One company phone and email for every airport; WhatsApp +1 507 522 5822. Its site does not state where the company is based, and prices are on request.";
const jodogo = (id: string, city: string, country: string, path: string, label?: string): VendorSeed => seed({
  id: `jodogo-${id}`, provider: "Jodogo Airport Assist", city, country, label, url: `${JODOGO_SITE}${path}`,
  offers: "Airport meet and greet and related assistance (fast track, VIP concierge, special assistance and transfers where offered) for this city's airport.",
  notes: JODOGO_NOTE, ...JODOGO_CONTACT,
});

/* ---- airssist: a booking marketplace; its own pages show one phone number (a UAE line). ---- */
export const AIRSSIST_CONTACT = { phone: "+971 4 456 1940" };
const AIRSSIST_NOTE = "Provider: airssist (airssist.com), a booking service with a Dubai phone line; its pages show \"Need help? Call +971 4 456 1940\". No email was readable. Its site blocks automated visits, so confirm the page before relying on it. Claims of airports covered vary between its pages.";
const airssist = (id: string, city: string, country: string, url: string, label?: string): VendorSeed => seed({
  id: `airssist-${id}`, provider: "airssist", city, country, label, url,
  offers: "Booked airport concierge: a greeter, fast track and VIP assistance at this city's airport.",
  notes: AIRSSIST_NOTE, ...AIRSSIST_CONTACT,
});

/* ---- SkyVIP ---- */
export const SKYVIP_CONTACT = { phone: "+1 855 575 98 47" };
const SKYVIP_NOTE = "Provider: SkyVIP (skyvipservices.com). One 24/7 phone line, also on WhatsApp. Its reservations email is shown obfuscated on the site, so it is not copied here. Where the company is based is not stated.";
const skyvip = (id: string, city: string, country: string, url: string, offers: string, extra = ""): VendorSeed => seed({
  id: `skyvip-${id}`, provider: "SkyVIP", city, country, url, offers, notes: `${SKYVIP_NOTE}${extra ? ` ${extra}` : ""}`, ...SKYVIP_CONTACT,
});

const MARHABA = { phone: "+971 800 627 4222", email: "marhaba@marhabaservices.com" };
const MARHABA_NOTE = "Provider: Marhaba (dnata, Dubai), marhabaservices.com/ae/english. Phone, email and WhatsApp (+971 54 793 5279) are company-wide. Prices are shown in dirhams and vary by airport and terminal; the Elite tier is aimed at VIPs and has no public price.";

export const AIRPORT_VIP_VENDORS: VendorSeed[] = [
  // ---- Puerto Rico
  jodogo("san-juan", "San Juan", "Puerto Rico", "/airports/luis-munoz-marin-international-airport", "Luis Muñoz Marín (SJU)"),
  jodogo("aguadilla", "Aguadilla", "Puerto Rico", "/airports/rafael-hernandez-airport", "Rafael Hernández"),
  airssist("san-juan", "San Juan", "Puerto Rico", "https://airssist.com/airport-concierge/san-juan/", "SJU"),
  seed({
    id: "five-stars-san-juan", provider: "Five Stars VIP Services", city: "San Juan", country: "Puerto Rico", label: "St Barth connections",
    offers: "Agents who meet you at the arrival gate with a name sign, hand over St Barth boarding passes, take you through a VIP fast track at security and escort you to the gate. Also helps on the way back.",
    url: "https://fivestars-stbarth.com/en/vip-services-sju-san-juan-puerto-rico",
    notes: "Provider: Five Stars, based at Rémy de Haenen airport, St Barthélemy (French West Indies). Phone +590 590 52 39 82; WhatsApp +590 690 37 27 73. Built for people flying on to St Barth. Price not listed.",
    phone: "+590 590 52 39 82", email: "info@fivestars-stbarth.com",
  }),

  // ---- United States
  jodogo("miami", "Miami", "United States", "/miami-airport-assistance-services"),
  jodogo("new-york-jfk", "New York", "United States", "/jfk-airport-assistance-services", "JFK"),
  jodogo("newark", "Newark", "United States", "/newark-airport-assistance-services"),
  jodogo("chicago-ohare", "Chicago", "United States", "/ohare-airport-assistance-services", "O'Hare"),
  jodogo("los-angeles", "Los Angeles", "United States", "/losangeles-airport-assistance-services"),
  jodogo("washington-dulles", "Washington DC", "United States", "/dulles-airport-assistance-services", "Dulles"),
  jodogo("denver", "Denver", "United States", "/denver-airport-assistance-services"),
  jodogo("dallas-fort-worth", "Dallas–Fort Worth", "United States", "/dallas-fort-worth-airport-assistance-services"),
  jodogo("boston", "Boston", "United States", "/boston-logan-airport-assistance-services"),
  jodogo("atlanta", "Atlanta", "United States", "/atlanta-airport-assistance-services"),
  jodogo("palm-beach", "Palm Beach", "United States", "/palmbeach-airport-assistance-services"),
  airssist("miami", "Miami", "United States", "https://airssist.com/meet-and-greet-service/miami-airport", "MIA"),
  seed({
    id: "clear-concierge-miami", provider: "Concierge Powered by CLEAR", city: "Miami", country: "United States",
    offers: "A concierge who meets you at the airport, helps with bags and check-in and takes you through security (departures, up to 5 people) or from the gate to your connection or ground transport (arrivals, up to 8). Open to anyone flying through MIA.",
    url: "https://www.clearme.com/clear-mia-concierge",
    notes: "Provider: CLEAR. Booked online at concierge.clearme.com. Its site says departures start at $99 and arrivals are $179 (the page shows $179 beside departures too, so confirm). The email is for escalations and cancelled flights. No phone number is listed.",
    email: "clearconcierge@clearme.com",
  }),
  seed({
    id: "ps-los-angeles", provider: "PS (The Private Suite)", city: "Los Angeles", country: "United States", label: "LAX",
    offers: "A private terminal reached from Imperial Highway: a private suite, a car to the aircraft and a separate check-in and security route, for commercial flights.",
    url: "https://reserveps.com/",
    notes: "Provider: PS, 6875 W. Imperial Highway, Los Angeles. Its site blocks automated visits and shows its emails obfuscated, so no phone or email is copied here: use the contact form on reserveps.com.",
  }),
  seed({
    id: "ps-atlanta", provider: "PS (The Private Suite)", city: "Atlanta", country: "United States", label: "ATL",
    offers: "A private terminal next to the Signature FBO with its own check-in and security, for commercial flights.",
    url: "https://reserveps.com/",
    notes: "Provider: PS, 1210 Toffie Terrace, Atlanta. A magazine review put a visit at about $1,000. Its site blocks automated visits and shows its emails obfuscated, so no phone or email is copied here: use the contact form on reserveps.com.",
  }),

  // ---- the United Kingdom, France, Switzerland
  seed({
    id: "heathrow-vip", provider: "Heathrow VIP", city: "London", country: "United Kingdom", label: "Heathrow",
    offers: "Heathrow's own VIP suite, with private arrival and departure handling and diplomatic rates for official travellers.",
    url: "https://www.heathrowvip.com/",
    notes: "Provider: Heathrow Airport's VIP suite. The email and phone (020 8757 2227, +44 20 8757 2227 from abroad) are from a 2023 UK government protocol document; its own site blocks automated visits, so confirm them. Packages run from hundreds to thousands of pounds.",
    phone: "+44 20 8757 2227", email: "enquiriesvip@heathrow.com",
  }),
  jodogo("london-heathrow", "London", "United Kingdom", "/heathrow-airport-assistance-services", "Heathrow"),
  airssist("london-heathrow", "London", "United Kingdom", "https://airssist.com/meet-and-greet-service/heathrow-airport", "Heathrow"),
  skyvip("london-heathrow", "London", "United Kingdom", "https://skyvipservices.com/airport/london-heathrow-lhr-egll-gb/terminal-3",
    "VIP meet and greet, terminal assistance and a private suite at Heathrow, with lounge access and transfers on request.", "Its site says meet and greet starts from USD 475 and the private suite from USD 6,250."),
  seed({
    id: "marhaba-manchester", provider: "Marhaba", city: "Manchester", country: "United Kingdom",
    offers: "Meet and greet at Manchester Airport.", url: "https://www.marhabaservices.com/ae/english", notes: `${MARHABA_NOTE} Listed from AED 379.`, ...MARHABA,
  }),
  seed({
    id: "extime-paris", provider: "Extime Paris Lounge Network", city: "Paris", country: "France", label: "CDG and Orly",
    offers: "A private car from the aircraft to the Extime lounge at Charles de Gaulle or Orly, run with the airports' operator.",
    url: "https://www.extime.com/en/paris/services/meet-and-greet",
    notes: "Provider: Extime, hosted by ParisAéroport. Phones +33 1 80 90 45 15 and +33 1 89 31 11 91 (second number not copied). Contacts are as quoted from its page by a search, not read on the page itself, so confirm.",
    phone: "+33 1 80 90 45 15", email: "contact@parisloungenetwork.com",
  }),
  seed({
    id: "precellence-paris", provider: "Precellence Service", city: "Paris",  country: "France",
    offers: "A greeter at the aircraft door or station platform at Charles de Gaulle, Orly, Le Bourget and Beauvais, and at Paris railway stations. €250 per arrival at an airport, €290 at a station, up to 3 passengers.",
    url: "https://precellence-service.com/en/services/meet-greet-aeroport-gare-paris",
    notes: "Provider: Precellence Service. WhatsApp +33 7 69 70 00 20. The email is shown obfuscated on its page and is as quoted from another of its pages by a search; its pages also show a different WhatsApp number (+33 6 95 87 81 86), so confirm.",
    phone: "+33 1 58 96 39 43", email: "contact@precellence-service.com",
  }),
  jodogo("paris", "Paris", "France", "/paris-airport-assistance-services"),
  airssist("paris", "Paris", "France", "https://airssist.com/airport-concierge/paris"),
  skyvip("paris-cdg", "Paris", "France", "https://skyvipservices.com/airport/charles-gaulle-cdg-lfpg-fr/fast-track",
    "Meet and greet and fast track at Charles de Gaulle, with transfers sold as an add-on."),
  seed({
    id: "marhaba-geneva", provider: "Marhaba", city: "Geneva", country: "Switzerland",
    offers: "Meet and greet at Geneva Airport.", url: "https://www.marhabaservices.com/ae/english", notes: `${MARHABA_NOTE} Listed from AED 1,392.`, ...MARHABA,
  }),
  jodogo("geneva", "Geneva", "Switzerland", "/geneva-airport-assistance-services"),

  // ---- the Middle East and Turkey
  seed({
    id: "marhaba-dubai", provider: "Marhaba", city: "Dubai", country: "United Arab Emirates", label: "DXB",
    offers: "Meet and greet at Dubai International, from a standard escort to the Elite tier for VIPs.", url: "https://www.marhabaservices.com/ae/english",
    notes: `${MARHABA_NOTE} Dubai listed from AED 136.`, ...MARHABA,
  }),
  jodogo("dubai", "Dubai", "United Arab Emirates", "/dubai-airport-assistance-services"),
  jodogo("abu-dhabi", "Abu Dhabi", "United Arab Emirates", "/abudhabi-airport-assistance-services"),
  jodogo("sharjah", "Sharjah", "United Arab Emirates", "/sharjah-airport-assistance-services"),
  seed({
    id: "al-maha-doha", provider: "Al Maha Services", city: "Doha", country: "Qatar", label: "Hamad International",
    offers: "The airport's own meet-and-assist service, in Gold and Platinum levels, for arrivals, departures and transits. Sold at a sales office on the ground floor of the arrivals hall near Gate 3.",
    url: "https://www.qatarairways.com/en-us/hia-hamad-international-airport/al-maha-services.html",
    notes: "Provider: Al Maha Services, at Hamad International Airport. Qatar Airways' site blocks automated visits, so no contact is copied here. A tour reseller's page gives +974 3329 1629 and +974 3326 6509 for Al Maha; those are not confirmed.",
  }),
  jodogo("doha", "Doha", "Qatar", "/doha-airport-assistance-services"),
  airssist("doha", "Doha", "Qatar", "https://airssist.com/meet-and-greet-service/hamad-airport", "Hamad"),
  jodogo("riyadh", "Riyadh", "Saudi Arabia", "/riyadh-airport-assistance-services"),
  jodogo("jeddah", "Jeddah", "Saudi Arabia", "/jeddah-airport-assistance-services"),
  seed({
    id: "assist-me-istanbul", provider: "Istanbul Airport Assist Me", city: "Istanbul", country: "Türkiye", label: "IST and Sabiha Gökçen",
    offers: "Meet and greet at Istanbul Airport (from €250 plus VAT) and Sabiha Gökçen (from €55 plus VAT): jet-bridge or curbside greeting, buggy, fast-track passport control, customs help, porter and lounge access.",
    url: "https://istanbulairportassistme.com/",
    notes: "Provider: Istanbul Airport Assist Me (istanbulairportassistme.com). Its site shows prices but no phone or email in readable form; use its contact page or Instagram (@istanbul_airport_assistme). Its guides say private-terminal bookings go through istanbulairportvip.com.",
  }),
  jodogo("istanbul", "Istanbul", "Türkiye", "/istanbul-airport-assistance-services"),
  airssist("istanbul", "Istanbul", "Türkiye", "https://airssist.com/meet-and-greet-service/istanbul-airport/"),
  skyvip("istanbul", "Istanbul", "Türkiye", "https://skyvipservices.com/blog/abc1", "Airport assistance at Istanbul Airport (IST)."),
  jodogo("cairo", "Cairo", "Egypt", "/cairo-airport-assistance-services"),

  // ---- Asia and the Pacific
  seed({
    id: "changi-recommends-singapore", provider: "Changi Recommends Meet & Greet", city: "Singapore", country: "Singapore", label: "Changi",
    offers: "The airport's official meet and greet. The Deluxe tier gives you a dedicated concierge; Classic Plus and a mobility companion service (from S$150) are also offered. Book at least 48 hours ahead.",
    url: "https://www.changirecommends.com/meetandgreet.aspx",
    notes: "Provider: Changi Recommends, for Changi Airport. General enquiries: call@changirecommends.com.sg. The page's phone link points to +65 8300 0160, a different number from the one shown, so confirm which to call. Deluxe and Classic Plus prices are not listed.",
    phone: "+65 8051 9119", email: "changimeetgreet@changirecommends.com.sg",
  }),
  seed({
    id: "jetquay-singapore", provider: "JetQuay", city: "Singapore", country: "Singapore", label: "Changi",
    offers: "A private airport concierge at Changi for executives, families, delegations and corporate travellers: Gateway, Quayside and Jetside packages with meet and greet and private lounge access.",
    url: "https://www.jetquay.com.sg/",
    notes: "Provider: JetQuay. The email is from its privacy policy page as quoted by a search; the pages read here show no phone or email, so confirm.",
    email: "reservations@jetquay.com.sg",
  }),
  jodogo("singapore", "Singapore", "Singapore", "/singapore-airport-assistance-services"),
  airssist("singapore", "Singapore", "Singapore", "https://airssist.com/airport-concierge/singapore-changi/", "Changi"),
  seed({
    id: "plaza-premium-hong-kong", provider: "Plaza Premium Group (ALLWAYS)", city: "Hong Kong", country: "China", label: "HKIA",
    offers: "The airport's meet-and-assist brand: a personal assistant meets you at a set point, helps with formalities and security and escorts you to baggage claim, a lounge or the gate. Counters in Terminals 1 and 2, with porter and limousine transfers by advance booking.",
    url: "https://www.plazapremiumlounge.com/contact-us/",
    notes: "Provider: Plaza Premium Group. The phone is its lounge management office (9am–6pm, Monday–Friday), as quoted from its contact page; the company's contact centre runs 24 hours and the number was not read. A corporate listing gives +852 3960 1300. No service email was found.",
    phone: "+852 5700 5329",
  }),
  jodogo("hong-kong", "Hong Kong", "China", "/hong-kong-airport-assistance-services"),
  jodogo("beijing", "Beijing", "China", "/beijing-airport-assistance-services"),
  jodogo("shanghai", "Shanghai", "China", "/pudong-airport-assistance-services", "Pudong"),
  jodogo("guangzhou", "Guangzhou", "China", "/guangzhou-baiyun-airport-assistance-services", "Baiyun"),
  seed({
    id: "japan-royal-service-tokyo", provider: "Japan Royal Service", city: "Tokyo", country: "Japan", label: "Haneda and Narita",
    offers: "Meet and greet with a chauffeured transfer from Haneda or Narita: from ¥45,000 (Haneda) and ¥55,000 (Narita) one way, with a 20% supplement between 10pm and 6am.",
    url: "https://japanroyalservice.com/services/transportation/tokyo-airport-transfer",
    notes: "Provider: Japan Royal Service. The phone is its WhatsApp number. Its prices are estimates, not quotes. No street address is shown.",
    phone: "+81 70 1378 1777", email: "info@japanroyalservice.com",
  }),
  jodogo("tokyo", "Tokyo", "Japan", "/tokyo-airport-assistance-services"),
  jodogo("narita", "Narita", "Japan", "/narita-airport-assistance-services"),
  airssist("tokyo-narita", "Tokyo", "Japan", "https://airssist.com/meet-and-greet-service/narita-airport", "Narita"),
  jodogo("seoul", "Seoul", "South Korea", "/seoul-incheon-airport-assistance-services", "Incheon"),
  jodogo("bangkok", "Bangkok", "Thailand", "/bangkok-airport-assistance-services"),
  jodogo("kuala-lumpur", "Kuala Lumpur", "Malaysia", "/kuala-lumpur-airport-assistance-services"),
  jodogo("manila", "Manila", "Philippines", "/ninoy-aquino-airport-assistance-services", "Ninoy Aquino"),
  jodogo("colombo", "Colombo", "Sri Lanka", "/colombo-airport-assistance-services"),
  jodogo("delhi", "Delhi", "India", "/delhi-airport-assistance-services"),
  jodogo("mumbai", "Mumbai", "India", "/mumbai-airport-assistance-services"),
  jodogo("bangalore", "Bangalore", "India", "/bangalore-airport-assistance-services"),
  jodogo("chennai", "Chennai", "India", "/chennai-airport-assistance-services"),
  jodogo("kolkata", "Kolkata", "India", "/kolkata-airport-assistance-services"),
  jodogo("sydney", "Sydney", "Australia", "/sydney-airport-assistance-services"),
  jodogo("melbourne", "Melbourne", "Australia", "/melbourne-airport-assistance-services"),

  // ---- Europe
  jodogo("amsterdam", "Amsterdam", "Netherlands", "/amsterdam-airport-assistance-services"),
  jodogo("frankfurt", "Frankfurt", "Germany", "/frankfurt-airport-assistance-services"),
  jodogo("madrid", "Madrid", "Spain", "/adolfo-suarez-madrid-barajas-airport-assistance-services", "Barajas"),
  jodogo("rome", "Rome", "Italy", "/rome-airport-assistance-services"),
  jodogo("milan", "Milan", "Italy", "/milan-malpensa-airport-assistance-services", "Malpensa"),
  jodogo("athens", "Athens", "Greece", "/athens-airport-assistance-services"),

  // ---- Africa
  jodogo("nairobi", "Nairobi", "Kenya", "/nairobi-airport-assistance-services"),
  jodogo("johannesburg", "Johannesburg", "South Africa", "/johannesburg-airport-assistance-services"),
  jodogo("cape-town", "Cape Town", "South Africa", "/capetown-airport-assistance-services"),
  airssist("johannesburg", "Johannesburg", "South Africa", "https://airssist.com/meet-and-greet-service/o-r-tambo-airport/", "O. R. Tambo"),
  airssist("cape-town", "Cape Town", "South Africa", "https://airssist.com/meet-and-greet-service/cape-town-airport/"),

  // ---- the Americas
  jodogo("toronto", "Toronto", "Canada", "/toronto-airport-assistance-services"),
  jodogo("mexico-city", "Mexico City", "Mexico", "/mexico-airport-assistance-services"),
  jodogo("cancun", "Cancún", "Mexico", "/cancun-airport-assistance-services"),
  airssist("cancun", "Cancún", "Mexico", "https://airssist.com/meet-and-greet-service/cancun"),
  skyvip("cancun", "Cancún", "Mexico", "https://skyvipservices.com/airport/cancun-cun-mmun-mx/fast-track", "Meet and greet and fast track at Cancún airport."),
  jodogo("sao-paulo", "São Paulo", "Brazil", "/sao-paulo-airport-assistance-services"),

  // ---- companies that cover airports in many countries (no single city)
  seed({
    id: "royal-airport-concierge", provider: "Royal Airport Concierge", city: "Worldwide", country: "Worldwide",
    offers: "VIP airport meet and greet at 500+ airports worldwide.", url: "https://www.royalairportconcierge.com/",
    notes: "Provider: Royal Airport Concierge. Phones: +1 (855) 455-1555 (US only) and +1 (202) 883-3332 (a Washington, DC number). Its email is shown obfuscated, so it is not copied here. Where it is based is not stated. Use it when the city is not above.",
    phone: "+1 (855) 455-1555",
  }),
  seed({
    id: "airportassist-network", provider: "AirportAssist", city: "Worldwide", country: "Worldwide",
    offers: "A network that says it serves 1,156 airports in 195 countries, with meet and greet, VIP and fast-track services.", url: "https://www.airportassist.com/",
    notes: "Provider: AirportAssist. WhatsApp +1 302 300 1122; Telegram @AirportAssist. Where it is based is not stated. Use it when the city is not above.",
    phone: "+1 650 308 9964", email: "service@airportassist.com",
  }),
];
