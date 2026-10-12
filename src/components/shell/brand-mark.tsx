/** Gear + lathe-chuck emblem. Pure SVG so it is crisp at any size and CSP-safe. */
export function BrandMark({ className }: { className?: string }) {
  const teeth = Array.from({ length: 12 }, (_, i) => i * 30);
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id="bm-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8fdcff" />
          <stop offset="0.55" stopColor="#4a7fd6" />
          <stop offset="1" stopColor="#14336a" />
        </linearGradient>
        <filter id="bm-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter="url(#bm-glow)">
        {teeth.map((deg) => (
          <rect key={deg} x="29" y="3" width="6" height="9" rx="1.5" fill="url(#bm-g)" transform={`rotate(${deg} 32 32)`} />
        ))}
        <circle cx="32" cy="32" r="21" fill="#081630" stroke="url(#bm-g)" strokeWidth="4" />
        <circle cx="32" cy="32" r="12" fill="none" stroke="#5ec8ff" strokeWidth="2" strokeDasharray="4 3" />
        {[0, 120, 240].map((deg) => (
          <rect key={deg} x="30" y="15" width="4" height="10" rx="1" fill="#8fdcff" transform={`rotate(${deg} 32 32)`} />
        ))}
        <circle cx="32" cy="32" r="4" fill="#5ec8ff" />
      </g>
    </svg>
  );
}
