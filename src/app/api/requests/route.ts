import { schedulePush } from "@/lib/server/after-push";
import { json, readJson } from "@/lib/server/http";
import { requestCreateInput } from "@/lib/server/inputs";
import { route } from "@/lib/server/route";
import { createRequest } from "@/lib/server/services/work";

export const POST = route({ access: "user" }, async ({ req, principal }) => {
  const input = await readJson(req, requestCreateInput);
  const { request, notifications } = await createRequest(principal, input);
  schedulePush(req, notifications);
  return json({ request }, { status: 201 });
});
