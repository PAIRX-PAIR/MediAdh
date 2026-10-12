"use client";

import clsx from "clsx";
import { Loader2 } from "lucide-react";
import {
  forwardRef,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

export const cn = clsx;

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
type ButtonSize = "sm" | "md" | "lg" | "xl";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-b from-navy-400 to-navy-600 text-white shadow-glow hover:shadow-glow-strong hover:from-navy-300 hover:to-navy-500 border border-glow/40",
  secondary: "bg-panel-2/80 text-ink border border-line-strong hover:border-glow/60 hover:bg-navy-700/60",
  ghost: "bg-transparent text-ink-soft hover:text-ink hover:bg-white/5 border border-transparent",
  danger: "bg-gradient-to-b from-[#ff6b6b] to-[#c9303f] text-white border border-[#ff9aa2]/40 hover:brightness-110",
  success: "bg-gradient-to-b from-[#3ddc97] to-[#16a06a] text-[#03140c] border border-[#9af5cb]/40 hover:brightness-110",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm gap-1.5",
  md: "h-11 px-4 text-[15px] gap-2",
  lg: "h-13 px-5 text-base gap-2.5",
  xl: "h-16 px-6 text-lg gap-3",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
}

/** Large, high-contrast touch targets (min 44px) — gloves and sunlight friendly. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, icon, block, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "relative inline-flex select-none items-center justify-center rounded-xl font-display font-semibold tracking-wide transition-all duration-200",
        "active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
        VARIANTS[variant],
        SIZES[size],
        block && "w-full",
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-5 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-11 items-center justify-center rounded-xl border border-line bg-panel/70 text-ink-soft transition hover:border-glow/60 hover:text-ink active:scale-95",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: (id: string, describedBy: string | undefined) => ReactNode;
  className?: string;
}

export function Field({ label, hint, error, children, className }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink-soft">
        {label}
      </label>
      {children(id, describedBy)}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-blocked">
          {error}
        </p>
      )}
    </div>
  );
}

const inputBase =
  "w-full rounded-xl border border-line bg-night/80 px-3.5 text-ink placeholder:text-faint transition focus:border-glow focus:outline-none focus:ring-2 focus:ring-glow/30 disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(inputBase, "h-12", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, rows = 3, ...rest },
  ref,
) {
  return <textarea ref={ref} rows={rows} className={cn(inputBase, "py-3", className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cn(inputBase, "h-12 appearance-none bg-[length:16px] pr-10", className)} {...rest}>
      {children}
    </select>
  );
});

export function Panel({ className, children, corners, as: Tag = "section" }: { className?: string; children: ReactNode; corners?: boolean; as?: "section" | "div" | "article" }) {
  return <Tag className={cn("hud-panel p-4 sm:p-5", corners && "hud-corners", className)}>{children}</Tag>;
}

export type Tone = "pending" | "progress" | "blocked" | "done" | "urgent" | "vacant" | "neutral" | "glow";

const TONES: Record<Tone, string> = {
  pending: "text-pending border-pending/40 bg-pending/10",
  progress: "text-progress border-progress/40 bg-progress/10",
  blocked: "text-blocked border-blocked/40 bg-blocked/10",
  done: "text-done border-done/40 bg-done/10",
  urgent: "text-white border-urgent bg-urgent/80",
  vacant: "text-vacant border-vacant/40 bg-vacant/10",
  neutral: "text-ink-soft border-line-strong bg-white/5",
  glow: "text-glow border-glow/40 bg-glow/10",
};

export function Chip({ tone = "neutral", children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 font-display text-xs font-semibold uppercase tracking-wider",
        TONES[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current shadow-[0_0_8px_currentColor]" aria-hidden />}
      {children}
    </span>
  );
}

export function Spinner({ className, label = "Cargando" }: { className?: string; label?: string }) {
  return (
    <span role="status" className={cn("inline-flex items-center gap-2 text-muted", className)}>
      <Loader2 className="size-5 animate-spin text-glow" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line px-6 py-10 text-center">
      {icon && <div className="text-glow/80 [&>svg]:size-10">{icon}</div>}
      <p className="font-display text-lg font-semibold text-ink">{title}</p>
      {body && <p className="max-w-sm text-sm text-muted">{body}</p>}
      {action}
    </div>
  );
}

/** Circular progress meter (HUD gauge). */
export function Ring({
  value,
  size = 64,
  stroke = 6,
  tone = "glow",
  children,
  label,
}: {
  value: number;
  size?: number;
  stroke?: number;
  tone?: "glow" | "done" | "pending" | "blocked";
  children?: ReactNode;
  label: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));
  const color = { glow: "var(--color-glow)", done: "var(--color-done)", pending: "var(--color-pending)", blocked: "var(--color-blocked)" }[tone];
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: "stroke-dashoffset 900ms cubic-bezier(.2,.8,.2,1)" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}
