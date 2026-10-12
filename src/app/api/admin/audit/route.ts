import { json } from "@/lib/server/http";
import { route } from "@/lib/server/route";
import { getDb } from "@/lib/server/store";

export const GET = route({ access: "admin" }, async () => {
  const { audit } = await getDb().read(["audit"]);
  return json({ entries: audit.items.slice(-500).reverse() });
});
