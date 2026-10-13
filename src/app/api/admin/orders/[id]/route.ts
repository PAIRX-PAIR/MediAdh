import { schedulePush } from "@/lib/server/after-push";
import { json, notFound, readJson } from "@/lib/server/http";
import { orderPatchInput } from "@/lib/server/inputs-production";
import { route } from "@/lib/server/route";
import { deleteOrder, updateOrder } from "@/lib/server/services/orders";
import { getDb } from "@/lib/server/store";

/** One work order with its full change log ("Historial de cambios"). */
export const GET = route({ access: "admin" }, async ({ params }) => {
  const { orders } = await getDb().read(["orders"]);
  const order = orders.items.find((o) => o.id === params.id);
  if (!order) throw notFound("Orden de trabajo no encontrada.");
  return json({ order });
});

export const PATCH = route({ access: "admin" }, async ({ req, principal, params }) => {
  const patch = await readJson(req, orderPatchInput);
  const { order, notifications } = await updateOrder(principal, params.id!, patch);
  schedulePush(req, notifications);
  return json({ order });
});

export const DELETE = route({ access: "admin" }, async ({ principal, params }) => {
  await deleteOrder(principal, params.id!);
  return json({ ok: true });
});
