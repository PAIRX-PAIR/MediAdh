import { holidayName, isoWeekday, minutesOf, shiftsOn, type WorkCalendar } from "./calendar";
import type { Attendance, PayAdjustment, PayrollSettings } from "./schema";
import { addDays } from "./time";

/**
 * Nómina quincenal: horas ordinarias y extra a partir del registro de horas y
 * del horario del taller, y liquidación de cada quincena (pagos los días 15 y
 * 30). Todo lo trabajado fuera del horario es hora extra; domingos y festivos
 * llevan además el recargo dominical. Es un cálculo de apoyo: el contador
 * valida la nómina definitiva.
 */

/* ───────────────────────── Quincenas ───────────────────────── */

export interface Quincena {
  /** "AAAA-MM-1" (días 1–15) or "AAAA-MM-2" (16–fin de mes). */
  key: string;
  from: string;
  to: string;
  /** Pago: el 15, o el 30 (último día en febrero). */
  payDate: string;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function quincenaByKey(key: string): Quincena | null {
  const m = key.match(/^(\d{4})-(0[1-9]|1[0-2])-([12])$/);
  if (!m) return null;
  const [, y, mm, half] = m;
  const year = Number(y);
  const month = Number(mm);
  const prefix = `${y}-${mm}`;
  if (half === "1") return { key, from: `${prefix}-01`, to: `${prefix}-15`, payDate: `${prefix}-15` };
  const last = lastDayOfMonth(year, month);
  return { key, from: `${prefix}-16`, to: `${prefix}-${String(last).padStart(2, "0")}`, payDate: `${prefix}-${String(Math.min(30, last)).padStart(2, "0")}` };
}

export function quincenaOf(date: string): Quincena {
  return quincenaByKey(`${date.slice(0, 7)}-${Number(date.slice(8, 10)) <= 15 ? 1 : 2}`)!;
}

/** The quincena `delta` periods before (negative) or after (positive) `q`. */
export function shiftQuincena(q: Quincena, delta: number): Quincena {
  let current = q;
  for (let i = 0; i < Math.abs(delta); i++) current = quincenaOf(delta > 0 ? addDays(current.to, 1) : addDays(current.from, -1));
  return current;
}

export function datesOf(q: Quincena): string[] {
  const out: string[] = [];
  for (let d = q.from; d <= q.to; d = addDays(d, 1)) out.push(d);
  return out;
}

/* ───────────────────────── Horas por día ───────────────────────── */

type Interval = [number, number];

function union(list: Interval[]): Interval[] {
  const sorted = list.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out: Interval[] = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

function intersect(a: Interval[], b: Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const [a0, a1] of a) for (const [b0, b1] of b) if (Math.min(a1, b1) > Math.max(a0, b0)) out.push([Math.max(a0, b0), Math.min(a1, b1)]);
  return union(out);
}

function subtract(a: Interval[], b: Interval[]): Interval[] {
  let rest = a;
  for (const [b0, b1] of b) {
    rest = rest.flatMap(([a0, a1]): Interval[] => {
      if (b1 <= a0 || b0 >= a1) return [[a0, a1]];
      const parts: Interval[] = [];
      if (b0 > a0) parts.push([a0, b0]);
      if (b1 < a1) parts.push([b1, a1]);
      return parts;
    });
  }
  return rest;
}

const length = (list: Interval[]) => list.reduce((sum, [a, b]) => sum + (b - a), 0);

export const HOUR_KINDS = ["extraDay", "extraNight", "extraHolidayDay", "extraHolidayNight", "holidayOrdinary"] as const;
export type HourKind = (typeof HOUR_KINDS)[number];

export const HOUR_KIND_LABEL: Record<HourKind, string> = {
  extraDay: "Extra diurna",
  extraNight: "Extra nocturna",
  extraHolidayDay: "Extra diurna dominical/festiva",
  extraHolidayNight: "Extra nocturna dominical/festiva",
  holidayOrdinary: "Recargo dominical/festivo (dentro del horario)",
};

export interface DayHours {
  date: string;
  /** Holiday name, "Domingo", or null. */
  special: string | null;
  scheduledMinutes: number;
  workedMinutes: number;
  /** Worked inside the schedule (covered by the salary). */
  ordinaryMinutes: number;
  minutes: Record<HourKind, number>;
  /** Blocks without a clock-out (not counted until someone closes them). */
  openEntries: number;
  /** Hours added by themselves from the schedule (nobody registered that day). */
  auto: boolean;
  /** Marked as falta. */
  absent: boolean;
}

function nightIntervals(settings: PayrollSettings): Interval[] {
  const start = minutesOf(settings.nightStart);
  const end = minutesOf(settings.nightEnd);
  return start > end ? [[0, end], [start, 1440]] : [[start, end]];
}

const roundDown = (minutes: number, block: number) => (block > 0 ? Math.floor(minutes / block) * block : minutes);

export function dayHours(date: string, entries: Attendance[], calendar: WorkCalendar, settings: PayrollSettings): DayHours {
  const closed = entries.filter((e) => e.date === date && e.end !== null && !e.absent);
  const worked = union(closed.map((e) => [minutesOf(e.start), minutesOf(e.end!)]));
  const scheduled = union(shiftsOn(date, calendar).map((s) => [minutesOf(s.start), minutesOf(s.end)]));
  const holiday = holidayName(date);
  const special = holiday ?? (isoWeekday(date) === 7 ? "Domingo" : null);
  const inside = length(intersect(worked, scheduled));
  const outside = subtract(worked, scheduled);
  const night = roundDown(length(intersect(outside, nightIntervals(settings))), settings.roundingMinutes);
  const day = roundDown(length(outside) - length(intersect(outside, nightIntervals(settings))), settings.roundingMinutes);
  const minutes: Record<HourKind, number> = { extraDay: 0, extraNight: 0, extraHolidayDay: 0, extraHolidayNight: 0, holidayOrdinary: 0 };
  if (special) {
    minutes.extraHolidayDay = day;
    minutes.extraHolidayNight = night;
    minutes.holidayOrdinary = inside;
  } else {
    minutes.extraDay = day;
    minutes.extraNight = night;
  }
  return {
    date,
    special,
    scheduledMinutes: length(scheduled),
    workedMinutes: length(worked),
    ordinaryMinutes: inside,
    minutes,
    openEntries: entries.filter((e) => e.date === date && e.end === null).length,
    auto: closed.length > 0 && closed.every((e) => e.source === "auto"),
    absent: entries.some((e) => e.date === date && e.absent),
  };
}

/**
 * Schedule hours that add up by themselves: every workday of the contract up to
 * now counts its shifts (today, only the shifts already over) unless someone
 * registered hours or a falta that day. Nothing is stored; real records win.
 */
export function autoEntries(
  person: Pick<PayrollPerson, "id" | "displayName" | "employment">,
  dates: string[],
  entries: Attendance[],
  calendar: WorkCalendar,
  now: { date: string; minutes: number },
): Attendance[] {
  const out: Attendance[] = [];
  for (const date of dates) {
    if (date > now.date) break;
    if (person.employment && !person.employment.some(([from, to]) => date >= from && (to === null || date <= to))) continue;
    if (entries.some((e) => e.userId === person.id && e.date === date)) continue;
    for (const s of shiftsOn(date, calendar)) {
      if (date === now.date && minutesOf(s.end) > now.minutes) continue;
      out.push({
        id: `auto-${person.id}-${date}-${s.start}`,
        userId: person.id,
        userName: person.displayName,
        date,
        start: s.start,
        end: s.end,
        note: "Horario (automático)",
        absent: false,
        source: "auto",
        createdBy: "sistema",
        createdAt: `${date}T00:00:00.000Z`,
        updatedAt: `${date}T00:00:00.000Z`,
        history: [],
      });
    }
  }
  return out;
}

/* ───────────────────────── Liquidación ───────────────────────── */

/** Multiplier over the ordinary hourly value for each kind of hour. */
export function hourFactor(kind: HourKind, s: PayrollSettings): number {
  switch (kind) {
    case "extraDay":
      return 1 + s.extraDayPct / 100;
    case "extraNight":
      return 1 + s.extraNightPct / 100;
    case "extraHolidayDay":
      return 1 + (s.extraDayPct + s.sundayHolidayPct) / 100;
    case "extraHolidayNight":
      return 1 + (s.extraNightPct + s.sundayHolidayPct) / 100;
    case "holidayOrdinary":
      // The base hour is already in the salary: only the surcharge is added.
      return s.sundayHolidayPct / 100;
  }
}

export interface PayrollPerson {
  id: string;
  displayName: string;
  monthlySalary: number | null;
  transportAllowance: boolean;
  /**
   * Contract periods [from, to] (to null = indefinite). Undefined = paid the
   * whole quincena (e.g. gerencia without a contract in the app).
   */
  employment?: Array<[string, string | null]>;
}

/**
 * Commercial days paid in the quincena (Colombian payroll: 15 per quincena):
 * all 15 when the contract covers the whole period, otherwise the days covered.
 */
export function paidDaysIn(q: Quincena, employment: PayrollPerson["employment"]): number {
  if (!employment) return 15;
  const dates = datesOf(q);
  const covered = dates.filter((d) => employment.some(([from, to]) => d >= from && (to === null || d <= to))).length;
  return covered === dates.length ? 15 : Math.min(15, covered);
}

export interface PayrollLine {
  userId: string;
  name: string;
  monthlySalary: number | null;
  hourlyValue: number;
  /** Salary for the days paid (15 = half of the monthly salary). */
  basic: number;
  paidDays: number;
  hours: Record<HourKind, number>;
  amounts: Record<HourKind, number>;
  extrasTotal: number;
  transport: number;
  /** Bonificaciones de la quincena (outside the social-security base). */
  bonuses: number;
  /** Descuentos puntuales (anticipos, préstamos…) taken off the net pay. */
  otherDeductions: number;
  adjustments: Array<Pick<PayAdjustment, "id" | "kind" | "concept" | "amount">>;
  earned: number;
  health: number;
  pension: number;
  net: number;
  workedHours: number;
  scheduledHours: number;
  openEntries: number;
  days: DayHours[];
}

const peso = (n: number) => Math.round(n);

export function liquidate(input: {
  people: PayrollPerson[];
  entries: Attendance[];
  quincena: Quincena;
  calendar: WorkCalendar;
  settings: PayrollSettings;
  adjustments?: PayAdjustment[];
  /** Current date and minute of the day: turns on the automatic schedule hours (settings.autoAttendance). */
  now?: { date: string; minutes: number };
}): PayrollLine[] {
  const { quincena, calendar, settings } = input;
  const dates = datesOf(quincena);
  return input.people.map((person) => {
    const recorded = input.entries.filter((e) => e.userId === person.id && e.date >= quincena.from && e.date <= quincena.to);
    const mine = input.now && settings.autoAttendance ? [...recorded, ...autoEntries(person, dates, recorded, calendar, input.now)] : recorded;
    const days = dates.map((d) => dayHours(d, mine, calendar, settings));
    const salary = person.monthlySalary ?? 0;
    const hourlyValue = salary / settings.monthlyHours;
    const hours = {} as Record<HourKind, number>;
    const amounts = {} as Record<HourKind, number>;
    for (const kind of HOUR_KINDS) {
      const minutes = days.reduce((sum, d) => sum + d.minutes[kind], 0);
      hours[kind] = minutes / 60;
      amounts[kind] = peso((minutes / 60) * hourlyValue * hourFactor(kind, settings));
    }
    const paidDays = paidDaysIn(quincena, person.employment);
    const basic = peso((salary / 30) * paidDays);
    const extrasTotal = HOUR_KINDS.reduce((sum, k) => sum + amounts[k], 0);
    const transport = person.transportAllowance ? peso((settings.transportAllowance / 30) * paidDays) : 0;
    // Social security contributions are not charged on the transport allowance.
    const base = basic + extrasTotal;
    const health = peso((base * settings.healthPct) / 100);
    const pension = peso((base * settings.pensionPct) / 100);
    const adjustments = (input.adjustments ?? []).filter((a) => a.userId === person.id && a.quincena === quincena.key);
    const bonuses = adjustments.filter((a) => a.kind === "bono").reduce((s, a) => s + a.amount, 0);
    const otherDeductions = adjustments.filter((a) => a.kind === "descuento").reduce((s, a) => s + a.amount, 0);
    const earned = base + transport + bonuses;
    return {
      userId: person.id,
      name: person.displayName,
      monthlySalary: person.monthlySalary,
      hourlyValue: peso(hourlyValue),
      basic,
      paidDays,
      hours,
      amounts,
      extrasTotal,
      transport,
      bonuses,
      otherDeductions,
      adjustments: adjustments.map(({ id, kind, concept, amount }) => ({ id, kind, concept, amount })),
      earned,
      health,
      pension,
      net: earned - health - pension - otherDeductions,
      workedHours: days.reduce((sum, d) => sum + d.workedMinutes, 0) / 60,
      scheduledHours: days.reduce((sum, d) => sum + d.scheduledMinutes, 0) / 60,
      openEntries: days.reduce((sum, d) => sum + d.openEntries, 0),
      days,
    };
  });
}

/** Checks a block against the person's other blocks of the same day. */
export function overlapsAnother(entry: Pick<Attendance, "id" | "userId" | "date" | "start" | "end">, others: Attendance[]): Attendance | null {
  const a0 = minutesOf(entry.start);
  const a1 = entry.end === null ? 1440 : minutesOf(entry.end);
  return (
    others.find((o) => {
      if (o.id === entry.id || o.userId !== entry.userId || o.date !== entry.date) return false;
      const b0 = minutesOf(o.start);
      const b1 = o.end === null ? 1440 : minutesOf(o.end);
      return Math.min(a1, b1) > Math.max(a0, b0);
    }) ?? null
  );
}
