import { json } from "@/lib/server/http";
import { route } from "@/lib/server/route";
import { deleteAnnouncement } from "@/lib/server/services/misc";

export const DELETE = route({ access: "admin" }, async ({ principal, params }) => {
  await deleteAnnouncement(principal, params.id!);
  return json({ ok: true });
});
