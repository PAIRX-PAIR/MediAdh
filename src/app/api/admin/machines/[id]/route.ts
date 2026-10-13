import { schedulePush } from "@/lib/server/after-push";
import { isOwner } from "@/lib/server/auth/principal";
import { HttpError, json, readJson } from "@/lib/server/http";
import { machinePatchInput } from "@/lib/server/inputs-production";
import { route } from "@/lib/server/route";
import { deleteMachine, updateMachine } from "@/lib/server/services/catalog";

export const PATCH = route({ access: "admin" }, async ({ req, principal, params }) => {
  const patch = await readJson(req, machinePatchInput);
  // Coordinación y asistencia manage the floor (state, stops, operator); the rest is configuration.
  const FLOOR_FIELDS = ["state", "stopReason", "activeSince", "positionId"];
  if (!isOwner(principal) && Object.keys(patch).some((k) => !FLOOR_FIELDS.includes(k))) {
    throw new HttpError(403, "Solo gerencia o administración cambian nombre, proceso, tope u tarifa de una máquina.", "owner_only");
  }
  const { machine, notifications } = await updateMachine(principal, params.id!, patch);
  schedulePush(req, notifications);
  return json({ machine });
});

export const DELETE = route({ access: "owner" }, async ({ principal, params }) => {
  await deleteMachine(principal, params.id!);
  return json({ ok: true });
});
