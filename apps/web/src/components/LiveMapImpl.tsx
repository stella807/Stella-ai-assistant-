import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// Leaflet's default marker points at relative image paths that only resolve
// when its CSS is served from leaflet's own directory, which a bundler
// never does. `mergeOptions` alone doesn't fix this: `Icon.Default` has its
// own `_getIconUrl` override that unconditionally prepends an
// auto-detected `imagePath` onto whatever URL is configured, so even an
// absolute bundled URL gets a second copy of the path glued in front of it
// and 404s. Deleting that override drops back to `Icon.prototype`'s
// version, which just returns the configured URL as-is.
delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
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
 * tracks an assistant's or a ride's real-time location on our own map (see
 * the voice/text thread pattern in AssistantModal, and the note on
 * `onPick` below), so a moving dot here would be exactly the kind of faked
 * capability the rest of the app refuses to show. Where a real live
 * position genuinely exists — Uber's own trip page once a ride is booked —
 * this links out to it instead of drawing a fake one (see `GetHomePanel`).
 */
/** Default export so this module can be `React.lazy`-loaded from LiveMap.tsx
 *  — Leaflet is ~50KB gzipped, not worth paying on every app launch for a
 *  map that most screens never show. */
export default function LiveMapImpl({ points, height = 200, onPick }: {
  points: { lat: number; lng: number; label?: string }[];
  height?: number;
  /**
   * Turns the *first* point into a pickup pin the rider can move — dragged,
   * or moved by tapping anywhere else on the map — instead of trusting the
   * device's GPS fix outright. GPS in a crowded venue or a parking structure
   * is routinely off by the width of a building, and there was previously no
   * way to correct that before a driver got sent to the wrong door. This
   * only ever repositions a point already on the map to a point the rider
   * themself chose; it is not, and must never become, a way to draw a
   * live-updating driver location this app does not actually have.
   */
  onPick?: (point: { lat: number; lng: number }) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  // Read inside the effect via a ref rather than retriggering the whole map
  // setup on every render — the callback identity is not what should decide
  // whether Leaflet gets torn down and rebuilt.
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

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

    const pickable = Boolean(onPickRef.current);
    const markers = points.map((p, i) =>
      L.marker([p.lat, p.lng], { draggable: pickable && i === 0 }).addTo(map).bindPopup(p.label ?? ""));

    const pin = markers[0];
    if (pickable && pin) {
      pin.on("dragend", () => {
        const { lat, lng } = pin.getLatLng();
        onPickRef.current?.({ lat, lng });
      });
      map.on("click", (e: L.LeafletMouseEvent) => {
        pin.setLatLng(e.latlng);
        onPickRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng });
      });
    }

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
