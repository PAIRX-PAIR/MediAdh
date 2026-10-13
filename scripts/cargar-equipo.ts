/**
 * Carga el equipo inicial desde equipo.local.json (archivo local, nunca se sube:
 * contiene nombres de personas y el repositorio es público) en la base de datos
 * configurada en .env.local (file local o el repositorio privado de GitHub).
 * Es idempotente: quien ya existe (mismo nombre) no se duplica.
 *
 *   npm run equipo:cargar
 *
 * Formato: { "personas": [{ "nombre": "…", "puesto": "fresadora", "usuario": "opcional", "celular": "…" }] }
 * Los operarios quedan sin acceso (no inician sesión). Coordinación y asistencia
 * reciben su contraseña temporal desde Equipo → «Restablecer contraseña».
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env") as typeof import("@next/env");
loadEnvConfig(process.cwd(), true, { info: () => undefined, error: console.error });

interface Persona {
  nombre: string;
  puesto: string;
  /** Optional username (coordinación y asistencia, who will sign in). */
  usuario?: string;
  celular?: string;
}

it("carga el equipo inicial", async () => {
  const file = path.join(process.cwd(), "equipo.local.json");
  if (!fs.existsSync(file)) throw new Error("Falta equipo.local.json (mira el formato en scripts/cargar-equipo.ts).");
  const { personas } = JSON.parse(fs.readFileSync(file, "utf8")) as { personas: Persona[] };

  const { getDb } = await import("@/lib/server/store");
  const { createAccount } = await import("@/lib/server/services/team");
  const { todayIn } = await import("@/lib/domain/time");
  const db = getDb();
  const { settings, users, positions } = await db.read(["settings", "users", "positions"]);
  const today = todayIn(settings.timezone);
  // A system actor: the import is recorded in the audit log as "Carga inicial".
  const principal = {
    user: { id: "carga-inicial", displayName: "Carga inicial" },
    position: null,
    isAdmin: true,
    scope: "total",
    settings,
    today,
    claims: { sub: "carga-inicial", sv: 0, iat: 0, exp: 0 },
    incomplete: false,
  } as unknown as Parameters<typeof createAccount>[0];

  let created = 0;
  for (const p of personas) {
    if (users.items.some((u) => u.displayName.trim().toLowerCase() === p.nombre.trim().toLowerCase())) continue;
    if (!positions.items.some((pos) => pos.id === p.puesto)) throw new Error(`El puesto «${p.puesto}» no existe (persona: ${p.nombre}).`);
    await createAccount(principal, {
      displayName: p.nombre,
      username: p.usuario ?? "",
      tempPassword: "",
      phone: p.celular ?? null,
      kind: "staff",
      positionId: p.puesto,
      replaceCurrent: false,
      startDate: today,
      endDate: null,
      notes: "Carga inicial",
    });
    created += 1;
  }
  console.log(`Equipo: ${created} persona(s) nuevas, ${personas.length - created} ya existían. Base: ${db.backend}.`);
  expect(created).toBeGreaterThanOrEqual(0);
});
