import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { aircraftTypeName, knotsToMph, projectPosition, type AircraftFix } from "@safehubby/core";
import type { JetMapLabels } from "./JetMap.tsx";

/** One step in from the opening view (7) and the jet carries its details beside it on the map. */
const DETAIL_ZOOM = 8;
/** Never carry the plane forward on its own guess for longer than this. */
const MAX_COAST_S = 60;
/** How far ahead the dashed course line reaches, in seconds of flying. */
const AHEAD_S = 15 * 60;

const COMPASS = { en: ["N", "NE", "E", "SE", "S", "SW", "W", "NW"], es: ["N", "NE", "E", "SE", "S", "SO", "O", "NO"] };
const compass = (deg: number, lang: string) => (lang === "es" ? COMPASS.es : COMPASS.en)[Math.round(((deg % 360) + 360) % 360 / 45) % 8];

function planeIcon(headingDeg: number): L.DivIcon {
  return L.divIcon({
    className: "jet-plane",
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    html: `<svg viewBox="0 0 24 24" width="40" height="40" style="transform:rotate(${Math.round(headingDeg)}deg)" aria-hidden="true"><path d="M12 1.6c.8 0 1.4.9 1.4 2.1v5.3l7.8 4.7v2.1l-7.8-2.4v4.5l2.3 1.7v1.6L12 20.2l-3.7 1v-1.6l2.3-1.7v-4.5l-7.8 2.4v-2.1l7.8-4.7V3.7c0-1.2.6-2.1 1.4-2.1z"/></svg>`,
  });
}

/**
 * A moving map in the style of the screens on board: a dark chart, the jet
 * turned to its heading and gliding between reports, the path it has flown
 * behind it in gold and a dashed course ahead, and the big numbers along the
 * bottom. Zoom in on the jet (or tap it) and its details appear beside it.
 *
 * Text that came from the aircraft data (tail, callsign, type) is only ever
 * set as text, never as HTML.
 */
export default function JetMapImpl({ fix, trail, receivedAt, labels, language }: {
  fix: AircraftFix; trail: { lat: number; lng: number }[]; receivedAt: number; labels: JetMapLabels; language: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const planeRef = useRef<L.Marker | null>(null);
  const trailRef = useRef<L.Polyline | null>(null);
  const aheadRef = useRef<L.Polyline | null>(null);
  const tagRef = useRef<HTMLDivElement | null>(null);
  const pinned = useRef(false);
  const [zoomedIn, setZoomedIn] = useState(false);
  const [now, setNow] = useState(Date.now());
  const pos = fix.position!;
  const fixRef = useRef({ fix, receivedAt });
  fixRef.current = { fix, receivedAt };

  // Built once.
  useEffect(() => {
    if (!boxRef.current) return;
    const map = L.map(boxRef.current, { zoomControl: false, attributionControl: false, scrollWheelZoom: false, worldCopyJump: true });
    mapRef.current = map;
    // Zoom top right, clear of the name plate; the map credit bottom left, above the readouts, where it stays visible.
    L.control.zoom({ position: "topright" }).addTo(map);
    L.control.attribution({ position: "bottomleft" }).addTo(map);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 16, minZoom: 3,
    }).addTo(map);
    map.setView([pos.lat, pos.lng], fix.onGround ? 12 : 7);

    trailRef.current = L.polyline([], { color: "#e8c27a", weight: 2.5, opacity: 0.9, interactive: false }).addTo(map);
    aheadRef.current = L.polyline([], { color: "#8fd3ff", weight: 1.5, opacity: 0.85, dashArray: "3 9", interactive: false }).addTo(map);

    const tag = document.createElement("div");
    tag.className = "jet-tag-body";
    tagRef.current = tag;
    const plane = L.marker([pos.lat, pos.lng], { icon: planeIcon(pos.headingDeg ?? 0), keyboard: true, title: fix.tailNumber })
      .addTo(map)
      .bindTooltip(tag, { permanent: true, direction: "right", offset: [22, 0], className: "jet-tag", opacity: 1 });
    planeRef.current = plane;
    const showTag = () => {
      const close = map.getZoom() >= DETAIL_ZOOM;
      setZoomedIn(close);
      if (close || pinned.current) plane.openTooltip(); else plane.closeTooltip();
    };
    plane.on("click", () => { pinned.current = !pinned.current; showTag(); });
    map.on("zoomend", showTag);
    showTag();

    // Glide the plane along its last heading and speed between reports.
    let raf = 0, last = 0;
    const glide = (t: number) => {
      raf = requestAnimationFrame(glide);
      if (t - last < 200) return;
      last = t;
      const { fix: f, receivedAt: got } = fixRef.current;
      const p = f.position;
      if (!p) return;
      const observed = got - f.seenSecondsAgo * 1000;
      const coast = Math.min(MAX_COAST_S, Math.max(0, (Date.now() - observed) / 1000));
      const moving = !f.onGround && p.groundSpeedKts !== undefined && p.headingDeg !== undefined;
      const here = moving ? projectPosition(p.lat, p.lng, p.headingDeg!, p.groundSpeedKts!, coast) : { lat: p.lat, lng: p.lng };
      plane.setLatLng([here.lat, here.lng]);
      if (moving) {
        const ahead = projectPosition(here.lat, here.lng, p.headingDeg!, p.groundSpeedKts!, AHEAD_S);
        aheadRef.current?.setLatLngs([[here.lat, here.lng], [ahead.lat, ahead.lng]]);
      } else {
        aheadRef.current?.setLatLngs([]);
      }
      // Follow the jet only when it nears the edge, so a person can zoom and look around.
      if (!map.getBounds().pad(-0.2).contains([here.lat, here.lng])) map.panTo([here.lat, here.lng], { animate: true, duration: 0.8 });
      setNow(Date.now());
    };
    raf = requestAnimationFrame(glide);

    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(boxRef.current);
    return () => { cancelAnimationFrame(raf); resize.disconnect(); map.remove(); mapRef.current = null; };
  }, []);

  // A new report: turn the plane, extend the path, refresh the details.
  useEffect(() => {
    planeRef.current?.setIcon(planeIcon(pos.headingDeg ?? 0));
    trailRef.current?.setLatLngs(trail.map((p) => [p.lat, p.lng] as [number, number]));
    const tag = tagRef.current;
    if (tag) {
      tag.replaceChildren();
      const line = (text: string, cls?: string) => { const d = document.createElement("div"); if (cls) d.className = cls; d.textContent = text; tag.append(d); };
      line(fix.tailNumber, "jet-tag-tail");
      const type = aircraftTypeName(fix.typeCode);
      if (type) line(type, "jet-tag-type");
      if (fix.callsign) line(`${labels.callsign} ${fix.callsign}`);
      if (fix.onGround) line(labels.onGround);
      else if (pos.altitudeFt !== undefined) line(`${pos.altitudeFt.toLocaleString(language)} ft`);
      if (pos.groundSpeedKts !== undefined && !fix.onGround) line(`${knotsToMph(pos.groundSpeedKts)} mph · ${Math.round(pos.groundSpeedKts)} kt`);
      if (pos.headingDeg !== undefined) line(`${Math.round(pos.headingDeg)}° ${compass(pos.headingDeg, language)}`);
      planeRef.current?.getTooltip()?.update();
    }
  }, [fix, trail, language]);

  const ageS = Math.max(0, Math.round((now - (receivedAt - fix.seenSecondsAgo * 1000)) / 1000));
  const climb = fix.verticalRateFpm ?? 0;
  const type = aircraftTypeName(fix.typeCode);

  return (
    <div className="jet-map-shell">
      <div ref={boxRef} className="jet-map" style={{ height: 320 }} />
      <div className="jet-hud-top" aria-hidden="true">
        <strong>{fix.tailNumber}</strong>
        {type && <span>{type}</span>}
      </div>
      {!zoomedIn && <div className="jet-hud-hint">{labels.zoomHint}</div>}
      <dl className="jet-hud">
        <div><dt>{labels.altitude}</dt><dd>{fix.onGround ? labels.onGround : pos.altitudeFt !== undefined ? `${pos.altitudeFt.toLocaleString(language)} ft` : "—"}</dd></div>
        <div><dt>{labels.speed}</dt><dd>{pos.groundSpeedKts !== undefined ? `${knotsToMph(pos.groundSpeedKts)} mph` : "—"}</dd></div>
        <div><dt>{labels.heading}</dt><dd>{pos.headingDeg !== undefined ? `${Math.round(pos.headingDeg)}° ${compass(pos.headingDeg, language)}` : "—"}</dd></div>
        <div><dt>{labels.climb}</dt><dd>{fix.onGround ? "—" : `${climb > 100 ? "▲" : climb < -100 ? "▼" : "▬"} ${Math.abs(climb).toLocaleString(language)} ft/min`}</dd></div>
      </dl>
      <div className="jet-hud-age">{labels.updated.replace("{s}", String(ageS))}</div>
    </div>
  );
}
