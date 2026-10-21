import { json, readJson } from "@/lib/server/http";
import { generalSupplyActionInput } from "@/lib/server/inputs-production";
import { route } from "@/lib/server/route";
import { generalSupplyAction } from "@/lib/server/services/orders";

/** Insumo suelto: marcar «Ya está», quitarlo o enlazarlo a una orden. */
export const POST = route({ access: "admin" }, async ({ req, principal, params }) => {
  const input = await readJson(req, generalSupplyActionInput);
  const { supply, order } = await generalSupplyAction(principal, params.id!, input);
  return json({ supply, order });
});
