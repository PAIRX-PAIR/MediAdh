import { json, readJson } from "@/lib/server/http";
import { ipcInput } from "@/lib/server/inputs-production";
import { route } from "@/lib/server/route";
import { saveIpc } from "@/lib/server/services/catalog";

/** Upserts monthly CPI values (DANE) and removes the listed months. */
export const PUT = route({ access: "admin" }, async ({ req, principal }) => {
  const input = await readJson(req, ipcInput);
  const entries = await saveIpc(principal, input);
  return json({ entries });
});
