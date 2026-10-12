import { schedulePush } from "@/lib/server/after-push";
import { json, readJson } from "@/lib/server/http";
import { requestPatchInput } from "@/lib/server/inputs";
import { route } from "@/lib/server/route";
import { updateRequest } from "@/lib/server/services/work";

export const PATCH = route({ access: "user" }, async ({ req, principal, params }) => {
  const input = await readJson(req, requestPatchInput);
  const { request, notifications } = await updateRequest(principal, params.id!, input);
  schedulePush(req, notifications);
  return json({ request });
});
