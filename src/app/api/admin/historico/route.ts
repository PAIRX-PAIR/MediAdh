import { json, readJson } from "@/lib/server/http";
import { historicalInput } from "@/lib/server/inputs-production";
import { route } from "@/lib/server/route";
import { createHistoricalOrder } from "@/lib/server/services/orders";

/** Registers a job done before the app existed into the historical archive. */
export const POST = route({ access: "admin" }, async ({ req, principal }) => {
  const input = await readJson(req, historicalInput);
  const order = await createHistoricalOrder(principal, input);
  return json({ order }, { status: 201 });
});
