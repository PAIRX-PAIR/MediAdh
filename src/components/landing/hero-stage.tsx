/**
 * Hero backdrop. Server-rendered poster (also the reduced-motion version);
 * the interactive 3D workshop scene mounts on top of it on capable devices.
 */
export function HeroStage() {
  return (
    <div className="absolute inset-0 -z-10" aria-hidden>
      <div className="hud-grid-bg absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_at_70%_40%,black,transparent_70%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(900px_600px_at_75%_35%,rgb(38_91_181/0.35),transparent_65%)]" />
    </div>
  );
}
