import { schedulePush } from "@/lib/server/after-push";
import { json, readJson } from "@/lib/server/http";
import { taskCreateInput } from "@/lib/server/inputs";
import { route } from "@/lib/server/route";
import { createTask } from "@/lib/server/services/work";

export const POST = route({ access: "admin" }, async ({ req, principal }) => {
  const input = await readJson(req, taskCreateInput);
  const { task, notifications } = await createTask(principal, input);
  schedulePush(req, notifications);
  return json({ task }, { status: 201 });
});
