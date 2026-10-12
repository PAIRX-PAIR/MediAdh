import { json } from "@/lib/server/http";
import { route } from "@/lib/server/route";
import { buildIndicators } from "@/lib/server/services/indicators";

export const GET = route({ access: "admin" }, async ({ req, principal }) => {
  const months = Math.min(36, Math.max(1, Number(req.nextUrl.searchParams.get("meses")) || 12));
  return json(await buildIndicators(principal, months));
});
