import { json } from "@/lib/server/http";
import { route } from "@/lib/server/route";
import { financeReport } from "@/lib/server/services/finance";

/** Ganancias del mes: only gerencia y administración. */
export const GET = route({ access: "owner" }, async ({ req, principal }) => json(await financeReport(principal, req.nextUrl.searchParams.get("mes"))));
