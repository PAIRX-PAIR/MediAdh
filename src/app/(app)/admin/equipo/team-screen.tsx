"use client";

import { BadgeCheck, CalendarRange, Edit3, KeyRound, Lock, LockOpen, Plus, Power, ShieldCheck, Trash2, UserCheck, UserPlus, UserX } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useSync } from "@/components/providers/sync-provider";
import { PageHeader, Segmented } from "@/components/ui/kit";
import { Modal, useConfirm } from "@/components/ui/overlay";
import { Button, Chip, EmptyState, Field, Input, Select, Textarea, cn } from "@/components/ui/primitives";
import { api } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { AREAS } from "@/lib/domain/defaults";
import { CONTRACT_STATUS_LABEL, USER_STATUS_LABEL, formatDate, formatDateTime, timeAgo } from "@/lib/domain/labels";
import { addDays } from "@/lib/domain/time";
import type { PositionView, UserView } from "@/lib/domain/views";

type Tab = "puestos" | "solicitudes" | "cuentas";

const CONTRACT_TONE = { vacante: "vacant", programado: "glow", vigente: "done", por_vencer: "pending", vencido: "blocked", terminado: "vacant" } as const;

export function TeamScreen() {
  const { data } = useSync();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const users = data.users ?? [];
  const pending = users.filter((u) => u.status === "pending");
  const tab = (params.get("tab") as Tab | null) ?? (params.get("puesto") ? "puestos" : pending.length ? "solicitudes" : "puestos");
  const [modal, setModal] = useState<
    | null
    | { kind: "approve"; user: UserView }
    | { kind: "reject"; user: UserView }
    | { kind: "contract"; position: PositionView }
    | { kind: "editContract"; position: PositionView }
    | { kind: "position"; position: PositionView | null }
    | { kind: "account" }
    | { kind: "reset"; user: UserView }
  >(null);
  const { run, busy } = useAction();
  const { confirm, dialog } = useConfirm();

  const setTab = (t: Tab) => {
    const next = new URLSearchParams(params);
    next.set("tab", t);
    next.delete("puesto");
    router.replace(`${pathname}?${next}`, { scroll: false });
  };
  const highlight = params.get("puesto");

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Equipo"
        title="Puestos, contratos y cuentas"
        description="Las tareas pertenecen al puesto, no a la persona. Si un contrato vence, el puesto queda vacante con su trabajo hasta registrar uno nuevo."
        actions={
          <>
            <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => setModal({ kind: "position", position: null })}>
              Nuevo puesto
            </Button>
            <Button icon={<UserPlus className="size-4" />} onClick={() => setModal({ kind: "account" })}>
              Crear cuenta
            </Button>
          </>
        }
      />
      <Segmented
        label="Secciones"
        value={tab}
        onChange={setTab}
        options={[
          { value: "puestos", label: "Puestos", count: data.positions.length },
          { value: "solicitudes", label: "Solicitudes de acceso", count: pending.length },
          { value: "cuentas", label: "Cuentas", count: users.filter((u) => u.status !== "pending").length },
        ]}
        className="self-start"
      />

      {tab === "puestos" && (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.positions.map((p) => {
            const c = p.contract;
            return (
              <li key={p.id} className={cn("hud-panel flex flex-col gap-3 p-4", highlight === p.id && "ring-2 ring-glow")}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 font-display text-lg font-semibold text-ink">
                      {p.title}
                      {p.grantsAdmin && <ShieldCheck className="size-4 text-glow" aria-label="Da permisos de administrador" />}
                    </p>
                    <p className="text-xs text-muted">
                      {p.area} · {p.openTasks} tareas abiertas
                    </p>
                  </div>
                  <Chip tone={CONTRACT_TONE[p.status]}>{CONTRACT_STATUS_LABEL[p.status]}</Chip>
                </div>
                {c ? (
                  <div className="rounded-xl border border-line bg-night/50 p-3 text-sm">
                    <p className="font-semibold text-ink">{c.personName}</p>
                    <p className="text-muted">
                      {formatDate(c.startDate, { day: "numeric", month: "short", year: "numeric" })} → {c.endDate ? formatDate(c.endDate, { day: "numeric", month: "short", year: "numeric" }) : "indefinido"}
                      {c.daysLeft !== null && c.daysLeft >= 0 && p.status !== "terminado" ? ` · faltan ${c.daysLeft} días` : ""}
                    </p>
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed border-vacant/40 p-3 text-sm text-vacant">Puesto vacante</p>
                )}
                <div className="flex flex-wrap gap-2">
                  {["vacante", "vencido", "terminado"].includes(p.status) ? (
                    <Button size="sm" icon={<UserCheck className="size-4" />} onClick={() => setModal({ kind: "contract", position: p })}>
                      Registrar contrato
                    </Button>
                  ) : (
                    <>
                      <Button size="sm" variant="secondary" icon={<CalendarRange className="size-4" />} onClick={() => setModal({ kind: "editContract", position: p })}>
                        Fechas
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<UserX className="size-4" />}
                        onClick={async () => {
                          if (await confirm({ title: `¿Terminar el contrato de ${c?.personName}?`, body: "El puesto queda vacante con sus tareas y la persona pierde el acceso.", confirmLabel: "Terminar", danger: true })) {
                            void run("end", () => api.admin.endContract(p.id), "Contrato terminado");
                          }
                        }}
                      >
                        Terminar
                      </Button>
                    </>
                  )}
                  <Button size="sm" variant="ghost" icon={<Edit3 className="size-4" />} onClick={() => setModal({ kind: "position", position: p })}>
                    Puesto
                  </Button>
                </div>
                {p.history && p.history.length > 0 && (
                  <details className="text-xs text-muted">
                    <summary className="cursor-pointer font-semibold">Contratos anteriores ({p.history.length})</summary>
                    <ul className="mt-1.5 flex flex-col gap-1">
                      {[...p.history].reverse().map((h) => (
                        <li key={h.id}>
                          {h.personName} · {h.startDate} → {h.endDate ?? "indefinido"}
                          {h.endedReason ? ` · ${h.endedReason}` : ""}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {tab === "solicitudes" &&
        (pending.length === 0 ? (
          <EmptyState icon={<BadgeCheck />} title="No hay solicitudes pendientes" body="Cuando alguien pida acceso desde la página de inicio, aparecerá aquí y te llegará un aviso." />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {pending.map((u) => (
              <li key={u.id} className="hud-panel flex flex-col gap-3 p-4">
                <div>
                  <p className="font-display text-lg font-semibold text-ink">{u.displayName}</p>
                  <p className="text-sm text-muted">
                    @{u.username}
                    {u.phone ? ` · ${u.phone}` : ""} · {timeAgo(u.createdAt)}
                  </p>
                </div>
                <p className="text-sm text-ink-soft">
                  Pide: <strong>{data.positions.find((p) => p.id === u.requestedPositionId)?.title ?? "sin puesto indicado"}</strong>
                </p>
                {u.registrationNote && <p className="rounded-lg bg-night/60 p-2.5 text-sm text-ink-soft">“{u.registrationNote}”</p>}
                <p className="text-xs text-faint">Autorizó el tratamiento de datos: {formatDateTime(u.consentAt)}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="success" icon={<UserCheck className="size-4" />} onClick={() => setModal({ kind: "approve", user: u })}>
                    Aprobar
                  </Button>
                  <Button size="sm" variant="ghost" icon={<UserX className="size-4" />} onClick={() => setModal({ kind: "reject", user: u })}>
                    Rechazar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ))}

      {tab === "cuentas" && (
        <div className="hud-panel overflow-x-auto p-0">
          <table className="w-full min-w-[48rem] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr className="border-b border-line">
                <th className="px-4 py-3 font-semibold">Persona</th>
                <th className="px-2 py-3 font-semibold">Tipo / puesto</th>
                <th className="px-2 py-3 font-semibold">Estado</th>
                <th className="px-2 py-3 font-semibold">Último ingreso</th>
                <th className="px-2 py-3 font-semibold">Avisos</th>
                <th className="px-4 py-3 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users
                .filter((u) => u.status !== "pending")
                .map((u) => {
                  const me = u.id === data.me.id;
                  return (
                    <tr key={u.id} className="border-b border-line/50">
                      <td className="px-4 py-2.5">
                        <span className="block font-semibold text-ink">
                          {u.displayName} {me && <span className="text-xs font-normal text-muted">(tú)</span>}
                        </span>
                        <span className="block text-xs text-muted">@{u.username}</span>
                      </td>
                      <td className="px-2 py-2.5 text-ink-soft">{u.kind === "admin" ? "Administrador" : (data.positions.find((p) => p.id === u.positionId)?.title ?? "Sin contrato vigente")}</td>
                      <td className="px-2 py-2.5">
                        <span className="flex flex-wrap gap-1">
                          <Chip tone={u.status === "active" ? "done" : u.status === "disabled" ? "vacant" : "blocked"}>{USER_STATUS_LABEL[u.status]}</Chip>
                          {u.lockedUntil && <Chip tone="blocked">Bloqueada</Chip>}
                          {u.mustChangePassword && <Chip tone="pending">Clave temporal</Chip>}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-xs text-muted">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : "Nunca"}</td>
                      <td className="tabular px-2 py-2.5 text-xs text-muted">{u.pushDevices} disp.</td>
                      <td className="px-4 py-2.5">
                        {!me && (
                          <span className="flex justify-end gap-1">
                            {u.lockedUntil && (
                              <IconAction label="Desbloquear" onClick={() => void run(`unlock-${u.id}`, () => api.admin.updateUser(u.id, { unlock: true }), "Cuenta desbloqueada")}>
                                <LockOpen className="size-4" />
                              </IconAction>
                            )}
                            <IconAction label="Restablecer contraseña" onClick={() => setModal({ kind: "reset", user: u })}>
                              <KeyRound className="size-4" />
                            </IconAction>
                            {u.status === "active" ? (
                              <IconAction
                                label="Desactivar"
                                onClick={async () => {
                                  if (await confirm({ title: `¿Desactivar a ${u.displayName}?`, body: "Pierde el acceso de inmediato en todos sus dispositivos.", confirmLabel: "Desactivar", danger: true })) {
                                    void run(`dis-${u.id}`, () => api.admin.updateUser(u.id, { status: "disabled" }), "Cuenta desactivada");
                                  }
                                }}
                              >
                                <Lock className="size-4" />
                              </IconAction>
                            ) : (
                              u.status === "disabled" && (
                                <IconAction label="Activar" onClick={() => void run(`act-${u.id}`, () => api.admin.updateUser(u.id, { status: "active" }), "Cuenta activada")}>
                                  <Power className="size-4" />
                                </IconAction>
                              )
                            )}
                            <IconAction
                              label="Eliminar cuenta"
                              onClick={async () => {
                                if (await confirm({ title: `¿Eliminar la cuenta de ${u.displayName}?`, body: "Se borran sus datos de acceso. El histórico de trabajo se conserva.", confirmLabel: "Eliminar", danger: true })) {
                                  void run(`del-${u.id}`, () => api.admin.deleteUser(u.id), "Cuenta eliminada");
                                }
                              }}
                            >
                              <Trash2 className="size-4" />
                            </IconAction>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      {modal?.kind === "approve" && <ApproveModal user={modal.user} onClose={() => setModal(null)} />}
      {modal?.kind === "reject" && (
        <ReasonModal
          title={`Rechazar a ${modal.user.displayName}`}
          label="Motivo (opcional, la persona no lo ve)"
          confirmLabel="Rechazar"
          busy={busy === "reject"}
          onClose={() => setModal(null)}
          onConfirm={async (reason) => {
            const ok = await run("reject", () => api.admin.reject(modal.user.id, reason), "Solicitud rechazada");
            if (ok) setModal(null);
          }}
        />
      )}
      {modal?.kind === "contract" && <ContractModal position={modal.position} onClose={() => setModal(null)} />}
      {modal?.kind === "editContract" && <EditContractModal position={modal.position} onClose={() => setModal(null)} />}
      {modal?.kind === "position" && <PositionModal position={modal.position} onClose={() => setModal(null)} />}
      {modal?.kind === "account" && <AccountModal onClose={() => setModal(null)} />}
      {modal?.kind === "reset" && <ResetModal user={modal.user} onClose={() => setModal(null)} />}
      {dialog}
    </div>
  );
}

function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="grid size-9 place-items-center rounded-lg border border-line text-muted hover:border-glow/60 hover:text-ink">
      {children}
    </button>
  );
}

function TermsFields({ start, end, setStart, setEnd }: { start: string; end: string; setStart: (v: string) => void; setEnd: (v: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Inicio">{(id) => <Input id={id} type="date" value={start} onChange={(e) => setStart(e.target.value)} />}</Field>
      <Field label="Fin" hint="Vacío = indefinido">
        {(id, d) => <Input id={id} aria-describedby={d} type="date" min={start} value={end} onChange={(e) => setEnd(e.target.value)} />}
      </Field>
    </div>
  );
}

function ApproveModal({ user, onClose }: { user: UserView; onClose: () => void }) {
  const { data } = useSync();
  const [mode, setMode] = useState<"staff" | "admin">("staff");
  const [positionId, setPositionId] = useState(user.requestedPositionId ?? "");
  const [start, setStart] = useState(data.today);
  const [end, setEnd] = useState(addDays(data.today, 90));
  const [replace, setReplace] = useState(false);
  const { run, busy } = useAction();
  const position = data.positions.find((p) => p.id === positionId);
  const taken = position && !["vacante", "vencido", "terminado"].includes(position.status);
  return (
    <Modal
      open
      onClose={onClose}
      title={`Aprobar a ${user.displayName}`}
      size="md"
      footer={
        <Button
          variant="success"
          loading={busy === "approve"}
          disabled={mode === "staff" && (!positionId || (taken && !replace))}
          icon={<UserCheck className="size-4" />}
          onClick={async () => {
            const ok = await run(
              "approve",
              () => api.admin.approve(user.id, mode === "admin" ? { mode } : { mode, positionId, startDate: start, endDate: end || null, replaceCurrent: replace }),
              "Acceso aprobado",
            );
            if (ok) onClose();
          }}
        >
          Aprobar
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Segmented
          label="Tipo de acceso"
          value={mode}
          onChange={setMode}
          options={[
            { value: "staff", label: "Operario con puesto" },
            { value: "admin", label: "Administrador" },
          ]}
          className="[&>button]:flex-1 [&>button]:justify-center"
        />
        {mode === "staff" ? (
          <>
            <Field label="Puesto">
              {(id) => (
                <Select id={id} value={positionId} onChange={(e) => setPositionId(e.target.value)}>
                  <option value="">Elige el puesto…</option>
                  {data.positions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} · {CONTRACT_STATUS_LABEL[p.status]}
                      {p.holder ? ` (${p.holder.name})` : ""}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <TermsFields start={start} end={end} setStart={setStart} setEnd={setEnd} />
            {taken && (
              <label className="flex items-start gap-3 rounded-xl border border-pending/40 bg-pending/10 p-3 text-sm text-pending">
                <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="mt-0.5 size-5 accent-[var(--color-pending)]" />
                Reemplazar el contrato actual de {position?.holder?.name ?? "otra persona"} (termina hoy).
              </label>
            )}
          </>
        ) : (
          <p className="text-sm text-ink-soft">Tendrá acceso a toda la consola de administración, sin puesto ni contrato.</p>
        )}
      </div>
    </Modal>
  );
}

function ContractModal({ position, onClose }: { position: PositionView; onClose: () => void }) {
  const { data } = useSync();
  const candidates = (data.users ?? []).filter((u) => u.kind === "staff" && u.status === "active" && !u.positionId);
  const [userId, setUserId] = useState(candidates[0]?.id ?? "");
  const [start, setStart] = useState(data.today);
  const [end, setEnd] = useState(addDays(data.today, 90));
  const [notes, setNotes] = useState("");
  const { run, busy } = useAction();
  return (
    <Modal
      open
      onClose={onClose}
      title={`Contrato · ${position.title}`}
      size="md"
      footer={
        <Button
          loading={busy === "c"}
          disabled={!userId}
          onClick={async () => {
            const ok = await run("c", () => api.admin.assignContract(position.id, { userId, startDate: start, endDate: end || null, notes: notes || null }), "Contrato registrado");
            if (ok) onClose();
          }}
        >
          Registrar contrato
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {candidates.length === 0 ? (
          <p className="rounded-xl border border-line bg-night/50 p-3 text-sm text-ink-soft">
            No hay cuentas de operario libres. Crea la cuenta con «Crear cuenta» o aprueba una solicitud de acceso.
          </p>
        ) : (
          <Field label="Persona">
            {(id) => (
              <Select id={id} value={userId} onChange={(e) => setUserId(e.target.value)}>
                {candidates.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName} (@{u.username})
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <TermsFields start={start} end={end} setStart={setStart} setEnd={setEnd} />
        <Field label="Notas (opcional)">{(id) => <Textarea id={id} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
      </div>
    </Modal>
  );
}

function EditContractModal({ position, onClose }: { position: PositionView; onClose: () => void }) {
  const c = position.contract!;
  const [start, setStart] = useState(c.startDate);
  const [end, setEnd] = useState(c.endDate ?? "");
  const { run, busy } = useAction();
  return (
    <Modal
      open
      onClose={onClose}
      title={`Fechas del contrato · ${c.personName}`}
      size="sm"
      footer={
        <Button
          loading={busy === "e"}
          onClick={async () => {
            const ok = await run("e", () => api.admin.updateContract(position.id, { startDate: start, endDate: end || null, notes: c.notes }), "Contrato actualizado");
            if (ok) onClose();
          }}
        >
          Guardar
        </Button>
      }
    >
      <TermsFields start={start} end={end} setStart={setStart} setEnd={setEnd} />
    </Modal>
  );
}

function PositionModal({ position, onClose }: { position: PositionView | null; onClose: () => void }) {
  const [title, setTitle] = useState(position?.title ?? "");
  const [area, setArea] = useState<string>(position?.area ?? "Torneado");
  const [grantsAdmin, setGrantsAdmin] = useState(position?.grantsAdmin ?? false);
  const { run, busy } = useAction();
  const { confirm, dialog } = useConfirm();
  return (
    <Modal
      open
      onClose={onClose}
      title={position ? `Puesto · ${position.title}` : "Nuevo puesto"}
      size="sm"
      footer={
        <>
          {position && (
            <Button
              variant="ghost"
              className="mr-auto"
              icon={<Trash2 className="size-4" />}
              onClick={async () => {
                if (await confirm({ title: `¿Eliminar ${position.title}?`, body: "Solo si no tiene contrato vigente ni tareas abiertas.", confirmLabel: "Eliminar", danger: true })) {
                  const ok = await run("d", () => api.admin.deletePosition(position.id), "Puesto eliminado");
                  if (ok) onClose();
                }
              }}
            >
              Eliminar
            </Button>
          )}
          <Button
            loading={busy === "s"}
            disabled={!title.trim()}
            onClick={async () => {
              const ok = await run(
                "s",
                (): Promise<unknown> => (position ? api.admin.updatePosition(position.id, { title, area, grantsAdmin }) : api.admin.createPosition({ title, area, grantsAdmin })),
                position ? "Puesto actualizado" : "Puesto creado",
              );
              if (ok) onClose();
            }}
          >
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Nombre del puesto">{(id) => <Input id={id} maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
        <Field label="Área">
          {(id) => (
            <Select id={id} value={area} onChange={(e) => setArea(e.target.value)}>
              {AREAS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <label className="flex items-start gap-3 rounded-xl border border-line bg-night/50 p-3 text-sm text-ink-soft">
          <input type="checkbox" checked={grantsAdmin} onChange={(e) => setGrantsAdmin(e.target.checked)} className="mt-0.5 size-5 accent-[var(--color-glow)]" />
          Quien ocupe este puesto es administrador (como el Coordinador de producción).
        </label>
      </div>
      {dialog}
    </Modal>
  );
}

function AccountModal({ onClose }: { onClose: () => void }) {
  const { data } = useSync();
  const [form, setForm] = useState({
    displayName: "",
    username: "",
    tempPassword: "",
    phone: "",
    kind: "staff" as "staff" | "admin",
    adminScope: "total" as "total" | "gestion",
    positionId: "",
    start: data.today,
    end: "",
  });
  const { run, busy } = useAction();
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  // Operarios don't sign in (unless Ajustes allows it); coordinación and asistencia positions do.
  const position = data.positions.find((p) => p.id === form.positionId);
  const needsLogin = form.kind === "admin" || Boolean(position?.grantsAdmin) || data.settings.staffLogin;
  return (
    <Modal
      open
      onClose={onClose}
      title={needsLogin ? "Crear cuenta" : "Registrar operario"}
      description={
        needsLogin
          ? "La persona entra con esta contraseña temporal y debe cambiarla y autorizar el tratamiento de datos."
          : "Los operarios no inician sesión: quedan registrados para sus máquinas, el tablero del taller, las tareas y la nómina."
      }
      size="md"
      footer={
        <Button
          loading={busy === "a"}
          disabled={!form.displayName || (needsLogin && (!form.username || form.tempPassword.length < 12)) || (form.kind === "staff" && !form.positionId)}
          icon={<UserPlus className="size-4" />}
          onClick={async () => {
            const ok = await run(
              "a",
              () =>
                api.admin.createAccount({
                  displayName: form.displayName,
                  username: needsLogin ? form.username : "",
                  tempPassword: needsLogin ? form.tempPassword : "",
                  adminScope: form.adminScope,
                  phone: form.phone || null,
                  kind: form.kind,
                  positionId: form.kind === "staff" ? form.positionId : null,
                  startDate: form.start,
                  endDate: form.end || null,
                }),
              needsLogin ? "Cuenta creada" : "Operario registrado",
            );
            if (ok) onClose();
          }}
        >
          Crear
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Segmented
          label="Tipo"
          value={form.kind}
          onChange={(v) => set("kind", v)}
          options={[
            { value: "staff", label: "Con puesto" },
            { value: "admin", label: "Administrador" },
          ]}
          className="[&>button]:flex-1 [&>button]:justify-center"
        />
        {form.kind === "admin" && (
          <Field label="Acceso" hint="Gestión: opera todo, pero no cambia Ajustes, Equipo, sueldos ni ve la auditoría.">
            {(id, d) => (
              <Select id={id} aria-describedby={d} value={form.adminScope} onChange={(e) => set("adminScope", e.target.value as "total" | "gestion")}>
                <option value="total">Total (gerencia y administración)</option>
                <option value="gestion">Gestión (coordinación y asistencia)</option>
              </Select>
            )}
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre completo">{(id) => <Input id={id} value={form.displayName} onChange={(e) => set("displayName", e.target.value)} />}</Field>
          {needsLogin && (
            <>
              <Field label="Usuario">{(id) => <Input id={id} autoCapitalize="none" value={form.username} onChange={(e) => set("username", e.target.value.toLowerCase())} />}</Field>
              <Field label="Contraseña temporal" hint="Mínimo 12 caracteres.">
                {(id, d) => <Input id={id} aria-describedby={d} autoComplete="new-password" value={form.tempPassword} onChange={(e) => set("tempPassword", e.target.value)} />}
              </Field>
            </>
          )}
          <Field label="Celular">{(id) => <Input id={id} type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} />}</Field>
        </div>
        {form.kind === "staff" && (
          <>
            <Field label="Puesto">
              {(id) => (
                <Select id={id} value={form.positionId} onChange={(e) => set("positionId", e.target.value)}>
                  <option value="">Elige…</option>
                  {data.positions
                    .filter((p) => ["vacante", "vencido", "terminado"].includes(p.status))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                </Select>
              )}
            </Field>
            <TermsFields start={form.start} end={form.end} setStart={(v) => set("start", v)} setEnd={(v) => set("end", v)} />
          </>
        )}
      </div>
    </Modal>
  );
}

function ResetModal({ user, onClose }: { user: UserView; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const { run, busy } = useAction();
  return (
    <Modal
      open
      onClose={onClose}
      title={`Nueva contraseña temporal · ${user.displayName}`}
      description="Cierra sus sesiones abiertas; al entrar deberá cambiarla."
      size="sm"
      footer={
        <Button
          loading={busy === "r"}
          disabled={password.length < 12}
          icon={<KeyRound className="size-4" />}
          onClick={async () => {
            const ok = await run("r", () => api.admin.resetPassword(user.id, password), "Contraseña restablecida");
            if (ok) onClose();
          }}
        >
          Restablecer
        </Button>
      }
    >
      <Field label="Contraseña temporal" hint="Mínimo 12 caracteres. Entrégasela en persona.">
        {(id, d) => <Input id={id} aria-describedby={d} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
      </Field>
    </Modal>
  );
}

function ReasonModal({ title, label, confirmLabel, busy, onClose, onConfirm }: { title: string; label: string; confirmLabel: string; busy: boolean; onClose: () => void; onConfirm: (reason: string | null) => void }) {
  const [reason, setReason] = useState("");
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <Button variant="danger" loading={busy} onClick={() => onConfirm(reason.trim() || null)}>
          {confirmLabel}
        </Button>
      }
    >
      <Field label={label}>{(id) => <Input id={id} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
    </Modal>
  );
}
