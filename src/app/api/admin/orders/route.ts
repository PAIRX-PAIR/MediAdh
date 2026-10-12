import { schedulePush } from "@/lib/server/after-push";
import { json, readJson } from "@/lib/server/http";
import { orderInput } from "@/lib/server/inputs-production";
import { route } from "@/lib/server/route";
import { createOrder } from "@/lib/server/services/orders";
import { getDb } from "@/lib/server/store";

/** The whole archive of work orders (histórico), without change logs. */
export const GET = route({ access: "admin" }, async () => {
  const { orders } = await getDb().read(["orders"]);
  const items = orders.items
    .map(({ history: _h, ...o }) => {
      void _h;
      return o;
    })
    .sort((a, b) => (a.intake.receivedAt < b.intake.receivedAt ? 1 : -1));
  return json({ orders: items });
});

export const POST = route({ access: "admin" }, async ({ req, principal }) => {
  const input = await readJson(req, orderInput);
  const { order, notifications } = await createOrder(principal, input);
  schedulePush(req, notifications);
  return json({ order }, { status: 201 });
});
