/**
 * Hand-off links to the apps that can actually complete the job.
 *
 * This is what replaced in-app ride booking. Uber's Ride Request API is closed
 * to third-party developers, so no app outside a formal partnership can book a
 * ride, quote a fare, or track a trip. A deep link can still open the Uber app
 * with the destination already filled in, which gets the user to the same place
 * two taps later and — unlike a fabricated fare — is true.
 *
 * These require no API key and no approval, and neither Apple nor Google
 * restricts them. The limitation is the providers', not the stores'.
 */

export interface Place {
  lat: number;
  lng: number;
  label?: string;
}

export interface HandOff {
  provider: string;
  /** Universal link: opens the app when installed, the web flow when not. */
  url: string;
  /** What actually happens, said plainly so the button does not overpromise. */
  description: string;
}

const enc = encodeURIComponent;

/**
 * Uber universal link. `pickup=my_location` lets the Uber app use its own
 * location fix rather than one we captured minutes ago — theirs is fresher and
 * it is the one the driver will navigate to.
 */
export function uberRide(dropoff: Place): HandOff {
  const params = new URLSearchParams({
    action: "setPickup",
    pickup: "my_location",
    "dropoff[latitude]": String(dropoff.lat),
    "dropoff[longitude]": String(dropoff.lng),
  });
  if (dropoff.label) params.set("dropoff[nickname]", dropoff.label);

  return {
    provider: "Uber",
    url: `https://m.uber.com/ul/?${params.toString()}`,
    description: "Opens Uber with your destination filled in. You confirm the fare and book there.",
  };
}

export function lyftRide(dropoff: Place): HandOff {
  const params = new URLSearchParams({
    id: "lyft",
    "destination[latitude]": String(dropoff.lat),
    "destination[longitude]": String(dropoff.lng),
  });

  return {
    provider: "Lyft",
    url: `https://lyft.com/ride?${params.toString()}`,
    description: "Opens Lyft with your destination filled in. You confirm the fare and book there.",
  };
}

/** A taxi or transit fallback, for anywhere the big two do not operate. */
export function mapsDirections(dropoff: Place): HandOff {
  const destination = enc(dropoff.label ? dropoff.label : `${dropoff.lat},${dropoff.lng}`);
  return {
    provider: "Maps",
    url: `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=transit`,
    description: "Directions home, in case there is no rideshare where you are.",
  };
}

export function ridesFor(dropoff: Place): HandOff[] {
  return [uberRide(dropoff), lyftRide(dropoff), mapsDirections(dropoff)];
}

/**
 * Delivery hand-off. DoorDash has no consumer ordering API — Drive delivers a
 * merchant's own goods — so the most an app outside a merchant agreement can do
 * is open the store with a search already typed.
 */
export function deliverySearch(provider: "doordash" | "ubereats", query: string): HandOff {
  if (provider === "ubereats") {
    return {
      provider: "Uber Eats",
      url: `https://www.ubereats.com/search?q=${enc(query)}`,
      description: "Opens Uber Eats. You place and pay for the order there.",
    };
  }
  return {
    provider: "DoorDash",
    url: `https://www.doordash.com/search/store/${enc(query)}`,
    description: "Opens DoorDash. You place and pay for the order there.",
  };
}

/** Same story for the pharmacy run until a delivery partnership exists. */
export function pharmacySearch(query: string): HandOff {
  return {
    provider: "Walgreens",
    url: `https://www.walgreens.com/search/results.jsp?Ntt=${enc(query)}`,
    description: "Opens Walgreens with the basket searched. You place the order there.",
  };
}
