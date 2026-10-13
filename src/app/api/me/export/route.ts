import { json, tooMany } from "@/lib/server/http";
import { consume } from "@/lib/server/rate-limit";
import { route } from "@/lib/server/route";
import { exportMyData } from "@/lib/server/services/misc";

export const GET = route({ access: "user", allowIncomplete: true }, async ({ principal }) => {
  const limit = consume(`export:${principal.user.id}`, 10, 60 * 60_000);
  if (!limit.ok) throw tooMany(limit.retryAfterSeconds);
  return json(await exportMyData(principal), {
    headers: { "Content-Disposition": `attachment; filename="mis-datos-${principal.user.username}.json"` },
  });
});
