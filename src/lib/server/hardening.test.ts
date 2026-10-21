import { beforeEach, describe, expect, it, vi } from "vitest";
import { Db, setDbForTests } from "./store";
import { MemoryRawStore } from "./store/memory";

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
vi.mock("./auth/password", async (orig) => {
  const real = await orig<typeof import("./auth/password")>();
  return {
    ...real,
    hashPassword: async (p: string) => `test$${p}`,
    verifyPassword: async (p: string, stored: string) => stored === `test$${p}`,
    burnPasswordCheck: async () => undefined,
    needsRehash: () => false,
  };
});

const { login } = await import("./services/auth");
const { setTrustCookie, TRUST_COOKIE } = await import("./auth/session");
const { requestDevice } = await import("./services/devices");
const { clientIp, normalizeIp } = await import("./rate-limit");

let db: Db;
let n = 0;
const ip = () => `10.1.0.${++n}`;

async function seedUser(id: string, username: string) {
  await db.transact(["users"], "seed", ({ users }) => {
    const now = new Date().toISOString();
    users.items.push({
      id,
      username,
      displayName: username,
      passwordHash: "test$Clave-Segura-2026",
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
}

beforeEach(() => {
  jar.clear();
  db = new Db(new MemoryRawStore());
  setDbForTests(db);
});

describe("bloqueo de cuenta y navegador de confianza", () => {
  it("un extraño bloquea la cuenta, pero su dueño entra desde su navegador de confianza", async () => {
    await seedUser("owner-1", "dueno");
    await seedUser("owner-2", "otro");
    // Alguien adivina contraseñas: la cuenta queda bloqueada.
    for (let i = 0; i < 5; i++) await expect(login({ username: "dueno", password: `mala-clave-${i}xxxx` }, ip())).rejects.toMatchObject({ status: 401 });
    await expect(login({ username: "dueno", password: "Clave-Segura-2026" }, ip())).rejects.toMatchObject({ status: 429 });

    // Cookie de confianza de OTRA cuenta: no sirve.
    await setTrustCookie("owner-2");
    await expect(login({ username: "dueno", password: "Clave-Segura-2026" }, ip())).rejects.toMatchObject({ status: 429 });

    // La del dueño sí, pero la contraseña se sigue verificando.
    await setTrustCookie("owner-1");
    await expect(login({ username: "dueno", password: "otra-clave-12345" }, ip())).rejects.toMatchObject({ status: 401 });
    const ok = await login({ username: "dueno", password: "Clave-Segura-2026" }, ip());
    expect(ok.user.id).toBe("owner-1");
    expect(ok.user.lockedUntil).toBeNull();
  });

  it("una cookie de confianza manipulada se ignora", async () => {
    await seedUser("owner-1", "dueno");
    for (let i = 0; i < 5; i++) await expect(login({ username: "dueno", password: `mala-clave-${i}xxxx` }, ip())).rejects.toMatchObject({ status: 401 });
    jar.set(TRUST_COOKIE, "eyJhbGciOiJub25lIn0.eyJzdWIiOiJvd25lci0xIn0.");
    await expect(login({ username: "dueno", password: "Clave-Segura-2026" }, ip())).rejects.toMatchObject({ status: 429 });
  });
});

describe("solicitudes anónimas de celulares", () => {
  it("no dejan más de 30 pendientes abiertas (cada una es un commit)", async () => {
    for (let i = 0; i < 30; i++) {
      jar.clear();
      await requestDevice("Mozilla/5.0 (Linux; Android 14)");
    }
    jar.clear();
    await expect(requestDevice("Mozilla/5.0 (Linux; Android 14)")).rejects.toMatchObject({ status: 429, code: "too_many_pending_devices" });
    const { devices } = await db.read(["devices"]);
    expect(devices.items).toHaveLength(30);
  });
});

describe("IP del cliente", () => {
  it("agrupa IPv6 por /64 y deja IPv4 intacta", () => {
    expect(normalizeIp("2001:db8:85a3::1")).toBe("2001:db8:85a3:0::/64");
    expect(normalizeIp("2001:db8:85a3:0:aaaa:bbbb:cccc:dddd")).toBe(normalizeIp("2001:db8:85a3:0:1:2:3:4"));
    expect(normalizeIp("203.0.113.9")).toBe("203.0.113.9");
    expect(normalizeIp("::ffff:203.0.113.9")).toBe("::ffff:203.0.113.9");
  });

  it("prefiere el encabezado que pone la plataforma", () => {
    const h = new Headers({ "x-forwarded-for": "1.1.1.1", "x-real-ip": "2.2.2.2", "x-vercel-forwarded-for": "3.3.3.3" });
    expect(clientIp(h)).toBe("3.3.3.3");
    expect(clientIp(new Headers({ "x-real-ip": "2.2.2.2" }))).toBe("2.2.2.2");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
