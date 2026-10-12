"use client";

import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, Field, Input, Panel } from "@/components/ui/primitives";
import { ApiError, api } from "@/lib/client/api";

export function SetupForm() {
  const router = useRouter();
  const [form, setForm] = useState({ setupKey: "", displayName: "", username: "", password: "", consent: false });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.consent) return setError("Debes aceptar la política de tratamiento de datos.");
    setBusy(true);
    try {
      await api.auth.setup({ setupKey: form.setupKey, displayName: form.displayName, username: form.username, password: form.password });
      await api.auth.login(form.username, form.password);
      router.replace("/admin/ajustes");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo completar la configuración.");
      setBusy(false);
    }
  };

  return (
    <Panel corners>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label="Clave de configuración (SETUP_KEY)" hint="Está en las variables de entorno de Vercel. Bórrala después de este paso.">
          {(id, d) => (
            <Input id={id} aria-describedby={d} type="password" autoComplete="off" required value={form.setupKey} onChange={(e) => set("setupKey", e.target.value)} />
          )}
        </Field>
        <Field label="Nombre completo">
          {(id, d) => <Input id={id} aria-describedby={d} autoComplete="name" required value={form.displayName} onChange={(e) => set("displayName", e.target.value)} />}
        </Field>
        <Field label="Usuario">
          {(id, d) => (
            <Input
              id={id}
              aria-describedby={d}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              required
              value={form.username}
              onChange={(e) => set("username", e.target.value.toLowerCase())}
            />
          )}
        </Field>
        <Field label="Contraseña" hint="Mínimo 12 caracteres; una frase de varias palabras es lo más seguro y fácil de recordar.">
          {(id, d) => (
            <Input id={id} aria-describedby={d} type="password" autoComplete="new-password" required value={form.password} onChange={(e) => set("password", e.target.value)} />
          )}
        </Field>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-night/60 p-3.5 text-sm text-ink-soft">
          <input type="checkbox" checked={form.consent} onChange={(e) => set("consent", e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[var(--color-glow)]" />
          <span>
            Acepto la{" "}
            <Link href="/legal/datos" target="_blank" className="font-semibold text-glow underline-offset-4 hover:underline">
              política de tratamiento de datos
            </Link>
            .
          </span>
        </label>
        {error && (
          <p role="alert" className="rounded-xl border border-blocked/40 bg-blocked/10 px-3.5 py-2.5 text-sm text-[#ffb3b8]">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" block loading={busy} icon={<ShieldCheck className="size-5" />}>
          Crear administrador
        </Button>
      </form>
    </Panel>
  );
}
