import { json, readJson } from "@/lib/server/http";
import { machineInput } from "@/lib/server/inputs-production";
import { route } from "@/lib/server/route";
import { createMachine } from "@/lib/server/services/catalog";

export const POST = route({ access: "admin" }, async ({ req, principal }) => {
  const input = await readJson(req, machineInput);
  const machine = await createMachine(principal, input);
  return json({ machine }, { status: 201 });
});
