import { json } from "@/lib/server/http";
import { route } from "@/lib/server/route";
import { deviceBoard } from "@/lib/server/services/devices";

/** The operator's own queue, for a phone authorised by QR. */
export const GET = route({ access: "public" }, async () => json(await deviceBoard(), { headers: { "X-Robots-Tag": "noindex, nofollow" } }));
