import { json, notFound, readJson } from "@/lib/server/http";
import { clientPatchInput } from "@/lib/server/inputs-production";
import { route } from "@/lib/server/route";
import { updateClient } from "@/lib/server/services/catalog";
import { getDb } from "@/lib/server/store";

/** Client with its change log and every order/quote (historial del cliente). */
export const GET = route({ access: "admin" }, async ({ params }) => {
  const { clients, orders, quotes } = await getDb().read(["clients", "orders", "quotes"]);
  const client = clients.items.find((c) => c.id === params.id);
  if (!client) throw notFound("Cliente no encontrado.");
  const strip = <T extends { history: unknown }>({ history: _h, ...rest }: T) => {
    void _h;
    return rest;
  };
  return json({
    client,
    orders: orders.items.filter((o) => o.clientId === client.id).map(strip),
    quotes: quotes.items.filter((q) => q.clientId === client.id).map(strip),
  });
});

export const PATCH = route({ access: "admin" }, async ({ req, principal, params }) => {
  const patch = await readJson(req, clientPatchInput);
  const client = await updateClient(principal, params.id!, patch);
  return json({ client });
});
