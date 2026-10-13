import { json, readJson } from "@/lib/server/http";
import { clientInput } from "@/lib/server/inputs-production";
import { route } from "@/lib/server/route";
import { createClient } from "@/lib/server/services/catalog";

export const POST = route({ access: "admin" }, async ({ req, principal }) => {
  const input = await readJson(req, clientInput);
  const client = await createClient(principal, input);
  return json({ client }, { status: 201 });
});
