import { json, readJson } from "@/lib/server/http";
import { setupInput } from "@/lib/server/inputs";
import { clientIp } from "@/lib/server/rate-limit";
import { route } from "@/lib/server/route";
import { setupFirstAdmin, setupStatus } from "@/lib/server/services/auth";

export const GET = route({ access: "public" }, async () => json(await setupStatus()));

export const POST = route({ access: "public" }, async ({ req }) => {
  const input = await readJson(req, setupInput);
  await setupFirstAdmin(input, clientIp(req.headers));
  return json({ ok: true }, { status: 201 });
});
