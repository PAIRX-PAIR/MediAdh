import { json, readJson } from "@/lib/server/http";
import { orderChatInput } from "@/lib/server/inputs-production";
import { route } from "@/lib/server/route";
import { postOrderChat } from "@/lib/server/services/orders";

/** Mensaje en el chat de una OT: cualquier administrador que atiende la orden (la lectura viene con la orden). */
export const POST = route({ access: "admin" }, async ({ req, principal, params }) => {
  const input = await readJson(req, orderChatInput);
  const { order } = await postOrderChat(principal, params.id!, input.text);
  return json({ order });
});
