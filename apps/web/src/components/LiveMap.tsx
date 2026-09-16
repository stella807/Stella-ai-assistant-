import { lazy, Suspense } from "react";

/**
 * The public entry point every screen imports. The real implementation
 * (LiveMapImpl.tsx) pulls in Leaflet, which is worth its own chunk rather
 * than the main bundle: most screens in this app never show a map, and a
 * safety app's first paint should not wait on ~50KB gzipped of mapping
 * library nobody asked for yet.
 */
const LiveMapImpl = lazy(() => import("./LiveMapImpl.tsx"));

export function LiveMap({ points, height = 200 }: {
  points: { lat: number; lng: number; label?: string }[];
  height?: number;
}) {
  if (points.length === 0) return null;
  return (
    <Suspense fallback={<div style={{ height, borderRadius: "var(--r-btn)", background: "var(--fill)" }} />}>
      <LiveMapImpl points={points} height={height} />
    </Suspense>
  );
}
