import { clearSessionCookie } from "@/lib/server/auth/session";
import { json } from "@/lib/server/http";
import { route } from "@/lib/server/route";

export const POST = route({ access: "public" }, async () => {
  await clearSessionCookie();
  return json({ ok: true });
});
