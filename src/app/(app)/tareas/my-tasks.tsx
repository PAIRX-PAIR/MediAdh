"use client";

import { ClipboardList } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useSync } from "@/components/providers/sync-provider";
import { PageHeader, Segmented } from "@/components/ui/kit";
import { EmptyState } from "@/components/ui/primitives";
import { TaskCard } from "@/components/work/task-card";
import { TaskDetailModal } from "@/components/work/task-detail";
import { PRIORITY_RANK } from "@/lib/domain/labels";

type View = "abiertas" | "bloqueadas" | "hechas";

/** The worker's task bar: open work first, ordered by urgency and due date. */
export function MyTasks() {
  const { data } = useSync();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [view, setView] = useState<View>("abiertas");
  const mine = data.tasks.filter((t) => t.positionId === data.me.positionId);
  const briefs = data.production.briefs ?? [];
  const list = mine
    .filter((t) => (view === "abiertas" ? t.status === "pendiente" || t.status === "en_proceso" : view === "bloqueadas" ? t.status === "bloqueada" : t.status === "completada"))
    .sort((a, b) => {
      if (view === "hechas") return (b.completedAt ?? "").localeCompare(a.completedAt ?? "");
      const inProgress = Number(b.status === "en_proceso") - Number(a.status === "en_proceso");
      if (inProgress) return inProgress;
      return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
    });
  const selectedId = params.get("t");
  const selected = selectedId ? mine.find((t) => t.id === selectedId) : null;
  const close = () => {
    const next = new URLSearchParams(params);
    next.delete("t");
    const q = next.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow={data.me.positionTitle ?? "Mi puesto"} title="Mis tareas" description="Toca una orden para empezarla, reportar piezas, bloquearla o terminarla." />
      <Segmented
        label="Filtro"
        value={view}
        onChange={setView}
        options={[
          { value: "abiertas", label: "Por hacer", count: mine.filter((t) => t.status === "pendiente" || t.status === "en_proceso").length },
          { value: "bloqueadas", label: "Bloqueadas", count: mine.filter((t) => t.status === "bloqueada").length },
          { value: "hechas", label: "Hechas" },
        ]}
        className="self-start"
      />
      {list.length === 0 ? (
        <EmptyState icon={<ClipboardList />} title={view === "abiertas" ? "Nada pendiente" : view === "bloqueadas" ? "Nada bloqueado" : "Aún no hay tareas terminadas"} />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {list.map((t) => (
            <li key={t.id}>
              <TaskCard task={t} brief={briefs.find((b) => b.id === t.orderId)} href={`/tareas?t=${t.id}`} today={data.today} />
            </li>
          ))}
        </ul>
      )}
      {selected && <TaskDetailModal key={selected.id} task={selected} onClose={close} />}
    </div>
  );
}
