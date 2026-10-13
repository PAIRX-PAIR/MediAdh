import { json, readJson } from "@/lib/server/http";
import { pushSubscribeInput } from "@/lib/server/inputs";
import { route } from "@/lib/server/route";
import { savePushSubscription } from "@/lib/server/services/misc";

export const POST = route({ access: "user", allowIncomplete: true }, async ({ req, principal }) => {
  const input = await readJson(req, pushSubscribeInput);
  await savePushSubscription(principal, input);
  return json({ ok: true });
});
