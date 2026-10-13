import { json, readJson } from "@/lib/server/http";
import { pushUnsubscribeInput } from "@/lib/server/inputs";
import { route } from "@/lib/server/route";
import { removePushSubscription } from "@/lib/server/services/misc";

export const POST = route({ access: "user", allowIncomplete: true }, async ({ req, principal }) => {
  const { endpoint } = await readJson(req, pushUnsubscribeInput);
  await removePushSubscription(principal, endpoint);
  return json({ ok: true });
});
