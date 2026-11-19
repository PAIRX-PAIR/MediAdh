import { json, readJson } from "@/lib/server/http";
import { indirectPositionInput } from "@/lib/server/inputs";
import { route } from "@/lib/server/route";
import { addIndirectPosition } from "@/lib/server/services/payroll";

/** Puesto indirecto (contador, aseo, mensajero…): solo gerencia. */
export const POST = route({ access: "owner" }, async ({ req, principal }) => {
  const input = await readJson(req, indirectPositionInput);
  return json({ position: await addIndirectPosition(principal, input) }, { status: 201 });
});
