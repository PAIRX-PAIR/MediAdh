import { schedulePush } from "@/lib/server/after-push";
import { json } from "@/lib/server/http";
import { route } from "@/lib/server/route";
import { maybeRunScheduler } from "@/lib/server/services/scheduler";
import { buildSync } from "@/lib/server/services/sync";

export const GET = route({ access: "user", allowIncomplete: true }, async ({ req, principal }) => {
  // Hobby cron runs once a day; reminders also fire from here, at most every few minutes.
  schedulePush(req, await maybeRunScheduler());
  const payload = await buildSync(principal);
  const etag = `"${payload.version}"`;
  if (req.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": "no-store, max-age=0" } });
  }
  return json(payload, { headers: { ETag: etag } });
});
