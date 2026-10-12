import { schedulePush } from "@/lib/server/after-push";
import { json, readJson } from "@/lib/server/http";
import { contractAssignInput, contractEndInput, contractUpdateInput } from "@/lib/server/inputs";
import { route } from "@/lib/server/route";
import { assignContract, endContract, updateContract } from "@/lib/server/services/team";

export const PUT = route({ access: "admin" }, async ({ req, principal, params }) => {
  const input = await readJson(req, contractAssignInput);
  const { notifications } = await assignContract(principal, params.id!, input);
  schedulePush(req, notifications);
  return json({ ok: true });
});

export const PATCH = route({ access: "admin" }, async ({ req, principal, params }) => {
  const input = await readJson(req, contractUpdateInput);
  await updateContract(principal, params.id!, input);
  return json({ ok: true });
});

/** DELETE with a JSON body: ends the contract today and frees the position. */
export const DELETE = route({ access: "admin" }, async ({ req, principal, params }) => {
  const { reason } = await readJson(req, contractEndInput);
  await endContract(principal, params.id!, reason);
  return json({ ok: true });
});
