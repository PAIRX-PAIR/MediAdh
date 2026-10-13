import { addDays } from "./time";

/**
 * Colombian public holidays (Ley 51 de 1983 "Ley Emiliani"): some dates are
 * fixed, others move to the following Monday, and the Easter-based ones are
 * computed from Easter Sunday.
 */

/** Easter Sunday (Gregorian, anonymous algorithm). */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: string): number {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

function nextMonday(date: string): string {
  const wd = isoWeekday(date);
  return wd === 1 ? date : addDays(date, 8 - wd);
}

const cache = new Map<number, Map<string, string>>();

/** Holidays of `year` as date → name. */
export function colombianHolidays(year: number): Map<string, string> {
  const cached = cache.get(year);
  if (cached) return cached;
  const y = String(year);
  const list = new Map<string, string>();
  const fixed: Array<[string, string]> = [
    ["01-01", "Año Nuevo"],
    ["05-01", "Día del Trabajo"],
    ["07-20", "Día de la Independencia"],
    ["08-07", "Batalla de Boyacá"],
    ["12-08", "Inmaculada Concepción"],
    ["12-25", "Navidad"],
  ];
  for (const [md, name] of fixed) list.set(`${y}-${md}`, name);
  const moved: Array<[string, string]> = [
    ["01-06", "Reyes Magos"],
    ["03-19", "San José"],
    ["06-29", "San Pedro y San Pablo"],
    ["08-15", "Asunción de la Virgen"],
    ["10-12", "Día de la Raza"],
    ["11-01", "Todos los Santos"],
    ["11-11", "Independencia de Cartagena"],
  ];
  for (const [md, name] of moved) list.set(nextMonday(`${y}-${md}`), name);
  const easter = easterSunday(year);
  list.set(addDays(easter, -3), "Jueves Santo");
  list.set(addDays(easter, -2), "Viernes Santo");
  list.set(addDays(easter, 43), "Ascensión del Señor");
  list.set(addDays(easter, 64), "Corpus Christi");
  list.set(addDays(easter, 71), "Sagrado Corazón");
  cache.set(year, list);
  return list;
}

export function holidayName(date: string): string | null {
  return colombianHolidays(Number(date.slice(0, 4))).get(date) ?? null;
}

/** One working block of a day, wall-clock HH:mm in the workshop timezone (end exclusive). */
export interface Shift {
  start: string;
  end: string;
}

/** Seven lists of shifts, index 0 = lunes … 6 = domingo. */
export type WeekSchedule = Shift[][];

/**
 * Horario de S.M.I. (42 h semanales): lunes y viernes 8:00–12:00 y 13:30–16:30,
 * martes a jueves 7:30–12:00 y 13:30–17:00, sábado 8:00–12:00.
 */
export const DEFAULT_WEEK_SCHEDULE: WeekSchedule = [
  [{ start: "08:00", end: "12:00" }, { start: "13:30", end: "16:30" }],
  [{ start: "07:30", end: "12:00" }, { start: "13:30", end: "17:00" }],
  [{ start: "07:30", end: "12:00" }, { start: "13:30", end: "17:00" }],
  [{ start: "07:30", end: "12:00" }, { start: "13:30", end: "17:00" }],
  [{ start: "08:00", end: "12:00" }, { start: "13:30", end: "16:30" }],
  [{ start: "08:00", end: "12:00" }],
  [],
];

/** Minutes since midnight of "HH:mm". */
export function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function shiftsMinutes(shifts: Shift[]): number {
  return shifts.reduce((sum, s) => sum + Math.max(0, minutesOf(s.end) - minutesOf(s.start)), 0);
}

export function weeklyHours(schedule: WeekSchedule): number {
  return schedule.reduce((sum, day) => sum + shiftsMinutes(day), 0) / 60;
}

export interface WorkCalendar {
  schedule: WeekSchedule;
  skipHolidays: boolean;
}

/** Shifts that apply on `date` (none on a holiday when holidays are skipped). */
export function shiftsOn(date: string, cal: WorkCalendar): Shift[] {
  if (cal.skipHolidays && holidayName(date)) return [];
  return cal.schedule[isoWeekday(date) - 1] ?? [];
}

/**
 * Productive hours a machine offers on `date`: the workshop schedule, capped
 * by the machine's own `hoursPerDay` when it has one.
 */
export function calendarHours(date: string, hoursPerDay: number | null, cal: WorkCalendar): number {
  const hours = shiftsMinutes(shiftsOn(date, cal)) / 60;
  return hoursPerDay === null ? hours : Math.min(hours, hoursPerDay);
}
