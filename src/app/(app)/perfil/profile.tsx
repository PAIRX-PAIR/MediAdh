"use client";

import { Download, FileText, KeyRound, LogOut, MonitorSmartphone } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useSync } from "@/components/providers/sync-provider";
import { InstallButton, PushCard } from "@/components/pwa/push-card";
import { SignOutButton } from "@/components/shell/app-shell";
import { KeyValues, PageHeader } from "@/components/ui/kit";
import { useConfirm, useToast } from "@/components/ui/overlay";
import { Button, Field, Input, Panel } from "@/components/ui/primitives";
import { ApiError, api } from "@/lib/client/api";
import { CONTRACT_STATUS_LABEL, formatDate } from "@/lib/domain/labels";

export function Profile() {
  const { data } = useSync();
  const router = useRouter();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    setBusy("pw");
    setError(null);
    try {
      await api.auth.changePassword(current, next);
      toast("Contraseña cambiada. Las demás sesiones se cerraron.");
      setCurrent("");
      setNext("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cambiar la contraseña.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Mi cuenta" title={data.me.displayName} description={`@${data.me.username}`} />

      <Panel>
        <KeyValues
          items={[
            ["Tipo de cuenta", data.me.isAdmin ? "Administrador" : "Operario"],
            ["Puesto", data.me.positionTitle ?? "—"],
            ["Contrato", data.me.contractStatus ? `${CONTRACT_STATUS_LABEL[data.me.contractStatus]}${data.me.contractEndDate ? ` · hasta ${formatDate(data.me.contractEndDate, { day: "numeric", month: "long", year: "numeric" })}` : ""}` : "—"],
            ["Celular", data.me.phone ?? "—"],
          ]}
        />
      </Panel>

      <PushCard />

      <div className="flex flex-wrap gap-2">
        <InstallButton />
      </div>

      <Panel>
        <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold text-ink">
          <KeyRound className="size-5 text-glow" aria-hidden /> Cambiar contraseña
        </h2>
        <form onSubmit={changePassword} className="flex flex-col gap-4">
          <input type="text" name="username" autoComplete="username" value={data.me.username} readOnly hidden />
          <Field label="Contraseña actual">{(id) => <Input id={id} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />}</Field>
          <Field label="Nueva contraseña" hint="Mínimo 12 caracteres. Una frase de 3 palabras funciona muy bien.">
            {(id, d) => <Input id={id} aria-describedby={d} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />}
          </Field>
          {error && (
            <p role="alert" className="text-sm text-blocked">
              {error}
            </p>
          )}
          <Button type="submit" loading={busy === "pw"} disabled={!current || next.length < 12} className="self-start">
            Guardar contraseña
          </Button>
        </form>
      </Panel>

      <Panel>
        <h2 className="mb-1 font-display text-lg font-semibold text-ink">Tus datos</h2>
        <p className="mb-3 text-sm text-muted">Tienes derecho a conocer todo lo que guardamos sobre ti (Ley 1581 de 2012).</p>
        <div className="flex flex-wrap gap-2">
          <a href={api.me.exportUrl} download className="inline-flex h-11 items-center gap-2 rounded-xl border border-line-strong px-4 font-display text-sm font-semibold text-ink-soft hover:border-glow/60 hover:text-ink">
            <Download className="size-4" aria-hidden /> Exportar mis datos
          </a>
          <Link href="/legal/datos" className="inline-flex h-11 items-center gap-2 rounded-xl border border-line-strong px-4 font-display text-sm font-semibold text-ink-soft hover:border-glow/60 hover:text-ink">
            <FileText className="size-4" aria-hidden /> Política de datos
          </Link>
        </div>
      </Panel>

      <Panel>
        <h2 className="mb-1 font-display text-lg font-semibold text-ink">Sesiones</h2>
        <p className="mb-3 text-sm text-muted">Si perdiste un celular o alguien conoce tu contraseña, cierra la sesión en todos los dispositivos.</p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            loading={busy === "all"}
            icon={<MonitorSmartphone className="size-4" />}
            onClick={async () => {
              if (!(await confirm({ title: "¿Cerrar sesión en todos los dispositivos?", body: "Tendrás que volver a entrar en cada uno, incluido este.", confirmLabel: "Cerrar todas" }))) return;
              setBusy("all");
              await api.auth.logoutEverywhere().catch(() => undefined);
              router.replace("/?acceso=1");
              router.refresh();
            }}
          >
            <LogOut className="sr-only" aria-hidden />
            Cerrar en todos los dispositivos
          </Button>
          <div className="w-full sm:w-auto">
            <SignOutButton />
          </div>
        </div>
      </Panel>
      {dialog}
    </div>
  );
}
