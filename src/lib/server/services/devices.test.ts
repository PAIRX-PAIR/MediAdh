import { beforeEach, describe, expect, it, vi } from "vitest";
import { todayIn } from "@/lib/domain/time";
import type { Principal } from "../auth/principal";
import { Db, setDbForTests } from "../store";
import { MemoryRawStore } from "../store/memory";

// A cookie jar standing in for the phone's browser.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string, opts?: { maxAge?: number }) => {
      if (opts?.maxAge === 0) jar.delete(name);
      else jar.set(name, value);
    },
  }),
}));
vi.mock("../auth/password", async (orig) => {
  const real = await orig<typeof import("../auth/password")>();
  return { ...real, hashPassword: async (p: string) => `test$${p}` };
});

const devices = await import("./devices");
const team = await import("./team");
const orders = await import("./orders");

let db: Db;

async function admin(): Promise<Principal> {
  const { settings, users } = await db.read(["settings", "users"]);
  return {
    user: users.items[0]!,
    position: null,
    isAdmin: true,
    scope: "total",
    settings,
    today: todayIn(settings.timezone),
    claims: { sub: "admin-1", sv: 0, iat: 0, exp: 0 },
    incomplete: false,
  };
}

beforeEach(async () => {
  jar.clear();
  db = new Db(new MemoryRawStore());
  setDbForTests(db);
  await db.transact(["users"], "seed", ({ users }) => {
    const now = new Date().toISOString();
    users.items.push({
      id: "admin-1",
      username: "jefe",
      displayName: "Jefe",
      passwordHash: "test$x",
      kind: "admin",
      status: "active",
      phone: null,
      requestedPositionId: null,
      registrationNote: null,
      rejectionReason: null,
      consentAt: now,
      consentVersion: null,
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
});

describe("acceso de operarios por QR", () => {
  it("el celular pide acceso, el admin lo aprueba por código y el operario ve solo su cola", async () => {
    const boss = await admin();
    await team.createAccount(boss, {
      displayName: "Operario Torno",
      username: "",
      tempPassword: "",
      phone: null,
      kind: "staff",
      positionId: "tornero-1",
      replaceCurrent: false,
      startDate: boss.today,
      endDate: null,
      notes: null,
    });
    await orders.createOrder(boss, {
      clientId: null,
      clientName: "Cliente privado",
      title: "Eje",
      description: "",
      difficulty: 1,
      quantity: 1,
      condition: "",
      receivedAt: null,
      due: { date: "2099-01-10", time: "17:00" },
      workItems: [
        { process: "torno", machineId: "pinacho", description: "", plannedHours: 4 },
        { process: "fresadora", machineId: "fresadora", description: "", plannedHours: 2 },
      ],
      supplies: [],
      price: 500_000,
      notes: "",
    });

    expect(await devices.deviceState()).toEqual({ status: "ninguno" });
    await expect(devices.deviceBoard()).rejects.toMatchObject({ status: 403 });
    const pending = await devices.requestDevice("Mozilla/5.0 (Linux; Android 14) Chrome/130");
    expect(pending).toMatchObject({ status: "pendiente" });
    const code = (pending as { code: string }).code;
    expect(code).toMatch(/^[A-Z2-9]{8}$/);
    // Asking again while pending keeps the same code.
    expect(await devices.requestDevice(null)).toMatchObject({ code });

    const { users } = await db.read(["users"]);
    const operator = users.items.find((u) => u.displayName === "Operario Torno")!;
    await expect(devices.approveDevice(boss, "ZZZZZZZZ", operator.id)).rejects.toMatchObject({ status: 404 });
    await expect(devices.approveDevice(boss, code, "admin-1")).rejects.toMatchObject({ status: 400 });
    await devices.approveDevice(boss, `${code.slice(0, 4)}-${code.slice(4).toLowerCase()}`, operator.id);

    expect(await devices.deviceState()).toEqual({ status: "aprobado", operator: "Operario Torno" });
    const board = await devices.deviceBoard();
    expect(board.groups.map((g) => g.id)).toEqual(["tornero-1"]);
    const json = JSON.stringify(board);
    expect(json).not.toContain("Cliente privado");
    expect(json).not.toContain("500000");
    // Only a hash of the phone's secret is stored.
    const stored = (await db.read(["devices"])).devices.items[0]!;
    expect(stored.secretHash).not.toBe([...jar.values()][0]);

    const { devices: list } = await devices.listDevices();
    await devices.revokeDevice(boss, list[0]!.id);
    expect(await devices.deviceState()).toEqual({ status: "revocado" });
    await expect(devices.deviceBoard()).rejects.toMatchObject({ status: 403 });
  });

  it("un código vencido no se puede aprobar", async () => {
    const boss = await admin();
    const pending = (await devices.requestDevice(null)) as { code: string };
    await db.transact(["devices"], "vence", ({ devices: d }) => {
      d.items[0]!.expiresAt = new Date(Date.now() - 1000).toISOString();
    });
    expect(await devices.deviceState()).toEqual({ status: "vencido" });
    await expect(devices.approveDevice(boss, pending.code, "admin-1")).rejects.toMatchObject({ status: 410 });
  });
});

describe("pedir material desde el celular del operario", () => {
  it("un celular autorizado crea el pedido a nombre de su operario", async () => {
    const boss = await admin();
    const team = await import("./team");
    await team.createAccount(boss, {
      displayName: "Operario Torno",
      username: "",
      tempPassword: "",
      phone: null,
      kind: "staff",
      positionId: "tornero-1",
      replaceCurrent: false,
      startDate: boss.today,
      endDate: null,
      notes: null,
    });
    const pending = (await devices.requestDevice(null)) as { code: string };
    const { users } = await db.read(["users"]);
    const operator = users.items.find((u) => u.displayName === "Operario Torno")!;
    await devices.approveDevice(boss, pending.code, operator.id);

    const { request } = await devices.deviceRequest({ type: "herramienta", item: "Inserto CCMT 09", quantity: "4", urgent: true, note: null, taskId: null });
    expect(request).toMatchObject({ requesterName: "Operario Torno", userId: operator.id, item: "Inserto CCMT 09", status: "pendiente", urgent: true });
    const { requests } = await db.read(["requests"]);
    expect(requests.items).toHaveLength(1);
  });

  it("sin celular autorizado no se puede pedir nada", async () => {
    await expect(devices.deviceRequest({ type: "material", item: "Tornillos", quantity: null, urgent: false, note: null, taskId: null })).rejects.toMatchObject({ status: 403 });
  });
});
