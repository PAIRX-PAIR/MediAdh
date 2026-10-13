import type { Goal } from "./schema";

/**
 * Ganancias del mes: what the workshop sold (delivered jobs, before VAT), minus
 * the materials of those jobs and the payroll of both quincenas, and how far
 * the month is from each goal.
 */

export interface GoalProgress {
  /** Goals already reached (in ascending order). */
  reached: Goal[];
  /** Next goal to reach, or null when all are reached. */
  next: Goal | null;
  /** Missing to reach `next` (0 when there is none). */
  missing: number;
  /** Progress toward the highest goal, 0–1. */
  ratio: number;
}

export function goalProgress(value: number, goals: Goal[]): GoalProgress {
  const sorted = [...goals].filter((g) => g.amount > 0).sort((a, b) => a.amount - b.amount);
  const reached = sorted.filter((g) => value >= g.amount);
  const next = sorted.find((g) => value < g.amount) ?? null;
  const top = sorted[sorted.length - 1]?.amount ?? 0;
  return {
    reached,
    next,
    missing: next ? next.amount - value : 0,
    ratio: top > 0 ? Math.min(1, Math.max(0, value / top)) : 0,
  };
}

/** "AAAA-MM" of the month before/after. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}
