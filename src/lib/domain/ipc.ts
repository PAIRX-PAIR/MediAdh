import type { IpcEntry } from "./schema";

export interface Adjusted {
  value: number;
  factor: number;
  /** Month whose index the price was expressed in. */
  fromMonth: string;
  /** Latest month with a published index used as "today". */
  toMonth: string;
}

/**
 * Valor presente = precio × IPC_actual / IPC_mes. "Actual" is the latest
 * published month not after `upTo`. Returns null when either index is missing.
 */
export function adjustForInflation(price: number, month: string, entries: IpcEntry[], upTo: string): Adjusted | null {
  const byMonth = new Map(entries.map((e) => [e.month, e.index]));
  const fromIndex = byMonth.get(month);
  if (fromIndex === undefined) return null;
  const latest = entries
    .filter((e) => e.month <= upTo)
    .sort((a, b) => (a.month < b.month ? 1 : -1))[0];
  if (!latest || latest.month < month) return null;
  const factor = latest.index / fromIndex;
  return { value: Math.round(price * factor), factor, fromMonth: month, toMonth: latest.month };
}

/** Month-over-month and 12-month variation of the series (%), for the IPC table. */
export function ipcVariations(entries: IpcEntry[]): Array<IpcEntry & { monthly: number | null; annual: number | null }> {
  const sorted = [...entries].sort((a, b) => (a.month < b.month ? -1 : 1));
  const byMonth = new Map(sorted.map((e) => [e.month, e.index]));
  const shift = (month: string, delta: number) => {
    const [y, m] = month.split("-").map(Number) as [number, number];
    const total = y * 12 + (m - 1) + delta;
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
  };
  return sorted.map((e) => {
    const prev = byMonth.get(shift(e.month, -1));
    const yearAgo = byMonth.get(shift(e.month, -12));
    return {
      ...e,
      monthly: prev ? Math.round((e.index / prev - 1) * 10000) / 100 : null,
      annual: yearAgo ? Math.round((e.index / yearAgo - 1) * 10000) / 100 : null,
    };
  });
}
