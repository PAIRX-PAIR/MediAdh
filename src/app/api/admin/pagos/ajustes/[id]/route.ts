import { json } from "@/lib/server/http";
import { route } from "@/lib/server/route";
import { removePayAdjustment } from "@/lib/server/services/payroll";

export const DELETE = route({ access: "owner" }, async ({ principal, params }) => {
  await removePayAdjustment(principal, params.id!);
  return json({ ok: true });
});
