import { clearSessionCookie } from "@/lib/server/auth/session";
import { json } from "@/lib/server/http";
import { route } from "@/lib/server/route";
import { signOutEverywhere } from "@/lib/server/services/auth";

export const POST = route({ access: "user", allowIncomplete: true, manageSession: true }, async ({ principal }) => {
  await signOutEverywhere(principal);
  await clearSessionCookie();
  return json({ ok: true });
});
