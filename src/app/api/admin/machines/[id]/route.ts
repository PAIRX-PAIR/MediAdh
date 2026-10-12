import { schedulePush } from "@/lib/server/after-push";
import { json, readJson } from "@/lib/server/http";
import { machinePatchInput } from "@/lib/server/inputs-production";
import { route } from "@/lib/server/route";
import { deleteMachine, updateMachine } from "@/lib/server/services/catalog";

export const PATCH = route({ access: "admin" }, async ({ req, principal, params }) => {
  const patch = await readJson(req, machinePatchInput);
  const { machine, notifications } = await updateMachine(principal, params.id!, patch);
  schedulePush(req, notifications);
  return json({ machine });
});

export const DELETE = route({ access: "admin" }, async ({ principal, params }) => {
  await deleteMachine(principal, params.id!);
  return json({ ok: true });
});
