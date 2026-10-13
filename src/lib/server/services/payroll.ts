import "server-only";
import { activeHolderId } from "@/lib/domain/contracts";
import { minutesOf } from "@/lib/domain/calendar";
import { diffFields } from "@/lib/domain/diff";
import { liquidate, overlapsAnother, quincenaByKey, quincenaOf, shiftQuincena, type PayrollPerson, type Quincena } from "@/lib/domain/payroll";
import type { Attendance, Database, User } from "@/lib/domain/schema";
import { isRealDate, timeInZone } from "@/lib/domain/time";
import { isOwner, type Principal } from "../auth/principal";
import { badRequest, notFound } from "../http";
import { getDb } from "../store";
import { actorOf, audit, newId, nowIso, track } from "./common";

/**
 * Registro de horas y nómina quincenal. Workers mark their own entrada/salida
 * from the phone; admins correct the log, set salaries and read the
 * liquidation. Salaries never travel in the sync payload.
 */

const ENTRY_LABELS = { date: "Fecha", start: "Entrada", end: "Salida", note: "Nota" } as const;

function calendarOf(settings: Database["settings"]) {
  return { schedule: settings.production.schedule, skipHolidays: settings.production.skipHolidays };
}

/** Marks entrada or salida now (workshop time) for the signed-in person. */
export async function clock(principal: Principal, action: "in" | "out"): Promise<Attendance> {
  const time = timeInZone(new Date(), principal.settings.timezone);
  const date = principal.today;
  const actor = actorOf(principal);
  return getDb().transact(["attendance", "audit"], action === "in" ? "Marca entrada" : "Marca salida", ({ attendance, audit: log }) => {
    const mine = attendance.items.filter((e) => e.userId === principal.user.id);
    const open = mine.find((e) => e.end === null);
    if (action === "in") {
      if (open?.date === date) throw badRequest(`Ya marcaste entrada a las ${open.start}. Marca la salida primero.`);
      const now = nowIso();
      const entry: Attendance = {
        id: newId(),
        userId: principal.user.id,
        userName: principal.user.displayName,
        date,
        start: time,
        end: null,
        note: "",
        source: "operario",
        createdBy: principal.user.id,
        createdAt: now,
        updatedAt: now,
        history: [],
      };
      if (overlapsAnother(entry, mine)) throw badRequest("Ya hay un registro que cubre esta hora.");
      attendance.items.push(entry);
      audit(log, actor, "entrada_marcada", entry.id, `${date} ${time}`);
      return entry;
    }
    if (!open || open.date !== date) {
      throw badRequest(
        open
          ? `Tu entrada del ${open.date} quedó sin salida. Pide al coordinador que la corrija y marca entrada de nuevo.`
          : "No tienes una entrada abierta hoy.",
      );
    }
    if (minutesOf(time) <= minutesOf(open.start)) throw badRequest("La salida debe ser después de la entrada.");
    open.end = time;
    open.updatedAt = nowIso();
    track(open, actor, "Salida marcada", [{ field: "end", label: "Salida", from: null, to: time }]);
    audit(log, actor, "salida_marcada", open.id, `${date} ${time}`);
    return open;
  });
}

/** What a person sees about their own hours: today's blocks and this quincena's totals (no money). */
export async function myAttendance(principal: Principal) {
  const { attendance, settings } = await getDb().read(["attendance", "settings"]);
  const quincena = quincenaOf(principal.today);
  const mine = attendance.items.filter((e) => e.userId === principal.user.id);
  const [line] = liquidate({
    people: [{ id: principal.user.id, displayName: principal.user.displayName, monthlySalary: null, transportAllowance: false }],
    entries: mine,
    quincena,
    calendar: calendarOf(settings),
    settings: settings.payroll,
  });
  return {
    today: mine.filter((e) => e.date === principal.today).sort((a, b) => a.start.localeCompare(b.start)),
    open: mine.find((e) => e.end === null) ?? null,
    quincena,
    hours: line!.hours,
    workedHours: line!.workedHours,
    scheduledHours: line!.scheduledHours,
  };
}

export interface PayrollPersonView extends PayrollPerson {
  username: string;
  positionTitle: string | null;
}

export function payrollPeopleFor(docs: Pick<Database, "users" | "positions">, entries: Attendance[], today: string): PayrollPersonView[] {
  const withEntries = new Set(entries.map((e) => e.userId));
  const positionOf = (u: User) => docs.positions.items.find((p) => activeHolderId(p, today) === u.id)?.title ?? null;
  return docs.users.items
    .filter((u) => u.status === "active" && (u.kind === "staff" || u.monthlySalary !== null || withEntries.has(u.id)))
    .map((u) => ({
      id: u.id,
      displayName: u.displayName,
      username: u.username,
      monthlySalary: u.monthlySalary,
      transportAllowance: u.transportAllowance,
      positionTitle: positionOf(u),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "es"));
}

/** Liquidation of one quincena (key "AAAA-MM-1|2"; default: the current one). */
export async function payrollReport(principal: Principal, key: string | null) {
  const quincena: Quincena | null = key ? quincenaByKey(key) : quincenaOf(principal.today);
  if (!quincena) throw badRequest("Quincena inválida (usa AAAA-MM-1 o AAAA-MM-2).");
  const docs = await getDb().read(["attendance", "settings", "users", "positions"]);
  const entries = docs.attendance.items
    .filter((e) => e.date >= quincena.from && e.date <= quincena.to)
    .sort((a, b) => (a.date === b.date ? a.start.localeCompare(b.start) : a.date.localeCompare(b.date)));
  const owner = isOwner(principal);
  // Coordinación y asistencia keep the hours log; salaries and money stay with gerencia/administración.
  const people = payrollPeopleFor(docs, entries, principal.today).map((p) => (owner ? p : { ...p, monthlySalary: null, transportAllowance: false }));
  return {
    moneyHidden: !owner,
    quincena,
    previous: shiftQuincena(quincena, -1).key,
    next: shiftQuincena(quincena, 1).key,
    current: quincenaOf(principal.today).key,
    settings: docs.settings.payroll,
    people,
    lines: liquidate({ people, entries, quincena, calendar: calendarOf(docs.settings), settings: docs.settings.payroll }),
    entries: entries.map(({ history: _h, ...rest }) => {
      void _h;
      return rest;
    }),
  };
}

export interface AttendanceInput {
  userId: string;
  date: string;
  start: string;
  end: string | null;
  note: string;
}

function validateEntry(input: Pick<AttendanceInput, "date" | "start" | "end">) {
  if (!isRealDate(input.date)) throw badRequest("Fecha inválida.");
  if (input.end !== null && minutesOf(input.end) <= minutesOf(input.start)) throw badRequest("La salida debe ser después de la entrada.");
}

export async function createAttendance(principal: Principal, input: AttendanceInput): Promise<Attendance> {
  validateEntry(input);
  const actor = actorOf(principal);
  return getDb().transact(["attendance", "users", "audit"], "Registra horas", ({ attendance, users, audit: log }) => {
    const user = users.items.find((u) => u.id === input.userId);
    if (!user) throw badRequest("La persona no existe.");
    const now = nowIso();
    const entry: Attendance = {
      id: newId(),
      userId: user.id,
      userName: user.displayName,
      date: input.date,
      start: input.start,
      end: input.end,
      note: input.note,
      source: "admin",
      createdBy: principal.user.id,
      createdAt: now,
      updatedAt: now,
      history: [],
    };
    const clash = overlapsAnother(entry, attendance.items);
    if (clash) throw badRequest(`Se cruza con el registro de ${clash.start} a ${clash.end ?? "sin salida"}.`);
    track(entry, actor, "Registro creado por el coordinador");
    attendance.items.push(entry);
    audit(log, actor, "horas_registradas", entry.id, `${user.username} ${input.date} ${input.start}-${input.end ?? "…"}`);
    return entry;
  });
}

export async function updateAttendance(principal: Principal, id: string, patch: Partial<Omit<AttendanceInput, "userId">>): Promise<Attendance> {
  const actor = actorOf(principal);
  return getDb().transact(["attendance", "audit"], "Corrige registro de horas", ({ attendance, audit: log }) => {
    const entry = attendance.items.find((e) => e.id === id);
    if (!entry) throw notFound();
    const next = { ...entry, ...patch };
    validateEntry(next);
    const clash = overlapsAnother(next, attendance.items);
    if (clash) throw badRequest(`Se cruza con el registro de ${clash.start} a ${clash.end ?? "sin salida"}.`);
    const changes = diffFields(entry, next, ENTRY_LABELS);
    if (changes.length === 0) return entry;
    Object.assign(entry, patch, { updatedAt: nowIso(), source: "admin" as const });
    track(entry, actor, "Registro corregido", changes);
    audit(log, actor, "horas_corregidas", entry.id, changes.map((c) => c.label).join(", "));
    return entry;
  });
}

export async function deleteAttendance(principal: Principal, id: string) {
  await getDb().transact(["attendance", "audit"], "Elimina registro de horas", ({ attendance, audit: log }) => {
    const entry = attendance.items.find((e) => e.id === id);
    if (!entry) throw notFound();
    attendance.items = attendance.items.filter((e) => e.id !== id);
    audit(log, actorOf(principal), "horas_eliminadas", entry.userId, `${entry.date} ${entry.start}-${entry.end ?? "…"}`);
  });
}

/** Salary and transport allowance of a person (admin only; the amount stays out of the audit log). */
export async function setPay(principal: Principal, userId: string, input: { monthlySalary?: number | null; transportAllowance?: boolean }) {
  await getDb().transact(["users", "audit"], "Actualiza sueldo", ({ users, audit: log }) => {
    const user = users.items.find((u) => u.id === userId);
    if (!user) throw notFound();
    if (input.monthlySalary !== undefined) user.monthlySalary = input.monthlySalary;
    if (input.transportAllowance !== undefined) user.transportAllowance = input.transportAllowance;
    user.updatedAt = nowIso();
    audit(log, actorOf(principal), "sueldo_actualizado", user.id, user.username);
  });
}
