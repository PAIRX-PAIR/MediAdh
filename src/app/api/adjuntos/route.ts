import { ATTACHMENT_KINDS, type AttachmentKind } from "@/lib/domain/schema";
import { badRequest, HttpError, json, tooMany } from "@/lib/server/http";
import { consume } from "@/lib/server/rate-limit";
import { route } from "@/lib/server/route";
import { MAX_ATTACHMENT_BYTES, uploadAttachment } from "@/lib/server/services/attachments";

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Raw upload: the body is the file itself (image/jpeg|png|webp or application/pdf),
 * metadata travels in the query string. Those content types are not CORS-"simple",
 * so a cross-site form cannot send them; the route wrapper also checks the origin.
 */
export const POST = route({ access: "admin" }, async ({ req, principal }) => {
  const limit = consume(`upload:${principal.user.id}`, 60, 10 * 60_000);
  if (!limit.ok) throw tooMany(limit.retryAfterSeconds, "Demasiados archivos seguidos. Espera un momento.");

  const params = req.nextUrl.searchParams;
  const kind = params.get("tipo") as AttachmentKind | null;
  if (!kind || !ATTACHMENT_KINDS.includes(kind)) throw badRequest("Tipo de archivo inválido.");
  const orderId = params.get("orden");
  const quoteId = params.get("cotizacion");
  if ((orderId && !ID.test(orderId)) || (quoteId && !ID.test(quoteId))) throw badRequest("Identificador inválido.");

  const declared = (req.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  const length = Number(req.headers.get("content-length") ?? "0");
  if (length > MAX_ATTACHMENT_BYTES) throw new HttpError(413, "El archivo supera 4 MB.", "too_large");
  const bytes = new Uint8Array(await req.arrayBuffer());

  const attachment = await uploadAttachment(principal, {
    kind,
    orderId,
    quoteId,
    name: (params.get("nombre") ?? "archivo").slice(0, 120),
    declaredMime: declared,
    bytes,
  });
  const { path: _p, ref: _r, ...view } = attachment;
  void _p;
  void _r;
  return json({ attachment: view }, { status: 201 });
});
