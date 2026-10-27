"use client";

import { Eye, ShieldCheck, UserRoundCog, UsersRound, Wrench } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useSync } from "@/components/providers/sync-provider";
import { PageHeader } from "@/components/ui/kit";
import { useConfirm, useToast } from "@/components/ui/overlay";
import { Button, EmptyState } from "@/components/ui/primitives";
import { api } from "@/lib/client/api";
import type { PositionView, UserView } from "@/lib/domain/views";

type Group = "admin" | "subadmin" | "operario";

const GROUPS: Array<{ id: Group; title: string; hint: string; icon: ReactNode }> = [
  { id: "admin", title: "Administración general", hint: "Gerencia y administración", icon: <ShieldCheck className="size-4" aria-hidden /> },
  { id: "subadmin", title: "Subadministradores", hint: "Coordinación y asistencia", icon: <UserRoundCog className="size-4" aria-hidden /> },
  { id: "operario", title: "Operarios", hint: "Lo que ve cada operario en su panel", icon: <Wrench className="size-4" aria-hidden /> },
];

/** Admin accounts first, then cargos that grant admin access, then operarios. */
export function groupOf(user: UserView, positions: PositionView[]): Group | null {
  if (user.kind === "admin") return "admin";
  const position = positions.find((p) => p.id === user.positionId);
  if (!position) return null; // sin contrato vigente: no puede entrar a la app
  return position.grantsAdmin ? "subadmin" : "operario";
}

/**
 * «Cambiar de usuario» (solo gerencia y administración): abre la app tal como
 * la ve otra persona, sin su contraseña. Es solo lectura y queda en Auditoría.
 */
export function SwitchUserScreen() {
  const { data } = useSync();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const out: Record<Group, Array<{ user: UserView; position: PositionView | undefined }>> = { admin: [], subadmin: [], operario: [] };
    for (const user of data.users ?? []) {
      if (user.id === data.me.id || user.status !== "active") continue;
      const group = groupOf(user, data.positions);
      if (group) out[group].push({ user, position: data.positions.find((p) => p.id === user.positionId) });
    }
    for (const list of Object.values(out)) list.sort((a, b) => a.user.displayName.localeCompare(b.user.displayName));
    return out;
  }, [data.users, data.positions, data.me.id]);

  const enter = async (user: UserView) => {
    const ok = await confirm({
      title: `¿Entrar como ${user.displayName}?`,
      body: "Verás la app exactamente como la ve esta persona. Es solo lectura: no podrás guardar cambios. Queda registrado en Auditoría y dura máximo 2 horas.",
      confirmLabel: "Entrar",
    });
    if (!ok) return;
    setBusy(user.id);
    try {
      const { home } = await api.auth.impersonate(user.id);
      // Full reload so nothing of the admin view stays in memory.
      window.location.assign(home);
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo cambiar de usuario.", "error");
      setBusy(null);
    }
  };

  const empty = GROUPS.every((g) => grouped[g.id].length === 0);

  return (
    <>
      <PageHeader
        eyebrow="Sistema"
        title="Cambiar de usuario"
        description="Entra como otra persona para ver la app tal como la ve. Es solo lectura, dura máximo 2 horas y queda registrado en Auditoría. Arriba aparece el botón para volver a tu cuenta."
      />
      {dialog}
      {data.me.impersonator ? (
        <EmptyState icon={<Eye />} title="Ya estás viendo la app como otra persona" body="Vuelve a tu cuenta con el botón de la barra amarilla para cambiar a otro usuario." />
      ) : empty ? (
        <EmptyState icon={<UsersRound />} title="No hay otros usuarios activos" />
      ) : (
        <div className="flex flex-col gap-6">
          {GROUPS.map((g) =>
            grouped[g.id].length === 0 ? null : (
              <section key={g.id} aria-labelledby={`grupo-${g.id}`} className="hud-panel p-4 sm:p-5">
                <h2 id={`grupo-${g.id}`} className="flex items-center gap-2 font-display text-lg font-bold text-ink">
                  {g.icon}
                  {g.title}
                  <span className="text-sm font-normal text-muted">· {g.hint}</span>
                </h2>
                <ul className="mt-3 flex flex-col divide-y divide-line/70">
                  {grouped[g.id].map(({ user, position }) => (
                    <li key={user.id} className="flex flex-wrap items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-ink">{user.displayName}</p>
                        <p className="truncate text-xs text-muted">
                          @{user.username}
                          {position ? ` · ${position.title}` : ""}
                        </p>
                      </div>
                      <Button size="sm" variant="secondary" icon={<Eye className="size-4" aria-hidden />} loading={busy === user.id} disabled={busy !== null} onClick={() => enter(user)}>
                        Entrar como
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            ),
          )}
        </div>
      )}
    </>
  );
}
