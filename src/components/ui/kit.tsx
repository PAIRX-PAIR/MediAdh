"use client";

import { History, Star } from "lucide-react";
import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { formatDateTime } from "@/lib/domain/labels";
import type { ChangeEntry } from "@/lib/domain/schema";
import { cn, Input, type Tone } from "./primitives";

/* ─────────────────────────── Estructura de página ─────────────────────────── */

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-5 flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="hud-label mb-1">{eyebrow}</p>}
        <h1 className="text-balance font-display text-2xl font-bold leading-tight text-ink sm:text-3xl">{title}</h1>
        {description && <div className="mt-1 max-w-2xl text-pretty text-sm text-muted">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-3", className)}>
      <h2 className="font-display text-lg font-semibold text-ink">{children}</h2>
      {action}
    </div>
  );
}

const TILE_TONE: Record<"glow" | "done" | "pending" | "blocked" | "vacant" | "neutral", string> = {
  glow: "text-glow",
  done: "text-done",
  pending: "text-pending",
  blocked: "text-blocked",
  vacant: "text-vacant",
  neutral: "text-ink",
};

/** Big number with a label: the HUD's basic gauge. */
export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: keyof typeof TILE_TONE;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("hud-panel flex flex-col gap-1 p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="hud-label">{label}</span>
        {icon && <span className={cn("[&>svg]:size-4", TILE_TONE[tone])} aria-hidden>{icon}</span>}
      </div>
      <span className={cn("tabular font-display text-3xl font-bold leading-none", TILE_TONE[tone])}>{value}</span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

/* ─────────────────────────── Pestañas segmentadas ─────────────────────────── */

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

/** Accessible tabs (arrow keys move, Home/End jump). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const index = options.findIndex((o) => o.value === value);
    let next = index;
    if (e.key === "ArrowRight") next = (index + 1) % options.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + options.length) % options.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = options.length - 1;
    else return;
    e.preventDefault();
    onChange(options[next]!.value);
    const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]");
    buttons[next]?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKey}
      className={cn("flex max-w-full gap-1 overflow-x-auto rounded-xl border border-line bg-night/70 p-1 [scrollbar-width:none]", className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 font-display text-sm font-semibold tracking-wide transition-colors duration-150",
              active ? "bg-navy-600/70 text-ink shadow-glow" : "text-muted hover:bg-white/5 hover:text-ink",
            )}
          >
            {o.label}
            {o.count !== undefined && o.count > 0 && (
              <span className={cn("tabular rounded-full px-1.5 text-xs", active ? "bg-glow/25 text-glow-soft" : "bg-white/10 text-ink-soft")}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ─────────────────────────── Campos numéricos ─────────────────────────── */

const copFormatter = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

/**
 * Pesos colombianos: shows "1.250.000" while typing, emits a number.
 * Numeric keyboard on phones; empty field = null.
 */
export function MoneyInput({
  value,
  onChange,
  id,
  placeholder = "0",
  ariaDescribedBy,
  className,
  allowEmpty = true,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  id?: string;
  placeholder?: string;
  ariaDescribedBy?: string;
  className?: string;
  allowEmpty?: boolean;
}) {
  return (
    <div className={cn("relative", className)}>
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden>
        $
      </span>
      <Input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        aria-describedby={ariaDescribedBy}
        placeholder={placeholder}
        className="tabular pl-7 text-right"
        value={value === null ? "" : copFormatter.format(value)}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "");
          onChange(digits ? Math.min(Number(digits), 100_000_000_000) : allowEmpty ? null : 0);
        }}
      />
    </div>
  );
}

/** Decimal number (hours, quantities): accepts comma or dot. */
export function NumberInput({
  value,
  onChange,
  id,
  min = 0,
  max = 1_000_000,
  step = "any",
  suffix,
  ariaDescribedBy,
  className,
  integer,
  placeholder,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  id?: string;
  min?: number;
  max?: number;
  step?: string;
  suffix?: string;
  ariaDescribedBy?: string;
  className?: string;
  integer?: boolean;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === null ? "" : String(value).replace(".", ","));
  return (
    <div className={cn("relative", className)}>
      <Input
        id={id}
        inputMode={integer ? "numeric" : "decimal"}
        autoComplete="off"
        aria-describedby={ariaDescribedBy}
        placeholder={placeholder}
        className={cn("tabular text-right", suffix && "pr-12")}
        value={shown}
        data-step={step}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d,.]/g, "");
          setDraft(raw);
          if (!raw) return onChange(null);
          const n = Number(raw.replace(",", "."));
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, integer ? Math.round(n) : n)));
        }}
        onBlur={() => setDraft(null)}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-muted" aria-hidden>
          {suffix}
        </span>
      )}
    </div>
  );
}

/* ─────────────────────────── Calificación ─────────────────────────── */

/** 1–5 stars as a radio group (large targets for gloves). */
export function StarRating({ value, onChange, label }: { value: number | null; onChange?: (value: number | null) => void; label: string }) {
  const name = useId();
  if (!onChange) {
    return (
      <span className="inline-flex items-center gap-0.5" role="img" aria-label={value ? `${label}: ${value} de 5` : `${label}: sin calificar`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Star key={n} className={cn("size-4", value !== null && n <= value ? "fill-pending text-pending" : "text-line-strong")} aria-hidden />
        ))}
      </span>
    );
  }
  return (
    <fieldset className="flex items-center gap-1">
      <legend className="sr-only">{label}</legend>
      {[1, 2, 3, 4, 5].map((n) => (
        <label key={n} className="relative cursor-pointer">
          <input
            type="radio"
            name={name}
            value={n}
            checked={value === n}
            onChange={() => onChange(n)}
            onClick={() => value === n && onChange(null)}
            className="peer sr-only"
          />
          <span className="flex size-11 items-center justify-center rounded-lg peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-glow">
            <Star className={cn("size-7 transition-colors", value !== null && n <= value ? "fill-pending text-pending" : "text-line-strong")} aria-hidden />
          </span>
          <span className="sr-only">{n} de 5</span>
        </label>
      ))}
    </fieldset>
  );
}

/* ─────────────────────────── Historial de cambios ─────────────────────────── */

/** "Quién y cuándo" with field-level differences, newest first. */
export function ChangeLog({ entries, empty = "Sin cambios registrados todavía." }: { entries: ChangeEntry[]; empty?: string }) {
  if (entries.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ol className="relative flex flex-col gap-4 border-l border-line pl-5">
      {[...entries].reverse().map((e, i) => (
        <li key={`${e.at}-${i}`} className="relative">
          <span className="absolute -left-[26px] top-1 grid size-3 place-items-center rounded-full border border-glow/60 bg-night" aria-hidden>
            <span className="size-1.5 rounded-full bg-glow" />
          </span>
          <p className="text-sm text-ink">
            <span className="font-semibold">{e.actorName ?? "Sistema"}</span> · {e.action}
          </p>
          <p className="text-xs text-faint">{formatDateTime(e.at)}</p>
          {e.changes.length > 0 && (
            <dl className="mt-1.5 grid gap-1 text-xs">
              {e.changes.map((c) => (
                <div key={c.field} className="flex flex-wrap gap-x-2">
                  <dt className="font-semibold text-ink-soft">{c.label}:</dt>
                  <dd className="text-muted">
                    <span className="line-through decoration-blocked/60">{c.from ?? "—"}</span>
                    <span className="mx-1 text-faint" aria-hidden>
                      →
                    </span>
                    <span className="sr-only"> cambió a </span>
                    <span className="text-ink">{c.to ?? "—"}</span>
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </li>
      ))}
    </ol>
  );
}

export function ChangeLogHeading() {
  return (
    <div className="mb-3 flex items-center gap-2">
      <History className="size-4 text-glow" aria-hidden />
      <h3 className="font-display font-semibold text-ink">Historial de cambios</h3>
    </div>
  );
}

/* ─────────────────────────── Datos clave ─────────────────────────── */

export function KeyValues({ items, className }: { items: Array<[string, ReactNode]>; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2", className)}>
      {items.map(([k, v]) => (
        <div key={k} className="flex flex-col">
          <dt className="text-xs text-muted">{k}</dt>
          <dd className="text-sm text-ink">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Thin progress bar with an accessible value. */
export function Meter({ value, tone = "glow", label, className }: { value: number; tone?: Tone; label: string; className?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const color: Record<string, string> = {
    glow: "bg-glow",
    done: "bg-done",
    pending: "bg-pending",
    blocked: "bg-blocked",
    progress: "bg-progress",
    vacant: "bg-vacant",
    urgent: "bg-urgent",
    neutral: "bg-ink-soft",
  };
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className={cn("h-2 overflow-hidden rounded-full bg-line", className)}>
      <div className={cn("h-full rounded-full transition-[width] duration-500 ease-[var(--ease-out)]", color[tone] ?? "bg-glow")} style={{ width: `${pct}%` }} />
    </div>
  );
}
