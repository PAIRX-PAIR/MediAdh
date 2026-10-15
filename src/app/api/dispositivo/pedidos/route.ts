import { json, readJson } from "@/lib/server/http";
import { requestCreateInput } from "@/lib/server/inputs";
import { clientIp, consume } from "@/lib/server/rate-limit";
import { route } from "@/lib/server/route";
import { deviceRequest } from "@/lib/server/services/devices";
import { HttpError } from "@/lib/server/http";
import { schedulePush } from "@/lib/server/after-push";

/** Pedido de material desde un celular de operario autorizado por QR. */
export const POST = route({ access: "public" }, async ({ req }) => {
  const limit = consume(`device-request:${clientIp(req.headers)}`, 30, 10 * 60_000);
  if (!limit.ok) throw new HttpError(429, "Demasiados pedidos. Espera un momento.", "rate_limited");
  const input = await readJson(req, requestCreateInput);
  const { request, notifications } = await deviceRequest(input);
  schedulePush(req, notifications);
  return json({ request }, { status: 201 });
});
