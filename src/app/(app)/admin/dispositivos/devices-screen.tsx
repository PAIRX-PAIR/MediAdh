"use client";

import { Camera, CheckCircle2, QrCode, Smartphone, Trash2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/ui/kit";
import { Modal, useConfirm } from "@/components/ui/overlay";
import { Button, Chip, EmptyState, Field, IconButton, Input, Panel, Select, Spinner } from "@/components/ui/primitives";
import { request } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { formatDateTime } from "@/lib/domain/labels";

interface DeviceList {
  operators: Array<{ userId: string; name: string; positionTitle: string }>;
  devices: Array<{
    id: string;
    status: "pendiente" | "aprobado" | "revocado";
    code: string | null;
    label: string;
    operator: string | null;
    approvedBy: string | null;
    approvedAt: string | null;
    createdAt: string;
  }>;
}

/** Accepts the QR's URL (…/admin/dispositivos?codigo=XXXX) or the bare code. */
function codeFrom(text: string): string {
  try {
    const fromUrl = new URL(text).searchParams.get("codigo");
    if (fromUrl) return fromUrl.toUpperCase().replace(/[^A-Z0-9]/g, "");
  } catch {
    // Not a URL: the bare code.
  }
  return text.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Phones of the operators: approve a new one by scanning its QR, revoke any of them. */
export function DevicesScreen() {
  const params = useSearchParams();
  const [list, setList] = useState<DeviceList | null>(null);
  const [version, setVersion] = useState(0);
  const [code, setCode] = useState(() => codeFrom(params.get("codigo") ?? ""));
  const [userId, setUserId] = useState("");
  const [scanning, setScanning] = useState(false);
  const { run, busy } = useAction();
  const { confirm, dialog } = useConfirm();

  useEffect(() => {
    request<DeviceList>("/api/admin/dispositivos")
      .then(setList)
      .catch(() => undefined);
  }, [version]);

  const reload = () => setVersion((v) => v + 1);
  const pretty = code.length > 4 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Equipo"
        title="Accesos QR"
        description="Los operarios ven su cola en el celular sin usuario ni contraseña. El operario toca «Soy operario» en la página de inicio, tú escaneas su código y eliges quién es."
        actions={
          <Button icon={<Camera className="size-4" />} onClick={() => setScanning(true)}>
            Escanear QR
          </Button>
        }
      />

      <Panel>
        <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold text-ink">
          <QrCode className="size-5 text-glow" aria-hidden /> Autorizar un celular
        </h2>
        <div className="grid gap-4 sm:grid-cols-[12rem_1fr_auto] sm:items-end">
          <Field label="Código del celular" hint="Lo lee el escáner, o escríbelo (8 letras o números).">
            {(id, d) => (
              <Input
                id={id}
                aria-describedby={d}
                autoCapitalize="characters"
                autoComplete="off"
                className="font-mono tracking-widest"
                placeholder="ABCD-EFGH"
                value={pretty}
                onChange={(e) => setCode(codeFrom(e.target.value).slice(0, 8))}
              />
            )}
          </Field>
          <Field label="¿Quién es el operario?">
            {(id) => (
              <Select id={id} value={userId} onChange={(e) => setUserId(e.target.value)}>
                <option value="">Elige…</option>
                {(list?.operators ?? []).map((o) => (
                  <option key={o.userId} value={o.userId}>
                    {o.name} · {o.positionTitle}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Button
            loading={busy === "ok"}
            disabled={code.length !== 8 || !userId}
            icon={<CheckCircle2 className="size-4" />}
            onClick={async () => {
              const ok = await run("ok", () => request<{ operator: string }>("/api/admin/dispositivos", { method: "POST", body: { code, userId } }), (r) => `Listo: el celular de ${r.operator} ya ve su cola`);
              if (ok) {
                setCode("");
                setUserId("");
                reload();
              }
            }}
          >
            Autorizar
          </Button>
        </div>
      </Panel>

      <section aria-labelledby="celulares-title">
        <h2 id="celulares-title" className="mb-3 font-display text-lg font-semibold text-ink">
          Celulares
        </h2>
        {!list ? (
          <Spinner />
        ) : list.devices.length === 0 ? (
          <EmptyState icon={<Smartphone />} title="Ningún celular autorizado todavía" />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {list.devices.map((d) => (
              <li key={d.id} className="hud-panel flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{d.operator ?? "Esperando aprobación"}</p>
                  <p className="text-sm text-muted">
                    {d.label}
                    {d.approvedAt ? ` · autorizado ${formatDateTime(d.approvedAt)}${d.approvedBy ? ` por ${d.approvedBy}` : ""}` : ` · pidió acceso ${formatDateTime(d.createdAt)}`}
                  </p>
                  {d.status === "pendiente" && d.code && (
                    <Button size="sm" variant="secondary" className="mt-2" onClick={() => setCode(d.code!)}>
                      Usar código {d.code.slice(0, 4)}-{d.code.slice(4)}
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Chip tone={d.status === "aprobado" ? "done" : "pending"}>{d.status === "aprobado" ? "Con acceso" : "Pendiente"}</Chip>
                  <IconButton
                    label="Quitar acceso"
                    onClick={async () => {
                      if (
                        await confirm({
                          title: `¿Quitar el acceso${d.operator ? ` de ${d.operator}` : ""}?`,
                          body: "Ese celular deja de ver la cola de inmediato. Puede volver a pedir acceso.",
                          confirmLabel: "Quitar",
                          danger: true,
                        })
                      ) {
                        const ok = await run(`rm-${d.id}`, () => request(`/api/admin/dispositivos/${encodeURIComponent(d.id)}`, { method: "DELETE" }), "Acceso quitado");
                        if (ok) reload();
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {scanning && (
        <ScannerModal
          onClose={() => setScanning(false)}
          onCode={(value) => {
            setCode(value);
            setScanning(false);
          }}
        />
      )}
      {dialog}
    </div>
  );
}

interface Detector {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
}

/** Camera QR reader: native BarcodeDetector when the browser has it (Android), jsQR otherwise (iPhone). */
function ScannerModal({ onClose, onCode }: { onClose: () => void; onCode: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const found = useRef(false);

  const finish = useCallback(
    (text: string) => {
      const code = codeFrom(text);
      if (found.current || code.length !== 8) return;
      found.current = true;
      onCode(code);
    },
    [onCode],
  );

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      } catch {
        setError("No se pudo abrir la cámara. Revisa el permiso de cámara del navegador o escribe el código a mano.");
        return;
      }
      if (stopped || !video.current) return;
      video.current.srcObject = stream;
      await video.current.play().catch(() => undefined);
      const Native = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
      const detector = Native ? new Native({ formats: ["qr_code"] }) : null;
      const { default: jsQR } = await import("jsqr");

      const tick = async () => {
        if (stopped || found.current || !video.current) return;
        const v = video.current;
        if (v.readyState >= 2 && v.videoWidth > 0) {
          try {
            if (detector) {
              const codes = await detector.detect(v);
              if (codes[0]) finish(codes[0].rawValue);
            } else if (ctx) {
              canvas.width = v.videoWidth;
              canvas.height = v.videoHeight;
              ctx.drawImage(v, 0, 0);
              const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const result = jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" });
              if (result) finish(result.data);
            }
          } catch {
            // A frame that cannot be read: try the next one.
          }
        }
        frame = requestAnimationFrame(() => void tick());
      };
      frame = requestAnimationFrame(() => void tick());
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [finish]);

  return (
    <Modal open onClose={onClose} title="Escanear QR del operario" description="Apunta la cámara al código que muestra el celular del operario." size="md">
      {error ? (
        <p className="rounded-xl border border-pending/40 bg-pending/10 p-3 text-sm text-pending">{error}</p>
      ) : (
        <div className="relative overflow-hidden rounded-xl border border-line bg-black">
          <video ref={video} muted playsInline className="aspect-square w-full object-cover" aria-label="Vista de la cámara" />
          <div className="pointer-events-none absolute inset-[18%] rounded-2xl border-2 border-glow/80 shadow-glow" aria-hidden />
        </div>
      )}
    </Modal>
  );
}
