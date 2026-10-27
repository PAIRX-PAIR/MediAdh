import { HttpError, json, tooMany } from "@/lib/server/http";
import { consume } from "@/lib/server/rate-limit";
import { route } from "@/lib/server/route";
import { exportMyData } from "@/lib/server/services/misc";

export const GET = route({ access: "user", allowIncomplete: true }, async ({ principal }) => {
  // The personal-data export belongs to the account holder, not to an admin viewing as them.
  if (principal.impersonator) throw new HttpError(403, "La descarga de datos personales solo la puede pedir el titular de la cuenta.", "impersonation_read_only");
  const limit = consume(`export:${principal.user.id}`, 10, 60 * 60_000);
  if (!limit.ok) throw tooMany(limit.retryAfterSeconds);
  return json(await exportMyData(principal), {
    headers: { "Content-Disposition": `attachment; filename="mis-datos-${principal.user.username}.json"` },
  });
});
