import { json, readJson } from "@/lib/server/http";
import { clockInput } from "@/lib/server/inputs";
import { route } from "@/lib/server/route";
import { clock, myAttendance } from "@/lib/server/services/payroll";

/** The signed-in person's own hours: today's blocks and this quincena's totals. */
export const GET = route({ access: "user" }, async ({ principal }) => json(await myAttendance(principal)));

/** Marca entrada o salida con la hora del taller. */
export const POST = route({ access: "user" }, async ({ req, principal }) => {
  const { action } = await readJson(req, clockInput);
  const entry = await clock(principal, action);
  return json({ entry }, { status: action === "in" ? 201 : 200 });
});
