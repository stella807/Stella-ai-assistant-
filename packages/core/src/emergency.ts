/**
 * Medical escalation.
 *
 * The feature this replaces was "Uber ambulance". There is no such product:
 * Uber Health is non-emergency medical transport booked by healthcare
 * organisations for appointments and discharges, and Uber's terms tell users to
 * call emergency services instead. Shipping a rideshare under an ambulance
 * label would be worse than shipping nothing — someone with alcohol poisoning
 * taps it, waits for a saloon car, and arrives with a driver who has no oxygen,
 * no airway training and no authority to treat. The delay is the harm.
 *
 * What people actually need at that moment is: to know this is an emergency, to
 * reach a dispatcher fast, and to be able to say something useful when they do.
 * That is what this module provides. It is never plan-gated.
 */

export type RedFlagId =
  | "unresponsive"
  | "vomiting-unresponsive"
  | "seizure"
  | "slow-breathing"
  | "irregular-breathing"
  | "blue-or-pale"
  | "cold-clammy"
  | "confused-stupor"
  | "head-injury";

export interface RedFlag {
  id: RedFlagId;
  label: string;
  detail: string;
}

/**
 * The recognised signs of alcohol poisoning, plus head injury — a fall is the
 * other thing that turns a bad night into an emergency, and a drunk person who
 * hit their head can look merely drunk.
 */
export const RED_FLAGS: RedFlag[] = [
  { id: "unresponsive", label: "Can't be woken", detail: "Won't rouse to shouting or a firm shake." },
  { id: "vomiting-unresponsive", label: "Vomiting while barely conscious", detail: "Choking risk. Turn them on their side now." },
  { id: "seizure", label: "Seizure or fitting", detail: "Any convulsion, however brief." },
  { id: "slow-breathing", label: "Breathing very slowly", detail: "Fewer than about 8 breaths a minute." },
  { id: "irregular-breathing", label: "Long gaps between breaths", detail: "Ten seconds or more between breaths." },
  { id: "blue-or-pale", label: "Blue or grey lips, skin or fingernails", detail: "A sign they aren't getting enough oxygen." },
  { id: "cold-clammy", label: "Cold, clammy or very pale skin", detail: "Especially with shivering they can't control." },
  { id: "confused-stupor", label: "Deeply confused or won't respond", detail: "Can't hold a conversation or answer their own name." },
  { id: "head-injury", label: "Hit their head", detail: "A fall can look like drunkenness. It isn't the same thing." },
];

export type Escalation = "call-emergency" | "get-checked" | "stay-and-watch";

export interface Assessment {
  escalation: Escalation;
  headline: string;
  /** What to do in the next sixty seconds, in order. */
  steps: string[];
  flagged: RedFlag[];
}

/**
 * Any single red flag routes to emergency services. This is deliberately not a
 * score: alcohol poisoning kills through one mechanism at a time, and a triage
 * model that needs two symptoms before it worries is a model that waits.
 */
export function assess(checkedIds: RedFlagId[]): Assessment {
  const flagged = RED_FLAGS.filter((f) => checkedIds.includes(f.id));

  if (flagged.length > 0) {
    return {
      escalation: "call-emergency",
      headline: "This is an emergency. Call now.",
      steps: [
        "Call emergency services now — do not wait to see if it improves.",
        "Turn them onto their side so they can't choke if they vomit.",
        "Stay with them. Do not leave them to sleep it off alone.",
        "Do not give them coffee, food, a cold shower, or more alcohol.",
        "Keep them warm and keep talking to them until help arrives.",
      ],
      flagged,
    };
  }

  return {
    escalation: "stay-and-watch",
    headline: "No emergency signs right now.",
    steps: [
      "Stay with them and check again in fifteen minutes.",
      "Keep them sitting up or on their side, never face-down or flat on their back.",
      "Water if they can drink it on their own. Never pour it into someone who is drowsy.",
      "If anything on this list starts, call emergency services immediately.",
    ],
    flagged,
  };
}

/** Escalation for someone who needs care but is not in immediate danger. */
export function assessNonEmergency(concerns: string[]): Assessment {
  return {
    escalation: "get-checked",
    headline: "Worth getting looked at.",
    steps: [
      "Urgent care or an emergency department can check them over.",
      "Do not drive. Book a ride, and have someone go with them.",
      "Take a note of what they drank and when — the clinician will ask.",
      ...concerns.map((c) => `Mention: ${c}`),
    ],
    flagged: [],
  };
}

/**
 * Emergency numbers vary by country, and an app that hardcodes 911 is useless —
 * or worse, actively misleading — everywhere else. Region comes from the
 * device; when it is unknown we say so rather than guessing, because a wrong
 * number costs the minutes that matter.
 */
export interface EmergencyNumber {
  region: string;
  countryName: string;
  number: string;
  poisonControl?: string;
}

export const EMERGENCY_NUMBERS: EmergencyNumber[] = [
  { region: "US", countryName: "United States", number: "911", poisonControl: "1-800-222-1222" },
  { region: "PR", countryName: "Puerto Rico", number: "911", poisonControl: "1-800-222-1222" },
  { region: "CA", countryName: "Canada", number: "911", poisonControl: "1-844-764-7669" },
  { region: "MX", countryName: "Mexico", number: "911" },
  { region: "GB", countryName: "United Kingdom", number: "999", poisonControl: "111" },
  { region: "IE", countryName: "Ireland", number: "112" },
  { region: "AU", countryName: "Australia", number: "000", poisonControl: "13 11 26" },
  { region: "NZ", countryName: "New Zealand", number: "111", poisonControl: "0800 764 766" },
  { region: "IN", countryName: "India", number: "112" },
  { region: "JP", countryName: "Japan", number: "119" },
  { region: "ZA", countryName: "South Africa", number: "10177" },
  { region: "BR", countryName: "Brazil", number: "192" },
];

/** EU and EEA members all answer 112. */
const EU_112 = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU",
  "IS", "IT", "LV", "LI", "LT", "LU", "MT", "NL", "NO", "PL", "PT", "RO", "SK",
  "SI", "ES", "SE", "CH",
];

export function emergencyNumberFor(region: string | null | undefined): EmergencyNumber | null {
  if (!region) return null;
  const code = region.trim().toUpperCase();
  const known = EMERGENCY_NUMBERS.find((n) => n.region === code);
  if (known) return known;
  if (EU_112.includes(code)) return { region: code, countryName: code, number: "112" };
  return null;
}

export interface DispatcherScriptInput {
  emergencyNumber: string | null;
  locationLabel: string | null;
  lat?: number;
  lng?: number;
  standardDrinks: number;
  hoursDrinking: number;
  flagged: RedFlag[];
}

/**
 * What to say when the dispatcher picks up. People freeze on this call, and a
 * drunk or frightened caller freezes harder — so the app hands them the words
 * and the facts it already knows.
 */
export function dispatcherScript(input: DispatcherScriptInput): string[] {
  const where = input.locationLabel
    ? `We're at ${input.locationLabel}.`
    : "I'll give you our location — it's on my phone screen now.";
  const coords =
    input.lat !== undefined && input.lng !== undefined
      ? `Coordinates ${input.lat.toFixed(5)}, ${input.lng.toFixed(5)}.`
      : null;

  const symptoms = input.flagged.length
    ? `They are: ${input.flagged.map((f) => f.label.toLowerCase()).join(", ")}.`
    : "They are very drunk and I'm worried about them.";

  const drinks = input.standardDrinks > 0
    ? `They've had roughly ${input.standardDrinks.toFixed(0)} standard drinks over about ${input.hoursDrinking.toFixed(0)} hours.`
    : "I'm not sure exactly how much they've had.";

  return [
    "I need an ambulance for suspected alcohol poisoning.",
    where,
    ...(coords ? [coords] : []),
    symptoms,
    drinks,
    "They are conscious / unconscious — say which.",
    "I'll stay on the line and stay with them.",
  ];
}

/**
 * Whether the app should be pushing the emergency route on its own, without
 * waiting for someone to open a checklist. Severe estimates plus a missed
 * check-in is the shape of a night that has already gone wrong.
 */
export function shouldPromptEmergencyCheck(band: string, missedCheckIns: number): boolean {
  return band === "severe" || (band === "high" && missedCheckIns >= 1);
}
