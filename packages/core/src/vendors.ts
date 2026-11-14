/**
 * The businesses that could help Safehubby put on its events — the Wingman
 * Club's monthly outings and its surprise events — kept as leads the owner
 * works through: found, contacted, quoted, booked.
 *
 * `SUGGESTED_VENDORS` is research, not a relationship. Each entry says what
 * the business does and where it was found. The prices in the notes come from
 * third-party listings and may be out of date, and nothing here was confirmed
 * with the business. Phone numbers and emails appear only where the business
 * published one itself; otherwise none were found, and the owner adds the real
 * contact once somebody answers.
 */

export type VendorCategory =
  | "boats" | "bio-bay" | "skydiving" | "motorsport" | "rum-cigars" | "wine" | "transport" | "cleaning" | "flowers" | "private-chef" | "fishing" | "air" | "off-road" | "event-planner" | "hotels" | "growth";

export const VENDOR_CATEGORIES: { id: VendorCategory; label: string }[] = [
  { id: "event-planner", label: "Event planners and DMCs" },
  { id: "boats", label: "Boats and sailing" },
  { id: "bio-bay", label: "Bioluminescent bays" },
  { id: "fishing", label: "Deep-sea fishing" },
  { id: "air", label: "Helicopter and seaplane" },
  { id: "skydiving", label: "Skydiving" },
  { id: "motorsport", label: "Drifting and motorsport" },
  { id: "off-road", label: "Off-road and adventure" },
  { id: "rum-cigars", label: "Rum and cigars" },
  { id: "wine", label: "Wine and tastings" },
  { id: "transport", label: "Chauffeurs and transport" },
  { id: "hotels", label: "Hotels and travel perks" },
  { id: "cleaning", label: "Home cleaning and maintenance" },
  { id: "flowers", label: "Flowers and gifts" },
  { id: "private-chef", label: "Private chefs and dining" },
  { id: "growth", label: "Growth, business and networking" },
];

export type VendorStatus = "lead" | "contacted" | "quoted" | "booked" | "declined";
export const VENDOR_STATUSES: VendorStatus[] = ["lead", "contacted", "quoted", "booked", "declined"];

/** A named list of vendors for one area the owner works in ("Puerto Rico vendors", "Texas"). */
export interface VendorList { id: string; name: string }

/** Where the researched Puerto Rico vendors, and any vendor with no list, live until the owner moves them. */
export const DEFAULT_VENDOR_LIST: VendorList = { id: "list-puerto-rico", name: "Puerto Rico vendors" };

/** Where researched vendors based on the mainland are filed, so they are not mistaken for Puerto Rico ones. */
export const UNITED_STATES_VENDOR_LIST: VendorList = { id: "list-united-states", name: "United States vendors" };

/** Lists a suggested vendor can be filed under, created the first time one of their vendors is loaded. */
export const SUGGESTED_VENDOR_LISTS: VendorList[] = [UNITED_STATES_VENDOR_LIST];

export interface Vendor {
  id: string;
  /** The list it is saved under. Absent on older records, which belong to the default list. */
  listId?: string;
  name: string;
  category: VendorCategory;
  /** Where it works: a town in Puerto Rico, or a city for a vendor based elsewhere. */
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

/**
 * Hotel booking services and perks programs like Lartisien and Mr & Mrs Smith, in Puerto
 * Rico and the US: partners for booking members' hotels with extras (breakfast, upgrades,
 * hotel credit). Researched on 2026-11-14. A phone or email is set only where the business
 * published it on its own site; a number found only in a directory is in the notes, to confirm.
 */
const US = UNITED_STATES_VENDOR_LIST.id;
export const HOTEL_PROGRAM_VENDORS: Seed[] = [
  // ---- Puerto Rico
  { id: "vnd-el-san-juan-club", name: "El San Juan Club (Fairmont El San Juan)", category: "hotels", area: "Carolina (Isla Verde)",
    offers: "By-application members club at the Fairmont El San Juan: beach club, spa and gym, dining discounts and early invitations to hotel events.",
    sourceUrl: "https://elsanjuanhotel.com/explore/membership", phone: "787-791-1000",
    notes: "The number is the hotel's main line (US and Canada: 1-800-819-7155); its membership email is behind a contact form. Membership price is not public, so ask. A fit for Elite members and events." },
  { id: "vnd-condado-travel", name: "Condado Travel Inc.", category: "hotels", area: "San Juan",
    offers: "Puerto Rican travel agency since 1969 and a Virtuoso member since 2001, so it can book Virtuoso hotel perks: breakfast, upgrades and hotel credit.",
    sourceUrl: "https://virtuoso.com/agencies/2113/condado-travel-inc",
    notes: "No public phone or email was found. One directory lists an address in Manatí. A local partner for hotel bookings with perks." },
  { id: "vnd-etc-puerto-rico", name: "ETC Puerto Rico", category: "transport", area: "San Juan area (SJU and BQN airports)",
    offers: "VIP airport service, chauffeured SUVs, concierge bookings, lifestyle management and relocation help.",
    sourceUrl: "https://etcpuertorico.squarespace.com/contact-us", phone: "939-775-7380", email: "info@etcpuertorico.com",
    notes: "Contacts from its own site. Prices on request. It overlaps with Safehubby, so treat it as a partner or a competitor." },
  { id: "vnd-the-reserve-pr", name: "The Reserve PR", category: "event-planner", area: "Puerto Rico",
    offers: "Concierge and management for private homes and vacation rentals, plus event planning.",
    sourceUrl: "https://www.discoverpuertorico.com/profile/reserve-pr/14637",
    notes: "Self-reported listing. No phone or email was found." },

  // ---- United States
  { id: "vnd-virtuoso", listId: US, name: "Virtuoso", category: "hotels", area: "Fort Worth, Texas",
    offers: "Network of luxury travel agencies. Booking a member hotel through a Virtuoso advisor usually adds breakfast for two, an upgrade when available and a $100 credit.",
    sourceUrl: "https://www.virtuoso.com/why-virtuoso/about-us/contact-us", phone: "817-870-0300",
    notes: "Head office line from its own site. Its only published email is for the press (PR@virtuoso.com). No membership for travelers: you book through a member agency." },
  { id: "vnd-fora", listId: US, name: "Fora Travel", category: "hotels", area: "New York, New York",
    offers: "Platform for independent travel advisors. Advisor-only programs like Hyatt Privé, Hilton for Luxury and Marriott STARS take bookings only from advisors, and joining a platform like this is the usual way in.",
    sourceUrl: "https://www.foratravel.com/contact-us", email: "support@foratravel.com",
    notes: "Advisors pay $299 a year or $99 a quarter. Hotel partners: suppliers@foratravel.com (own site). Listed number (844) 409-3672 is from a business directory; confirm." },
  { id: "vnd-lhw", listId: US, name: "Leading Hotels of the World (Leaders Club)", category: "hotels", area: "New York, New York",
    offers: "400+ independent luxury hotels. Leaders Club members get breakfast for two, upgrades when available and hotel extras.",
    sourceUrl: "https://www.lhw.com/press-center/0624_Leaders_Club_Complimentary",
    notes: "Leaders Club is free now; the old $175 a year fee was dropped. No phone or email was found: the site uses a customer care form." },
  { id: "vnd-preferred-hotels", listId: US, name: "Preferred Hotels & Resorts", category: "hotels", area: "Chicago, Illinois",
    offers: "Independent luxury hotels with the I Prefer rewards program.",
    sourceUrl: "https://hospitalitynet.org/brand/23000333/preferred-hotels-resorts.html",
    notes: "Listed number +1 312 913 0400 is from a hospitality directory; confirm. I Prefer's price is not shown." },
  { id: "vnd-signature-travel", listId: US, name: "Signature Travel Network", category: "hotels", area: "El Segundo, California (office in New York)",
    offers: "Member-owned network of 15,000+ travel advisors, with perks at partner hotels through its agencies.",
    sourceUrl: "https://hostagencyreviews.com/consortia/signature",
    notes: "Agencies apply to join; the fee is not public. Listed number +1 212-239-7388 (New York) is from a business directory; confirm." },
  { id: "vnd-five-star-alliance", listId: US, name: "Five Star Alliance", category: "hotels", area: "Washington, DC",
    offers: "Books five-star hotels with special offers. Reservation agents answer the phone 24/7.",
    sourceUrl: "https://www.fivestaralliance.com/luxury-hotel-experts/hoteliers/hotelier-contact-us", phone: "1-888-578-2711",
    notes: "International line +1-703-836-0692, also from its own site. No membership." },
  { id: "vnd-skylark", listId: US, name: "Skylark", category: "hotels", area: "New York, New York",
    offers: "Luxury hotel booking with travel advisors. Members get perks at many hotels, often listed at $195 or more per stay.",
    sourceUrl: "https://skylark.com/destinations/north-america/united-states/rhode-island/newport-rhode-island", phone: "212-759-5275", email: "info@skylark.com",
    notes: "Its site lists the number as (212) SKYLARK. Free to join; a paid Signature Status is listed at $3,500 a year." },
  { id: "vnd-indagare", listId: US, name: "Indagare", category: "hotels", area: "New York, New York",
    offers: "Members-only travel company: hotel bookings with perks and trip planning.",
    sourceUrl: "https://www.indagare.com/contact", phone: "212-988-2611", email: "hotel.reservations@indagare.com",
    notes: "The email is for hotel bookings. Self Planner membership is $395 a year as a gift; there is a 30-day free trial." },
  { id: "vnd-inspirato", listId: US, name: "Inspirato", category: "hotels", area: "Denver, Colorado",
    offers: "Subscription club for luxury homes and hotels. Bought by Exclusive Resorts in February 2026.",
    sourceUrl: "https://www.inspirato.com/contact-us", phone: "888-625-7525", email: "info@inspirato.com",
    notes: "Membership line from its own site; office (303) 586-7771, Spanish 1-800-681-1853. Club list price $15,000 a year; a five-year plan is advertised at $3,000 a year." },
  { id: "vnd-exclusive-resorts", listId: US, name: "Exclusive Resorts", category: "hotels", area: "Denver, Colorado",
    offers: "Private club of luxury vacation homes and hotel stays. Now owns Inspirato.",
    sourceUrl: "https://www.papercitymag.com/276h",
    notes: "From $195,000 to join, plus yearly dues, per a magazine report. Listed number 1-800-447-8988 is from business directories; confirm." },
  { id: "vnd-embark-beyond", listId: US, name: "Embark Beyond", category: "hotels", area: "New York, New York",
    offers: "Luxury travel agency in the Virtuoso network, with perks at 1,000+ luxury hotels.",
    sourceUrl: "https://www.virtuoso.com/agencies/15793613/embark-beyond",
    notes: "No public phone or email was found. Address: 133 West 19th Street, New York." },
  { id: "vnd-amex-fhr", listId: US, name: "American Express Fine Hotels + Resorts", category: "hotels", area: "New York, New York",
    offers: "Platinum Card members who book through Amex Travel get hotel perks and up to $600 a year in hotel credits.",
    sourceUrl: "https://www.americanexpress.com/idc/en/benefits/the-platinum-card/fine-hotels-and-resorts.html",
    notes: "A card benefit, not a vendor deal: useful for members who hold the card ($895 a year). An Amex page lists 1-800-801-6564, but it may be for another card program; cardholders should call the number on their card." },
  { id: "vnd-chase-edit", listId: US, name: "Chase Sapphire Reserve: The Edit", category: "hotels", area: "New York, New York",
    offers: "1,371 hotels with perks booked through Chase Travel, with a $500 Edit credit plus a $250 select-hotel credit in 2026.",
    sourceUrl: "https://thriftytraveler.com/guides/credit-card/the-edit-by-chase-travel/",
    notes: "A card benefit, not a vendor deal: the card is $795 a year. Cardholders call the number on their card." },
  { id: "vnd-capital-one-premier", listId: US, name: "Capital One Premier Collection", category: "hotels", area: "McLean, Virginia",
    offers: "Venture X cardholders get luxury hotel perks, including a $100 experience credit, when they book through Capital One Travel.",
    sourceUrl: "https://www.cnbc.com/select/capital-one-premier-collection/",
    notes: "A card benefit, not a vendor deal: the Venture X card is $395 a year. Cardholders call the number on their card." },
  { id: "vnd-private-upgrades", listId: US, name: "PrivateUpgrades", category: "hotels", area: "Switzerland (US phone line)",
    offers: "Free club: breakfast for two, a hotel credit of about $100 and upgrades when available, at 2,500+ hotels.",
    sourceUrl: "https://privateupgrades.com/faq", phone: "617-778-2318",
    notes: "Free membership. A Swiss company; the US line is from its own site. No email was published." },
];

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
    offers: "Private offshore fishing charter for up to six anglers; half-day to full-day trips, 25 minutes from the marina. Gear, bait, license, captain and crew included.",
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

  // ---- drifting and motorsport. No drift school or paid driving experience turned
  // up in Puerto Rico, so a drift day would be built with local drivers and a venue.
  // That needs the venue's insurance, helmets, a safety crew and a waiver for every member.
  { id: "vnd-arecibo-motorsport", name: "Arecibo Motorsport", category: "motorsport", area: "Arecibo",
    offers: "A motorsport venue that has hosted drift bashes, drift exhibitions and ride-alongs, and the Drift Wars: Puerto Rico vs. Dominican Republic (listed for November 14, 2026).",
    sourceUrl: "https://www.pietix.com/pr-100x35-expo", notes: "The best lead for a drift day. The listings are public ticketed events, so ask whether it hires out the venue and drivers for a private group." },
  { id: "vnd-pr-pro-drift", name: "PR Pro Drift", category: "motorsport", area: "Puerto Rico",
    offers: "Covers Formula Drift Pro-Am activity in Puerto Rico, including drift events and demos.",
    sourceUrl: "https://www.facebook.com/prprodrift/", notes: "A Facebook page, so a way to reach local drift drivers who could give ride-alongs or an exhibition for the club." },
  { id: "vnd-ponce-speedway", name: "Ponce International Speedway Park", category: "motorsport", area: "Ponce",
    offers: "A circuit that opened in 2003 and hosted the Grand Prix de Ponce, a car race that ran from 1993 to 2012.",
    sourceUrl: "https://en.wikipedia.org/wiki/Grand_Prix_de_Ponce", notes: "No drift or private-rental information was found. Ask whether a private track day is possible." },
  { id: "vnd-salinas-speedway", name: "Salinas Speedway", category: "motorsport", area: "Salinas",
    offers: "A quarter-mile NHRA drag strip that also hosts circuit races.",
    sourceUrl: "https://www.performanceracing.com/magazine/featured/11-01-2023/regional-report-puerto-rico", notes: "Drag-focused, not a drift venue. Ask about private days, which could suit a speed-and-cars outing." },

  // ---- off-road and adventure
  { id: "vnd-carabali", name: "Carabalí Rainforest Park", category: "off-road", area: "Luquillo (El Yunque foothills)",
    offers: "Guided UTV rides through rainforest trails and a ranch.",
    sourceUrl: "https://www.expedia.com/things-to-do/carabali-rainforest-park-utv-adventure-tour.a47971785.activity-details", notes: "Listed at $162 a traveller for one hour. " + L },
  { id: "vnd-offroad-pr", name: "Offroad Puerto Rico (Dos Mares tour)", category: "off-road", area: "Fajardo and El Yunque",
    offers: "One-hour mountain and rainforest UTV route.",
    sourceUrl: "https://www.expedia.com.my/ms/things-to-do/dos-mares-and-rainforest-utv-adventure-tour-in-fajardo.a49453202.activity-details", notes: "Ask about a private group day with a cookout." },

  // ---- rum and cigars
  { id: "vnd-uvas-pr", name: "Uvas Puerto Rico", category: "wine", area: "Dorado (#877 carr. 693)",
    offers: "Wine tasting room inspired by Napa Valley: seasonal wine flights, fine wines and grower champagnes, in an intimate setting.",
    sourceUrl: "https://uvaspuertorico.com", phone: "939-473-3219",
    notes: "From its own site and Instagram (@uvas.pr, about 4,600 followers). Open Wed-Sun, 2-8pm. Takes WhatsApp messages. No prices or group sizes published, so ask about private bookings and a group rate for a Wingman Club evening." },
  // ---- partner businesses a concierge could call for what an assistant cannot do alone
  { id: "vnd-first-class-destination", name: "First Class Destination Solutions", category: "transport", area: "Carolina",
    offers: "Chauffeur-driven VIP transport: airport pickups, full-day private drivers and special-event transport.",
    notes: "Listed number 787-296-5466. Top pick for a full-day driver. From a research chat's list of possible partners; the listed number is from a business listing and nothing was confirmed with the business." },
  { id: "vnd-pr-green-transportation", name: "Puerto Rico Green Transportation", category: "transport", area: "San Juan",
    offers: "Private transportation: airport transfers, hourly drivers and island-wide service, with luxury passenger vans.",
    notes: "Listed number 787-918-7748. From a research chat's list of possible partners; the listed number is from a business listing and nothing was confirmed with the business." },
  { id: "vnd-tu-chef-pr", name: "TU CHEF PR", category: "private-chef", area: "Puerto Rico",
    offers: "Private chefs, catering and yacht provisioning, including an emergency same-day chef service subject to availability.",
    sourceUrl: "https://www.tuchefpr.com/services", notes: "Listed on its own site. From a research chat's list of possible partners; the listed number is from a business listing and nothing was confirmed with the business." },
  { id: "vnd-chef-ronda-salavert", name: "Private Chef Ronda Salavert", category: "private-chef", area: "Puerto Rico",
    offers: "Private dining for anniversaries, birthdays, villa and Airbnb dinners and other special occasions.",
    notes: "Listed number 939-439-3166. From a research chat's list of possible partners; the listed number is from a business listing and nothing was confirmed with the business." },
  { id: "vnd-in-house-chef", name: "In House Chef Inc.", category: "private-chef", area: "Puerto Rico",
    offers: "In-home dining, private events and customised catering.",
    notes: "Listed number 787-941-7330. From a research chat's list of possible partners; the listed number is from a business listing and nothing was confirmed with the business." },
  { id: "vnd-green-rose-cleaners", name: "Green Rose Cleaners", category: "cleaning", area: "Carolina and the San Juan metro",
    offers: "Residential and apartment cleaning, including recurring household cleaning.",
    notes: "Listed number 787-388-9387. From a research chat's list of possible partners; the listed number is from a business listing and nothing was confirmed with the business." },
  { id: "vnd-hom-doc", name: "Hom Doc", category: "cleaning", area: "Puerto Rico",
    offers: "Home maintenance: pressure washing, upholstery, carpet and window cleaning.",
    notes: "Listed number 787-991-7712. From a research chat's list of possible partners; the listed number is from a business listing and nothing was confirmed with the business." },
  { id: "vnd-floristeria-croto", name: "Floristería Croto Jr.", category: "flowers", area: "Cayey",
    offers: "Flower arrangements, gift delivery and event flowers.",
    notes: "Listed number 787-738-0032. From a research chat's list of possible partners; the listed number is from a business listing and nothing was confirmed with the business." },
  { id: "vnd-jessias-flowers", name: "Jessias Flowers", category: "flowers", area: "Cayey",
    offers: "Floral design: premium bouquets, gourmet gift baskets, wedding and event decoration.",
    notes: "Listed number 939-478-6690. From a research chat's list of possible partners; the listed number is from a business listing and nothing was confirmed with the business." },
  { id: "vnd-escape-to-paradise", name: "Escape To Paradise PR", category: "boats", area: "Fajardo (Sunbay Marina)",
    offers: "Private boat trips to Icacos and Palomino, full-day experiences, and yacht rentals around 65 ft.",
    notes: "Listed number 787-516-1025. From a research chat's list of possible partners; the listed number is from a business listing and nothing was confirmed with the business." },
  { id: "vnd-pr-charter-group", name: "Puerto Rico Charter Group", category: "boats", area: "Fajardo",
    offers: "Private yacht charters, fishing excursions and sunset cruises, including a 36 ft luxury yacht to Icacos and Palomino.",
    notes: "Listed number 787-624-6117. From a research chat's list of possible partners; the listed number is from a business listing and nothing was confirmed with the business." },
  { id: "vnd-deluxuria", name: "Deluxuria Global", category: "event-planner", area: "Puerto Rico",
    offers: "Luxury concierge, private chefs and villas. Advertises 400+ affiliated partners across hospitality, property, wellness and logistics.",
    notes: "Worth exploring a referral or collaboration agreement, since it already has a provider network. Self-reported. From a research chat's list of possible partners; the listed number is from a business listing and nothing was confirmed with the business." },
  { id: "vnd-dorado-concierge", name: "Dorado Concierge Group", category: "event-planner", area: "Dorado",
    offers: "Luxury lifestyle concierge with one point of contact for services. Open Mon-Fri 9am-6pm, Sat 9am-1pm.",
    notes: "Call or text (939) 409-8156 per its own site. A possible partner or competitor; read it as an alliance lead. From a research chat's list of possible partners; the listed number is from a business listing and nothing was confirmed with the business." },
  { id: "vnd-bespoke-lifestyle", name: "Bespoke Lifestyle Management", category: "event-planner", area: "Carolina",
    offers: "Lifestyle management for high-end clients.",
    notes: "Self-reported. From a research chat's list of possible partners; the listed number is from a business listing and nothing was confirmed with the business." },

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

  ...HOTEL_PROGRAM_VENDORS,
];
