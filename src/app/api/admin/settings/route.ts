import { json, readJson } from "@/lib/server/http";
import { settingsPatchInput } from "@/lib/server/inputs";
import { route } from "@/lib/server/route";
import { updateSettings } from "@/lib/server/services/misc";

export const PATCH = route({ access: "owner" }, async ({ req, principal }) => {
  const input = await readJson(req, settingsPatchInput);
  await updateSettings(principal, input);
  return json({ ok: true });
});
