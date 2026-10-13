import { json, readJson } from "@/lib/server/http";
import { route } from "@/lib/server/route";
import { boardToken } from "@/lib/server/services/board";
import { z } from "zod";

/** Link of the operators' board: coordinación and asistencia share it on the floor. */
export const GET = route({ access: "admin" }, async ({ principal }) => json({ token: await boardToken(principal, false) }));

/** Rotates the secret (the old link stops working). */
export const POST = route({ access: "admin" }, async ({ req, principal }) => {
  await readJson(req, z.object({ rotate: z.literal(true) }));
  return json({ token: await boardToken(principal, true) });
});
