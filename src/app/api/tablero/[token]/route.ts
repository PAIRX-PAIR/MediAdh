import { HttpError, json } from "@/lib/server/http";
import { clientIp, consume } from "@/lib/server/rate-limit";
import { route } from "@/lib/server/route";
import { boardFor } from "@/lib/server/services/board";

/** Read-only workshop board for the operators (no session; secret link). */
export const GET = route({ access: "public" }, async ({ req, params }) => {
  const limit = consume(`board:${clientIp(req.headers)}`, 120, 60_000);
  if (!limit.ok) throw new HttpError(429, "Demasiadas consultas. Espera un momento.", "rate_limited");
  return json(await boardFor(params.token ?? ""), { headers: { "X-Robots-Tag": "noindex, nofollow" } });
});
