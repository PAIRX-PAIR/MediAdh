import { schedulePush } from "@/lib/server/after-push";
import { forbidden, json, readJson } from "@/lib/server/http";
import { taskPatchInput } from "@/lib/server/inputs";
import { route } from "@/lib/server/route";
import { deleteTask, updateTask } from "@/lib/server/services/work";

export const PATCH = route({ access: "user" }, async ({ req, principal, params }) => {
  const patch = await readJson(req, taskPatchInput);
  const { task, notifications } = await updateTask(principal, params.id!, patch);
  schedulePush(req, notifications);
  return json({ task });
});

export const DELETE = route({ access: "user" }, async ({ principal, params }) => {
  if (!principal.isAdmin) throw forbidden();
  await deleteTask(principal, params.id!);
  return json({ ok: true });
});
