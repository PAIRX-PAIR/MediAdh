"use client";

import { motion, useScroll, useTransform, type MotionValue } from "motion/react";
import dynamic from "next/dynamic";
import { Component, useEffect, useRef, useState, type ReactNode } from "react";

/** The R3F chunk (~240 KB gzip) is never part of the first load and never downloaded with reduced motion. */
const WorkshopScene = dynamic(() => import("./workshop-scene"), { ssr: false });

class SceneBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function canRender3d(): boolean {
  const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
  if (nav.connection?.saveData) return false;
  if (typeof nav.deviceMemory === "number" && nav.deviceMemory < 2) return false;
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

function useReducedMotionLive(): boolean {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

/**
 * Wraps the hero and the story. A single fixed Canvas lives behind them; the
 * camera follows the scroll progress of this wrapper and the layer fades out
 * as the journey ends. Off screen or in a hidden tab, rendering stops.
 */
export function Journey({ children, poster }: { children: ReactNode; poster: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotionLive();
  const [mount, setMount] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [inView, setInView] = useState(true);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const opacity = useTransform(scrollYProgress, [0.9, 1], [1, 0]);

  // Mount only after the page is idle, on capable devices, without reduced motion.
  useEffect(() => {
    // Nothing to schedule: the render below also gates on reduced/failed.
    if (reduced || failed || !canRender3d()) return;
    let cancelled = false;
    const go = () => {
      if (cancelled) return;
      const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      if (idle) idle(() => !cancelled && setMount(true), { timeout: 1500 });
      else setTimeout(() => !cancelled && setMount(true), 300);
    };
    if (document.readyState === "complete") go();
    else window.addEventListener("load", go, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener("load", go);
    };
  }, [reduced, failed]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setInView(entry!.isIntersecting), { rootMargin: "100px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!mount) return;
    // Fade the canvas in after its first frames are on screen (the poster sits underneath).
    const id = window.setTimeout(() => setReady(true), 450);
    return () => window.clearTimeout(id);
  }, [mount]);

  return (
    <div ref={ref} className="relative">
      {/* Fixed backdrop: the drawn poster, with the 3D workshop fading in above it. */}
      <motion.div aria-hidden className="pointer-events-none fixed inset-0 z-0" style={{ opacity: opacity as MotionValue<number> }}>
        {poster}
        {mount && !failed && !reduced && (
          <div className={`absolute inset-0 transition-opacity duration-700 ease-[var(--ease-out)] ${ready ? "opacity-100" : "opacity-0"}`}>
            <SceneBoundary onError={() => setFailed(true)}>
              <WorkshopScene progress={scrollYProgress} active={inView} reduced={reduced} onLost={() => setFailed(true)} />
            </SceneBoundary>
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgb(3_8_18/0.85)_0%,rgb(3_8_18/0.35)_45%,transparent_70%)]" />
          </div>
        )}
      </motion.div>
      <div className="relative z-10">{children}</div>
    </div>
  );
}
