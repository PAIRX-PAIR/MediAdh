import { HttpError, json } from "@/lib/server/http";
import { clientIp, consume } from "@/lib/server/rate-limit";
import { route } from "@/lib/server/route";
import { deviceState, forgetDevice, requestDevice } from "@/lib/server/services/devices";

/** State of this phone: sin solicitud, pendiente (with its code), aprobado, vencido o revocado. */
export const GET = route({ access: "public" }, async () => json(await deviceState()));

/** The phone asks for access and gets a short code to show as QR. */
export const POST = route({ access: "public" }, async ({ req }) => {
  // Generous: every phone on the workshop WiFi shares one public IP.
  const limit = consume(`device:${clientIp(req.headers)}`, 15, 10 * 60_000);
  if (!limit.ok) throw new HttpError(429, "Demasiadas solicitudes. Espera unos minutos.", "rate_limited");
  const global = consume("device:global", 40, 10 * 60_000);
  if (!global.ok) throw new HttpError(429, "Demasiadas solicitudes. Espera unos minutos.", "rate_limited");
  return json(await requestDevice(req.headers.get("user-agent")), { status: 201 });
});

/** "Salir": this phone stops seeing the board. */
export const DELETE = route({ access: "public" }, async () => {
  await forgetDevice();
  return json({ ok: true });
});
