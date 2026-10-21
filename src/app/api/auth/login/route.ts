import { readJson, json } from "@/lib/server/http";
import { loginInput } from "@/lib/server/inputs";
import { clientIp } from "@/lib/server/rate-limit";
import { route } from "@/lib/server/route";
import { setSessionCookie, setTrustCookie } from "@/lib/server/auth/session";
import { login } from "@/lib/server/services/auth";

export const POST = route({ access: "public", manageSession: true }, async ({ req }) => {
  const input = await readJson(req, loginInput);
  const { token, user } = await login(input, clientIp(req.headers));
  await setSessionCookie(token);
  await setTrustCookie(user.id);
  return json({ ok: true, mustChangePassword: user.mustChangePassword });
});
