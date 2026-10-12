import { schedulePush } from "@/lib/server/after-push";
import { json, readJson } from "@/lib/server/http";
import { closeDayInput } from "@/lib/server/inputs";
import { route } from "@/lib/server/route";
import { closeDay } from "@/lib/server/services/work";

export const POST = route({ access: "user" }, async ({ req, principal }) => {
  const input = await readJson(req, closeDayInput);
  const { closure, notifications } = await closeDay(principal, input);
  schedulePush(req, notifications);
  return json({ closure }, { status: 201 });
});
