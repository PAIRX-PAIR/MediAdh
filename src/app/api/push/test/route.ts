import { appOrigin } from "@/lib/server/after-push";
import { json, tooMany } from "@/lib/server/http";
import { sendTestPush } from "@/lib/server/push";
import { consume } from "@/lib/server/rate-limit";
import { route } from "@/lib/server/route";

export const POST = route({ access: "user" }, async ({ req, principal }) => {
  const limit = consume(`push-test:${principal.user.id}`, 5, 10 * 60_000);
  if (!limit.ok) throw tooMany(limit.retryAfterSeconds);
  return json(await sendTestPush(principal.user.id, appOrigin(req)));
});
