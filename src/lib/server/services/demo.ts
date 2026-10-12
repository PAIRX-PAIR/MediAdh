import "server-only";
import { randomUUID } from "node:crypto";
import { defaultPositions, defaultSettings } from "@/lib/domain/defaults";
import type { Collection, Database, Notification, Position, Task, User } from "@/lib/domain/schema";
import { addDays, todayIn } from "@/lib/domain/time";
import { hashPassword } from "../auth/password";
import { docPath } from "../store/db";
import type { RawStore } from "../store/raw";

/** Public on purpose: the demo runs on throwaway in-memory data only. */
export const DEMO_CREDENTIALS = {
  username: "admin.demo",
  password: "Demo-Taller-2026",
  worker: { username: "tornero.demo", password: "Tornero-Demo-2026" },
};

const PEOPLE: Record<string, string> = {
  "coordinador-produccion": "Laura Gómez (ficticio)",
  "tornero-1": "Carlos Pérez (ficticio)",
  "tornero-3": "Andrés Ruiz (ficticio)",
  "programador-cnc": "Diana Torres (ficticio)",
  fresadora: "Jorge Díaz (ficticio)",
  soldador: "Miguel Rojas (ficticio)",
};

/** Seeds the in-memory store with a realistic workshop so the demo is explorable. */
export async function seedDemo(raw: RawStore) {
  const snapshot = await raw.read([docPath("users")]);
  if (snapshot.files.get(docPath("users"))) return;

  const now = new Date();
  const iso = now.toISOString();
  const settings = defaultSettings(iso);
  settings.workshopName = "SMI Taller · Demo";
  const today = todayIn(settings.timezone, now);
  const [adminHash, workerHash] = await Promise.all([
    hashPassword(DEMO_CREDENTIALS.password),
    hashPassword(DEMO_CREDENTIALS.worker.password),
  ]);

  const baseUser = (over: Partial<User> & Pick<User, "username" | "displayName">): User => ({
    id: randomUUID(),
    passwordHash: workerHash,
    kind: "staff",
    status: "active",
    phone: null,
    requestedPositionId: null,
    registrationNote: null,
    rejectionReason: null,
    consentAt: iso,
    consentVersion: settings.legal.policyVersion,
    mustChangePassword: false,
    sessionVersion: 0,
    failedLogins: 0,
    lockedUntil: null,
    createdAt: iso,
    updatedAt: iso,
    approvedBy: null,
    approvedAt: iso,
    lastLoginAt: null,
    ...over,
  });

  const admin = baseUser({ username: DEMO_CREDENTIALS.username, displayName: "Admin Demo", kind: "admin", passwordHash: adminHash });
  const users: User[] = [admin];
  const positions = defaultPositions(iso);

  const contractFor = (position: Position, user: User, startOffset: number, endOffset: number | null) => {
    position.contract = {
      id: randomUUID(),
      userId: user.id,
      personName: user.displayName,
      startDate: addDays(today, startOffset),
      endDate: endOffset === null ? null : addDays(today, endOffset),
      notes: null,
      createdBy: admin.id,
      createdAt: new Date(now.getTime() - 86_400_000 * 30).toISOString(),
      endedAt: null,
      endedReason: null,
    };
  };

  for (const position of positions.items) {
    const name = PEOPLE[position.id];
    if (name) {
      const username = position.id === "tornero-1" ? DEMO_CREDENTIALS.worker.username : `${position.id.replace(/-/g, ".")}.demo`;
      const user = baseUser({ username, displayName: name });
      users.push(user);
      const end = position.id === "tornero-3" ? 3 : position.id === "soldador" ? 120 : null;
      contractFor(position, user, -60, end);
    }
    if (position.id === "tornero-2") {
      const former = baseUser({ username: "tornero2.anterior", displayName: "Pedro León (ficticio)" });
      users.push(former);
      contractFor(position, former, -90, -1); // expired yesterday -> vacant
    }
  }
  users.push(
    baseUser({
      username: "sofia.herrera",
      displayName: "Sofía Herrera (ficticio)",
      status: "pending",
      approvedAt: null,
      requestedPositionId: "tornero-2",
      registrationNote: "Entro a reemplazar a Pedro en el turno de la mañana.",
    }),
  );

  let seq = 0;
  const task = (positionId: string | null, title: string, over: Partial<Task> = {}): Task => {
    seq += 1;
    return {
      id: randomUUID(),
      folio: `OT-${String(seq).padStart(4, "0")}`,
      title,
      description: "",
      positionId,
      priority: "normal",
      status: "pendiente",
      dueDate: addDays(today, 2),
      piece: null,
      quantity: null,
      quantityDone: 0,
      checklist: [],
      notes: [],
      blockedReason: null,
      createdBy: admin.id,
      createdAt: iso,
      updatedAt: iso,
      updatedBy: admin.id,
      startedAt: null,
      completedAt: null,
      completedBy: null,
      ...over,
    };
  };
  const step = (text: string, done = false) => ({ id: randomUUID(), text, done });
  const tasks: Task[] = [
    task("tornero-1", "Tornear ejes de transmisión Ø40 mm", {
      priority: "alta",
      status: "en_proceso",
      piece: "Eje SAE 1045",
      quantity: 24,
      quantityDone: 9,
      startedAt: iso,
      dueDate: today,
      checklist: [step("Verificar plano rev. C", true), step("Desbaste", true), step("Acabado y tolerancias"), step("Control dimensional")],
      description: "Tolerancia h7 en el asiento de rodamiento. Usar inserto CNMG.",
    }),
    task("tornero-1", "Roscar bujes M24", { piece: "Buje bronce", quantity: 12, priority: "normal" }),
    task("tornero-1", "Refrentar bridas para bomba", { priority: "urgente", dueDate: today, quantity: 4 }),
    task("tornero-2", "Mecanizar poleas en V", { priority: "alta", quantity: 6 }),
    task("tornero-2", "Rectificar asientos de válvula", { status: "bloqueada", blockedReason: "Falta inserto CCMT 09" }),
    task("tornero-3", "Fabricar pasadores templados", { quantity: 50, quantityDone: 32, status: "en_proceso", startedAt: iso }),
    task("programador-cnc", "Programa CAM para carcasa de reductor", {
      priority: "alta",
      checklist: [step("Modelo 3D recibido", true), step("Estrategia de desbaste"), step("Simulación"), step("Post-procesado")],
    }),
    task("fresadora", "Fresar chaveteros 10×8", { quantity: 18, status: "en_proceso", quantityDone: 7, startedAt: iso }),
    task("soldador", "Soldar estructura de soporte (MIG)", { priority: "alta", piece: "Bastidor A36", dueDate: addDays(today, 1) }),
    task("soldador", "Reparar tolva con recargue", {
      status: "completada",
      completedAt: iso,
      completedBy: users.find((u) => u.username === "soldador.demo")?.id ?? null,
    }),
    task(null, "Inventario de insertos de carburo", { priority: "baja", dueDate: addDays(today, 5) }),
  ];

  const worker = users.find((u) => u.username === DEMO_CREDENTIALS.worker.username)!;
  const requests = [
    {
      id: randomUUID(),
      folio: "SOL-0001",
      positionId: "tornero-1",
      userId: worker.id,
      requesterName: worker.displayName,
      type: "herramienta" as const,
      item: "Inserto CNMG 120408",
      quantity: "10 unidades",
      urgent: true,
      note: "Se acabaron los de acabado",
      taskId: tasks[0]!.id,
      status: "pendiente" as const,
      response: null,
      resolvedBy: null,
      resolvedAt: null,
      createdAt: iso,
      updatedAt: iso,
    },
    {
      id: randomUUID(),
      folio: "SOL-0002",
      positionId: "fresadora",
      userId: users.find((u) => u.username === "fresadora.demo")!.id,
      requesterName: PEOPLE.fresadora!,
      type: "material" as const,
      item: "Barra cuadrada 1\" AISI 1020",
      quantity: "2 barras de 6 m",
      urgent: false,
      note: null,
      taskId: null,
      status: "en_camino" as const,
      response: "Llega mañana a las 9 a. m.",
      resolvedBy: null,
      resolvedAt: null,
      createdAt: iso,
      updatedAt: iso,
    },
  ];

  const notification = (over: Partial<Notification> & Pick<Notification, "title" | "body" | "type" | "audience">): Notification => ({
    id: randomUUID(),
    link: null,
    urgent: false,
    actorId: null,
    createdAt: iso,
    readBy: [],
    ...over,
  });
  const notifications: Notification[] = [
    notification({
      audience: { kind: "admins" },
      type: "registration_pending",
      title: "Nueva solicitud de acceso",
      body: "Sofía Herrera (@sofia.herrera) pide acceso como Tornero 2.",
      link: "/admin/equipo?tab=solicitudes",
      urgent: true,
    }),
    notification({
      audience: { kind: "admins" },
      type: "request_created",
      title: "URGENTE · Herramienta: Inserto CNMG 120408",
      body: `${worker.displayName} (Tornero) pide 10 unidades · Se acabaron los de acabado`,
      link: "/admin/solicitudes",
      urgent: true,
    }),
    notification({
      audience: { kind: "all" },
      type: "announcement",
      title: "Nuevo aviso",
      body: "Mañana hay mantenimiento del compresor de 7 a 8 a. m.",
      link: "/panel",
    }),
  ];

  const collection = <T,>(items: T[], s = items.length): Collection<T> => ({ schema: 1, seq: s, items });
  const db: Database = {
    settings,
    users: collection(users, 0),
    positions,
    tasks: collection(tasks, seq),
    requests: collection(requests),
    notifications: collection(notifications, 0),
    announcements: collection(
      [
        {
          id: randomUUID(),
          text: "Mañana hay mantenimiento del compresor de 7 a 8 a. m.",
          level: "info" as const,
          createdBy: admin.id,
          authorName: admin.displayName,
          createdAt: iso,
          expiresAt: null,
        },
      ],
      0,
    ),
    closures: collection([], 0),
    push: collection([], 0),
    audit: collection([], 0),
  };

  const changes = new Map<string, string>();
  for (const [name, value] of Object.entries(db)) changes.set(docPath(name as keyof Database), `${JSON.stringify(value, null, 2)}\n`);
  await raw.write(snapshot.version, changes, "Datos de demostración");
}
