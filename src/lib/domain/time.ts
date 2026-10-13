export const DEFAULT_TIMEZONE = "America/Bogota";

/** Calendar date (AAAA-MM-DD) for `at` in the workshop's timezone. */
export function dateInZone(at: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

export function todayIn(timeZone: string, now: Date = new Date()): string {
  return dateInZone(now, timeZone);
}

/** Whole days from `from` to `to` (both AAAA-MM-DD). Negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

export function addDays(date: string, days: number): string {
  const d = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

/** Offset (ms) of `timeZone` from UTC at instant `at`. */
function zoneOffset(at: number, timeZone: string): number {
  let fmt = partsFormatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsFormatters.set(timeZone, fmt);
  }
  const parts = fmt.formatToParts(new Date(at));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(at / 1000) * 1000;
}

/** The instant of wall-clock `date` (AAAA-MM-DD) at `time` (HH:mm) in `timeZone`. */
export function zonedInstant(date: string, time: string, timeZone: string): Date {
  const [h, m] = time.split(":").map(Number);
  const wall = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), h ?? 0, m ?? 0);
  let guess = wall - zoneOffset(wall, timeZone);
  // A second pass settles DST transitions (Colombia has none, other zones may).
  guess = wall - zoneOffset(guess, timeZone);
  return new Date(guess);
}

/** HH:mm of `at` in `timeZone`. */
export function timeInZone(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
