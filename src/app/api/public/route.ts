import { route } from "@/lib/server/route";
import { json } from "@/lib/server/http";
import { buildPublicInfo } from "@/lib/server/services/sync";

export const GET = route({ access: "public" }, async () => json(await buildPublicInfo()));
