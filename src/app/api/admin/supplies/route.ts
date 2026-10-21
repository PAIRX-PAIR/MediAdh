import { json, readJson } from "@/lib/server/http";
import { supplyCreateInput } from "@/lib/server/inputs-production";
import { route } from "@/lib/server/route";
import { addSupply } from "@/lib/server/services/orders";

/** Pide un insumo: suelto (para ir a comprar) o enlazado a una orden con `orderId`. */
export const POST = route({ access: "admin" }, async ({ req, principal }) => {
  const input = await readJson(req, supplyCreateInput);
  const { supply, order } = await addSupply(principal, input);
  return json({ supply, order }, { status: 201 });
});
