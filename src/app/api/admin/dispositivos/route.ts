import { z } from "zod";
import { json, readJson } from "@/lib/server/http";
import { entityId } from "@/lib/server/inputs";
import { route } from "@/lib/server/route";
import { approveDevice, listDevices } from "@/lib/server/services/devices";

export const GET = route({ access: "admin" }, async () => json(await listDevices()));

/** Approves the phone showing `code` for the chosen operator (code read from its QR). */
export const POST = route({ access: "admin" }, async ({ req, principal }) => {
  const input = await readJson(req, z.object({ code: z.string().min(1).max(40), userId: entityId }));
  return json(await approveDevice(principal, input.code, input.userId));
});
