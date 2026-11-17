import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { MAX_PARTS, PART_BYTES, PDF_MAX_BYTES, SINGLE_UPLOAD_MAX_BYTES } from "@/lib/domain/files";
import type { Attachment, AttachmentKind, AttachmentMime } from "@/lib/domain/schema";
import type { Principal } from "../auth/principal";
import { badRequest, forbidden, HttpError, notFound } from "../http";
import { sessionSecret } from "../env";
import { getDb } from "../store";
import { getAttachmentStore } from "../store/attachments";
import { actorOf, audit, newId, nowIso, track } from "./common";

/** Vercel functions accept request bodies up to 4.5 MB; images are compressed in the browser first. */
export const MAX_ATTACHMENT_BYTES = SINGLE_UPLOAD_MAX_BYTES;
export { PART_BYTES, MAX_PARTS };
const MAX_PER_ORDER = 60;

const EXTENSION: Record<AttachmentMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** Content must match the declared type (magic bytes), so a renamed script is never served. */
export function sniffMime(bytes: Uint8Array): AttachmentMime | null {
  const b = bytes;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return "image/png";
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP") return "image/webp";
  if (b.length >= 5 && ascii(b, 0, 5) === "%PDF-") return "application/pdf";
  return null;
}

function ascii(b: Uint8Array, from: number, to: number) {
  return String.fromCharCode(...b.subarray(from, to));
}

/** Keeps a readable, harmless file name for downloads. */
export function cleanName(name: string, mime: AttachmentMime): string {
  const base = name
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
    .replace(/\.[a-z0-9]{1,5}$/i, "")
    .replace(/^[.\s]+/, "")
    .trim()
    .slice(0, 80);
  return `${base || "archivo"}.${EXTENSION[mime]}`;
}

export interface UploadInput {
  kind: AttachmentKind;
  orderId: string | null;
  quoteId: string | null;
  name: string;
  declaredMime: string;
  bytes: Uint8Array;
}

export async function uploadAttachment(principal: Principal, input: UploadInput): Promise<Attachment> {
  if (input.bytes.byteLength === 0) throw badRequest("El archivo está vacío.");
  const mime = sniffMime(input.bytes);
  if (!mime) throw new HttpError(415, "Solo se aceptan fotos (JPG, PNG, WebP) o PDF.", "unsupported_media_type");
  // Los PDF grandes llegan armados desde sus partes; una foto nunca pasa de 4 MB.
  const max = mime === "application/pdf" ? PDF_MAX_BYTES : MAX_ATTACHMENT_BYTES;
  if (input.bytes.byteLength > max) {
    const label = mime === "application/pdf" ? "50 MB" : "4 MB";
    throw new HttpError(413, `El archivo supera ${label}. Reduce la foto o divide el PDF.`, "too_large");
  }
  if (input.declaredMime !== mime) throw new HttpError(415, "El tipo del archivo no coincide con su contenido.", "mime_mismatch");
  if (!input.orderId && !input.quoteId) throw badRequest("El archivo debe pertenecer a una orden o a una cotización.");

  const db = getDb();
  // Check the owner first so nothing is uploaded for a missing order.
  const { orders, quotes, attachments } = await db.read(["orders", "quotes", "attachments"]);
  if (input.orderId && !orders.items.some((o) => o.id === input.orderId)) throw notFound("Orden de trabajo no encontrada.");
  if (input.quoteId && !quotes.items.some((q) => q.id === input.quoteId)) throw notFound("Cotización no encontrada.");
  const count = attachments.items.filter((a) => (input.orderId && a.orderId === input.orderId) || (input.quoteId && a.quoteId === input.quoteId)).length;
  if (count >= MAX_PER_ORDER) throw badRequest(`Máximo ${MAX_PER_ORDER} archivos por orden.`);

  const id = newId();
  const now = nowIso();
  const filePath = `data/adjuntos/${now.slice(0, 4)}/${now.slice(5, 7)}/${id}.${EXTENSION[mime]}`;
  const name = cleanName(input.name, mime);
  const { ref } = await getAttachmentStore().put(filePath, input.bytes, `Adjunto: ${name}`);

  return db.transact(["attachments", "orders", "quotes", "audit"], "Registra un archivo adjunto", (docs) => {
    const attachment: Attachment = {
      id,
      kind: input.kind,
      orderId: input.orderId,
      quoteId: input.quoteId,
      name,
      mime,
      size: input.bytes.byteLength,
      path: filePath,
      ref,
      createdBy: principal.user.id,
      createdAt: now,
    };
    docs.attachments.items.push(attachment);
    const actor = actorOf(principal);
    if (input.orderId) {
      const order = docs.orders.items.find((o) => o.id === input.orderId);
      if (order) {
        const list = input.kind === "plano" ? order.drawingIds : input.kind === "foto_ingreso" ? order.intakePhotoIds : order.photoIds;
        list.push(id);
        order.updatedAt = now;
        track(order, actor, `Adjuntó ${name}`);
      }
    }
    if (input.quoteId) {
      const quote = docs.quotes.items.find((q) => q.id === input.quoteId);
      if (quote) {
        quote.drawingIds.push(id);
        track(quote, actor, `Adjuntó ${name}`);
      }
    }
    audit(docs.audit, actor, "adjunto_subido", input.orderId ?? input.quoteId, name);
    return attachment;
  });
}

/* ───────────── PDF grandes por partes (como en Studio Bamboo) ───────────── */

const partPath = (id: string) => `data/adjuntos/partes/${id}.bin`;

/** Firma de una parte: prueba que la subió esta persona, con este tamaño y en esta copia del almacén. */
function partSignature(principal: Principal, id: string, size: number, ref: string | null) {
  return createHmac("sha256", sessionSecret()).update(`parte-adjunto|${principal.user.id}|${id}|${size}|${ref ?? ""}`).digest("base64url");
}

/** Guarda una parte aparte. No cuenta como archivo hasta que se arma con `assembleAttachment`. */
export async function uploadAttachmentPart(principal: Principal, bytes: Uint8Array) {
  if (bytes.byteLength === 0) throw badRequest("La parte está vacía.");
  if (bytes.byteLength > PART_BYTES) throw new HttpError(413, "La parte es demasiado grande.", "too_large");
  const id = newId();
  const { ref } = await getAttachmentStore().put(partPath(id), bytes, "Parte de un adjunto grande");
  return { id, size: bytes.byteLength, ref, sig: partSignature(principal, id, bytes.byteLength, ref) };
}

export interface AssemblyInput {
  kind: AttachmentKind;
  orderId: string | null;
  quoteId: string | null;
  name: string;
  parts: Array<{ id: string; size: number; ref: string | null; sig: string }>;
}

/** Arma un PDF con sus partes ya subidas, en orden, y lo guarda como un adjunto normal. */
export async function assembleAttachment(principal: Principal, input: AssemblyInput): Promise<Attachment> {
  const incomplete = () => badRequest("El archivo llegó incompleto. Súbelo otra vez.");
  if (input.parts.length < 2 || input.parts.length > MAX_PARTS) throw incomplete();
  if (new Set(input.parts.map((p) => p.id)).size !== input.parts.length) throw incomplete();
  let total = 0;
  for (const [i, p] of input.parts.entries()) {
    const expected = Buffer.from(partSignature(principal, p.id, p.size, p.ref));
    const given = Buffer.from(p.sig);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw incomplete();
    // Todas las partes van llenas salvo la última: nadie arma un archivo más grande que el límite.
    if (i < input.parts.length - 1 && p.size !== PART_BYTES) throw incomplete();
    total += p.size;
  }
  if (total > PDF_MAX_BYTES) throw new HttpError(413, "El archivo supera 50 MB.", "too_large");

  const store = getAttachmentStore();
  const chunks: Uint8Array[] = [];
  for (const p of input.parts) {
    const bytes = await store.get(partPath(p.id), p.ref);
    if (!bytes || bytes.byteLength !== p.size) throw incomplete();
    chunks.push(bytes);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }

  const attachment = await uploadAttachment(principal, {
    kind: input.kind,
    orderId: input.orderId,
    quoteId: input.quoteId,
    name: input.name,
    declaredMime: "application/pdf",
    bytes,
  });
  // Las partes ya no hacen falta: si no se pueden borrar, quedan como archivos sueltos sin efecto.
  for (const p of input.parts) await store.remove(partPath(p.id), p.ref, "Limpia una parte de adjunto").catch(() => undefined);
  return attachment;
}

/** Admins see every file; a worker only the files of orders that have a task for their position. */
export async function readAttachment(principal: Principal, id: string) {
  const { attachments, tasks } = await getDb().read(["attachments", "tasks"]);
  const attachment = attachments.items.find((a) => a.id === id);
  if (!attachment) throw notFound("Archivo no encontrado.");
  if (!principal.isAdmin) {
    const positionId = principal.position?.id;
    const allowed = Boolean(positionId && attachment.orderId && tasks.items.some((t) => t.orderId === attachment.orderId && t.positionId === positionId));
    if (!allowed) throw forbidden("Este archivo no es de tus trabajos.");
  }
  const bytes = await getAttachmentStore().get(attachment.path, attachment.ref);
  if (!bytes) throw notFound("El archivo ya no está disponible.");
  return { attachment, bytes };
}

export async function deleteAttachment(principal: Principal, id: string) {
  const removed = await getDb().transact(["attachments", "orders", "quotes", "audit"], "Quita un archivo adjunto", (docs) => {
    const attachment = docs.attachments.items.find((a) => a.id === id);
    if (!attachment) throw notFound("Archivo no encontrado.");
    docs.attachments.items = docs.attachments.items.filter((a) => a.id !== id);
    const actor = actorOf(principal);
    for (const o of docs.orders.items) {
      const before = o.drawingIds.length + o.intakePhotoIds.length + o.photoIds.length;
      o.drawingIds = o.drawingIds.filter((x) => x !== id);
      o.intakePhotoIds = o.intakePhotoIds.filter((x) => x !== id);
      o.photoIds = o.photoIds.filter((x) => x !== id);
      if (o.drawingIds.length + o.intakePhotoIds.length + o.photoIds.length !== before) track(o, actor, `Quitó ${attachment.name}`);
    }
    for (const q of docs.quotes.items) q.drawingIds = q.drawingIds.filter((x) => x !== id);
    audit(docs.audit, actor, "adjunto_eliminado", attachment.orderId ?? attachment.quoteId, attachment.name);
    return attachment;
  });
  // The repository history keeps the bytes; removing the current file just frees the listing.
  await getAttachmentStore()
    .remove(removed.path, removed.ref, `Quita adjunto: ${removed.name}`)
    .catch((error) => console.warn("[smi] attachment remove", (error as Error).message));
}
