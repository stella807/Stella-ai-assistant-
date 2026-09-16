/**
 * Small icon set for the category-tile grids (desk tasks, concierge/errand
 * categories, the Elite desk's catalogue). Same inline-SVG, no-webfont
 * approach as NavIcons.tsx — one glyph per real category id from core,
 * plus a generic fallback for anything that ever gets added there without a
 * matching icon here.
 */
import type { ReactElement } from "react";

const base = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const Calendar = () => (
  <svg {...base} aria-hidden="true">
    <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </svg>
);
const Bell = () => (
  <svg {...base} aria-hidden="true">
    <path d="M6 10a6 6 0 0 1 12 0c0 3 1 5 1.5 6H4.5C5 15 6 13 6 10Z" />
    <path d="M10 19a2 2 0 0 0 4 0" />
  </svg>
);
const Message = () => (
  <svg {...base} aria-hidden="true">
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8A2.5 2.5 0 0 1 17.5 16H10l-4.5 4.5V16H6.5A2.5 2.5 0 0 1 4 13.5Z" />
  </svg>
);
const Search = () => (
  <svg {...base} aria-hidden="true">
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M19 19l-4-4" />
  </svg>
);
const Folder = () => (
  <svg {...base} aria-hidden="true">
    <path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4l2 2.5h8A1.5 1.5 0 0 1 20.5 9v8A1.5 1.5 0 0 1 19 18.5H5A1.5 1.5 0 0 1 3.5 17Z" />
  </svg>
);
const Bag = () => (
  <svg {...base} aria-hidden="true">
    <path d="M6 8h12l-1 12H7Z" />
    <path d="M9 8V6a3 3 0 0 1 6 0v2" />
  </svg>
);
const PersonCheck = () => (
  <svg {...base} aria-hidden="true">
    <circle cx="10" cy="8" r="3.5" />
    <path d="M4 20c0-3.6 2.7-6 6-6s6 2.4 6 6" />
    <path d="M16 14l1.6 1.6L21 12" />
  </svg>
);
const Cart = () => (
  <svg {...base} aria-hidden="true">
    <path d="M4 5h2l1.6 10.6A1.5 1.5 0 0 0 9.1 17h8.3a1.5 1.5 0 0 0 1.47-1.2L20 8H6.5" />
    <circle cx="9.5" cy="20" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="17" cy="20" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);
const Errand = () => (
  <svg {...base} aria-hidden="true">
    <path d="M4 12l6-6M4 12l6 6M4 12h13" />
    <circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" />
  </svg>
);
const Plane = () => (
  <svg {...base} aria-hidden="true">
    <path d="M10.5 20.5 9 15l-5-1.5 1.5-1.8L10 13l3-8.5c.4-1 1.8-1 2.2 0l1 2.5 3.5 1.2c1 .3 1 1.6 0 2l-3.5 1.7-1 5.6-1.7-.9L12 20Z" />
  </svg>
);
const Boat = () => (
  <svg {...base} aria-hidden="true">
    <path d="M4 15h16l-2 4H6Z" />
    <path d="M8 15V6l6 4.5" />
    <path d="M8 6h1" />
  </svg>
);
const House = () => (
  <svg {...base} aria-hidden="true">
    <path d="M4 11.5 12 4l8 7.5" />
    <path d="M6 10v9.5h12V10" />
  </svg>
);
const Confetti = () => (
  <svg {...base} aria-hidden="true">
    <path d="M4 20 14 4" />
    <path d="M9 6l1.5 1.5M15 4l1.5 1.5M18 9l1.5 1.5" />
    <circle cx="7" cy="14" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="10" r="1" fill="currentColor" stroke="none" />
  </svg>
);
const Hotel = () => (
  <svg {...base} aria-hidden="true">
    <path d="M4 20V6.5A1.5 1.5 0 0 1 5.5 5h6A1.5 1.5 0 0 1 13 6.5V20" />
    <path d="M13 12h5.5A1.5 1.5 0 0 1 20 13.5V20" />
    <path d="M4 20h16M7 8.5h.01M10 8.5h.01M7 12h.01M10 12h.01" />
  </svg>
);
const Stethoscope = () => (
  <svg {...base} aria-hidden="true">
    <path d="M6 4v5a4 4 0 0 0 8 0V4" />
    <path d="M10 13v2a5 5 0 0 0 10 0v-1.5" />
    <circle cx="20" cy="11.5" r="1.6" />
  </svg>
);
const Sparkle = () => (
  <svg {...base} aria-hidden="true">
    <path d="M12 3v5M12 16v5M3 12h5M16 12h5" />
    <path d="M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3" />
  </svg>
);

/** Keyed by the real `DeskTaskKind` / `ConciergeCategory` / `EliteServiceId`
 *  values in core — see desk-tasks.ts, concierge.ts, elite.ts. */
const ICONS: Record<string, () => ReactElement> = {
  appointment: Calendar,
  reminder: Bell,
  message: Message,
  research: Search,
  paperwork: Folder,
  "grab-something": Bag,
  "wait-with-someone": PersonCheck,
  "check-in-person": PersonCheck,
  "run-errand": Errand,
  "book-and-buy": Cart,
  "jet-travel": Plane,
  "yacht-charter": Boat,
  "luxury-property": House,
  "event-production": Confetti,
  "premium-hospitality": Hotel,
  "concierge-doctor": Stethoscope,
};

export function CategoryIcon({ id }: { id: string }) {
  const Icon = ICONS[id] ?? Sparkle;
  return <Icon />;
}
