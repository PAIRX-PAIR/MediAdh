"use client";

import { KeyRound, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useSync } from "@/components/providers/sync-provider";
import { Button, Field, Input, Panel } from "@/components/ui/primitives";
import { ApiError, api } from "@/lib/client/api";
import { BrandMark } from "./brand-mark";
import { SignOutButton } from "./app-shell";

/**
 * First-use gate: accounts created by an admin (or after a policy update) must
 * authorise personal-data processing (Ley 1581) and replace the temporary
 * password before using the app. The server enforces the same rule.
 */
export function ProfileGate() {
  const { data, refresh } = useSync();
  const step = data.me.needsConsent ? "consent" : "password";

  return (
    <div className="hud-grid-bg flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <BrandMark className="size-11" />
          <div>
            <p className="font-display text-lg font-bold">{data.settings.workshopName}</p>
            <p className="text-sm text-muted">Hola, {data.me.displayName}. Antes de empezar:</p>
          </div>
        </div>
        <ol className="mb-4 flex gap-2 text-xs font-semibold uppercase tracking-wider" aria-label="Pasos">
          <li className={step === "consent" ? "text-glow" : "text-done"}>1 · Datos personales</li>
          <li className="text-faint">/</li>
          <li className={step === "password" ? "text-glow" : "text-faint"}>2 · Tu contraseña</li>
        </ol>
        {step === "consent" ? <ConsentStep onDone={refresh} /> : <PasswordStep onDone={refresh} />}
        <div className="mt-6">
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}

function ConsentStep({ onDone }: { onDone: () => Promise<void> }) {
  const { data } = useSync();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const company = data.settings.legal.companyName || data.settings.workshopName;
  return (
    <Panel corners>
      <div className="flex items-center gap-2 text-glow">
        <ShieldCheck className="size-5" />
        <h1 className="font-display text-xl font-semibold text-ink">Autorización de datos</h1>
      </div>
      <p className="mt-3 text-sm text-ink-soft">
        {company} usará tu nombre, usuario, teléfono, tu puesto y lo que registres en la aplicación (tareas, solicitudes y cierres) solo para
        organizar el trabajo del taller. Puedes conocer, actualizar o pedir la eliminación de tus datos cuando quieras.
      </p>
      <Link href="/legal/datos" target="_blank" className="mt-2 inline-block text-sm font-semibold text-glow underline-offset-4 hover:underline">
        Leer la política de tratamiento de datos completa
      </Link>
      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-night/60 p-3">
        <input type="checkbox" className="mt-1 size-5 accent-[var(--color-glow)]" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        <span className="text-sm text-ink">
          Autorizo de forma previa, expresa e informada el tratamiento de mis datos personales conforme a la Ley 1581 de 2012 y la política de
          tratamiento de datos.
        </span>
      </label>
      {error && <p className="mt-3 text-sm text-blocked">{error}</p>}
      <Button
        className="mt-4"
        size="lg"
        block
        disabled={!checked}
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await api.auth.acceptConsent();
            await onDone();
          } catch (e) {
            setError(e instanceof ApiError ? e.message : "No se pudo guardar.");
          } finally {
            setBusy(false);
          }
        }}
      >
        Acepto y continúo
      </Button>
    </Panel>
  );
}

function PasswordStep({ onDone }: { onDone: () => Promise<void> }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mismatch = confirm.length > 0 && confirm !== next;

  return (
    <Panel corners>
      <div className="flex items-center gap-2 text-glow">
        <KeyRound className="size-5" />
        <h1 className="font-display text-xl font-semibold text-ink">Crea tu contraseña</h1>
      </div>
      <p className="mt-2 text-sm text-ink-soft">
        Tu cuenta tiene una contraseña temporal. Cámbiala por una que solo tú conozcas. Tip: una frase de 3 palabras es fácil de recordar y difícil de
        adivinar.
      </p>
      <form
        className="mt-4 flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (mismatch) return;
          setBusy(true);
          setError(null);
          try {
            await api.auth.changePassword(current, next);
            await onDone();
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "No se pudo cambiar la contraseña.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Contraseña temporal">
          {(id, d) => <Input id={id} aria-describedby={d} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />}
        </Field>
        <Field label="Nueva contraseña" hint="Mínimo 12 caracteres.">
          {(id, d) => (
            <Input id={id} aria-describedby={d} type="password" autoComplete="new-password" minLength={12} value={next} onChange={(e) => setNext(e.target.value)} required />
          )}
        </Field>
        <Field label="Repite la nueva contraseña" error={mismatch ? "No coinciden." : null}>
          {(id, d) => (
            <Input id={id} aria-describedby={d} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          )}
        </Field>
        {error && (
          <p role="alert" className="text-sm text-blocked">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" block loading={busy} disabled={mismatch || next.length < 12}>
          Guardar y entrar
        </Button>
      </form>
    </Panel>
  );
}
