import { LAUNCH_MARKETS, type LaunchMarketId } from "./service-area.ts";

/**
 * Sending somebody to a person other than the one ordering.
 *
 * The case this exists for: an older person alone in a hospital, with no
 * smartphone and no card, and a daughter in Orlando who wants a juice and a
 * charger in room 412. The ordering screen used to take the *customer's* GPS
 * as the place the task happens, so she could not order for him at all.
 *
 * There is no geocoder here yet (see place search in ports.ts), so the
 * destination is **words, not a pin**: the customer chooses the market, and
 * types the hospital or address, room and name. The coordinates are the middle
 * of that market — enough to pick a roster and nothing more — and every
 * screen has to say so rather than draw a marker on a hospital it is not on.
 * Worked out on the server from the market, never taken from the client, so an
 * order for somewhere outside the launch markets cannot be smuggled in by
 * typing coordinates.
 */
export interface OnBehalfOf {
  marketId: LaunchMarketId;
  /** Who it is for — what the person at the door will be asked. */
  recipientName: string;
  /** The hospital or address, as the customer would say it. */
  place: string;
  /** Room, bed or unit. */
  room?: string;
  /** A number for the recipient or the nurses' station, if there is one. */
  phone?: string;
}

export const MAX_ON_BEHALF_FIELD = 120;

/** The middle of a market's bounding box. */
export function marketCenter(id: LaunchMarketId): { lat: number; lng: number } {
  const m = LAUNCH_MARKETS.find((x) => x.id === id);
  if (!m) throw new Error("Choose the area this is going to.");
  return {
    lat: Number(((m.bounds.minLat + m.bounds.maxLat) / 2).toFixed(4)),
    lng: Number(((m.bounds.minLng + m.bounds.maxLng) / 2).toFixed(4)),
  };
}

export function validateOnBehalfOf(input: OnBehalfOf): void {
  if (!LAUNCH_MARKETS.some((m) => m.id === input.marketId)) throw new Error("Choose the area this is going to.");
  if (!input.recipientName?.trim()) throw new Error("Say who it is for — their name is how they are found.");
  if (!input.place?.trim()) throw new Error("Say where it is going — the hospital or the address.");
  for (const [label, value] of [["name", input.recipientName], ["place", input.place], ["room", input.room ?? ""]] as const) {
    if (value.length > MAX_ON_BEHALF_FIELD) throw new Error(`That ${label} is too long — keep it under ${MAX_ON_BEHALF_FIELD} characters.`);
  }
  if (input.phone !== undefined && input.phone.trim() !== "" && !/^[+()\-.\s\d]{7,20}$/.test(input.phone.trim())) {
    throw new Error("That phone number does not look right.");
  }
}

/** Where the task is, as the rest of the system understands a location. */
export function locationForOnBehalf(input: OnBehalfOf): { lat: number; lng: number; label: string } {
  const room = input.room?.trim();
  return { ...marketCenter(input.marketId), label: room ? `${input.place.trim()}, ${room}` : input.place.trim() };
}

/**
 * Shown, and agreed to, before anything is sent to somebody who has not asked
 * for it. The runner is a stranger arriving at a hospital room for a person who
 * may be frail, may not be expecting them, and may be on a restricted diet.
 */
export const ON_BEHALF_DISCLOSURES = [
  "Tell them it is coming. Somebody arriving unannounced at a hospital room is a stranger; somebody they were told about is help.",
  "Your assistant will check with the nurse before handing over any food or drink — some patients cannot eat or drink, or are on a restricted diet. If the nurse says no, they will not hand it over.",
  "Hospitals set their own visitor rules. Entry to a room is not guaranteed; your assistant may have to leave it at the front desk or the nurses' station.",
  "Your assistant does not give medical advice and does not hand over medication themselves.",
] as const;
