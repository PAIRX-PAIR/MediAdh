"use client";

import { Megaphone, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { useSync } from "@/components/providers/sync-provider";
import { PageHeader, Segmented } from "@/components/ui/kit";
import { Button, EmptyState, Field, Input, Panel, Textarea, cn } from "@/components/ui/primitives";
import { api } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { formatDate, timeAgo } from "@/lib/domain/labels";

/** Announcements shown in the ticker for everybody; "importante" also pops up and rings. */
export default function AnnouncementsPage() {
  const { data } = useSync();
  const [text, setText] = useState("");
  const [level, setLevel] = useState<"info" | "importante">("info");
  const [expiresAt, setExpiresAt] = useState("");
  const { run, busy } = useAction();

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Equipo" title="Avisos del taller" description="Aparecen en la cinta superior de todos. Los importantes abren una ventana con sonido y llegan al celular." />
      <Panel corners>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run("post", () => api.admin.createAnnouncement({ text: text.trim(), level, expiresAt: expiresAt || null }), "Aviso publicado");
            if (ok) {
              setText("");
              setExpiresAt("");
              setLevel("info");
            }
          }}
        >
          <Field label="Mensaje">{(id) => <Textarea id={id} rows={2} maxLength={280} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ej: Mañana hay mantenimiento del compresor de 7 a 8 a. m." />}</Field>
          <div className="flex flex-wrap items-end gap-3">
            <Segmented
              label="Nivel"
              value={level}
              onChange={setLevel}
              options={[
                { value: "info", label: "Informativo" },
                { value: "importante", label: "Importante" },
              ]}
            />
            <Field label="Visible hasta (opcional)">{(id) => <Input id={id} type="date" min={data.today} value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />}</Field>
            <Button type="submit" className="ml-auto" loading={busy === "post"} disabled={!text.trim()} icon={<Send className="size-4" />}>
              Publicar
            </Button>
          </div>
        </form>
      </Panel>
      {data.announcements.length === 0 ? (
        <EmptyState icon={<Megaphone />} title="Sin avisos vigentes" />
      ) : (
        <ul className="flex flex-col gap-2">
          {data.announcements.map((a) => (
            <li key={a.id} className={cn("hud-panel flex items-start gap-3 p-4", a.level === "importante" && "border-pending/50")}>
              <Megaphone className={cn("mt-0.5 size-5 shrink-0", a.level === "importante" ? "text-pending" : "text-glow")} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-ink">{a.text}</p>
                <p className="mt-1 text-xs text-faint">
                  {a.authorName} · {timeAgo(a.createdAt)}
                  {a.expiresAt ? ` · hasta ${formatDate(a.expiresAt)}` : ""}
                </p>
              </div>
              <Button size="sm" variant="ghost" aria-label="Retirar aviso" loading={busy === a.id} icon={<Trash2 className="size-4" />} onClick={() => void run(a.id, () => api.admin.deleteAnnouncement(a.id), "Aviso retirado")} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
