/**
 * Hero backdrop rendered on the server: a drawn lathe chuck and gear train in
 * HUD lines. It is the first paint, the reduced-motion version and the
 * fallback if WebGL is unavailable; the 3D workshop fades in over it.
 */
export function HeroStage() {
  const teeth = Array.from({ length: 28 }, (_, i) => (i * 360) / 28);
  const small = Array.from({ length: 14 }, (_, i) => (i * 360) / 14);
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      <div className="hud-grid-bg absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_at_70%_45%,black,transparent_70%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(900px_600px_at_72%_40%,rgb(38_91_181/0.35),transparent_65%)]" />
      <svg viewBox="0 0 800 600" className="absolute right-[-12%] top-1/2 h-[min(92svh,820px)] -translate-y-1/2 opacity-70 sm:right-[-4%]" fill="none">
        <defs>
          <radialGradient id="poster-chuck" cx="50%" cy="45%" r="60%">
            <stop offset="0" stopColor="#c9d3e3" stopOpacity="0.55" />
            <stop offset="1" stopColor="#14336a" stopOpacity="0.15" />
          </radialGradient>
        </defs>
        {/* Big gear */}
        <g transform="translate(470 300)" stroke="#4a7fd6" strokeWidth="2">
          {teeth.map((d) => (
            <rect key={d} x="-9" y="-196" width="18" height="26" rx="3" transform={`rotate(${d})`} fill="#0d2247" />
          ))}
          <circle r="172" fill="#081630" />
          <circle r="120" stroke="#265bb5" strokeDasharray="6 8" />
          <circle r="34" stroke="#5ec8ff" strokeWidth="3" />
        </g>
        {/* Lathe chuck in front, three jaws */}
        <g transform="translate(300 330)">
          <circle r="132" fill="url(#poster-chuck)" stroke="#8fdcff" strokeWidth="3" />
          <circle r="96" stroke="#5ec8ff" strokeOpacity="0.6" strokeDasharray="3 6" />
          {[0, 120, 240].map((d) => (
            <rect key={d} x="-16" y="-122" width="32" height="70" rx="5" fill="#7d8aa3" stroke="#c9d3e3" strokeWidth="1.5" transform={`rotate(${d})`} />
          ))}
          <circle r="26" fill="#c9d3e3" />
          <circle r="10" fill="#030812" />
        </g>
        {/* Small gear meshing at the top */}
        <g transform="translate(655 120)" stroke="#5ec8ff" strokeWidth="1.5">
          {small.map((d) => (
            <rect key={d} x="-8" y="-98" width="16" height="22" rx="3" transform={`rotate(${d})`} fill="#14336a" />
          ))}
          <circle r="80" fill="#0a1730" />
          <circle r="18" stroke="#8fdcff" />
        </g>
        {/* HUD callouts */}
        <g stroke="#5ec8ff" strokeOpacity="0.55" strokeWidth="1">
          <path d="M412 228 L520 160 L620 160" />
          <path d="M190 430 L120 500 L40 500" />
        </g>
      </svg>
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgb(3_8_18/0.9)_0%,rgb(3_8_18/0.4)_50%,transparent_75%)]" />
    </div>
  );
}
