"use client";

import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from "motion/react";
import { Fragment, useRef, useState, type ReactNode } from "react";
import { cn } from "@/components/ui/primitives";

const EASE = [0.23, 1, 0.32, 1] as const;

/** Fades/slides content in once when it enters the viewport (static with reduced motion). */
export function Reveal({ children, className, delay = 0, as = "div" }: { children: ReactNode; className?: string; delay?: number; as?: "div" | "li" }) {
  const reduce = useReducedMotion();
  const props = {
    className,
    initial: reduce ? false : { opacity: 0, transform: "translateY(24px)", filter: "blur(6px)" },
    whileInView: { opacity: 1, transform: "translateY(0px)", filter: "blur(0px)" },
    viewport: { once: true, margin: "-80px" },
    transition: { duration: 0.7, delay, ease: EASE },
  } as const;
  return as === "li" ? <motion.li {...props}>{children}</motion.li> : <motion.div {...props}>{children}</motion.div>;
}

/** Each word rises out of its own mask with a short stagger (static text for reduced motion and screen readers). */
export function SplitWords({ text, className, delay = 0 }: { text: string; className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  if (reduce) return <span className={className}>{text}</span>;
  const words = text.split(" ");
  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {words.map((w, i) => (
          <Fragment key={`${w}-${i}`}>
            <span className="inline-block overflow-hidden pb-[0.08em] align-bottom">
              <motion.span
                className="inline-block"
                initial={{ transform: "translateY(105%)", opacity: 0 }}
                whileInView={{ transform: "translateY(0%)", opacity: 1 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.6, delay: delay + i * 0.045, ease: EASE }}
              >
                {w}
              </motion.span>
            </span>
            {/* The space lives between the masks: inside an inline-block it would collapse. */}
            {i < words.length - 1 && " "}
          </Fragment>
        ))}
      </span>
    </span>
  );
}

export interface StoryStep {
  id: string;
  kicker: string;
  station: string;
  title: string;
  body: string;
}

/**
 * The workflow told as six full-height beats. The 3D camera flies to one
 * station per beat; a HUD rail on the side tracks the progress and names the
 * station currently in view.
 */
export function StoryScroll({ steps, icons }: { steps: StoryStep[]; icons: ReactNode[] }) {
  const ref = useRef<HTMLOListElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start center", "end center"] });
  const fill = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);
  const [current, setCurrent] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (v) => setCurrent(Math.min(steps.length - 1, Math.max(0, Math.floor(v * steps.length)))));

  return (
    <section className="relative" aria-labelledby="flujo-title">
      <h2 id="flujo-title" className="sr-only">
        Flujo de trabajo: del cliente a la factura
      </h2>
      {/* HUD rail (desktop): progress line, station nodes and a live readout. */}
      <div className="pointer-events-none sticky top-0 z-10 hidden h-0 lg:block" aria-hidden>
        <div className="absolute right-8 top-[18vh] flex h-[64vh] items-stretch gap-4">
          <div className="flex flex-col items-end justify-between py-1 text-right">
            {steps.map((s, i) => (
              <span key={s.id} className={cn("font-display text-xs font-semibold uppercase tracking-[0.18em] transition-colors duration-300", i === current ? "text-glow" : i < current ? "text-ink-soft" : "text-faint")}>
                {s.station}
              </span>
            ))}
          </div>
          <div className="relative w-px bg-line">
            <motion.div className="absolute inset-x-0 top-0 bg-glow shadow-[0_0_12px_var(--color-glow)]" style={{ height: reduce ? "100%" : fill }} />
          </div>
        </div>
      </div>

      <ol ref={ref} className="relative">
        {steps.map((s, i) => (
          <li key={s.id} id={s.id} className="flex min-h-svh items-center px-4 sm:px-6">
            <div className="mx-auto w-full max-w-7xl">
              <Reveal className="hud-panel hud-corners relative max-w-lg overflow-hidden p-6 backdrop-blur-xl sm:p-8">
                <span className="pointer-events-none absolute -right-3 -top-6 select-none font-display text-[8rem] font-bold leading-none text-glow/[0.07]" aria-hidden>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="mb-4 flex items-center gap-3">
                  <span className="grid size-12 place-items-center rounded-xl border border-glow/40 bg-navy-800/70 text-glow shadow-glow">{icons[i]}</span>
                  <span>
                    <span className="hud-label block text-glow-soft">{s.kicker}</span>
                    <span className="block text-xs text-muted">{s.station}</span>
                  </span>
                </div>
                <h3 className="text-balance font-display text-2xl font-bold leading-tight text-ink sm:text-3xl">
                  <SplitWords text={s.title} />
                </h3>
                <p className="mt-3 text-pretty text-ink-soft">{s.body}</p>
                <div className="mt-5 h-px w-full shimmer-line opacity-50" aria-hidden />
              </Reveal>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
