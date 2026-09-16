import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// Leaflet's default marker points at relative image paths that only resolve
// when its CSS is served from leaflet's own directory, which a bundler
// never does. Repointed at the bundled asset URLs instead of shipping a
// blank square where the pin should be.
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow });

/**
 * The map every other screen in this file was missing: no API key, so it
 * renders unconditionally rather than joining `PlaceMap`'s "nothing shown
 * until someone pays for a Google Maps key" state.
 *
 * OpenStreetMap tiles rather than Google's, on purpose — the tile server is
 * free and keyless, which matters more here than matching Google's basemap
 * style: a map that never renders because no key is configured is a worse
 * default than one drawn from a plainer source. Attribution is required by
 * OSM's tile usage policy and stays on screen, not just in source.
 *
 * A pin per point, never a claim of live movement: nothing in this app
 * tracks an assistant's real-time location (see the voice/text thread
 * pattern in AssistantModal), so a moving dot here would be exactly the kind
 * of faked capability the rest of the app refuses to show.
 */
/** Default export so this module can be `React.lazy`-loaded from LiveMap.tsx
 *  — Leaflet is ~50KB gzipped, not worth paying on every app launch for a
 *  map that most screens never show. */
export default function LiveMapImpl({ points, height = 200 }: {
  points: { lat: number; lng: number; label?: string }[];
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || points.length === 0) return;

    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: true,
      scrollWheelZoom: false,
    });
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    const markers = points.map((p) => L.marker([p.lat, p.lng]).addTo(map).bindPopup(p.label ?? ""));
    if (points.length === 1) {
      map.setView([points[0]!.lat, points[0]!.lng], 15);
    } else {
      map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), { padding: [24, 24] });
    }

    return () => {
      markers.forEach((m) => m.remove());
      map.remove();
      mapRef.current = null;
    };
    // Keyed on the coordinates themselves, not on every render — a fresh
    // Leaflet map instance per keystroke would leak listeners.
  }, [JSON.stringify(points)]);

  if (points.length === 0) return null;

  return (
    <div ref={containerRef} style={{ height, borderRadius: "var(--r-btn)", overflow: "hidden" }} aria-label="Map" />
  );
}
