/**
 * An original cigar illustration — drawn here, not a stock photo — so the
 * Wingman Club has something to look at before any photography exists. The
 * ember glows and the smoke drifts through CSS (see wingman.css); with
 * reduced motion on, it is simply a still picture of a cigar.
 */
export function CigarArt({ className = "" }: { className?: string }) {
  return (
    <svg className={`cigar-art ${className}`} viewBox="0 0 420 180" role="img" aria-label="A lit cigar" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="cg-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8a5a34" />
          <stop offset=".45" stopColor="#5b3519" />
          <stop offset="1" stopColor="#2c170a" />
        </linearGradient>
        <linearGradient id="cg-band" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8d6a1f" />
          <stop offset=".5" stopColor="#ffd478" />
          <stop offset="1" stopColor="#9a7424" />
        </linearGradient>
        <radialGradient id="cg-ember" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#fff2c2" />
          <stop offset=".35" stopColor="#ff9a3c" />
          <stop offset="1" stopColor="#ff5a1f" stopOpacity="0" />
        </radialGradient>
        <filter id="cg-blur"><feGaussianBlur stdDeviation="5" /></filter>
      </defs>

      {/* smoke, rising from the lit end */}
      <g className="cigar-smoke" filter="url(#cg-blur)" fill="none" stroke="#e9e1d4" strokeLinecap="round">
        <path className="smoke-a" d="M352 96 C340 70 372 56 358 30 C348 12 372 4 366 -8" strokeWidth="9" />
        <path className="smoke-b" d="M362 100 C382 78 350 60 372 38" strokeWidth="6" />
        <path className="smoke-c" d="M346 100 C330 82 346 66 334 48" strokeWidth="5" />
      </g>

      {/* the cigar */}
      <g transform="rotate(-6 210 112)">
        <rect x="46" y="96" width="300" height="38" rx="19" fill="url(#cg-body)" />
        {/* leaf texture */}
        <g stroke="#1f1007" strokeOpacity=".35" strokeWidth="1.2">
          <path d="M70 104 L84 130 M100 100 L112 132 M132 102 L140 134 M164 100 L176 132 M196 102 L204 134 M228 100 L240 132 M262 102 L270 134" />
        </g>
        <rect x="46" y="98" width="300" height="9" rx="4.5" fill="#fff" fillOpacity=".12" />
        {/* band */}
        <rect x="132" y="94" width="46" height="42" rx="3" fill="url(#cg-band)" />
        <rect x="132" y="94" width="46" height="42" rx="3" fill="none" stroke="#3a2808" strokeOpacity=".5" />
        <text x="155" y="121" textAnchor="middle" fontFamily="Georgia, serif" fontSize="17" fontWeight="700" fill="#3a2808">SH</text>
        {/* foot cap */}
        <rect x="40" y="96" width="14" height="38" rx="7" fill="#7a4d2a" />
        {/* ash and ember */}
        <rect x="330" y="97" width="26" height="36" rx="13" fill="#c9c2b8" />
        <rect x="330" y="97" width="26" height="36" rx="13" fill="#000" fillOpacity=".08" />
        <circle className="cigar-ember" cx="354" cy="115" r="16" fill="url(#cg-ember)" />
      </g>
    </svg>
  );
}

/** A checkered flag, for the track day. */
export function FlagArt({ className = "" }: { className?: string }) {
  const cells = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) if ((r + c) % 2 === 0) cells.push(<rect key={`${r}-${c}`} x={c * 12} y={r * 12} width="12" height="12" />);
  return (
    <svg className={`flag-art ${className}`} viewBox="0 0 84 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="0" width="3" height="64" fill="#c9a24b" />
      <g transform="translate(8 2)" fill="#f4efe6"><rect width="72" height="48" fill="#14110d" />{cells}</g>
    </svg>
  );
}
