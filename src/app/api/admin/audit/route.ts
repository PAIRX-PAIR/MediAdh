import { json } from "@/lib/server/http";
import { route } from "@/lib/server/route";
import { getDb } from "@/lib/server/store";

/** Latest entries of the audit trail (it is stored in one file per month). */
export const GET = route({ access: "admin" }, async ({ req }) => {
  const limit = Math.min(2000, Math.max(50, Number(req.nextUrl.searchParams.get("limite")) || 500));
  const audit = await getDb().readLog("audit");
  return json({ entries: audit.items.slice(-limit).reverse() });
});
