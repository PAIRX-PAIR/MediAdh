import { setSessionCookie } from "@/lib/server/auth/session";
import { json } from "@/lib/server/http";
import { route } from "@/lib/server/route";
import { stopImpersonation } from "@/lib/server/services/impersonation";

/** Leaves "entrar como" and restores the admin's own session. */
export const POST = route({ access: "user", allowIncomplete: true, manageSession: true, allowImpersonated: true }, async ({ principal }) => {
  await setSessionCookie(await stopImpersonation(principal));
  return json({ ok: true });
});
