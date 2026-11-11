import { Suspense } from "react";
import { lazyWithReload } from "../app/lazy-import.ts";

/**
 * The public entry point every screen imports. The real implementation
 * (LiveMapImpl.tsx) pulls in Leaflet, which is worth its own chunk rather
 * than the main bundle: most screens in this app never show a map, and a
 * safety app's first paint should not wait on ~50KB gzipped of mapping
 * library nobody asked for yet.
 */
const LiveMapImpl = lazyWithReload(() => import("./LiveMapImpl.tsx"));

export function LiveMap({ points, height = 200, onPick, onLocate, zoom, follow }: {
  points: { lat: number; lng: number; label?: string; icon?: "plane"; headingDeg?: number }[];
  height?: number;
  /** See LiveMapImpl.tsx. */
  zoom?: number;
  follow?: boolean;
  /** See the doc on `onPick` in LiveMapImpl.tsx — lets the rider drag or
   *  tap to move the first point instead of trusting a GPS fix outright. */
  onPick?: (point: { lat: number; lng: number }) => void;
  onLocate?: () => Promise<{ lat: number; lng: number } | null>;
}) {
  if (points.length === 0) return null;
  return (
    <Suspense fallback={<div style={{ height, borderRadius: "var(--r-btn)", background: "var(--fill)" }} />}>
      <LiveMapImpl points={points} height={height} onPick={onPick} onLocate={onLocate} zoom={zoom} follow={follow} />
    </Suspense>
  );
}
