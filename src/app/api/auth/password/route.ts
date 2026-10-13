import { setSessionCookie } from "@/lib/server/auth/session";
import { json, readJson } from "@/lib/server/http";
import { passwordInput } from "@/lib/server/inputs";
import { route } from "@/lib/server/route";
import { changePassword } from "@/lib/server/services/auth";

export const POST = route({ access: "user", allowIncomplete: true }, async ({ req, principal }) => {
  const input = await readJson(req, passwordInput);
  const token = await changePassword(principal, input);
  await setSessionCookie(token);
  return json({ ok: true });
});
