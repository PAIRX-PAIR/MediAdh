import { json, readJson } from "@/lib/server/http";
import { markReadInput } from "@/lib/server/inputs";
import { route } from "@/lib/server/route";
import { markNotificationsRead } from "@/lib/server/services/misc";

export const POST = route({ access: "user", allowIncomplete: true }, async ({ req, principal }) => {
  const { ids } = await readJson(req, markReadInput);
  await markNotificationsRead(principal, ids);
  return json({ ok: true });
});
