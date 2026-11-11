import { Suspense } from "react";
import type { AircraftFix } from "@safehubby/core";
import { lazyWithReload } from "../app/lazy-import.ts";

/** The moving map's real implementation pulls in Leaflet, so it loads only when a jet is shown. */
const JetMapImpl = lazyWithReload(() => import("./JetMapImpl.tsx"));

export interface JetMapLabels {
  altitude: string; speed: string; heading: string; climb: string; updated: string; zoomHint: string;
  type: string; callsign: string; onGround: string;
}

export function JetMap(props: {
  fix: AircraftFix;
  /** Positions seen so far while watching, oldest first. */
  trail: { lat: number; lng: number }[];
  /** When this fix reached the phone (ms); with the fix's own age, when it was observed. */
  receivedAt: number;
  labels: JetMapLabels;
  language: string;
}) {
  return (
    <Suspense fallback={<div className="jet-map-shell" style={{ height: 320 }} />}>
      <JetMapImpl {...props} />
    </Suspense>
  );
}
