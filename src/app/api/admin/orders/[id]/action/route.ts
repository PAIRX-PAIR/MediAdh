import { schedulePush } from "@/lib/server/after-push";
import { json, readJson } from "@/lib/server/http";
import { orderActionInput } from "@/lib/server/inputs-production";
import { route } from "@/lib/server/route";
import { orderAction } from "@/lib/server/services/orders";

/** Deliver, close, invoice, claims, satisfaction, cancel/reopen and manual status changes. */
export const POST = route({ access: "admin" }, async ({ req, principal, params }) => {
  const input = await readJson(req, orderActionInput);
  const { order, notifications } = await orderAction(principal, params.id!, input);
  schedulePush(req, notifications);
  return json({ order });
});
