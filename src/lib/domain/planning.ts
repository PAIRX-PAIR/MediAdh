import { shiftsOn, type WorkCalendar } from "./calendar";
import type { Machine, Order, OrderStatus, Process, WorkItem } from "./schema";
import { addDays, daysBetween, zonedInstant } from "./time";

/**
 * Production planning: finite-capacity list scheduling of the open work items
 * on the workshop machines, queue occupancy, an explainable priority advisor
 * and the "¿Me puedo comprometer?" simulator.
 *
 * Simplifications (documented for the boss, all adjustable later):
 * - Process steps of one order may run in parallel on different machines.
 * - Capacity comes from the workshop's weekly shifts (horario) and skips
 *   Colombian holidays; a machine may cap it with its own hours per day.
 * - Jobs are dispatched by earliest due date (EDD), ties by difficulty.
 */

const HOUR = 3_600_000;
const MAX_DAYS = 730;
const EPS = 1e-6;

export const OPEN_ORDER_STATUSES: OrderStatus[] = ["recibida", "en_proceso", "garantia"];

export interface PlanContext {
  machines: Machine[];
  calendar: WorkCalendar;
  timezone: string;
  /** Current instant (ms). */
  now: number;
  /** Today in the workshop timezone (AAAA-MM-DD). */
  today: string;
}

/** A machine can take work unless it is still "inactiva" (not bought / not in service). */
export function isSchedulable(m: Machine, date: string): boolean {
  if (m.state === "inactiva") return false;
  return !m.activeSince || date >= m.activeSince;
}

function overlapMs(aFrom: number, aTo: number, bFrom: number, bTo: number): number {
  return Math.max(0, Math.min(aTo, bTo) - Math.max(aFrom, bFrom));
}

/**
 * Productive hours of `m` on `date` inside the workshop shifts, minus
 * maintenance stops. `notBefore` / `notAfter` trim the window (today: only
 * what is left of the shifts counts; due day: only what comes before the time).
 */
export function machineHoursOn(m: Machine, date: string, ctx: Pick<PlanContext, "calendar" | "timezone">, notBefore?: number, notAfter?: number): number {
  if (m.state === "inactiva") return 0;
  if (m.activeSince && date < m.activeSince) return 0;
  // A machine's own hours/day cap the schedule, counted from the first shift.
  let budget = m.hoursPerDay === null ? Number.POSITIVE_INFINITY : m.hoursPerDay * HOUR;
  let total = 0;
  for (const shift of shiftsOn(date, ctx.calendar)) {
    if (budget <= 0) break;
    const start = zonedInstant(date, shift.start, ctx.timezone).getTime();
    const end = Math.min(zonedInstant(date, shift.end, ctx.timezone).getTime(), start + budget);
    budget -= end - start;
    const from = notBefore !== undefined ? Math.max(start, notBefore) : start;
    const to = notAfter !== undefined ? Math.min(end, notAfter) : end;
    if (from >= to) continue;
    let stopped = 0;
    for (const stop of m.stops) {
      const sFrom = Date.parse(stop.from);
      const sTo = stop.to ? Date.parse(stop.to) : Number.POSITIVE_INFINITY;
      stopped += overlapMs(from, to, sFrom, sTo);
    }
    total += Math.max(0, to - from - stopped);
  }
  return total / HOUR;
}

/** Remaining hours of a work item (planned minus reported). */
export function remainingHours(item: WorkItem): number {
  if (item.status === "completada") return 0;
  return Math.max(0, item.plannedHours - (item.actualHours ?? 0));
}

export function dueInstant(order: Pick<Order, "due">, timezone: string): number | null {
  return order.due ? zonedInstant(order.due.date, order.due.time, timezone).getTime() : null;
}

/**
 * Target used for scheduling: the agreed date, except for warranty rework of a
 * job already delivered, which is due as soon as possible (the claim's time).
 */
export function scheduleTarget(order: Pick<Order, "due" | "status" | "deliveredAt" | "claims">, timezone: string): number | null {
  if (order.status === "garantia" && order.deliveredAt) {
    const open = order.claims.filter((c) => !c.resolvedAt).map((c) => Date.parse(c.at));
    return open.length ? Math.min(...open) : Date.parse(order.deliveredAt);
  }
  return dueInstant(order, timezone);
}

export interface Job {
  orderId: string;
  folio: string;
  workItemId: string;
  process: Process;
  /** Fixed machine, or null to let the scheduler pick the best one of the process. */
  machineId: string | null;
  hours: number;
  due: number | null;
  difficulty: number;
  /** Urgent jobs bump the piece mounted on the machine: they go first. */
  urgent: boolean;
  receivedAt: number;
}

export function jobsFromOrders(orders: Order[], timezone: string): Job[] {
  const jobs: Job[] = [];
  for (const o of orders) {
    if (!OPEN_ORDER_STATUSES.includes(o.status)) continue;
    for (const item of o.workItems) {
      const hours = remainingHours(item);
      if (hours <= EPS) continue;
      jobs.push({
        orderId: o.id,
        folio: o.folio,
        workItemId: item.id,
        process: item.process,
        machineId: item.machineId,
        hours,
        due: scheduleTarget(o, timezone),
        difficulty: o.difficulty,
        urgent: o.urgent ?? false,
        receivedAt: Date.parse(o.intake.receivedAt),
      });
    }
  }
  return jobs;
}

/** Earliest due date first; no date goes last; then harder jobs, then the oldest. */
export function byDispatchRule(a: Job, b: Job): number {
  if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
  const da = a.due ?? Number.POSITIVE_INFINITY;
  const db = b.due ?? Number.POSITIVE_INFINITY;
  if (da !== db) return da - db;
  if (a.difficulty !== b.difficulty) return b.difficulty - a.difficulty;
  return a.receivedAt - b.receivedAt;
}

export interface ScheduledJob extends Job {
  /** Machine actually used (null when no machine can do it). */
  assignedMachineId: string | null;
  startDate: string | null;
  endDate: string | null;
  /** Finishes after its due date (date-level). */
  late: boolean;
}

export interface MachineLoad {
  machineId: string;
  /** Hours allocated per day index (0 = today). */
  load: number[];
  /** Capacity per day index. */
  capacity: number[];
  /** First date with free capacity after the queued work. */
  freeDate: string | null;
  queuedHours: number;
}

export interface Schedule {
  days: string[];
  jobs: ScheduledJob[];
  machines: Map<string, MachineLoad>;
}

interface Cursor {
  day: number;
  used: number;
}

/**
 * Finite-capacity list scheduling: jobs are taken in the given order and each
 * one goes to the machine (fixed, or the best of its process) where it
 * finishes first, filling the remaining daily capacity.
 */
export function scheduleJobs(ordered: Job[], ctx: PlanContext, horizonDays = 60): Schedule {
  const days: string[] = [];
  const dayOf = (i: number) => {
    while (days.length <= i) days.push(addDays(ctx.today, days.length));
    return days[i]!;
  };
  const capCache = new Map<string, number[]>();
  const capOf = (m: Machine, i: number) => {
    let caps = capCache.get(m.id);
    if (!caps) capCache.set(m.id, (caps = []));
    if (caps[i] === undefined) caps[i] = machineHoursOn(m, dayOf(i), ctx, i === 0 ? ctx.now : undefined);
    return caps[i]!;
  };

  const cursors = new Map<string, Cursor>();
  const loads = new Map<string, number[]>();
  for (const m of ctx.machines) {
    cursors.set(m.id, { day: 0, used: 0 });
    loads.set(m.id, []);
  }

  const simulate = (m: Machine, hours: number) => {
    const cursor = cursors.get(m.id)!;
    let i = cursor.day;
    let used = cursor.used;
    let remaining = hours;
    let start: number | null = null;
    const allocations: Array<[number, number]> = [];
    if (remaining <= EPS) return { start: i, end: i, cursor: { day: i, used }, allocations };
    while (i < MAX_DAYS) {
      const free = capOf(m, i) - used;
      if (free > EPS) {
        const take = Math.min(free, remaining);
        start ??= i;
        allocations.push([i, take]);
        remaining -= take;
        used += take;
        if (remaining <= EPS) return { start, end: i, cursor: { day: i, used }, allocations };
      }
      i += 1;
      used = 0;
    }
    return null;
  };

  const scheduled: ScheduledJob[] = [];
  for (const job of ordered) {
    const candidates = ctx.machines.filter((m) =>
      job.machineId ? m.id === job.machineId && m.state !== "inactiva" : m.process === job.process && m.state !== "inactiva",
    );
    let best: { m: Machine; result: NonNullable<ReturnType<typeof simulate>> } | null = null;
    for (const m of candidates) {
      const result = simulate(m, job.hours);
      if (result && (!best || result.end < best.result.end)) best = { m, result };
    }
    if (!best) {
      scheduled.push({ ...job, assignedMachineId: null, startDate: null, endDate: null, late: job.due !== null });
      continue;
    }
    cursors.set(best.m.id, best.result.cursor);
    const load = loads.get(best.m.id)!;
    for (const [i, h] of best.result.allocations) load[i] = (load[i] ?? 0) + h;
    const endDate = dayOf(best.result.end);
    const dueDate = job.due !== null ? isoDateOfInstant(job.due, ctx.timezone) : null;
    scheduled.push({
      ...job,
      assignedMachineId: best.m.id,
      startDate: dayOf(best.result.start),
      endDate,
      late: dueDate !== null && endDate > dueDate,
    });
  }

  const machines = new Map<string, MachineLoad>();
  for (const m of ctx.machines) {
    const cursor = cursors.get(m.id)!;
    const span = Math.max(horizonDays, cursor.day + 1);
    const capacity: number[] = [];
    const load: number[] = [];
    for (let i = 0; i < span; i++) {
      capacity.push(capOf(m, i));
      load.push(loads.get(m.id)![i] ?? 0);
    }
    let freeDate: string | null = null;
    if (m.state !== "inactiva") {
      for (let i = cursor.day; i < MAX_DAYS; i++) {
        const free = capOf(m, i) - (i === cursor.day ? cursor.used : 0);
        if (free > EPS) {
          freeDate = dayOf(i);
          break;
        }
      }
    }
    machines.set(m.id, { machineId: m.id, load, capacity, freeDate, queuedHours: load.reduce((s, h) => s + h, 0) });
  }
  return { days: days.slice(0, Math.max(horizonDays, days.length)), jobs: scheduled, machines };
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>();
function isoDateOfInstant(ms: number, timezone: string): string {
  let fmt = dateFormatters.get(timezone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" });
    dateFormatters.set(timezone, fmt);
  }
  return fmt.format(new Date(ms));
}

export function planOrders(orders: Order[], ctx: PlanContext, horizonDays = 60): Schedule {
  return scheduleJobs(jobsFromOrders(orders, ctx.timezone).sort(byDispatchRule), ctx, horizonDays);
}

/** Projected finish date of each order according to a schedule. */
export function projectedEnds(schedule: Schedule): Map<string, string | null> {
  const ends = new Map<string, string | null>();
  for (const job of schedule.jobs) {
    const prev = ends.get(job.orderId);
    if (job.endDate === null || prev === null) ends.set(job.orderId, null);
    else ends.set(job.orderId, prev === undefined || job.endDate > prev ? job.endDate : prev);
  }
  return ends;
}

/* ───────────────────────── Ocupación por máquina ───────────────────────── */

export type OccupancyLevel = "libre" | "media" | "alta" | "inactiva" | "mantenimiento";

export interface MachineOccupancy {
  machineId: string;
  name: string;
  process: Process;
  state: Machine["state"];
  level: OccupancyLevel;
  /** Load / capacity over the window (0–1+). */
  ratio: number;
  loadHours: number;
  capacityHours: number;
  queuedHours: number;
  freeDate: string | null;
  /** Daily load and capacity over the window, for the chart. */
  daily: Array<{ date: string; load: number; capacity: number }>;
}

/** Semáforo: verde < 70 %, ámbar 70–90 %, rojo ≥ 90 % of the capacity in the next `windowDays`. */
export function occupancy(schedule: Schedule, machines: Machine[], windowDays = 14): MachineOccupancy[] {
  return [...machines]
    .sort((a, b) => a.order - b.order)
    .map((m) => {
      const ml = schedule.machines.get(m.id);
      const daily: MachineOccupancy["daily"] = [];
      let load = 0;
      let capacity = 0;
      for (let i = 0; i < windowDays; i++) {
        const l = ml?.load[i] ?? 0;
        const c = ml?.capacity[i] ?? 0;
        load += l;
        capacity += c;
        daily.push({ date: schedule.days[i] ?? addDays(schedule.days[0] ?? "", i), load: round1(l), capacity: round1(c) });
      }
      const ratio = capacity > EPS ? load / capacity : load > EPS ? 1 : 0;
      let level: OccupancyLevel;
      if (m.state === "inactiva") level = "inactiva";
      else if (m.state === "mantenimiento") level = "mantenimiento";
      else level = ratio >= 0.9 ? "alta" : ratio >= 0.7 ? "media" : "libre";
      return {
        machineId: m.id,
        name: m.name,
        process: m.process,
        state: m.state,
        level,
        ratio,
        loadHours: round1(load),
        capacityHours: round1(capacity),
        queuedHours: round1(ml?.queuedHours ?? 0),
        freeDate: ml?.freeDate ?? null,
        daily,
      };
    });
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/* ───────────────────────── Asesor de prioridades ───────────────────────── */

export interface PriorityReason {
  label: string;
  points: number;
}

export interface PriorityItem {
  orderId: string;
  folio: string;
  title: string;
  clientName: string;
  score: number;
  reasons: PriorityReason[];
  /** Can be worked on right now (nothing blocked). */
  actionable: boolean;
  blockedReasons: string[];
  remainingHours: number;
  /** Working hours left until the due date (shift hours), null without date. */
  hoursUntilDue: number | null;
  criticalRatio: number | null;
  projectedEnd: string | null;
  dueDate: string | null;
}

/** Working hours of the workshop schedule between now and `due`. */
export function shiftHoursUntil(due: number, ctx: PlanContext): number {
  if (due <= ctx.now) return 0;
  const reference: Machine = {
    id: "_shift",
    name: "turno",
    process: "banco",
    description: "",
    state: "activa",
    activeSince: null,
    hoursPerDay: null,
    hourlyRate: 0,
    positionId: null,
    order: 0,
    stops: [],
    history: [],
    createdAt: "",
    updatedAt: "",
  };
  const dueDate = isoDateOfInstant(due, ctx.timezone);
  const span = Math.min(MAX_DAYS, Math.max(0, daysBetween(ctx.today, dueDate)));
  let total = 0;
  for (let i = 0; i <= span; i++) {
    const date = addDays(ctx.today, i);
    // Only the part of the due day before the due time counts.
    total += machineHoursOn(reference, date, ctx, i === 0 ? ctx.now : undefined, date === dueDate ? due : undefined);
  }
  return total;
}

export interface PriorityInput {
  orders: Order[];
  /** Client tier by client id (1 normal, 2 frecuente, 3 estratégico). */
  clientTier: (clientId: string | null) => number;
  /** Blocked reason of each work item, from its task. */
  blockedReason: (orderId: string, workItemId: string) => string | null;
}

/**
 * Explainable priority score (0–100+): each component adds visible points so
 * the coordinator can see WHY an order goes first.
 */
export function prioritize(input: PriorityInput, ctx: PlanContext, schedule?: Schedule): PriorityItem[] {
  const plan = schedule ?? planOrders(input.orders, ctx);
  const ends = projectedEnds(plan);
  const items: PriorityItem[] = [];
  for (const o of input.orders) {
    if (!OPEN_ORDER_STATUSES.includes(o.status)) continue;
    const reasons: PriorityReason[] = [];
    const remaining = o.workItems.reduce((s, w) => s + remainingHours(w), 0);
    // Steps run in parallel, so the longest machine queue of the order is its true remaining span.
    const byMachine = new Map<string, number>();
    for (const w of o.workItems) {
      const key = w.machineId ?? `proc:${w.process}`;
      byMachine.set(key, (byMachine.get(key) ?? 0) + remainingHours(w));
    }
    const bottleneck = Math.max(0, ...byMachine.values());
    // Warranty rework of a delivered job has no pending "due date": the client is already waiting.
    const due = o.status === "garantia" && o.deliveredAt ? null : dueInstant(o, ctx.timezone);
    let hoursUntilDue: number | null = null;
    let cr: number | null = null;

    if (due === null) {
      if (o.status !== "garantia") reasons.push({ label: "Sin fecha de entrega", points: 0 });
    } else if (due <= ctx.now) {
      const late = Math.max(1, Math.round((ctx.now - due) / HOUR));
      reasons.push({ label: late >= 24 ? `Vencida hace ${Math.round(late / 24)} día(s)` : `Vencida hace ${late} h`, points: 45 });
      hoursUntilDue = 0;
      cr = 0;
    } else {
      hoursUntilDue = shiftHoursUntil(due, ctx);
      cr = bottleneck > EPS ? hoursUntilDue / bottleneck : Number.POSITIVE_INFINITY;
      if (cr < 1) reasons.push({ label: `No alcanza: faltan ${fmtH(bottleneck)} y quedan ${fmtH(hoursUntilDue)} hábiles`, points: 38 });
      else if (cr < 1.5) reasons.push({ label: `Holgura mínima: ${fmtH(hoursUntilDue)} hábiles para ${fmtH(bottleneck)} de trabajo`, points: 28 });
      else if (cr < 2.5) reasons.push({ label: `Holgura justa (razón crítica ${cr.toFixed(1)})`, points: 16 });
      else if (Number.isFinite(cr)) reasons.push({ label: `Con holgura (razón crítica ${cr.toFixed(1)})`, points: 5 });
    }

    const end = ends.get(o.id) ?? null;
    const dueDate = o.due?.date ?? null;
    if (due !== null && due > ctx.now && end && dueDate && end > dueDate) {
      reasons.push({ label: `Con la cola actual terminaría el ${end}, después de la entrega`, points: 15 });
    }
    if (o.urgent) reasons.push({ label: "Urgente: se baja la pieza montada en la máquina", points: 40 });
    if (o.difficulty === 3) reasons.push({ label: "Dificultad muy alta", points: 10 });
    else if (o.difficulty === 2) reasons.push({ label: "Dificultad mayor", points: 7 });

    const tier = input.clientTier(o.clientId);
    if (tier === 3) reasons.push({ label: "Cliente estratégico", points: 10 });
    else if (tier === 2) reasons.push({ label: "Cliente frecuente", points: 5 });

    const waitDays = Math.max(0, Math.floor((ctx.now - Date.parse(o.intake.receivedAt)) / (24 * HOUR)));
    if (waitDays > 0) reasons.push({ label: `Lleva ${waitDays} día(s) en el taller`, points: Math.min(10, waitDays) });

    if (o.status === "garantia") reasons.push({ label: "Garantía: el cliente ya está esperando", points: 30 });

    const blockedReasons: string[] = [];
    for (const w of o.workItems) {
      if (w.status === "completada") continue;
      const why = w.status === "bloqueada" ? (input.blockedReason(o.id, w.id) ?? "bloqueada") : null;
      if (why) blockedReasons.push(why);
    }
    const pending = o.workItems.filter((w) => w.status !== "completada");
    const actionable = pending.length > 0 && blockedReasons.length < pending.length;
    if (blockedReasons.length > 0) {
      reasons.push({ label: `Bloqueos: ${blockedReasons.join("; ")}`, points: actionable ? -5 : -20 });
    }
    if (pending.length === 0) reasons.push({ label: "Sin pasos de proceso pendientes", points: -10 });

    items.push({
      orderId: o.id,
      folio: o.folio,
      title: o.title,
      clientName: o.clientName,
      score: reasons.reduce((s, r) => s + r.points, 0),
      reasons,
      actionable,
      blockedReasons,
      remainingHours: round1(remaining),
      hoursUntilDue: hoursUntilDue === null ? null : round1(hoursUntilDue),
      criticalRatio: cr === null || !Number.isFinite(cr) ? null : Math.round(cr * 100) / 100,
      projectedEnd: end,
      dueDate,
    });
  }
  return items.sort((a, b) => b.score - a.score || (a.dueDate ?? "9999") .localeCompare(b.dueDate ?? "9999"));
}

/** The order to work on next: the best-ranked one that is not fully blocked. */
export function nextUp(ranking: PriorityItem[]): PriorityItem | null {
  return ranking.find((r) => r.actionable) ?? null;
}

const fmtH = (h: number) => `${round1(h)} h`;

/* ───────────────────────── ¿Me puedo comprometer? ───────────────────────── */

export interface CommitRequest {
  /** Hours per process (the scheduler picks the machine) … */
  hoursByProcess?: Partial<Record<Process, number>>;
  /** … and/or hours on specific machines. */
  hoursByMachine?: Record<string, number>;
  dueDate: string;
  dueTime?: string;
  difficulty?: number;
  /** Urgent work goes ahead of the queue (the answer then only depends on capacity). */
  urgent?: boolean;
}

export interface CommitMove {
  orderId: string;
  folio: string;
  from: string | null;
  to: string | null;
  /** Still delivered on time after moving. */
  onTime: boolean;
}

export interface CommitAnswer {
  verdict: "si" | "si_moviendo" | "no";
  /** Finish date if the new job goes after everything already queued. */
  finishQueued: string | null;
  /** Finish date if it gets its place by due date (moving later work). */
  finishPrioritized: string | null;
  /** Earliest date the workshop can commit to. */
  feasibleDate: string | null;
  moved: CommitMove[];
  perMachine: Array<{ machineId: string | null; process: Process; hours: number; endDate: string | null }>;
  explanation: string;
}

const NEW_ID = "__nuevo__";

export function canCommit(orders: Order[], request: CommitRequest, ctx: PlanContext): CommitAnswer {
  const due = zonedInstant(request.dueDate, request.dueTime ?? "17:00", ctx.timezone).getTime();
  const base = jobsFromOrders(orders, ctx.timezone).sort(byDispatchRule);
  const newJobs: Job[] = [];
  const now = ctx.now;
  for (const [process, hours] of Object.entries(request.hoursByProcess ?? {}) as Array<[Process, number]>) {
    if (hours > 0) newJobs.push({ orderId: NEW_ID, folio: "NUEVO", workItemId: `p-${process}`, process, machineId: null, hours, due, difficulty: request.difficulty ?? 1, urgent: request.urgent ?? false, receivedAt: now });
  }
  for (const [machineId, hours] of Object.entries(request.hoursByMachine ?? {})) {
    const m = ctx.machines.find((x) => x.id === machineId);
    if (m && hours > 0) newJobs.push({ orderId: NEW_ID, folio: "NUEVO", workItemId: `m-${machineId}`, process: m.process, machineId, hours, due, difficulty: request.difficulty ?? 1, urgent: request.urgent ?? false, receivedAt: now });
  }
  if (newJobs.length === 0) {
    return { verdict: "si", finishQueued: ctx.today, finishPrioritized: ctx.today, feasibleDate: ctx.today, moved: [], perMachine: [], explanation: "No se indicaron horas de trabajo." };
  }

  const baseline = scheduleJobs(base, ctx);
  const baseEnds = projectedEnds(baseline);
  const queued = scheduleJobs([...base, ...newJobs], ctx);
  const prioritized = scheduleJobs([...base, ...newJobs].sort(byDispatchRule), ctx);

  const finishOf = (s: Schedule) => projectedEnds(s).get(NEW_ID) ?? null;
  const finishQueued = finishOf(queued);
  const finishPrioritized = finishOf(prioritized);
  const fits = (d: string | null) => d !== null && d <= request.dueDate;
  const perMachine = (s: Schedule) =>
    s.jobs.filter((j) => j.orderId === NEW_ID).map((j) => ({ machineId: j.assignedMachineId, process: j.process, hours: j.hours, endDate: j.endDate }));

  if (fits(finishQueued)) {
    return {
      verdict: "si",
      finishQueued,
      finishPrioritized,
      feasibleDate: finishQueued,
      moved: [],
      perMachine: perMachine(queued),
      explanation: `Sí. Aun haciéndolo después de todo lo que está en cola, queda listo el ${finishQueued}.`,
    };
  }

  const prioEnds = projectedEnds(prioritized);
  const moved: CommitMove[] = [];
  for (const [orderId, before] of baseEnds) {
    const after = prioEnds.get(orderId) ?? null;
    if (orderId === NEW_ID || after === before) continue;
    if (before !== null && after !== null && after <= before) continue;
    const order = orders.find((o) => o.id === orderId);
    moved.push({
      orderId,
      folio: order?.folio ?? orderId,
      from: before,
      to: after,
      onTime: !order?.due || (after !== null && after <= order.due.date),
    });
  }

  if (fits(finishPrioritized)) {
    const late = moved.filter((m) => !m.onTime);
    return {
      verdict: "si_moviendo",
      finishQueued,
      finishPrioritized,
      feasibleDate: finishPrioritized,
      moved,
      perMachine: perMachine(prioritized),
      explanation:
        late.length === 0
          ? `Sí, pasándolo adelante de ${moved.map((m) => m.folio).join(", ") || "trabajos con más holgura"}; todo lo demás sigue a tiempo. Listo el ${finishPrioritized}.`
          : `Solo si se mueve ${moved.map((m) => m.folio).join(", ")}; ojo: ${late.map((m) => m.folio).join(", ")} quedaría(n) tarde. Listo el ${finishPrioritized}.`,
    };
  }

  const feasibleDate = finishPrioritized ?? finishQueued;
  return {
    verdict: "no",
    finishQueued,
    finishPrioritized,
    feasibleDate,
    moved,
    perMachine: perMachine(prioritized),
    explanation: feasibleDate
      ? `No para el ${request.dueDate}. La fecha más cercana posible es el ${feasibleDate}${finishQueued && finishQueued !== feasibleDate ? ` (moviendo trabajos; sin moverlos, el ${finishQueued})` : ""}.`
      : "No hay una máquina activa que pueda hacer este proceso.",
  };
}
