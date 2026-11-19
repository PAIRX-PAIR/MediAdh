import { json, readJson } from "@/lib/server/http";
import { indirectPositionPatchInput } from "@/lib/server/inputs";
import { route } from "@/lib/server/route";
import { removeIndirectPosition, updateIndirectPosition } from "@/lib/server/services/payroll";

export const PATCH = route({ access: "owner" }, async ({ req, principal, params }) => {
  const input = await readJson(req, indirectPositionPatchInput);
  return json({ position: await updateIndirectPosition(principal, params.id!, input) });
});

export const DELETE = route({ access: "owner" }, async ({ principal, params }) => {
  await removeIndirectPosition(principal, params.id!);
  return json({ ok: true });
});
