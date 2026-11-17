import { schedulePush } from "@/lib/server/after-push";
import { json, readJson } from "@/lib/server/http";
import { dueDecisionInput } from "@/lib/server/inputs-production";
import { route } from "@/lib/server/route";
import { decideDue } from "@/lib/server/services/orders";

/** Gerencia aprueba, rechaza o pide ajustes a la fecha propuesta. Solo gerencia (scope total). */
export const POST = route({ access: "owner" }, async ({ req, principal, params }) => {
  const input = await readJson(req, dueDecisionInput);
  const { order, notifications } = await decideDue(principal, params.id!, input);
  schedulePush(req, notifications);
  return json({ order });
});
