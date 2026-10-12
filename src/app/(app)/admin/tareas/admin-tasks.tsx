"use client";

import { Edit3, Plus, Search, Trash2, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useSync } from "@/components/providers/sync-provider";
import { NumberInput, PageHeader, Segmented } from "@/components/ui/kit";
import { Modal, useConfirm } from "@/components/ui/overlay";
import { Button, EmptyState, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { TaskCard } from "@/components/work/task-card";
import { TaskDetailModal } from "@/components/work/task-detail";
import { api } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { PRIORITY_RANK, TASK_PRIORITY_LABEL } from "@/lib/domain/labels";
import { TASK_PRIORITIES, type Task, type TaskPriority, type TaskStatus } from "@/lib/domain/schema";

type View = "abiertas" | TaskStatus | "todas";

/** Every task of the team. Steps of work orders are edited on the OT; internal tasks here. */
export function AdminTasks() {
  const { data } = useSync();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [view, setView] = useState<View>((params.get("estado") as View | null) ?? "abiertas");
  const [position, setPosition] = useState(params.get("puesto") ?? "");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Task | "new" | null>(null);
  const { run } = useAction();
  const { confirm, dialog } = useConfirm();

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.tasks
      .filter((t) => (view === "abiertas" ? t.status !== "completada" : view === "todas" ? true : t.status === view))
      .filter((t) => !position || (position === "sin" ? !t.positionId : t.positionId === position))
      .filter((t) => !q || `${t.folio} ${t.title} ${t.piece ?? ""}`.toLowerCase().includes(q))
      .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  }, [data.tasks, view, position, query]);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const selected = params.get("t") ? data.tasks.find((t) => t.id === params.get("t")) : null;
  const briefs = data.production.orders ?? [];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="Equipo"
        title="Tareas"
        description="Las tareas que vienen de una orden de trabajo se editan en la OT; aquí puedes reasignarlas de puesto y crear tareas internas (mantenimiento, orden, inventario)."
        actions={
          <Button icon={<Plus className="size-5" />} onClick={() => setEditing("new")}>
            Tarea interna
          </Button>
        }
      />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <Segmented
          label="Estado"
          value={view}
          onChange={setView}
          options={[
            { value: "abiertas", label: "Abiertas", count: data.tasks.filter((t) => t.status !== "completada").length },
            { value: "bloqueada", label: "Bloqueadas", count: data.tasks.filter((t) => t.status === "bloqueada").length },
            { value: "en_proceso", label: "En proceso" },
            { value: "completada", label: "Hechas" },
            { value: "todas", label: "Todas" },
          ]}
        />
        <Select aria-label="Puesto" className="lg:ml-auto lg:w-56" value={position} onChange={(e) => setPosition(e.target.value)}>
          <option value="">Todos los puestos</option>
          <option value="sin">Sin asignar</option>
          {data.positions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </Select>
        <div className="relative lg:w-64">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input type="search" aria-label="Buscar tarea" placeholder="Buscar" className="pl-10" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>
      {list.length === 0 ? (
        <EmptyState title="No hay tareas con esos filtros" />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((t) => (
            <li key={t.id}>
              <TaskCard
                task={t}
                brief={briefs.find((o) => o.id === t.orderId)}
                href={`${pathname}?${new URLSearchParams({ ...Object.fromEntries(params), t: t.id })}`}
                today={data.today}
                positionTitle={data.positions.find((p) => p.id === t.positionId)?.title ?? "Sin asignar"}
              />
            </li>
          ))}
        </ul>
      )}
      {selected && (
        <TaskDetailModal
          key={selected.id}
          task={selected}
          onClose={() => setParam("t", null)}
          adminActions={
            <>
              <Button size="sm" variant="secondary" icon={<Edit3 className="size-4" />} onClick={() => setEditing(selected)}>
                {selected.orderId ? "Reasignar puesto" : "Editar"}
              </Button>
              {selected.orderId && (
                <a href={`/admin/ordenes?o=${selected.orderId}`} className="inline-flex h-9 items-center rounded-xl border border-line-strong px-3 text-sm font-semibold text-ink-soft hover:border-glow/60">
                  Ver la OT
                </a>
              )}
              {!selected.orderId && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Trash2 className="size-4" />}
                  onClick={async () => {
                    if (await confirm({ title: `¿Eliminar ${selected.folio}?`, confirmLabel: "Eliminar", danger: true })) {
                      const ok = await run("del", () => api.tasks.remove(selected.id), "Tarea eliminada");
                      if (ok) setParam("t", null);
                    }
                  }}
                >
                  Eliminar
                </Button>
              )}
              {editing && editing !== "new" && <TaskForm key={editing.id} task={editing} onClose={() => setEditing(null)} />}
              {dialog}
            </>
          }
        />
      )}
      {editing === "new" && <TaskForm key="new" task={null} onClose={() => setEditing(null)} />}
      {!selected && dialog}
    </div>
  );
}

function TaskForm({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const { data } = useSync();
  const fromOrder = Boolean(task?.orderId);
  const [form, setForm] = useState({
    title: task?.title ?? "",
    description: task?.description ?? "",
    positionId: task?.positionId ?? "",
    priority: task?.priority ?? ("normal" as TaskPriority),
    dueDate: task?.dueDate ?? "",
    piece: task?.piece ?? "",
    quantity: task?.quantity ?? (null as number | null),
    checklist: task?.checklist.map((c) => ({ id: c.id as string | undefined, text: c.text, done: c.done })) ?? [],
  });
  const [step, setStep] = useState("");
  const { run, busy } = useAction();
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    const ok = await run(
      "save",
      (): Promise<unknown> =>
        task
          ? api.tasks.update(
              task.id,
              fromOrder
                ? { positionId: form.positionId || null }
                : {
                    title: form.title,
                    description: form.description,
                    positionId: form.positionId || null,
                    priority: form.priority,
                    dueDate: form.dueDate || null,
                    piece: form.piece || null,
                    quantity: form.quantity,
                    checklist: form.checklist,
                  },
            )
          : api.tasks.create({
              title: form.title,
              description: form.description,
              positionId: form.positionId || null,
              priority: form.priority,
              dueDate: form.dueDate || null,
              piece: form.piece || null,
              quantity: form.quantity,
              checklist: form.checklist.map((c) => c.text),
            }),
      task ? "Tarea actualizada" : "Tarea creada y enviada al puesto",
    );
    if (ok) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={task ? (fromOrder ? `Reasignar ${task.folio}` : `Editar ${task.folio}`) : "Nueva tarea interna"}
      description={fromOrder ? "Los datos del trabajo se editan en la orden; aquí solo cambias el puesto." : undefined}
      footer={
        <Button loading={busy === "save"} disabled={!fromOrder && !form.title.trim()} onClick={() => void save()}>
          Guardar
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Puesto">
          {(id) => (
            <Select id={id} value={form.positionId} onChange={(e) => set("positionId", e.target.value)}>
              <option value="">Sin asignar</option>
              {data.positions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                  {p.holder ? ` · ${p.holder.name}` : " · vacante"}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {!fromOrder && (
          <>
            <Field label="Tarea">{(id) => <Input id={id} maxLength={140} value={form.title} onChange={(e) => set("title", e.target.value)} />}</Field>
            <Field label="Indicaciones">{(id) => <Textarea id={id} rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} />}</Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Prioridad">
                {(id) => (
                  <Select id={id} value={form.priority} onChange={(e) => set("priority", e.target.value as TaskPriority)}>
                    {TASK_PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {TASK_PRIORITY_LABEL[p]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Fecha límite">{(id) => <Input id={id} type="date" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} />}</Field>
              <Field label="Pieza / equipo">{(id) => <Input id={id} value={form.piece} onChange={(e) => set("piece", e.target.value)} />}</Field>
              <Field label="Cantidad">{(id) => <NumberInput id={id} integer min={1} value={form.quantity} onChange={(v) => set("quantity", v)} />}</Field>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-ink-soft">Pasos (lista de chequeo)</p>
              <ul className="mb-2 flex flex-col gap-1">
                {form.checklist.map((c, i) => (
                  <li key={c.id ?? i} className="flex items-center gap-2 rounded-lg border border-line bg-night/50 px-3 py-2 text-sm text-ink">
                    <span className="flex-1">{c.text}</span>
                    <button type="button" aria-label={`Quitar paso ${c.text}`} onClick={() => set("checklist", form.checklist.filter((_, j) => j !== i))} className="text-muted hover:text-blocked">
                      <X className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!step.trim()) return;
                  set("checklist", [...form.checklist, { id: undefined, text: step.trim(), done: false }]);
                  setStep("");
                }}
              >
                <Input aria-label="Nuevo paso" placeholder="Agregar paso" value={step} onChange={(e) => setStep(e.target.value)} />
                <Button type="submit" variant="secondary" icon={<Plus className="size-4" />} aria-label="Agregar paso" />
              </form>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
