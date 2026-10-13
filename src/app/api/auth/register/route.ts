import { schedulePush } from "@/lib/server/after-push";
import { json, readJson } from "@/lib/server/http";
import { registerInput } from "@/lib/server/inputs";
import { clientIp } from "@/lib/server/rate-limit";
import { route } from "@/lib/server/route";
import { register } from "@/lib/server/services/auth";

export const POST = route({ access: "public" }, async ({ req }) => {
  const input = await readJson(req, registerInput);
  const { notifications } = await register(input, clientIp(req.headers));
  schedulePush(req, notifications);
  return json(
    { ok: true, message: "Solicitud enviada. Un administrador debe aprobar tu acceso; te avisaremos aquí cuando lo haga." },
    { status: 201 },
  );
});
