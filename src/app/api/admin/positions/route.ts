import { json, readJson } from "@/lib/server/http";
import { positionCreateInput } from "@/lib/server/inputs";
import { route } from "@/lib/server/route";
import { createPosition } from "@/lib/server/services/team";

export const POST = route({ access: "admin" }, async ({ req, principal }) => {
  const input = await readJson(req, positionCreateInput);
  const position = await createPosition(principal, input);
  return json({ id: position.id }, { status: 201 });
});
