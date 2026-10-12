import { json, readJson } from "@/lib/server/http";
import { userPatchInput } from "@/lib/server/inputs";
import { route } from "@/lib/server/route";
import { deleteUser, updateUser } from "@/lib/server/services/team";

export const PATCH = route({ access: "admin" }, async ({ req, principal, params }) => {
  const input = await readJson(req, userPatchInput);
  await updateUser(principal, params.id!, input);
  return json({ ok: true });
});

export const DELETE = route({ access: "admin" }, async ({ principal, params }) => {
  await deleteUser(principal, params.id!);
  return json({ ok: true });
});
