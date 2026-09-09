import { Geolocation, type Position } from "@capacitor/geolocation";
import { isNative } from "./platform.ts";

/**
 * Device location.
 *
 * On the App Store path this is the whole reason for a native shell: iOS gives
 * web apps no background location at all, so a browser build can only report
 * where someone was when the tab was last open — useless for a safety app whose
 * job is to know where someone is while the phone is in their pocket.
 */

export interface Fix {
  lat: number;
  lng: number;
  accuracyMeters: number;
  at: string;
}

export type LocationDenied = "denied" | "unavailable";

const toFix = (p: Position | GeolocationPosition): Fix => ({
  lat: p.coords.latitude,
  lng: p.coords.longitude,
  accuracyMeters: Math.round(p.coords.accuracy ?? 0),
  at: new Date(p.timestamp).toISOString(),
});

/**
 * Asks for permission. Returns what happened rather than throwing, because a
 * refusal is a normal answer the UI has to explain, not an error.
 */
export async function requestPermission(): Promise<"granted" | LocationDenied> {
  if (!isNative()) {
    return "geolocation" in navigator ? "granted" : "unavailable";
  }
  try {
    const status = await Geolocation.requestPermissions({ permissions: ["location"] });
    return status.location === "granted" || status.location === "prompt-with-rationale"
      ? "granted"
      : "denied";
  } catch {
    return "unavailable";
  }
}

export async function currentFix(): Promise<Fix | null> {
  try {
    if (isNative()) {
      return toFix(await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10_000 }));
    }
    return await new Promise<Fix | null>((resolve) => {
      if (!("geolocation" in navigator)) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (p) => resolve(toFix(p)),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10_000 },
      );
    });
  } catch {
    return null;
  }
}

export type StopWatching = () => void;

/**
 * Streams fixes. The distance filter is what keeps this off the battery: a
 * phone sitting on a bar does not need a fix every second, and a night out
 * that flattens the handset by midnight is a safety feature that turned itself
 * off.
 */
export async function watchLocation(onFix: (fix: Fix) => void): Promise<StopWatching> {
  if (isNative()) {
    const id = await Geolocation.watchPosition(
      { enableHighAccuracy: true, timeout: 30_000 },
      (position, err) => { if (!err && position) onFix(toFix(position)); },
    );
    return () => void Geolocation.clearWatch({ id });
  }

  if (!("geolocation" in navigator)) return () => {};
  const id = navigator.geolocation.watchPosition(
    (p) => onFix(toFix(p)),
    () => {},
    { enableHighAccuracy: true, maximumAge: 30_000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}
