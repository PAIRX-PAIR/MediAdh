import { PART_BYTES } from "@/lib/domain/files";
import { HttpError, json, tooMany } from "@/lib/server/http";
import { consume } from "@/lib/server/rate-limit";
import { route } from "@/lib/server/route";
import { uploadAttachmentPart } from "@/lib/server/services/attachments";

/** Una parte de un PDF grande. Se guarda aparte y solo cuenta cuando se arma el archivo (/api/adjuntos/armar). */
export const POST = route({ access: "admin" }, async ({ req, principal }) => {
  const limit = consume(`upload-part:${principal.user.id}`, 600, 60 * 60_000);
  if (!limit.ok) throw tooMany(limit.retryAfterSeconds, "Demasiadas subidas seguidas. Espera un momento.");
  const length = Number(req.headers.get("content-length") ?? "0");
  if (length > PART_BYTES) throw new HttpError(413, "La parte es demasiado grande.", "too_large");
  const bytes = new Uint8Array(await req.arrayBuffer());
  return json(await uploadAttachmentPart(principal, bytes));
});
