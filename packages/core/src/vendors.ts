/**
 * The businesses that could help Safehubby put on its events — the Wingman
 * Club's monthly outings and its surprise events — kept as leads the owner
 * works through: found, contacted, quoted, booked.
 *
 * `SUGGESTED_VENDORS` is research, not a relationship. Each entry says what
 * the business does and where it was found. The prices in the notes come from
 * third-party listings and may be out of date, and nothing here was confirmed
 * with the business. There are no phone numbers or email addresses on
 * purpose: none were published in what was found, and the owner adds the real
 * contact once somebody answers.
 */

export type VendorCategory =
  | "boats" | "bio-bay" | "skydiving" | "rum-cigars" | "private-chef" | "fishing" | "air" | "off-road" | "event-planner" | "growth";

export const VENDOR_CATEGORIES: { id: VendorCategory; label: string }[] = [
  { id: "event-planner", label: "Event planners and DMCs" },
  { id: "boats", label: "Boats and sailing" },
  { id: "bio-bay", label: "Bioluminescent bays" },
  { id: "fishing", label: "Deep-sea fishing" },
  { id: "air", label: "Helicopter and seaplane" },
  { id: "skydiving", label: "Skydiving" },
  { id: "off-road", label: "Off-road and adventure" },
  { id: "rum-cigars", label: "Rum and cigars" },
  { id: "private-chef", label: "Private chefs and dining" },
  { id: "growth", label: "Growth, business and networking" },
];

export type VendorStatus = "lead" | "contacted" | "quoted" | "booked" | "declined";
export const VENDOR_STATUSES: VendorStatus[] = ["lead", "contacted", "quoted", "booked", "declined"];

export interface Vendor {
  id: string;
  name: string;
  category: VendorCategory;
  /** Where in Puerto Rico it works. */
  area: string;
  /** What it does, in a sentence. */
  offers: string;
  /** Where it was found, or its own site when that is the source. */
  sourceUrl?: string;
  /** What the research said about price and fit, and how reliable that is. */
  notes: string;
  status: VendorStatus;
  /** Filled in by the owner once somebody answers. */
  contactName?: string;
  phone?: string;
  email?: string;
  /** The owner's own notes: what they said, what was quoted, what was agreed. */
  ownerNotes?: string;
  updatedAt: string;
}

type Seed = Omit<Vendor, "status" | "updatedAt">;

const L = "Third-party listing price; confirm with the operator.";

export const SUGGESTED_VENDORS: Seed[] = [
  // ---- the people who can coordinate a whole event
  { id: "vnd-destination-pr", name: "Destination Puerto Rico (Travel Services, Inc.)", category: "event-planner", area: "San Juan",
    offers: "Destination management company: teambuilding, themed events, restaurant coordination and off-site venues. Says it has served the island since 1955 and is DMC-accredited (ADME).",
    notes: "Self-reported profile. A strong first call to coordinate several events at once." },
  { id: "vnd-group-services", name: "Group Services, Inc.", category: "event-planner", area: "San Juan and Fajardo",
    offers: "Full-service DMC with offices in San Juan and Fajardo: team building, golf programs, eco-tours and customised group experiences.",
    sourceUrl: "https://www.discoverpuertorico.com/profile/group-services-inc", notes: "Self-reported profile. Fajardo office is handy for boat and bio-bay days." },
  { id: "vnd-rico-sun-tours", name: "Rico Sun Tours (RST Destination Management Company)", category: "event-planner", area: "Island-wide",
    offers: "DMC for groups of 1 to 1,000+: meet and greet, transport from an SUV to a coach, dine-around programmes, team building. Locally owned.",
    sourceUrl: "https://www.discoverpuertorico.com/es/profile/rst-destination-management-company", notes: "Self-reported profile." },
  { id: "vnd-innovation-dmc", name: "Innovation DMC", category: "event-planner", area: "San Juan",
    offers: "Full-service DMC: site selection, transport, vendor selection and on-site staffing.", notes: "Self-reported; found in a search of Puerto Rico DMCs." },
  { id: "vnd-cube-events", name: "CUBE Events", category: "event-planner", area: "Puerto Rico",
    offers: "Agency for planning, production and management of high-impact corporate events, conferences and summits.", notes: "An event agency rather than a DMC. Better for big, produced evenings than for outings." },

  // ---- boats and sailing
  { id: "vnd-caribe-bliss", name: "Caribe Bliss", category: "boats", area: "Fajardo",
    offers: "Private Grady White and luxury catamaran charters with snorkelling, paddleboarding and water toys, crewed or bareboat.",
    sourceUrl: "https://app.advcollective.com/local-experts/grady-white-private-boat-charter-icacos-island-caribe-bliss", notes: "Ask whether they can add Culebra's Flamenco Beach; the listing doesn't say." },
  { id: "vnd-pure-adventure", name: "Pure Adventure Corp.", category: "boats", area: "Fajardo, Culebra, Vieques",
    offers: "Private snorkel-and-cruise on a 36 ft catamaran with a marine biologist and captain, for small groups of 1-6. Also guides bio-bay kayaking at Laguna Grande.",
    sourceUrl: "https://www.expedia.com/things-to-do/private-snorkel-and-cruise-experience-in-ceiba.a46467416.activity-details", notes: "One listing showed $998 a traveller. Prices differ by site. Small groups only." },
  { id: "vnd-sailo-catamarans", name: "Captained catamarans from Marina Puerto del Rey (via Sailo)", category: "boats", area: "Fajardo",
    offers: "Six-hour charters on 40-45 ft catamarans for 20-28 guests with a reef stop, a beach and a buffet lunch.",
    sourceUrl: "https://www.sailo.com/boats/Fajardo_Puerto_Rico/Motor/rental_boat_46481/", notes: "One listing showed $2,895 for 15 guests for six hours. A reviewer found the 45 ft boat more of an excursion boat than a private cruiser. 14-day cancellation window." },

  // ---- bioluminescent bays
  { id: "vnd-borikua-tours", name: "Borikua Tours", category: "bio-bay", area: "Vieques (Esperanza)",
    offers: "One-hour kayak experience in Mosquito Bay, the brightest bioluminescent bay.",
    sourceUrl: "https://www.travelocity.com/things-to-do/mosquito-bay-kayak-experience-in-vieques.a47904089.activity-details", notes: "Listed at $95 an adult. Vieques means a ferry or flight and usually a night there. Best near the new moon." },
  { id: "vnd-kayaking-pr", name: "Kayaking Puerto Rico", category: "bio-bay", area: "Fajardo (Laguna Grande)",
    offers: "Guided kayak tours of the Laguna Grande bioluminescent lagoon.",
    sourceUrl: "https://www.travelawaits.com/2784328/tips-for-taking-a-bioluminescent-tour-in-puerto-rico/", notes: "Named in a travel article; confirm group sizes and private bookings." },
  { id: "vnd-pr-bio-bay-tours", name: "Puerto Rico Bio Bay Tours", category: "bio-bay", area: "Fajardo (Laguna Grande)",
    offers: "Bioluminescent bay tours at Laguna Grande.",
    sourceUrl: "https://www.travelawaits.com/2784328/tips-for-taking-a-bioluminescent-tour-in-puerto-rico/", notes: "Named in a travel article; confirm group sizes and private bookings." },

  // ---- deep-sea fishing
  { id: "vnd-the-legend", name: "\"The Legend\" 48 ft Hatteras", category: "fishing", area: "San Juan Bay",
    offers: "Private offshore fishing charter for up to six anglers; half-day to full-day trips, 25 minutes from the marina. Gear, bait, licence, captain and crew included.",
    sourceUrl: "https://feverup.com/m/683871/en", notes: "Listings showed $1,363 for a short trip and $1,629 for six hours. " + L },
  { id: "vnd-ocean-pro", name: "Ocean Pro Adventure", category: "fishing", area: "Fajardo",
    offers: "Deep-sea fishing charters out of Fajardo on boats around 55 ft.",
    sourceUrl: "https://fishanywhere.com/locations/puerto-rico/fajardo/technique/deep_sea_fishing", notes: "The page reports an average trip price of $2,416. " + L },

  // ---- air
  { id: "vnd-caribbean-helicopters", name: "Caribbean Helicopters", category: "air", area: "San Juan (Isla Grande)",
    offers: "Private 25- and 45-minute helicopter tours over Old San Juan, the coast to Dorado and the canyons; the short one circles the Bacardí distillery.",
    sourceUrl: "https://www.expedia.com/things-to-do/private-45-minute-helicopter-tour-across-puerto-rico.a47218550.activity-details", notes: "Listed at $285 an adult (25 min) and $495 (45 min). " + L },
  { id: "vnd-pr-helitours", name: "Puerto Rico Helitours", category: "air", area: "San Juan",
    offers: "Short helicopter tours over El Morro and the canyons (about 10-12 minutes).",
    sourceUrl: "https://magpie.travel/things-to-do/the-enchanted-shore-helitour/193f7cf9-2bd9-42e4-9e67-579476989050", notes: "Cheapest option, listed from about $154. Much shorter flights." },
  { id: "vnd-flapper", name: "Flapper", category: "air", area: "San Juan",
    offers: "Private aviation company with premium sightseeing flights and private jet charter.",
    sourceUrl: "https://flyflapper.com/en-US/private-jet-charter/puerto-rico/puerto-rico/san-juan-(puerto-rico)", notes: "Could cover the finale trip to another island." },
  { id: "vnd-tropic-ocean", name: "Tropic Ocean Airways", category: "air", area: "San Juan (SJU and Old San Juan dock)",
    offers: "Seaplane flights that take off and land on water, from the airport or the Bahía Urbana dock.",
    sourceUrl: "https://flytropic.com/?p=629", notes: "Fixed-wing, not a helicopter. A memorable way to reach Culebra or Vieques." },

  // ---- skydiving. Whoever jumps, the club needs the operator's USPA affiliation,
  // its insurance and a signed waiver for every member before a date is set.
  { id: "vnd-skydive-pr", name: "Skydive Puerto Rico", category: "skydiving", area: "Arecibo",
    offers: "A drop zone that hosted a 400-person skydiving boogie in February 2024, with two Twin Otters and its own Caravan; jumps go out over the beach and the field.",
    sourceUrl: "https://parachutist.com/p/PgrID/2839/PageID/43/ArtMID/2834/ArticleID/9399",
    notes: "Found in a trade-magazine report on the event, so it is proven at scale. Tandem prices and group terms were not found: ask for a private group tandem day and for proof of insurance." },
  { id: "vnd-xtreme-divers", name: "Xtreme Divers", category: "skydiving", area: "Arecibo airport",
    offers: "Skydiving operation founded in 2002 that has run free-fall jumps from the Arecibo airport.",
    sourceUrl: "https://nowtoronto.com/lifestyle/puerto-rican-free-fall/",
    notes: "The sources are an undated article and a 2019 travel blog (a $50-a-person deposit, weekends or by appointment). Confirm it is still operating before you rely on it." },

  // ---- off-road and adventure
  { id: "vnd-carabali", name: "Carabalí Rainforest Park", category: "off-road", area: "Luquillo (El Yunque foothills)",
    offers: "Guided UTV rides through rainforest trails and a ranch.",
    sourceUrl: "https://www.expedia.com/things-to-do/carabali-rainforest-park-utv-adventure-tour.a47971785.activity-details", notes: "Listed at $162 a traveller for one hour. " + L },
  { id: "vnd-offroad-pr", name: "Offroad Puerto Rico (Dos Mares tour)", category: "off-road", area: "Fajardo and El Yunque",
    offers: "One-hour mountain and rainforest UTV route.",
    sourceUrl: "https://www.expedia.com.my/ms/things-to-do/dos-mares-and-rainforest-utv-adventure-tour-in-fajardo.a49453202.activity-details", notes: "Ask about a private group day with a cookout." },

  // ---- rum and cigars
  { id: "vnd-casa-bacardi", name: "Casa Bacardí", category: "rum-cigars", area: "Cataño (San Juan)",
    offers: "Tours and tastings at the distillery, including the Maestro's Walk and a Founder's Experience; private cocktail classes and tastings with an engraved bottle for groups.",
    sourceUrl: "https://www.bacardi.com/casa-bacardi/tickets/", notes: "Maestro's Walk listed at $80 plus tax. Founder's Experience about $300 on cruise-excursion pages. Ask for the private group options." },
  { id: "vnd-sj-artisan-distillers", name: "San Juan Artisan Distillers", category: "rum-cigars", area: "San Juan",
    offers: "A private 1.5-hour distillery tour and rum tasting for 1 to 15 guests.",
    sourceUrl: "https://www.byfood.com/experiences/sugarcane-estate-rum-distillery-tour-51758", notes: "A good fit for a blending night." },
  { id: "vnd-barrilito", name: "Ron del Barrilito (Hacienda Santa Ana)", category: "rum-cigars", area: "Bayamón",
    offers: "Artisanal rum made at a distillery open to the public.",
    sourceUrl: "https://www.discoverpuertorico.com/meetings/article/incorporating-mixology-rum-into-your-meeting", notes: "Check whether they host private groups." },
  { id: "vnd-cigar-workshop", name: "Cigar rolling workshop (Río Grande)", category: "rum-cigars", area: "Río Grande",
    offers: "A workshop where guests roll an artisan cigar from locally grown tobacco.",
    notes: "Listed at $147 a person on a tour-booking site; the operator's name was not shown. Find the operator before approaching." },

  // ---- private chefs and dining
  { id: "vnd-el-pescador", name: "El Pescador PR", category: "private-chef", area: "Manatí",
    offers: "Seafood-focused private chef service, \"ocean to table\", for homes and rentals; customised private events.",
    notes: "Confirm they cover San Juan and the east coast, and whether they serve on a beach." },
  { id: "vnd-chef-horta", name: "Chef Horta (via Traveling Spoon)", category: "private-chef", area: "San Juan",
    offers: "Private chef who cooks an authentic Puerto Rican meal at a villa or rental for 2-10 guests.",
    sourceUrl: "https://travelingspoon.com/hosts/17933-private-chef-service-in-san-juan-nearby-areas", notes: "Small groups only." },
  { id: "vnd-take-a-chef", name: "Take a Chef (marketplace)", category: "private-chef", area: "Río San Juan",
    offers: "Request menu proposals from local private chefs and chat with them until you pick one.",
    sourceUrl: "https://www.takeachef.com/en-en/private-chef/departamento-de-rio-san-juan", notes: "A fast way to compare chefs for a beach dinner." },
  { id: "vnd-chefs-studio", name: "El San Juan Resort & Casino, Chef's Studio", category: "private-chef", area: "Isla Verde, San Juan",
    offers: "Private dining for up to eight guests with a custom menu and wine pairings from the executive chef, by reservation.",
    sourceUrl: "https://meetingstoday.com/articles/132865/puerto-rican-resort-debuts-unique-chefs-studio", notes: "A hotel kitchen, so it suits a founders' dinner, not a beach." },

  // ---- growth, business and networking
  { id: "vnd-uncommon-entrepreneurs", name: "Uncommon EntrePReneurs", category: "growth", area: "San Juan",
    offers: "A monthly networking evening for founders, investors and business leaders, with short presentations.",
    sourceUrl: "https://meetup.com/uncommon-entrepreneurs-networking-events", notes: "Good for a partnership: speakers for a founders' dinner, or members at their events." },
  { id: "vnd-endeavor-pr", name: "Endeavor Puerto Rico", category: "growth", area: "San Juan",
    offers: "A global network of high-impact entrepreneurs; hosted a Meeting of the Americas in San Juan.",
    sourceUrl: "https://newsismybusiness.com/endeavor-hosts-first-ever-meeting-of-the-americas-in-san-juan/", notes: "Entrepreneurs here could be dinner speakers or mentors. Membership is selective." },
  { id: "vnd-cdvca", name: "Community Development Venture Capital Alliance (CDVCA)", category: "growth", area: "San Juan",
    offers: "Ran a quarterly Angel Investor Insights Series in 2025 connecting entrepreneurs with capital providers.",
    sourceUrl: "https://newsismybusiness.com/cdvca-wraps-2025-investor-series-after-san-juan-finale", notes: "A source of investor speakers for a pitch night." },
  { id: "vnd-be-fest", name: "Boricua Entrepreneur Fest (BE Fest)", category: "growth", area: "San Juan",
    offers: "Puerto Rico's largest entrepreneurship event, with networking, sessions and mentorship.",
    sourceUrl: "https://federallabs.org/events/2026-boricua-entrepreneur-fest-(be-fest)", notes: "The 2026 edition was listed for September 4. Could be a member outing." },
];
