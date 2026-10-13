import { json } from "@/lib/server/http";
import { route } from "@/lib/server/route";
import { revokeDevice } from "@/lib/server/services/devices";

export const DELETE = route({ access: "admin" }, async ({ principal, params }) => {
  await revokeDevice(principal, params.id!);
  return json({ ok: true });
});
