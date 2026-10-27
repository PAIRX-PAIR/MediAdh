import { NextRequest } from "next/server";
import { SignJWT } from "jose";
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

const { resolvePrincipal, getPrincipal } = await import("./auth/principal");
const { createSessionToken, setSessionCookie, verifySessionToken } = await import("./auth/session");
const { sessionSecret } = await import("./env");
const { startImpersonation, stopImpersonation } = await import("./services/impersonation");
const { route } = await import("./route");
const { json } = await import("./http");

let db: Db;

async function seedAdmin(id: string, scope: "total" | "gestion") {
  await db.transact(["users"], "seed", ({ users }) => {
    const now = new Date().toISOString();
    users.items.push({
      id,
      username: id,
      displayName: `Nombre ${id}`,
      passwordHash: "x",
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
      adminScope: scope,
    });
  });
}

async function signInAs(id: string) {
  const { users } = await db.read(["users"]);
  const user = users.items.find((u) => u.id === id)!;
  await setSessionCookie(await createSessionToken(user.id, user.sessionVersion));
  return (await getPrincipal())!;
}

async function enterAs(adminId: string, targetId: string) {
  const admin = await signInAs(adminId);
  const { token } = await startImpersonation(admin, targetId);
  await setSessionCookie(token);
  return (await getPrincipal())!;
}

const post = route({ access: "admin", allowIncomplete: true }, async () => json({ ok: true }));
const get = route({ access: "admin", allowIncomplete: true }, async () => json({ ok: true }));
const leave = route({ access: "user", allowIncomplete: true, manageSession: true, allowImpersonated: true }, async () => json({ ok: true }));
const call = (handler: typeof post, method: string) =>
  handler(new NextRequest("http://localhost/api/x", { method, headers: { origin: "http://localhost", host: "localhost" } }), { params: Promise.resolve({}) });

beforeEach(async () => {
  jar.clear();
  db = new Db(new MemoryRawStore());
  setDbForTests(db);
  await seedAdmin("gerente", "total");
  await seedAdmin("socio", "total");
  await seedAdmin("coordinador", "gestion");
});

describe("entrar como otro usuario", () => {
  it("gerencia ve la app como otra persona y la sesión sabe quién es en realidad", async () => {
    const p = await enterAs("gerente", "coordinador");
    expect(p.user.id).toBe("coordinador");
    expect(p.scope).toBe("gestion");
    expect(p.impersonator).toEqual({ id: "gerente", displayName: "Nombre gerente" });
  });

  it("es solo lectura: se puede consultar, pero ningún cambio pasa", async () => {
    await enterAs("gerente", "coordinador");
    expect((await call(get, "GET")).status).toBe(200);
    const res = await call(post, "POST");
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("impersonation_read_only");
    expect((await call(post, "DELETE")).status).toBe(403);
    // Salir sí está permitido.
    expect((await call(leave, "POST")).status).toBe(200);
  });

  it("los subadministradores no pueden entrar como nadie", async () => {
    const coord = await signInAs("coordinador");
    await expect(startImpersonation(coord, "gerente")).rejects.toMatchObject({ status: 403 });
  });

  it("no se encadena: desde una sesión prestada no se entra como un tercero", async () => {
    const p = await enterAs("gerente", "socio");
    await expect(startImpersonation(p, "coordinador")).rejects.toMatchObject({ code: "already_impersonating" });
  });

  it("volver a mi cuenta restaura la sesión del administrador y queda en auditoría", async () => {
    const p = await enterAs("gerente", "coordinador");
    await setSessionCookie(await stopImpersonation(p));
    const back = (await getPrincipal())!;
    expect(back.user.id).toBe("gerente");
    expect(back.impersonator).toBeNull();
    const { audit } = await db.read(["audit"]);
    expect(audit.items.map((a) => a.action)).toEqual(["entrar_como_inicio", "entrar_como_fin"]);
    expect(audit.items.every((a) => a.actorId === "gerente")).toBe(true);
  });

  it("si al administrador le cierran las sesiones o le quitan gerencia, la sesión prestada muere", async () => {
    await enterAs("gerente", "coordinador");
    await db.transact(["users"], "t", ({ users }) => {
      users.items.find((u) => u.id === "gerente")!.sessionVersion += 1;
    });
    expect((await resolvePrincipal()).status).toBe("anonymous");

    await enterAs("socio", "coordinador");
    await db.transact(["users"], "t", ({ users }) => {
      users.items.find((u) => u.id === "socio")!.adminScope = "gestion";
    });
    expect((await resolvePrincipal()).status).toBe("anonymous");
  });

  it("un token con el actor manipulado no sirve ni como sesión normal", async () => {
    const forged = await new SignJWT({ sv: 0, act: "gerente" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject("coordinador")
      .setIssuer("smi-taller")
      .setAudience("smi-taller-app")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(sessionSecret());
    expect(await verifySessionToken(forged)).toBeNull();
  });

  it("la sesión prestada vence en 2 horas", async () => {
    const admin = await signInAs("gerente");
    const { token } = await startImpersonation(admin, "coordinador");
    const claims = (await verifySessionToken(token))!;
    expect(claims.exp - claims.iat).toBe(2 * 3600);
  });
});
