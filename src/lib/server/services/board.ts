import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { activeHolderId } from "@/lib/domain/contracts";
import { shiftsOn } from "@/lib/domain/calendar";
import { planOrders, type PlanContext } from "@/lib/domain/planning";
import type { Database, MachineState, Order, Process } from "@/lib/domain/schema";
import { todayIn } from "@/lib/domain/time";
import type { Principal } from "../auth/principal";
import { notFound } from "../http";
import { getDb } from "../store";
import { actorOf, audit } from "./common";

/**
 * Tablero del taller: the operators' read-only view of their queue, opened
 * without signing in through a secret link (shown on a workshop screen or a
 * phone). It carries what the floor needs (folio, piece, hours, dates) and
 * never client names, prices or personal data beyond the operator's name.
 */

export interface BoardJob {
  folio: string;
  title: string;
  quantity: number;
  process: Process;
  detail: string;
  hours: number;
  startDate: string | null;
  endDate: string | null;
  due: Order["due"];
  late: boolean;
  urgent: boolean;
  difficulty: Order["difficulty"];
  inProgress: boolean;
  blockedReason: string | null;
}

export interface BoardMachine {
  id: string;
  name: string;
  process: Process;
  state: MachineState;
  stopReason: string | null;
  jobs: BoardJob[];
}

export interface BoardGroup {
  id: string;
  title: string;
  operator: string | null;
  machines: BoardMachine[];
}

export interface Board {
  workshopName: string;
  today: string;
  generatedAt: string;
  shiftsToday: Array<{ start: string; end: string }>;
  groups: BoardGroup[];
}

function sameToken(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

type BoardDocs = Pick<Database, "settings" | "orders" | "machines" | "positions" | "users" | "tasks">;
const BOARD_DOCS = ["settings", "orders", "machines", "positions", "users", "tasks"] as const;

export async function boardFor(token: string): Promise<Board> {
  const docs = await getDb().read([...BOARD_DOCS]);
  const expected = docs.settings.boardToken;
  if (!expected || !sameToken(token, expected)) throw notFound();
  return buildBoard(docs);
}

/** Only the positions the operator holds today (a phone authorised by QR). */
export async function boardForOperator(userId: string): Promise<Board> {
  const docs = await getDb().read([...BOARD_DOCS]);
  const today = todayIn(docs.settings.timezone);
  const held = new Set(docs.positions.items.filter((p) => activeHolderId(p, today) === userId).map((p) => p.id));
  const board = buildBoard(docs);
  return { ...board, groups: board.groups.filter((g) => held.has(g.id)) };
}

function buildBoard(docs: BoardDocs): Board {
  const timezone = docs.settings.timezone;
  const today = todayIn(timezone);
  const calendar = { schedule: docs.settings.production.schedule, skipHolidays: docs.settings.production.skipHolidays };
  const machines = [...docs.machines.items].sort((a, b) => a.order - b.order);
  const ctx: PlanContext = { machines, calendar, timezone, now: Date.now(), today };
  const schedule = planOrders(docs.orders.items, ctx, 21);
  const orderById = new Map(docs.orders.items.map((o) => [o.id, o]));
  const nameOf = (userId: string | null) => (userId ? (docs.users.items.find((u) => u.id === userId)?.displayName ?? null) : null);

  const machineView = (m: (typeof machines)[number]): BoardMachine => ({
    id: m.id,
    name: m.name,
    process: m.process,
    state: m.state,
    stopReason: m.stops.find((s) => !s.to)?.reason || null,
    jobs: schedule.jobs
      .filter((j) => j.assignedMachineId === m.id)
      .map((j) => {
        const order = orderById.get(j.orderId)!;
        const item = order.workItems.find((w) => w.id === j.workItemId);
        const task = docs.tasks.items.find((t) => t.orderId === j.orderId && t.workItemId === j.workItemId);
        return {
          folio: order.folio,
          title: order.title,
          quantity: order.intake.quantity,
          process: j.process,
          detail: item?.description ?? "",
          hours: Math.round(j.hours * 10) / 10,
          startDate: j.startDate,
          endDate: j.endDate,
          due: order.due,
          late: j.late,
          urgent: order.urgent,
          difficulty: order.difficulty,
          inProgress: item?.status === "en_proceso",
          blockedReason: item?.status === "bloqueada" ? (task?.blockedReason ?? "Bloqueada") : null,
        };
      }),
  });

  const operatorPositions = [...docs.positions.items].filter((p) => !p.grantsAdmin).sort((a, b) => a.order - b.order);
  const groups: BoardGroup[] = operatorPositions
    .map((p) => ({
      id: p.id,
      title: p.title,
      operator: nameOf(activeHolderId(p, today)),
      machines: machines.filter((m) => m.positionId === p.id && m.state !== "inactiva").map(machineView),
    }))
    .filter((g) => g.machines.length > 0);
  const unassigned = machines.filter((m) => m.state !== "inactiva" && !operatorPositions.some((p) => p.id === m.positionId));
  if (unassigned.length > 0) groups.push({ id: "sin-operario", title: "Sin operario asignado", operator: null, machines: unassigned.map(machineView) });

  return {
    workshopName: docs.settings.workshopName,
    today,
    generatedAt: new Date().toISOString(),
    shiftsToday: shiftsOn(today, calendar),
    groups,
  };
}

/** Current board link secret (created on first use). */
export async function boardToken(principal: Principal, rotate: boolean): Promise<string> {
  return getDb().transact(["settings", "audit"], rotate ? "Cambia el enlace del tablero" : "Crea el enlace del tablero", ({ settings, audit: log }) => {
    if (settings.boardToken && !rotate) return settings.boardToken;
    settings.boardToken = randomBytes(18).toString("base64url");
    audit(log, actorOf(principal), rotate ? "tablero_enlace_cambiado" : "tablero_enlace_creado");
    return settings.boardToken;
  });
}
