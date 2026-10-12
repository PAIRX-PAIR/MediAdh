import type { ChangeEntry, FieldChange } from "./schema";

/** Human-readable value for the change log. */
export function displayValue(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (Array.isArray(value)) return value.length === 0 ? null : `${value.length} elemento(s)`;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Field-level differences between two versions of an entity, limited to the
 * labelled fields (labels double as the whitelist of what is tracked).
 */
export function diffFields<T extends object>(before: T, after: T, labels: Partial<Record<keyof T & string, string>>): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const [field, label] of Object.entries(labels) as Array<[keyof T & string, string]>) {
    const a = (before as Record<string, unknown>)[field];
    const b = (after as Record<string, unknown>)[field];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    changes.push({ field, label, from: displayValue(a), to: displayValue(b) });
  }
  return changes;
}

/** Appends a change-log entry, keeping only the latest `max` entries. */
export function recordChange(
  history: ChangeEntry[],
  entry: Omit<ChangeEntry, "at"> & { at?: string },
  max: number,
): ChangeEntry[] {
  const next = [...history, { ...entry, at: entry.at ?? new Date().toISOString() }];
  return next.length > max ? next.slice(next.length - max) : next;
}
