import { json, readJson } from "@/lib/server/http";
import { rejectInput } from "@/lib/server/inputs";
import { route } from "@/lib/server/route";
import { rejectRegistration } from "@/lib/server/services/team";

export const POST = route({ access: "admin" }, async ({ req, principal, params }) => {
  const { reason } = await readJson(req, rejectInput);
  await rejectRegistration(principal, params.id!, reason);
  return json({ ok: true });
});
