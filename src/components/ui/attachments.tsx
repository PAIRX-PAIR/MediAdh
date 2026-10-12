"use client";

import { Camera, FileText, Loader2, Paperclip, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { useSync } from "@/components/providers/sync-provider";
import { ApiError, api, attachmentUrl, uploadFile } from "@/lib/client/api";
import { ATTACHMENT_KIND_LABEL } from "@/lib/domain/labels";
import type { AttachmentKind } from "@/lib/domain/schema";
import type { AttachmentView } from "@/lib/domain/views";
import { Modal, useConfirm, useToast } from "./overlay";
import { Button, cn } from "./primitives";

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_SIDE = 2000;

/**
 * Phone photos are 3–12 MB: re-encode in the browser (max 2000 px, JPEG 0.82)
 * so uploads stay well under the 4 MB server limit and fast on mobile data.
 */
async function compressImage(file: File): Promise<Blob> {
  if (file.type === "image/png" && file.size < 1_500_000) return file;
  if (file.type === "image/jpeg" && file.size < 900_000) return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("No se pudo leer la foto. Prueba con JPG o PNG.");
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  if (!blob) throw new Error("No se pudo comprimir la foto.");
  return blob;
}

async function prepare(file: File): Promise<Blob> {
  if (file.type === "application/pdf") {
    if (file.size > MAX_BYTES) throw new Error(`“${file.name}” supera 4 MB. Divide el PDF o redúcelo.`);
    return file;
  }
  if (!file.type.startsWith("image/")) throw new Error(`“${file.name}” no es una foto ni un PDF.`);
  const blob = await compressImage(file);
  if (blob.size > MAX_BYTES) throw new Error(`“${file.name}” sigue pesando más de 4 MB.`);
  return blob;
}

export function AttachmentUploader({
  kind,
  orderId,
  quoteId,
  onUploaded,
  label,
  camera = false,
}: {
  kind: AttachmentKind;
  orderId?: string | null;
  quoteId?: string | null;
  onUploaded: (attachment: AttachmentView) => void | Promise<void>;
  label?: string;
  /** Opens the rear camera directly on phones. */
  camera?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const { refresh } = useSync();

  const handle = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      setBusy(file.name);
      try {
        const blob = await prepare(file);
        const name = file.type === "application/pdf" ? file.name : file.name.replace(/\.[a-z0-9]+$/i, ".jpg");
        const attachment = await uploadFile(blob, { kind, orderId, quoteId, name });
        await onUploaded(attachment);
        await refresh();
        toast(`${ATTACHMENT_KIND_LABEL[kind]} adjuntado`);
      } catch (error) {
        toast(error instanceof ApiError || error instanceof Error ? error.message : "No se pudo subir el archivo.", "error");
      }
    }
    setBusy(null);
    if (input.current) input.current.value = "";
  };

  return (
    <>
      <input
        ref={input}
        type="file"
        className="sr-only"
        tabIndex={-1}
        accept={kind === "plano" || kind === "documento" ? "image/*,application/pdf" : "image/*"}
        capture={camera ? "environment" : undefined}
        multiple={!camera}
        onChange={(e) => void handle(e.target.files)}
      />
      <Button
        variant="secondary"
        size="sm"
        loading={busy !== null}
        icon={camera ? <Camera className="size-4" /> : <Paperclip className="size-4" />}
        onClick={() => input.current?.click()}
      >
        {busy ? "Subiendo…" : (label ?? (camera ? "Tomar foto" : "Adjuntar"))}
      </Button>
    </>
  );
}

/** Thumbnails for photos, tiles for PDFs. Photos open in a viewer, PDFs in a new tab. */
export function AttachmentGallery({
  items,
  onRemoved,
  empty,
  canRemove = false,
}: {
  items: AttachmentView[];
  onRemoved?: () => void | Promise<void>;
  empty?: string;
  canRemove?: boolean;
}) {
  const [viewing, setViewing] = useState<AttachmentView | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const { refresh: refreshAfterRemove } = useSync();
  const { confirm, dialog } = useConfirm();
  const toast = useToast();

  if (items.length === 0) return empty ? <p className="text-sm text-muted">{empty}</p> : null;

  const remove = async (a: AttachmentView) => {
    if (!(await confirm({ title: `¿Quitar ${a.name}?`, body: "El archivo deja de verse en la orden.", confirmLabel: "Quitar", danger: true }))) return;
    setRemoving(a.id);
    try {
      await api.attachments.remove(a.id);
      await onRemoved?.();
      await refreshAfterRemove();
      setViewing(null);
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setRemoving(null);
    }
  };

  return (
    <>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {items.map((a) => (
          <li key={a.id} className="relative">
            {a.mime === "application/pdf" ? (
              <a
                href={attachmentUrl(a.id)}
                target="_blank"
                rel="noopener"
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-line bg-night/70 p-2 text-center transition-colors hover:border-glow/60"
              >
                <FileText className="size-8 text-glow" aria-hidden />
                <span className="line-clamp-2 break-all text-[11px] text-ink-soft">{a.name}</span>
              </a>
            ) : (
              <button
                type="button"
                onClick={() => setViewing(a)}
                className="block aspect-square w-full overflow-hidden rounded-xl border border-line bg-night/70 transition-colors hover:border-glow/60"
                aria-label={`Ver ${a.name}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- authenticated API image, not optimisable */}
                <img src={attachmentUrl(a.id)} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
              </button>
            )}
            {canRemove && (
              <button
                type="button"
                onClick={() => void remove(a)}
                aria-label={`Quitar ${a.name}`}
                className="absolute right-1 top-1 grid size-8 place-items-center rounded-lg bg-abyss/80 text-muted backdrop-blur hover:text-blocked"
              >
                {removing === a.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              </button>
            )}
          </li>
        ))}
      </ul>
      <Modal open={viewing !== null} onClose={() => setViewing(null)} title={viewing?.name ?? ""} size="xl">
        {viewing && (
          <div className="flex flex-col gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- authenticated API image */}
            <img src={attachmentUrl(viewing.id)} alt={viewing.name} className="max-h-[70dvh] w-full rounded-xl object-contain" />
            <div className={cn("flex flex-wrap gap-2")}>
              <a href={attachmentUrl(viewing.id, true)} className="text-sm font-semibold text-glow underline-offset-4 hover:underline">
                Descargar
              </a>
            </div>
          </div>
        )}
      </Modal>
      {dialog}
    </>
  );
}
