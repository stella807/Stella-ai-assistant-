/**
 * Airports in the cities Safehubby covers: name, three-letter code, city and country. That is all. It deliberately says
 * nothing about services, companies or contacts at any airport: those are what clients pay Safehubby for. Codes and names
 * are the public ones; a test checks every city we research has an entry here.
 */
export interface Airport { name: string; code: string }
export interface CityAirports { city: string; country: string; airports: Airport[] }

const a = (name: string, code: string): Airport => ({ name, code });
const c = (city: string, country: string, ...airports: Airport[]): CityAirports => ({ city, country, airports });

export const AIRPORTS: CityAirports[] = [
  c("San Juan", "Puerto Rico", a("Luis Muñoz Marín International Airport", "SJU")),
  c("Aguadilla", "Puerto Rico", a("Rafael Hernández Airport", "BQN")),
  c("Miami", "United States", a("Miami International Airport", "MIA")),
  c("New York", "United States", a("John F. Kennedy International Airport", "JFK"), a("LaGuardia Airport", "LGA")),
  c("Newark", "United States", a("Newark Liberty International Airport", "EWR")),
  c("Chicago", "United States", a("O'Hare International Airport", "ORD"), a("Midway International Airport", "MDW")),
  c("Los Angeles", "United States", a("Los Angeles International Airport", "LAX")),
  c("Washington DC", "United States", a("Washington Dulles International Airport", "IAD"), a("Reagan Washington National Airport", "DCA")),
  c("Denver", "United States", a("Denver International Airport", "DEN")),
  c("Dallas–Fort Worth", "United States", a("Dallas Fort Worth International Airport", "DFW")),
  c("Boston", "United States", a("Logan International Airport", "BOS")),
  c("Atlanta", "United States", a("Hartsfield–Jackson Atlanta International Airport", "ATL")),
  c("Palm Beach", "United States", a("Palm Beach International Airport", "PBI")),
  c("London", "United Kingdom", a("Heathrow Airport", "LHR"), a("Gatwick Airport", "LGW")),
  c("Manchester", "United Kingdom", a("Manchester Airport", "MAN")),
  c("Paris", "France", a("Charles de Gaulle Airport", "CDG"), a("Orly Airport", "ORY")),
  c("Geneva", "Switzerland", a("Geneva Airport", "GVA")),
  c("Dubai", "United Arab Emirates", a("Dubai International Airport", "DXB")),
  c("Abu Dhabi", "United Arab Emirates", a("Zayed International Airport", "AUH")),
  c("Sharjah", "United Arab Emirates", a("Sharjah International Airport", "SHJ")),
  c("Doha", "Qatar", a("Hamad International Airport", "DOH")),
  c("Riyadh", "Saudi Arabia", a("King Khalid International Airport", "RUH")),
  c("Jeddah", "Saudi Arabia", a("King Abdulaziz International Airport", "JED")),
  c("Istanbul", "Türkiye", a("Istanbul Airport", "IST"), a("Sabiha Gökçen International Airport", "SAW")),
  c("Cairo", "Egypt", a("Cairo International Airport", "CAI")),
  c("Singapore", "Singapore", a("Changi Airport", "SIN")),
  c("Hong Kong", "China", a("Hong Kong International Airport", "HKG")),
  c("Beijing", "China", a("Beijing Capital International Airport", "PEK"), a("Beijing Daxing International Airport", "PKX")),
  c("Shanghai", "China", a("Shanghai Pudong International Airport", "PVG"), a("Shanghai Hongqiao International Airport", "SHA")),
  c("Guangzhou", "China", a("Guangzhou Baiyun International Airport", "CAN")),
  c("Tokyo", "Japan", a("Haneda Airport", "HND"), a("Narita International Airport", "NRT")),
  c("Narita", "Japan", a("Narita International Airport", "NRT")),
  c("Seoul", "South Korea", a("Incheon International Airport", "ICN"), a("Gimpo International Airport", "GMP")),
  c("Bangkok", "Thailand", a("Suvarnabhumi Airport", "BKK"), a("Don Mueang International Airport", "DMK")),
  c("Kuala Lumpur", "Malaysia", a("Kuala Lumpur International Airport", "KUL")),
  c("Manila", "Philippines", a("Ninoy Aquino International Airport", "MNL")),
  c("Colombo", "Sri Lanka", a("Bandaranaike International Airport", "CMB")),
  c("Delhi", "India", a("Indira Gandhi International Airport", "DEL")),
  c("Mumbai", "India", a("Chhatrapati Shivaji Maharaj International Airport", "BOM")),
  c("Bangalore", "India", a("Kempegowda International Airport", "BLR")),
  c("Chennai", "India", a("Chennai International Airport", "MAA")),
  c("Kolkata", "India", a("Netaji Subhas Chandra Bose International Airport", "CCU")),
  c("Sydney", "Australia", a("Sydney Kingsford Smith Airport", "SYD")),
  c("Melbourne", "Australia", a("Melbourne Airport", "MEL")),
  c("Amsterdam", "Netherlands", a("Amsterdam Airport Schiphol", "AMS")),
  c("Frankfurt", "Germany", a("Frankfurt Airport", "FRA")),
  c("Madrid", "Spain", a("Adolfo Suárez Madrid–Barajas Airport", "MAD")),
  c("Rome", "Italy", a("Leonardo da Vinci–Fiumicino Airport", "FCO")),
  c("Milan", "Italy", a("Malpensa Airport", "MXP"), a("Linate Airport", "LIN")),
  c("Athens", "Greece", a("Athens International Airport", "ATH")),
  c("Nairobi", "Kenya", a("Jomo Kenyatta International Airport", "NBO")),
  c("Johannesburg", "South Africa", a("O. R. Tambo International Airport", "JNB")),
  c("Cape Town", "South Africa", a("Cape Town International Airport", "CPT")),
  c("Toronto", "Canada", a("Toronto Pearson International Airport", "YYZ")),
  c("Mexico City", "Mexico", a("Benito Juárez International Airport", "MEX")),
  c("Cancún", "Mexico", a("Cancún International Airport", "CUN")),
  c("São Paulo", "Brazil", a("São Paulo/Guarulhos International Airport", "GRU"), a("Congonhas Airport", "CGH")),
];

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export interface AirportQuery { q?: string; country?: string; limit?: number }
export interface AirportResult { city: string; country: string; airports: Airport[] }

export function lookupAirports(query: AirportQuery): { results: AirportResult[]; total: number } {
  const q = plain(query.q?.trim() ?? "");
  const country = plain(query.country?.trim() ?? "");
  const hits = AIRPORTS.filter((e) => {
    if (country && plain(e.country) !== country) return false;
    if (!q) return true;
    return plain(e.city).includes(q) || plain(e.country).includes(q) || e.airports.some((p) => plain(p.name).includes(q) || p.code.toLowerCase() === q);
  });
  const limit = Math.min(Math.max(Math.floor(query.limit ?? 25), 1), 100);
  return { results: hits.slice(0, limit), total: hits.length };
}
