/**
 * The app's illustration set — drawn here, one style, so every screen can have
 * a picture without a stock-photo dependency. Gold and amber on deep blue and
 * wood, the same palette as the rest of the app. Each is decorative
 * (`aria-hidden`); the words next to it do the telling.
 */
import type { SVGProps } from "react";

type ArtProps = SVGProps<SVGSVGElement>;
const deco = { "aria-hidden": true, focusable: false } as const;

/** A rocks glass of bourbon with a big cube, catching the light. */
export function BourbonGlassArt(props: ArtProps) {
  return (
    <svg viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg" {...deco} {...props}>
      <defs>
        <linearGradient id="bg-liquid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffb547" />
          <stop offset=".6" stopColor="#c8741c" />
          <stop offset="1" stopColor="#7a3e0c" />
        </linearGradient>
        <linearGradient id="bg-glass" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity=".38" />
          <stop offset=".3" stopColor="#ffffff" stopOpacity=".06" />
          <stop offset=".8" stopColor="#ffffff" stopOpacity=".1" />
          <stop offset="1" stopColor="#ffffff" stopOpacity=".3" />
        </linearGradient>
        <radialGradient id="bg-glow" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#ffb547" stopOpacity=".55" />
          <stop offset="1" stopColor="#ffb547" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="80" cy="140" rx="62" ry="10" fill="url(#bg-glow)" />
      {/* body */}
      <path d="M36 44 L44 134 Q45 142 54 142 H106 Q115 142 116 134 L124 44 Z" fill="url(#bg-glass)" stroke="#fff" strokeOpacity=".35" />
      {/* bourbon */}
      <path d="M40 64 L46 132 Q47 138 54 138 H106 Q113 138 114 132 L120 64 Z" fill="url(#bg-liquid)" />
      <ellipse cx="80" cy="64" rx="40" ry="6" fill="#ffd38a" opacity=".9" />
      {/* ice */}
      <g>
        <rect x="58" y="62" width="40" height="40" rx="6" fill="#fff" opacity=".32" transform="rotate(-8 78 82)" />
        <rect x="58" y="62" width="40" height="40" rx="6" fill="none" stroke="#fff" strokeOpacity=".65" transform="rotate(-8 78 82)" />
        <path d="M64 70 L72 68" stroke="#fff" strokeOpacity=".8" strokeWidth="2" strokeLinecap="round" />
      </g>
      {/* rim + highlight */}
      <ellipse cx="80" cy="44" rx="44" ry="6" fill="none" stroke="#fff" strokeOpacity=".55" />
      <path d="M46 52 L52 128" stroke="#fff" strokeOpacity=".5" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** A canopy over the clouds, a skydiver hanging below. */
export function ParachuteArt(props: ArtProps) {
  return (
    <svg viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg" {...deco} {...props}>
      <defs>
        <linearGradient id="pa-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1d3a78" />
          <stop offset="1" stopColor="#ff9a5a" />
        </linearGradient>
        <linearGradient id="pa-canopy" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ff7a59" />
          <stop offset=".5" stopColor="#ffd478" />
          <stop offset="1" stopColor="#ff7a59" />
        </linearGradient>
      </defs>
      <rect width="200" height="160" rx="18" fill="url(#pa-sky)" />
      <circle cx="160" cy="118" r="22" fill="#fff2c2" opacity=".85" />
      {/* clouds */}
      <g fill="#fff" opacity=".9">
        <ellipse cx="46" cy="128" rx="36" ry="12" />
        <ellipse cx="76" cy="122" rx="26" ry="14" />
        <ellipse cx="140" cy="140" rx="46" ry="12" />
        <ellipse cx="168" cy="132" rx="22" ry="12" />
      </g>
      {/* canopy */}
      <path d="M52 62 Q100 4 148 62 Q124 54 100 62 Q76 54 52 62Z" fill="url(#pa-canopy)" />
      <path d="M100 62 Q100 36 100 14 M76 58 Q84 34 92 16 M124 58 Q116 34 108 16" stroke="#fff" strokeOpacity=".5" fill="none" />
      {/* lines */}
      <path d="M54 62 L98 104 M146 62 L102 104 M100 62 L100 104" stroke="#fff" strokeOpacity=".8" />
      {/* diver */}
      <circle cx="100" cy="108" r="5" fill="#1a0f00" />
      <path d="M100 113 V130 M100 118 L90 126 M100 118 L110 126 M100 130 L94 144 M100 130 L106 144" stroke="#1a0f00" strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** A concierge bell and a hand-off: somebody arriving to help. */
export function AssistantArt(props: ArtProps) {
  return (
    <svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg" {...deco} {...props}>
      <defs>
        <linearGradient id="as-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffe3a0" />
          <stop offset="1" stopColor="#c8932f" />
        </linearGradient>
      </defs>
      <circle cx="60" cy="52" r="40" fill="#ffb547" opacity=".12" />
      <path d="M26 74 H94" stroke="url(#as-gold)" strokeWidth="6" strokeLinecap="round" />
      <path d="M34 72 Q34 36 60 34 Q86 36 86 72Z" fill="url(#as-gold)" />
      <rect x="55" y="24" width="10" height="9" rx="3" fill="#c8932f" />
      <circle cx="60" cy="22" r="4" fill="#ffe3a0" />
      <path d="M44 62 Q46 46 58 42" stroke="#fff" strokeOpacity=".7" strokeWidth="3" strokeLinecap="round" fill="none" />
      {/* a person arriving */}
      <circle cx="98" cy="30" r="7" fill="#6ee7ff" />
      <path d="M98 38 Q90 50 92 60 M98 38 Q106 50 104 60" stroke="#6ee7ff" strokeWidth="3.4" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** A paper bag with the things people actually ask for: a bottle and a charger. */
export function ErrandArt(props: ArtProps) {
  return (
    <svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg" {...deco} {...props}>
      <defs>
        <linearGradient id="er-bag" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e9b366" />
          <stop offset="1" stopColor="#b9792c" />
        </linearGradient>
      </defs>
      <circle cx="60" cy="54" r="40" fill="#6ee7ff" opacity=".1" />
      {/* bottle */}
      <rect x="44" y="10" width="14" height="22" rx="4" fill="#6ee7ff" opacity=".9" />
      <rect x="47" y="4" width="8" height="8" rx="2" fill="#aab7d6" />
      {/* charger cable */}
      <path d="M76 36 Q86 16 98 24 Q104 28 96 34" stroke="#eef3ff" strokeWidth="3" fill="none" strokeLinecap="round" />
      <rect x="92" y="32" width="10" height="7" rx="2" fill="#eef3ff" />
      {/* bag */}
      <path d="M28 34 H92 L98 88 Q98 92 94 92 H26 Q22 92 22 88Z" fill="url(#er-bag)" />
      <path d="M28 34 H92 L94 46 H26Z" fill="#fff" opacity=".18" />
      <path d="M44 34 Q44 22 60 22 Q76 22 76 34" stroke="#7a4d12" strokeWidth="3" fill="none" />
      <path d="M52 62 L60 70 L72 56" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

/** A car on a route, with the pin it is heading for. */
export function RideArt(props: ArtProps) {
  return (
    <svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg" {...deco} {...props}>
      <circle cx="60" cy="52" r="40" fill="#9b8cff" opacity=".12" />
      <path d="M12 82 Q34 52 56 66 T108 30" stroke="#aab7d6" strokeOpacity=".7" strokeWidth="3" strokeDasharray="2 7" strokeLinecap="round" fill="none" />
      {/* pin */}
      <path d="M100 8 Q116 8 116 24 Q116 36 100 52 Q84 36 84 24 Q84 8 100 8Z" fill="#ff7a59" />
      <circle cx="100" cy="24" r="6" fill="#fff" />
      {/* car */}
      <path d="M14 78 L20 64 Q24 58 32 58 H52 Q60 58 64 64 L70 78Z" fill="#ffd478" />
      <rect x="10" y="76" width="64" height="12" rx="5" fill="#ffb547" />
      <path d="M26 64 H36 V74 H22Z M40 64 H52 L58 74 H40Z" fill="#1d3a78" opacity=".85" />
      <circle cx="26" cy="90" r="6" fill="#0d1428" /><circle cx="26" cy="90" r="2.4" fill="#aab7d6" />
      <circle cx="58" cy="90" r="6" fill="#0d1428" /><circle cx="58" cy="90" r="2.4" fill="#aab7d6" />
    </svg>
  );
}

/** A calendar with a reminder ticked off. */
export function DeskArt(props: ArtProps) {
  return (
    <svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg" {...deco} {...props}>
      <circle cx="60" cy="52" r="40" fill="#ffb547" opacity=".1" />
      <rect x="24" y="22" width="72" height="64" rx="10" fill="#eef3ff" />
      <path d="M24 32 Q24 22 34 22 H86 Q96 22 96 32 V42 H24Z" fill="#ff7a59" />
      <rect x="38" y="14" width="6" height="14" rx="3" fill="#aab7d6" /><rect x="76" y="14" width="6" height="14" rx="3" fill="#aab7d6" />
      <g fill="#aab7d6"><rect x="34" y="52" width="10" height="8" rx="2" /><rect x="55" y="52" width="10" height="8" rx="2" /><rect x="76" y="52" width="10" height="8" rx="2" /><rect x="34" y="68" width="10" height="8" rx="2" /><rect x="76" y="68" width="10" height="8" rx="2" /></g>
      <circle cx="60" cy="72" r="9" fill="#2ecb8a" />
      <path d="M55 72 L59 76 L66 67" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

/**
 * The Wingman Club's own mark: a bourbon glass and a cigar crossed. Small
 * enough for a tab, simple enough to survive being 24 pixels wide.
 */
export function WingmanIcon({ size = 24, ...rest }: ArtProps & { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" {...rest}>
      <defs>
        <linearGradient id="wi-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffe3a0" />
          <stop offset="1" stopColor="#d49a30" />
        </linearGradient>
      </defs>
      {/* cigar */}
      <g transform="rotate(-32 24 26)">
        <rect x="3" y="21" width="36" height="8" rx="4" fill="#8a5a34" />
        <rect x="14" y="20" width="6" height="10" rx="1" fill="url(#wi-gold)" />
        <circle cx="40" cy="25" r="3.4" fill="#ff9a3c" />
      </g>
      {/* glass */}
      <path d="M22 18 L24 42 Q24.4 44 27 44 H37 Q39.6 44 40 42 L42 18Z" fill="none" stroke="url(#wi-gold)" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M23 28 H41 L40 41 Q40 42.6 37.4 42.6 H26.6 Q24.2 42.6 24 41Z" fill="#ffb547" opacity=".85" />
      <rect x="27" y="24" width="8" height="8" rx="1.6" fill="#fff" opacity=".5" />
    </svg>
  );
}
