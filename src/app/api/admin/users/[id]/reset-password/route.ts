import { json, readJson } from "@/lib/server/http";
import { resetPasswordInput } from "@/lib/server/inputs";
import { route } from "@/lib/server/route";
import { resetPassword } from "@/lib/server/services/team";

export const POST = route({ access: "owner" }, async ({ req, principal, params }) => {
  const { tempPassword } = await readJson(req, resetPasswordInput);
  await resetPassword(principal, params.id!, tempPassword);
  return json({ ok: true });
});
