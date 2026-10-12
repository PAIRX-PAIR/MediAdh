"use client";

import { Table2 } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/components/ui/primitives";

/**
 * Small SVG chart kit following the dataviz method: thin marks (≤24 px bars,
 * 4 px rounded data-ends, 2 px lines), recessive hairline grid, one axis,
 * per-mark tooltips on hover AND keyboard focus, and a table view for every chart.
 */

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

interface TableData {
  columns: string[];
  rows: Array<Array<string | number>>;
}

/** Card with title, optional subtitle/legend and a "ver tabla" toggle (the accessible view). */
export function ChartFrame({
  title,
  subtitle,
  legend,
  table,
  children,
  className,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  legend?: ReactNode;
  table?: TableData;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <figure className={cn("hud-panel flex flex-col gap-3 p-4 sm:p-5", className)}>
      <figcaption className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display text-base font-semibold text-ink">{title}</p>
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {actions}
          {table && (
            <button
              type="button"
              onClick={() => setShowTable((v) => !v)}
              aria-pressed={showTable}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-semibold text-ink-soft hover:border-glow/60 hover:text-ink"
            >
              <Table2 className="size-4" aria-hidden /> {showTable ? "Ver gráfico" : "Ver tabla"}
            </button>
          )}
        </div>
      </figcaption>
      {legend}
      {showTable && table ? <DataTable data={table} /> : children}
    </figure>
  );
}

function DataTable({ data }: { data: TableData }) {
  return (
    <div className="max-h-80 overflow-auto rounded-lg border border-line">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-panel">
          <tr>
            {data.columns.map((c) => (
              <th key={c} scope="col" className="px-3 py-2 text-xs font-semibold text-muted">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r, i) => (
            <tr key={i} className="border-t border-line/60">
              {r.map((cell, j) => (
                <td key={j} className={cn("px-3 py-1.5 text-ink-soft", typeof cell === "number" && "tabular text-right")}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LegendKey({ items }: { items: Array<{ label: string; color: string; shape?: "rect" | "line" }> }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          {i.shape === "line" ? (
            <span className="h-0.5 w-4 rounded-full" style={{ background: i.color }} aria-hidden />
          ) : (
            <span className="size-2.5 rounded-[3px]" style={{ background: i.color }} aria-hidden />
          )}
          {i.label}
        </li>
      ))}
    </ul>
  );
}

interface Tip {
  x: number;
  y: number;
  content: ReactNode;
}

function Tooltip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 min-w-28 -translate-x-1/2 -translate-y-full rounded-lg border border-line-strong bg-night/95 px-3 py-2 text-xs shadow-panel backdrop-blur"
      style={{ left: tip.x, top: tip.y - 8 }}
    >
      {tip.content}
    </div>
  );
}

/** Rounded-top bar path: 4 px data-end radius, square at the baseline. */
function barPath(x: number, y: number, w: number, h: number, r = 4): string {
  if (h <= 0) return "";
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

const niceMax = (v: number) => {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
};

/* ───────────────────────── Columnas (carga vs capacidad) ───────────────────────── */

export interface ColumnDatum {
  key: string;
  label: string;
  value: number;
  /** Optional reference drawn as a track behind the column (e.g. daily capacity). */
  reference?: number;
  tip: ReactNode;
}

/**
 * Single-series columns with an optional reference track (capacity).
 * Used for a machine's daily load over the next two weeks.
 */
export function ColumnChart({ data, height = 140, color = "var(--viz-1)", unit = "h", ariaLabel }: { data: ColumnDatum[]; height?: number; color?: string; unit?: string; ariaLabel: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const pad = { top: 10, right: 4, bottom: 22, left: 28 };
  const max = niceMax(Math.max(1, ...data.map((d) => Math.max(d.value, d.reference ?? 0))));
  const innerW = Math.max(0, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const band = data.length ? innerW / data.length : 0;
  const bw = Math.min(24, Math.max(4, band - 2));
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;
  const ticks = [0, max / 2, max];
  const labelEvery = band < 26 ? Math.ceil(26 / Math.max(1, band)) : 1;

  return (
    <div ref={ref} className="relative w-full">
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--viz-axis)" : "var(--viz-grid)"} strokeWidth={1} />
              <text x={pad.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted text-[10px] tabular">
                {Math.round(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = pad.left + band * i + band / 2;
            const x = cx - bw / 2;
            const show = (e: { currentTarget: Element }) => {
              const box = (e.currentTarget as SVGGElement).getBBox();
              setTip({ x: box.x + box.width / 2, y: Math.min(y(d.value), d.reference !== undefined ? y(d.reference) : height), content: d.tip });
            };
            return (
              <g
                key={d.key}
                tabIndex={0}
                role="listitem"
                aria-label={`${d.label}: ${d.value.toFixed(1)} ${unit}${d.reference !== undefined ? ` de ${d.reference.toFixed(1)} ${unit}` : ""}`}
                onPointerEnter={show}
                onPointerLeave={() => setTip(null)}
                onFocus={show}
                onBlur={() => setTip(null)}
                className="outline-none [&:focus-visible>rect:first-child]:stroke-glow"
              >
                <rect x={pad.left + band * i} y={pad.top} width={band} height={innerH} fill="transparent" stroke="transparent" strokeWidth={1} />
                {d.reference !== undefined && d.reference > 0 && <path d={barPath(x, y(d.reference), bw, y(0) - y(d.reference))} fill="var(--viz-track)" />}
                {d.value > 0 && <path d={barPath(x, y(d.value), bw, y(0) - y(d.value))} fill={color} />}
                {i % labelEvery === 0 && (
                  <text x={cx} y={height - 6} textAnchor="middle" className="fill-muted text-[10px]">
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      <Tooltip tip={tip} />
    </div>
  );
}

/* ───────────────────────── Línea mensual ───────────────────────── */

export interface LinePoint {
  key: string;
  label: string;
  value: number | null;
}

/** Single-series line with crosshair tooltip; nulls leave gaps. The last value is labelled. */
export function LineChart({
  points,
  height = 160,
  min = 0,
  max: maxIn,
  format = (v: number) => String(v),
  color = "var(--viz-1)",
  ariaLabel,
  target,
}: {
  points: LinePoint[];
  height?: number;
  min?: number;
  max?: number;
  format?: (v: number) => string;
  color?: string;
  ariaLabel: string;
  /** Horizontal reference (goal), drawn as a hairline with a label. */
  target?: { value: number; label: string };
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const gradient = useId();
  const pad = { top: 14, right: 44, bottom: 22, left: 36 };
  const values = points.map((p) => p.value).filter((v): v is number => v !== null);
  const max = maxIn ?? niceMax(Math.max(min + 1, ...values, target?.value ?? 0));
  const innerW = Math.max(0, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const x = (i: number) => pad.left + (points.length <= 1 ? innerW / 2 : (innerW * i) / (points.length - 1));
  const y = (v: number) => pad.top + innerH - ((v - min) / (max - min)) * innerH;

  const segments: string[] = [];
  let current = "";
  points.forEach((p, i) => {
    if (p.value === null) {
      if (current) segments.push(current);
      current = "";
      return;
    }
    current += `${current ? "L" : "M"}${x(i)},${y(p.value)}`;
  });
  if (current) segments.push(current);
  const lastIndex = points.map((p) => p.value !== null).lastIndexOf(true);
  const ticks = [min, (min + max) / 2, max];

  const onMove = (clientX: number, rect: DOMRect) => {
    const px = clientX - rect.left;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    setHover(best);
  };

  return (
    <div ref={ref} className="relative w-full">
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          tabIndex={0}
          className="outline-none focus-visible:ring-2 focus-visible:ring-glow/60 rounded"
          onPointerMove={(e) => onMove(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerLeave={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") setHover((h) => Math.min(points.length - 1, (h ?? -1) + 1));
            if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? points.length) - 1));
          }}
          onBlur={() => setHover(null)}
        >
          <defs>
            <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity="0.16" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke={t === min ? "var(--viz-axis)" : "var(--viz-grid)"} />
              <text x={pad.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted text-[10px] tabular">
                {format(t)}
              </text>
            </g>
          ))}
          {target && (
            <g>
              <line x1={pad.left} x2={width - pad.right} y1={y(target.value)} y2={y(target.value)} stroke="var(--color-ink-soft)" strokeOpacity={0.5} />
              <text x={width - pad.right + 4} y={y(target.value)} dy="0.32em" className="fill-ink-soft text-[10px]">
                {target.label}
              </text>
            </g>
          )}
          {segments.map((d) => (
            <g key={d}>
              <path d={`${d}V${y(min)}H${d.split("M")[1]!.split(",")[0]}Z`} fill={`url(#${gradient})`} />
              <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            </g>
          ))}
          {points.map((p, i) =>
            p.value === null ? null : (
              <circle key={p.key} cx={x(i)} cy={y(p.value)} r={i === lastIndex || i === hover ? 4.5 : 0} fill={color} stroke="var(--color-panel)" strokeWidth={2} />
            ),
          )}
          {lastIndex >= 0 && hover === null && (
            <text x={x(lastIndex) + 8} y={y(points[lastIndex]!.value!)} dy="0.32em" className="fill-ink text-[11px] font-semibold tabular">
              {format(points[lastIndex]!.value!)}
            </text>
          )}
          {points.map((p, i) =>
            i % Math.max(1, Math.ceil(points.length / 7)) === 0 || i === points.length - 1 ? (
              <text key={`l-${p.key}`} x={x(i)} y={height - 6} textAnchor="middle" className="fill-muted text-[10px]">
                {p.label}
              </text>
            ) : null,
          )}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={y(min)} stroke="var(--color-ink-soft)" strokeOpacity={0.4} />}
        </svg>
      )}
      {hover !== null && points[hover] && (
        <Tooltip
          tip={{
            x: x(hover),
            y: points[hover]!.value !== null ? y(points[hover]!.value!) : pad.top,
            content: (
              <>
                <p className="tabular text-sm font-semibold text-ink">{points[hover]!.value === null ? "Sin datos" : format(points[hover]!.value!)}</p>
                <p className="text-muted">{points[hover]!.label}</p>
              </>
            ),
          }}
        />
      )}
    </div>
  );
}

/* ───────────────────────── Barras horizontales ───────────────────────── */

export interface HBarDatum {
  key: string;
  label: string;
  value: number | null;
  /** Shown at the bar tip. */
  display: string;
  muted?: boolean;
  note?: string;
}

/** Ranked horizontal bars with the value at the tip and an optional goal line. */
export function HBarChart({ data, max, target, color = "var(--viz-1)", ariaLabel }: { data: HBarDatum[]; max: number; target?: { value: number; label: string }; color?: string; ariaLabel: string }) {
  return (
    <ul className="flex flex-col gap-2.5" aria-label={ariaLabel}>
      {data.map((d) => {
        const pct = d.value === null ? 0 : Math.max(0, Math.min(1, d.value / max)) * 100;
        return (
          <li key={d.key} className={cn("grid grid-cols-[minmax(84px,7.5rem)_1fr] items-center gap-3", d.muted && "opacity-55")}>
            <span className="truncate text-sm text-ink-soft" title={d.label}>
              {d.label}
            </span>
            <span className="relative flex h-6 items-center">
              <span className="absolute inset-y-[7px] left-0 right-14 rounded-[4px] bg-[var(--viz-track)]" aria-hidden />
              <span className="absolute inset-y-0 left-0 right-14" aria-hidden>
                {d.value !== null && (
                  <span className="absolute inset-y-[7px] left-0 rounded-r-[4px]" style={{ width: `${pct}%`, background: color }} />
                )}
                {target && <span className="absolute inset-y-0 w-px bg-ink-soft/60" style={{ left: `${(target.value / max) * 100}%` }} title={target.label} />}
              </span>
              <span className="tabular ml-auto w-12 text-right text-xs font-semibold text-ink">{d.note ?? d.display}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Tiny trend line for stat tiles (no axes, last point marked). */
export function Sparkline({ values, width = 96, height = 28, color = "var(--viz-1)" }: { values: Array<number | null>; width?: number; height?: number; color?: string }) {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length < 2) return null;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const pts = values.map((v, i) => (v === null ? null : [(i / (values.length - 1)) * (width - 6) + 3, height - 3 - ((v - min) / span) * (height - 6)] as const));
  const d = pts.reduce((acc, p) => (p ? `${acc}${acc && !acc.endsWith("|") ? "L" : "M"}${p[0]},${p[1]}` : `${acc}|`), "").replace(/\|/g, "");
  const last = [...pts].reverse().find(Boolean);
  return (
    <svg width={width} height={height} aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
      {last && <circle cx={last[0]} cy={last[1]} r={3} fill={color} />}
    </svg>
  );
}
