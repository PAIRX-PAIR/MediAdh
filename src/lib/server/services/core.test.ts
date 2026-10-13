import { beforeEach, describe, expect, it, vi } from "vitest";
import { contractStatus, evaluateAccess } from "@/lib/domain/contracts";
import { addDays, todayIn } from "@/lib/domain/time";
import type { Principal } from "../auth/principal";
import { HttpError } from "../http";
import { Db, setDbForTests } from "../store";
import { MemoryRawStore } from "../store/memory";
import { ConflictError } from "../store/raw";

vi.mock("../auth/password", async (orig) => {
  // Real policy, cheap hashing: scrypt at OWASP cost is too slow for unit tests.
  const real = await orig<typeof import("../auth/password")>();
  return {
    ...real,
    hashPassword: async (p: string) => `test$${p}`,
    verifyPassword: async (p: string, stored: string) => stored === `test$${p}`,
    burnPasswordCheck: async () => undefined,
    needsRehash: () => false,
  };
});

const { login, register } = await import("./auth");
const team = await import("./team");
const work = await import("./work");
const { buildSync } = await import("./sync");

let db: Db;
let ipCounter = 0;
const ip = () => `10.0.0.${++ipCounter}`;

async function principalFor(username: string): Promise<Principal> {
  const { users, positions, settings } = await db.read(["users", "positions", "settings"]);
  const user = users.items.find((u) => u.username === username)!;
  const today = todayIn(settings.timezone);
  const access = evaluateAccess(user, positions.items, today);
  if (!access.ok) throw new Error(`no access: ${access.reason}`);
  return {
    user,
    position: access.position,
    isAdmin: access.isAdmin,
    scope: access.scope,
    settings,
    today,
    claims: { sub: user.id, sv: user.sessionVersion, iat: 0, exp: 0 },
    incomplete: false,
  };
}

async function seedAdmin() {
  await db.transact(["users", "settings"], "seed", ({ users, settings }) => {
    // These tests cover the generic self-registration and worker login flows.
    settings.registrationOpen = true;
    settings.staffLogin = true;
    const now = new Date().toISOString();
    users.items.push({
      id: "admin-1",
      username: "jefe",
      displayName: "Jefe",
      passwordHash: "test$Clave-Segura-2026",
      kind: "admin",
      status: "active",
      phone: null,
      requestedPositionId: null,
      registrationNote: null,
      rejectionReason: null,
      consentAt: now,
      consentVersion: settings.legal.policyVersion,
      mustChangePassword: false,
      sessionVersion: 0,
      failedLogins: 0,
      lockedUntil: null,
      createdAt: now,
      updatedAt: now,
      approvedBy: null,
      approvedAt: now,
      lastLoginAt: null,
      monthlySalary: null,
      transportAllowance: false,
      adminScope: "total",
    });
  });
}

const registration = (over: Partial<Parameters<typeof register>[0]> = {}) => ({
  displayName: "Ana Torres",
  username: "ana.torres",
  password: "torno azul mañana",
  phone: null,
  requestedPositionId: "programador-cnc",
  note: null,
  accessCode: null,
  consent: true,
  website: null,
  ...over,
});

beforeEach(async () => {
  db = new Db(new MemoryRawStore());
  setDbForTests(db);
  await seedAdmin();
});

describe("administrador declarado en el entorno", () => {
  it("se crea al primer inicio de sesión con el hash del entorno y luego pide aceptar la política", async () => {
    process.env.ADMIN_BOOTSTRAP_USERNAME = "judago";
    process.env.ADMIN_BOOTSTRAP_NAME = "Judago";
    process.env.ADMIN_BOOTSTRAP_PASSWORD_HASH = "scrypt$131072$8$1$c2FsdA==$a2V5";
    try {
      // The test double accepts "test$<password>"; with a scrypt-shaped hash the password check fails generically.
      await expect(login({ username: "judago", password: "x" }, ip())).rejects.toMatchObject({ status: 401 });
      const { users } = await db.read(["users"]);
      const admin = users.items.find((u) => u.username === "judago")!;
      expect(admin).toMatchObject({ kind: "admin", status: "active", displayName: "Judago", consentAt: null });
      // Idempotent: a second attempt does not duplicate the account.
      await expect(login({ username: "judago", password: "x" }, ip())).rejects.toMatchObject({ status: 401 });
      expect((await db.read(["users"])).users.items.filter((u) => u.username === "judago")).toHaveLength(1);
      // Other usernames are untouched.
      await expect(login({ username: "otro", password: "x" }, ip())).rejects.toMatchObject({ status: 401 });
      expect((await db.read(["users"])).users.items.some((u) => u.username === "otro")).toBe(false);
      // Additional slots (ADMIN_BOOTSTRAP_2_*) work the same way.
      process.env.ADMIN_BOOTSTRAP_2_USERNAME = "ax95";
      process.env.ADMIN_BOOTSTRAP_2_PASSWORD_HASH = "scrypt$131072$8$1$c2FsdA==$a2V5";
      await expect(login({ username: "ax95", password: "x" }, ip())).rejects.toMatchObject({ status: 401 });
      expect((await db.read(["users"])).users.items.find((u) => u.username === "ax95")).toMatchObject({ kind: "admin", displayName: "ax95" });
    } finally {
      delete process.env.ADMIN_BOOTSTRAP_USERNAME;
      delete process.env.ADMIN_BOOTSTRAP_NAME;
      delete process.env.ADMIN_BOOTSTRAP_PASSWORD_HASH;
      delete process.env.ADMIN_BOOTSTRAP_2_USERNAME;
      delete process.env.ADMIN_BOOTSTRAP_2_PASSWORD_HASH;
    }
  });
});

describe("registro con aprobación", () => {
  it("crea la cuenta pendiente y avisa a los admins; no puede entrar hasta ser aprobada", async () => {
    const { notifications } = await register(registration(), ip());
    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.audience).toEqual({ kind: "admins" });
    expect(notifications[0]!.urgent).toBe(true);

    await expect(login({ username: "ana.torres", password: "torno azul mañana" }, ip())).rejects.toMatchObject({
      status: 403,
      code: "access_pending",
    });

    const admin = await principalFor("jefe");
    const { users } = await db.read(["users"]);
    const ana = users.items.find((u) => u.username === "ana.torres")!;
    await team.approveRegistration(admin, ana.id, {
      mode: "staff",
      positionId: "programador-cnc",
      replaceCurrent: false,
      startDate: admin.today,
      endDate: addDays(admin.today, 30),
      notes: null,
    });

    const result = await login({ username: "ANA.TORRES ", password: "torno azul mañana" }, ip());
    expect(result.user.status).toBe("active");
  });

  it("no revela el estado de la cuenta con una contraseña incorrecta", async () => {
    await register(registration(), ip());
    await expect(login({ username: "ana.torres", password: "incorrecta-123456" }, ip())).rejects.toMatchObject({
      status: 401,
      code: "invalid_credentials",
    });
  });

  it("exige autorización de datos, contraseña fuerte y usuario único", async () => {
    await expect(register(registration({ consent: false }), ip())).rejects.toMatchObject({ code: "consent_required" });
    await expect(register(registration({ password: "corta" }), ip())).rejects.toMatchObject({ code: "weak_password" });
    await register(registration(), ip());
    await expect(register(registration({ password: "otra frase larga 99" }), ip())).rejects.toMatchObject({
      code: "username_taken",
    });
  });

  it("el honeypot finge éxito sin guardar nada", async () => {
    await register(registration({ website: "http://spam" }), ip());
    const { users } = await db.read(["users"]);
    expect(users.items.some((u) => u.username === "ana.torres")).toBe(false);
  });

  it("bloquea la cuenta tras 5 intentos fallidos", async () => {
    for (let i = 0; i < 5; i++) {
      await expect(login({ username: "jefe", password: `mala-clave-${i}xxxx` }, ip())).rejects.toBeInstanceOf(HttpError);
    }
    await expect(login({ username: "jefe", password: "Clave-Segura-2026" }, ip())).rejects.toMatchObject({ status: 429 });
  });
});

describe("contratos", () => {
  it("un contrato vencido deja el puesto vacante y bloquea el acceso", async () => {
    const admin = await principalFor("jefe");
    const { user } = await team.createAccount(admin, {
      displayName: "Luis",
      username: "luis",
      tempPassword: "frase temporal segura",
      phone: null,
      kind: "staff",
      positionId: "soldador",
      replaceCurrent: false,
      startDate: addDays(admin.today, -30),
      endDate: addDays(admin.today, -1),
      notes: null,
    });
    const { positions, users } = await db.read(["positions", "users"]);
    const soldador = positions.items.find((p) => p.id === "soldador")!;
    expect(contractStatus(soldador.contract, admin.today)).toBe("vencido");
    const luis = users.items.find((u) => u.id === user.id)!;
    expect(evaluateAccess(luis, positions.items, admin.today)).toMatchObject({ ok: false, reason: "no_contract" });

    // A new contract can be registered on the freed position.
    const { user: nuevo } = await team.createAccount(admin, {
      displayName: "Marta",
      username: "marta",
      tempPassword: "otra frase temporal",
      phone: null,
      kind: "staff",
      positionId: "soldador",
      replaceCurrent: false,
      startDate: admin.today,
      endDate: null,
      notes: null,
    });
    const after = await db.read(["positions"]);
    const p = after.positions.items.find((x) => x.id === "soldador")!;
    expect(p.contract?.userId).toBe(nuevo.id);
    expect(p.contractHistory).toHaveLength(1);
  });

  it("no permite pisar un contrato vigente sin confirmar el reemplazo", async () => {
    const admin = await principalFor("jefe");
    const base = {
      phone: null,
      kind: "staff" as const,
      positionId: "fresadora",
      startDate: admin.today,
      endDate: null,
      notes: null,
    };
    await team.createAccount(admin, { ...base, displayName: "A", username: "aaa", tempPassword: "frase larga numero uno", replaceCurrent: false });
    await expect(
      team.createAccount(admin, { ...base, displayName: "B", username: "bbb", tempPassword: "frase larga numero dos", replaceCurrent: false }),
    ).rejects.toMatchObject({ code: "position_taken" });
  });

  it("siempre queda al menos un administrador", async () => {
    const admin = await principalFor("jefe");
    await expect(team.deleteUser(admin, "admin-1")).rejects.toMatchObject({ status: 403 });
  });
});

describe("tareas y permisos", () => {
  async function workerSetup() {
    const admin = await principalFor("jefe");
    await team.createAccount(admin, {
      displayName: "Tornero Uno",
      username: "tornero1",
      tempPassword: "frase temporal segura",
      phone: null,
      kind: "staff",
      positionId: "tornero-1",
      replaceCurrent: false,
      startDate: admin.today,
      endDate: null,
      notes: null,
    });
    await team.createAccount(admin, {
      displayName: "Soldador",
      username: "soldador1",
      tempPassword: "frase temporal segura",
      phone: null,
      kind: "staff",
      positionId: "soldador",
      replaceCurrent: false,
      startDate: admin.today,
      endDate: null,
      notes: null,
    });
    return { admin, t1: await principalFor("tornero1"), s1: await principalFor("soldador1") };
  }

  it("el trabajador solo ve y modifica las tareas de su puesto", async () => {
    const { admin, t1, s1 } = await workerSetup();
    const { task, notifications } = await work.createTask(admin, {
      title: "Ejes",
      description: "",
      positionId: "tornero-1",
      priority: "urgente",
      dueDate: null,
      piece: null,
      quantity: 10,
      checklist: ["Desbaste"],
    });
    expect(task.folio).toBe("T-0001");
    expect(notifications[0]).toMatchObject({ urgent: true, audience: { kind: "position", positionId: "tornero-1" } });

    await expect(work.updateTask(s1, task.id, { status: "en_proceso" })).rejects.toMatchObject({ status: 403 });
    await expect(work.updateTask(t1, task.id, { title: "hack" })).rejects.toMatchObject({ status: 403 });

    const { task: done, notifications: n2 } = await work.updateTask(t1, task.id, { status: "completada" });
    expect(done.quantityDone).toBe(10);
    expect(n2[0]).toMatchObject({ type: "task_completed", audience: { kind: "admins" } });

    const syncT1 = await buildSync(t1);
    const syncS1 = await buildSync(s1);
    expect(syncT1.tasks.map((t) => t.id)).toContain(task.id);
    expect(syncS1.tasks).toHaveLength(0);
    expect(syncS1.users).toBeUndefined();
    expect(JSON.stringify(syncT1)).not.toContain("passwordHash");
    expect(JSON.stringify(await buildSync(admin))).not.toContain("test$");
  });

  it("bloquear exige motivo y avisa a los admins con ventana emergente", async () => {
    const { admin, t1 } = await workerSetup();
    const { task } = await work.createTask(admin, {
      title: "Bridas",
      description: "",
      positionId: "tornero-1",
      priority: "normal",
      dueDate: null,
      piece: null,
      quantity: null,
      checklist: [],
    });
    await expect(work.updateTask(t1, task.id, { status: "bloqueada" })).rejects.toMatchObject({ status: 400 });
    const { notifications } = await work.updateTask(t1, task.id, { status: "bloqueada", blockedReason: "Falta inserto" });
    expect(notifications[0]).toMatchObject({ type: "task_blocked", urgent: true });
  });

  it("solicitudes: el trabajador pide, el admin responde, el trabajador solo puede cancelar", async () => {
    const { admin, t1 } = await workerSetup();
    const { request, notifications } = await work.createRequest(t1, {
      type: "material",
      item: "Barra 1045",
      quantity: "2",
      urgent: true,
      note: null,
      taskId: null,
    });
    expect(notifications[0]).toMatchObject({ audience: { kind: "admins" }, urgent: true });
    await expect(work.updateRequest(t1, request.id, { status: "entregada", response: null })).rejects.toMatchObject({ status: 403 });
    const { notifications: n2 } = await work.updateRequest(admin, request.id, { status: "en_camino", response: "Mañana" });
    expect(n2[0]).toMatchObject({ audience: { kind: "user", userId: t1.user.id } });
  });

  it("cierre de día completa tareas y resume pendientes", async () => {
    const { admin, t1 } = await workerSetup();
    const mk = (title: string) =>
      work.createTask(admin, { title, description: "", positionId: "tornero-1", priority: "normal", dueDate: null, piece: null, quantity: null, checklist: [] });
    const a = (await mk("A")).task;
    await mk("B");
    const { closure } = await work.closeDay(t1, { note: "Todo bien", issues: "", completeTaskIds: [a.id] });
    expect(closure.completed.map((c) => c.id)).toEqual([a.id]);
    expect(closure.pending).toHaveLength(1);
  });
});

describe("almacenamiento", () => {
  it("reintenta transacciones ante escrituras concurrentes sin perder datos", async () => {
    const raw = new MemoryRawStore();
    const local = new Db(raw);
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        local.transact(["announcements"], "x", ({ announcements }) => {
          announcements.items.push({
            id: `a${i}`,
            text: `${i}`,
            level: "info",
            createdBy: "x",
            authorName: "x",
            createdAt: new Date().toISOString(),
            expiresAt: null,
          });
        }),
      ),
    );
    const { announcements } = await local.read(["announcements"]);
    expect(announcements.items).toHaveLength(8);
  });

  it("MemoryRawStore rechaza escrituras sobre una versión vieja", async () => {
    const raw = new MemoryRawStore();
    await raw.write("0", new Map([["a", "1"]]), "m");
    await expect(raw.write("0", new Map([["a", "2"]]), "m")).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("registro de horas y nómina", () => {
  it("marca entrada y salida con la hora del taller y liquida las extras", async () => {
    const payroll = await import("./payroll");
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-10-13T12:30:00Z")); // martes 7:30 a. m. en Bogotá
      const p = await principalFor("jefe");
      const entry = await payroll.clock(p, "in");
      expect(entry).toMatchObject({ date: "2026-10-13", start: "07:30", end: null, source: "operario" });
      await expect(payroll.clock(p, "in")).rejects.toMatchObject({ status: 400 });

      vi.setSystemTime(new Date("2026-10-13T23:00:00Z")); // 6:00 p. m.
      expect(await payroll.clock(p, "out")).toMatchObject({ end: "18:00" });
      await expect(payroll.createAttendance(p, { userId: "admin-1", date: "2026-10-13", start: "08:00", end: "09:00", note: "" })).rejects.toMatchObject({ status: 400 });

      await payroll.setPay(p, "admin-1", { monthlySalary: 2_100_000 });
      const report = await payroll.payrollReport(p, null);
      expect(report.quincena).toMatchObject({ from: "2026-10-01", to: "2026-10-15", payDate: "2026-10-15" });
      const line = report.lines.find((l) => l.userId === "admin-1")!;
      // Martes 7:30–12:00 y 13:30–17:00 en el horario; 12:00–13:30 y 17:00–18:00 quedan por fuera: 2,5 h extra diurna.
      expect(line.hours.extraDay).toBe(2.5);
      expect(line.amounts.extraDay).toBe(31_250); // 2,5 × 10.000 × 1,25
      // Workers never see salaries in the sync payload.
      const sync = JSON.stringify(await buildSync(p));
      expect(sync).not.toContain("monthlySalary");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("salida olvidada", () => {
  it("una entrada sin salida de otro día no bloquea la salida de hoy", async () => {
    const payroll = await import("./payroll");
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-10-13T12:30:00Z")); // martes 7:30 a. m.
      await payroll.clock(await principalFor("jefe"), "in"); // y nunca marca salida
      vi.setSystemTime(new Date("2026-10-14T12:30:00Z")); // miércoles 7:30 a. m.
      const p = await principalFor("jefe");
      await payroll.clock(p, "in");
      vi.setSystemTime(new Date("2026-10-14T22:00:00Z")); // 5:00 p. m.
      expect(await payroll.clock(p, "out")).toMatchObject({ date: "2026-10-14", end: "17:00" });
    } finally {
      vi.useRealTimers();
    }
  });
});
