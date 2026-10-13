import { json, readJson } from "@/lib/server/http";
import { payInput } from "@/lib/server/inputs";
import { route } from "@/lib/server/route";
import { setPay } from "@/lib/server/services/payroll";

/** Sueldo mensual y auxilio de transporte de una persona. */
export const PATCH = route({ access: "admin" }, async ({ req, principal, params }) => {
  const input = await readJson(req, payInput);
  await setPay(principal, params.id!, input);
  return json({ ok: true });
});
