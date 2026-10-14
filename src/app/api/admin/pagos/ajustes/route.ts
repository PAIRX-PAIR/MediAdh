import { json, readJson } from "@/lib/server/http";
import { payAdjustmentInput } from "@/lib/server/inputs";
import { route } from "@/lib/server/route";
import { addPayAdjustment } from "@/lib/server/services/payroll";

/** Bonificación o descuento de una quincena: solo gerencia y administración. */
export const POST = route({ access: "owner" }, async ({ req, principal }) => {
  const input = await readJson(req, payAdjustmentInput);
  return json({ adjustment: await addPayAdjustment(principal, input) }, { status: 201 });
});
