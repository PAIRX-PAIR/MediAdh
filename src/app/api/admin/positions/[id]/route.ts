import { json, readJson } from "@/lib/server/http";
import { positionPatchInput } from "@/lib/server/inputs";
import { route } from "@/lib/server/route";
import { deletePosition, updatePosition } from "@/lib/server/services/team";

export const PATCH = route({ access: "admin" }, async ({ req, principal, params }) => {
  const input = await readJson(req, positionPatchInput);
  await updatePosition(principal, params.id!, input);
  return json({ ok: true });
});

export const DELETE = route({ access: "admin" }, async ({ principal, params }) => {
  await deletePosition(principal, params.id!);
  return json({ ok: true });
});
