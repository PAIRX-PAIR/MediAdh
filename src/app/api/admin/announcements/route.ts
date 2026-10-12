import { schedulePush } from "@/lib/server/after-push";
import { json, readJson } from "@/lib/server/http";
import { announcementInput } from "@/lib/server/inputs";
import { route } from "@/lib/server/route";
import { createAnnouncement } from "@/lib/server/services/misc";

export const POST = route({ access: "admin" }, async ({ req, principal }) => {
  const input = await readJson(req, announcementInput);
  const { announcement, notifications } = await createAnnouncement(principal, input);
  schedulePush(req, notifications);
  return json({ announcement }, { status: 201 });
});
