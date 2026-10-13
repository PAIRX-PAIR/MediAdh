import { ImageResponse } from "next/og";

/**
 * App icons generated from code (no binary files in the repo): the gear-and-chuck
 * emblem on navy. "maskable" keeps the emblem inside Android's safe zone.
 */
const SIZES: Record<string, { px: number; maskable: boolean }> = {
  "96": { px: 96, maskable: false },
  "180": { px: 180, maskable: false },
  "192": { px: 192, maskable: false },
  "512": { px: 512, maskable: false },
  maskable: { px: 512, maskable: true },
};

function Emblem({ size }: { size: number }) {
  const teeth = Array.from({ length: 12 }, (_, i) => i * 30);
  return (
    <svg width={size} height={size} viewBox="0 0 64 64">
      {teeth.map((deg) => (
        <rect key={deg} x="29" y="3" width="6" height="9" rx="1.5" fill="#4a7fd6" transform={`rotate(${deg} 32 32)`} />
      ))}
      <circle cx="32" cy="32" r="21" fill="#081630" stroke="#5ec8ff" strokeWidth="4" />
      <circle cx="32" cy="32" r="12" fill="none" stroke="#5ec8ff" strokeWidth="2" strokeDasharray="4 3" />
      {[0, 120, 240].map((deg) => (
        <rect key={deg} x="30" y="15" width="4" height="10" rx="1" fill="#8fdcff" transform={`rotate(${deg} 32 32)`} />
      ))}
      <circle cx="32" cy="32" r="4" fill="#5ec8ff" />
    </svg>
  );
}

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const spec = SIZES[(await params).size];
  if (!spec) return new Response("No encontrado", { status: 404 });
  const emblem = Math.round(spec.px * (spec.maskable ? 0.62 : 0.8));
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(circle at 50% 35%, #14336a 0%, #060e1d 70%)",
          borderRadius: spec.maskable ? 0 : spec.px * 0.22,
        }}
      >
        <Emblem size={emblem} />
      </div>
    ),
    {
      width: spec.px,
      height: spec.px,
      headers: { "Cache-Control": "public, max-age=604800, immutable" },
    },
  );
}
