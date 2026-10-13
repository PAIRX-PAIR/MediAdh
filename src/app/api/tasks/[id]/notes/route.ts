import { schedulePush } from "@/lib/server/after-push";
import { json, readJson } from "@/lib/server/http";
import { noteInput } from "@/lib/server/inputs";
import { route } from "@/lib/server/route";
import { addTaskNote } from "@/lib/server/services/work";

export const POST = route({ access: "user" }, async ({ req, principal, params }) => {
  const { text } = await readJson(req, noteInput);
  const { task, notifications } = await addTaskNote(principal, params.id!, text);
  schedulePush(req, notifications);
  return json({ task }, { status: 201 });
});
