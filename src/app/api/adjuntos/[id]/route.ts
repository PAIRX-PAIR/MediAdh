import { json } from "@/lib/server/http";
import { route } from "@/lib/server/route";
import { deleteAttachment, readAttachment } from "@/lib/server/services/attachments";

/**
 * Serves a stored file only to signed-in users allowed to see it. Files are
 * immutable (new id per upload), so the browser may cache them privately.
 */
export const GET = route({ access: "user" }, async ({ req, principal, params }) => {
  const { attachment, bytes } = await readAttachment(principal, params.id!);
  const download = req.nextUrl.searchParams.get("descargar") === "1";
  const encoded = encodeURIComponent(attachment.name);
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": attachment.mime,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encoded}`,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      // Images opened directly can never run anything. PDFs are left to the browser's
      // own isolated viewer (a sandbox CSP would stop Chrome from rendering them).
      ...(attachment.mime === "application/pdf"
        ? {}
        : { "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox" }),
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
});

export const DELETE = route({ access: "admin" }, async ({ principal, params }) => {
  await deleteAttachment(principal, params.id!);
  return json({ ok: true });
});
