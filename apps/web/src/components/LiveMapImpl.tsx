import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { useLanguage } from "../i18n.tsx";
import { rideWords } from "../app/rides-copy.ts";

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
export default function LiveMapImpl({ points, height = 200, onPick, onLocate }: {
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
  /** Asks the device where it is; shown as a "my location" button when given. */
  onLocate?: () => Promise<{ lat: number; lng: number } | null>;
}) {
  const { language } = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [locating, setLocating] = useState(false);
  // Read inside the effect via a ref rather than retriggering the whole map
  // setup on every render — the callback identity is not what should decide
  // whether Leaflet gets torn down and rebuilt.
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const pickable = Boolean(onPick);
  const hasPoints = points.length > 0;

  // Built once. Moving the pin used to rebuild the whole map, which threw away
  // the rider's zoom and pan on every tap — the opposite of what placing a pin
  // precisely needs.
  useEffect(() => {
    if (!containerRef.current || !hasPoints) return;
    const map = L.map(containerRef.current, {
      zoomControl: pickable,
      attributionControl: true,
      scrollWheelZoom: pickable,
    });
    mapRef.current = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    map.on("click", (e: L.LeafletMouseEvent) => {
      const pin = markersRef.current[0];
      if (!onPickRef.current || !pin) return;
      pin.setLatLng(e.latlng);
      onPickRef.current({ lat: e.latlng.lat, lng: e.latlng.lng });
    });
    // Picking a spot means seeing the spot: close in on the pickup rather
    // than zooming out far enough to fit home in too.
    if (points.length === 1 || pickable) map.setView([points[0]!.lat, points[0]!.lng], pickable ? 17 : 15);
    else map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), { padding: [24, 24] });
    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [hasPoints, pickable]);

  // Markers follow the points without touching the view.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    points.forEach((p, i) => {
      const existing = markersRef.current[i];
      if (existing) {
        existing.setLatLng([p.lat, p.lng]);
        existing.setPopupContent(p.label ?? "");
        return;
      }
      const m = L.marker([p.lat, p.lng], { draggable: pickable && i === 0 }).addTo(map).bindPopup(p.label ?? "");
      if (pickable && i === 0) {
        m.on("dragend", () => {
          const { lat, lng } = m.getLatLng();
          onPickRef.current?.({ lat, lng });
        });
      }
      markersRef.current[i] = m;
    });
    markersRef.current.splice(points.length).forEach((m) => m.remove());
    // A pickup that jumps somewhere new — a GPS fix arriving after the map
    // opened on a fallback — brings the view with it. Small moves the rider
    // makes by hand leave the view where they put it.
    const first = points[0]!;
    const c = map.getCenter();
    if (pickable && (Math.abs(c.lat - first.lat) > 0.01 || Math.abs(c.lng - first.lng) > 0.01)) {
      map.setView([first.lat, first.lng], Math.max(map.getZoom(), 16));
    }
  }, [JSON.stringify(points), pickable]);

  // Leaflet measures its box once; tell it when the box changes size.
  useEffect(() => {
    const t = setTimeout(() => {
      mapRef.current?.invalidateSize();
      // Keep the pickup in the middle when the box grows or shrinks.
      const pin = markersRef.current[0];
      if (pickable && pin) mapRef.current?.panTo(pin.getLatLng(), { animate: false });
    }, 50);
    return () => clearTimeout(t);
  }, [expanded, height]);

  const locate = async () => {
    if (!onLocate) return;
    setLocating(true);
    try {
      const fix = await onLocate();
      if (!fix) return;
      mapRef.current?.setView([fix.lat, fix.lng], 17);
      markersRef.current[0]?.setLatLng([fix.lat, fix.lng]);
      onPickRef.current?.(fix);
    } finally {
      setLocating(false);
    }
  };

  if (!hasPoints) return null;
  const w = rideWords(language).map;

  return (
    <div className={`live-map${expanded ? " live-map-expanded" : ""}`} style={expanded ? undefined : { height }}>
      <div ref={containerRef} className="live-map-canvas" aria-label={w.label} />
      <div className="live-map-tools">
        {onLocate && (
          <button type="button" className="btn live-map-btn" onClick={locate} disabled={locating} aria-label={w.locate}>
            {locating ? w.finding : w.myLocation}
          </button>
        )}
        <button type="button" className="btn live-map-btn" onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? w.collapse : w.expand}>
          {expanded ? w.done : w.expandShort}
        </button>
      </div>
    </div>
  );
}
