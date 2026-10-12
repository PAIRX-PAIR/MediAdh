import { json } from "@/lib/server/http";
import { route } from "@/lib/server/route";
import { acceptConsent } from "@/lib/server/services/auth";

export const POST = route({ access: "user", allowIncomplete: true }, async ({ principal }) => {
  await acceptConsent(principal);
  return json({ ok: true });
});
