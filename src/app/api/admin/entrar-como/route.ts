import { z } from "zod";
import { setSessionCookie } from "@/lib/server/auth/session";
import { json, readJson } from "@/lib/server/http";
import { entityId } from "@/lib/server/inputs";
import { route } from "@/lib/server/route";
import { startImpersonation } from "@/lib/server/services/impersonation";

/** Gerencia y administración only: open the app as another user (read-only, audited). */
export const POST = route({ access: "owner", manageSession: true }, async ({ req, principal }) => {
  const { userId } = await readJson(req, z.object({ userId: entityId }));
  const { token, isAdmin } = await startImpersonation(principal, userId);
  await setSessionCookie(token);
  return json({ ok: true, home: isAdmin ? "/admin" : "/panel" });
});
