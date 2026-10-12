"use client";

import { motion, useReducedMotion } from "motion/react";
import { Children, type ElementType, type ReactNode } from "react";

/** Fades/slides content in once when it enters the viewport (static with reduced motion). */
export function Reveal({
  children,
  className,
  delay = 0,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "li" | "section";
}) {
  const reduce = useReducedMotion();
  const Tag = motion[as] as ElementType;
  if (reduce) {
    const Plain = as as ElementType;
    return <Plain className={className}>{children}</Plain>;
  }
  return (
    <Tag
      className={className}
      initial={{ opacity: 0, transform: "translateY(24px)", filter: "blur(6px)" }}
      whileInView={{ opacity: 1, transform: "translateY(0px)", filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, delay, ease: [0.23, 1, 0.32, 1] }}
    >
      {children}
    </Tag>
  );
}

interface Step {
  id: string;
  kicker: string;
  title: string;
  body: string;
}

/** The workflow told as a vertical story; icons are passed as children (one per step). */
export function StoryRail({ steps, children }: { steps: Step[]; children: ReactNode }) {
  const icons = Children.toArray(children);
  return (
    <section className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6" aria-labelledby="flujo-title">
      <Reveal>
        <p className="hud-label mb-2">Flujo de trabajo</p>
        <h2 id="flujo-title" className="max-w-2xl text-balance font-display text-3xl font-bold text-ink sm:text-4xl">
          Un solo hilo del cliente a la factura
        </h2>
      </Reveal>
      <ol className="relative mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {steps.map((s, i) => (
          <Reveal as="li" key={s.id} delay={(i % 3) * 0.06} className="hud-panel relative flex flex-col gap-3 p-6">
            <span className="grid size-12 place-items-center rounded-xl border border-glow/40 bg-navy-800/70 text-glow shadow-glow">{icons[i]}</span>
            <p className="hud-label text-glow-soft">{s.kicker}</p>
            <h3 className="font-display text-xl font-semibold text-ink">{s.title}</h3>
            <p className="text-pretty text-ink-soft">{s.body}</p>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}
