"use client";

import { motion } from "motion/react";
import { CheckCircle2, Eye, EyeOff, KeyRound, LogIn, UserPlus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Segmented } from "@/components/ui/kit";
import { Modal } from "@/components/ui/overlay";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { ApiError, api } from "@/lib/client/api";
import type { PublicInfo } from "@/lib/domain/views";

type Tab = "entrar" | "registro";

const REASONS: Record<string, string> = {
  pending: "Tu solicitud está pendiente. El coordinador debe aprobarla y asignarte un puesto.",
  rejected: "Tu solicitud de acceso no fue aprobada. Habla con el coordinador.",
  disabled: "Tu cuenta está desactivada. Habla con el coordinador.",
  no_contract: "No tienes un contrato vigente. El acceso se habilita cuando el coordinador registre tu contrato.",
  contract_not_started: "Tu contrato aún no ha iniciado.",
};

/**
 * "Iniciar sesión / Crear cuenta" popup. Opens with ?acceso=1 (the proxy sends
 * signed-out visitors here with ?volver=), shows why access was denied with
 * ?motivo= and an expired-session notice with ?expirada=1.
 */
export function AccessDialog({ info }: { info: PublicInfo }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const open = params.get("acceso") === "1" || params.get("acceso") === "registro";
  const [tab, setTab] = useState<Tab>(params.get("acceso") === "registro" ? "registro" : "entrar");
  const reason = params.get("motivo");
  const expired = params.get("expirada") === "1";

  const close = () => {
    const next = new URLSearchParams(params);
    for (const k of ["acceso", "motivo", "expirada", "volver"]) next.delete(k);
    const q = next.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={tab === "entrar" ? "Iniciar sesión" : "Crear cuenta"}
      description={info.workshopName}
      size="md"
    >
      <Segmented
        label="Acceso"
        value={tab}
        onChange={setTab}
        options={[
          { value: "entrar", label: "Iniciar sesión" },
          { value: "registro", label: "Crear cuenta" },
        ]}
        className="mb-4 w-full [&>button]:flex-1 [&>button]:justify-center"
      />
      {(reason || expired) && (
        <p role="alert" className="mb-4 rounded-xl border border-pending/40 bg-pending/10 px-3.5 py-2.5 text-sm text-pending">
          {expired ? "Tu sesión terminó. Vuelve a entrar." : (REASONS[reason!] ?? "No tienes acceso en este momento.")}
        </p>
      )}
      {tab === "entrar" ? <LoginForm info={info} /> : <RegisterForm info={info} onDone={() => setTab("entrar")} />}
    </Modal>
  );
}

function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: "current-password" | "new-password";
  describedBy?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={describedBy}
        className="pr-12"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        aria-pressed={visible}
        className="absolute right-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-lg text-muted hover:text-ink"
      >
        {visible ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
      </button>
    </div>
  );
}

function LoginForm({ info }: { info: PublicInfo }) {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.auth.login(username, password);
      const session = await api.session();
      const back = params.get("volver");
      // Only same-site paths are followed (no open redirect).
      const safeBack = back && back.startsWith("/") && !back.startsWith("//") ? back : null;
      const home = session.status === "ok" && session.user.isAdmin ? "/admin" : "/panel";
      router.replace(safeBack ?? home);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo iniciar sesión.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field label="Usuario">
        {(id, d) => (
          <Input
            id={id}
            aria-describedby={d}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        )}
      </Field>
      <Field label="Contraseña">{(id, d) => <PasswordInput id={id} describedBy={d} value={password} onChange={setPassword} autoComplete="current-password" />}</Field>
      {error && (
        <p role="alert" className="rounded-xl border border-blocked/40 bg-blocked/10 px-3.5 py-2.5 text-sm text-[#ffb3b8]">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" block loading={busy} icon={<LogIn className="size-5" />}>
        Entrar
      </Button>
      {info.demo && (
        <div className="rounded-xl border border-vacant/40 bg-vacant/10 p-3 text-sm">
          <p className="mb-2 font-semibold text-vacant">Demostración con datos ficticios</p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setUsername(info.demo!.username);
                setPassword(info.demo!.password);
              }}
            >
              Entrar como coordinador
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setUsername(info.demo!.worker.username);
                setPassword(info.demo!.worker.password);
              }}
            >
              Entrar como tornero
            </Button>
          </div>
        </div>
      )}
      {info.needsSetup && (
        <p className="text-center text-sm text-muted">
          ¿Primera vez?{" "}
          <Link href="/setup" className="font-semibold text-glow underline-offset-4 hover:underline">
            Crea el administrador inicial
          </Link>
        </p>
      )}
    </form>
  );
}

function RegisterForm({ info, onDone }: { info: PublicInfo; onDone: () => void }) {
  const [form, setForm] = useState({
    displayName: "",
    username: "",
    password: "",
    phone: "",
    requestedPositionId: "",
    note: "",
    accessCode: "",
    consent: false,
    website: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  // Suggest a username from the name, the way people usually write it ("ana.torres").
  const suggestion = form.displayName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join(".")
    .replace(/[^a-z0-9.]/g, "");

  if (!info.registrationOpen) {
    return <p className="rounded-xl border border-line bg-white/5 p-4 text-sm text-ink-soft">El registro de nuevas cuentas está cerrado. Pide al coordinador que te cree la cuenta.</p>;
  }

  if (done) {
    return (
      <motion.div initial={{ opacity: 0, transform: "translateY(8px)" }} animate={{ opacity: 1, transform: "translateY(0px)" }} className="flex flex-col items-center gap-3 py-4 text-center">
        <CheckCircle2 className="size-12 text-done" aria-hidden />
        <p className="font-display text-lg font-semibold text-ink">Solicitud enviada</p>
        <p className="text-sm text-ink-soft">{done}</p>
        <Button variant="secondary" onClick={onDone}>
          Ir a iniciar sesión
        </Button>
      </motion.div>
    );
  }

  const tooShort = form.password.length > 0 && form.password.length < 12;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.consent) return setError("Debes autorizar el tratamiento de tus datos personales para continuar.");
    setBusy(true);
    try {
      const res = await api.auth.register({
        displayName: form.displayName,
        username: form.username,
        password: form.password,
        phone: form.phone || null,
        requestedPositionId: form.requestedPositionId || null,
        note: form.note || null,
        accessCode: form.accessCode || null,
        consent: form.consent,
        website: form.website || null,
      });
      setDone(res.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo enviar la solicitud.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <p className="text-sm text-muted">Tu cuenta queda pendiente hasta que el coordinador la apruebe y te asigne un puesto.</p>
      <Field label="Nombre completo">
        {(id, d) => <Input id={id} aria-describedby={d} autoComplete="name" required maxLength={80} value={form.displayName} onChange={(e) => set("displayName", e.target.value)} />}
      </Field>
      <Field label="Usuario" hint="Con este nombre entras. Minúsculas, números y punto. Ej: ana.torres">
        {(id, d) => (
          <Input
            id={id}
            aria-describedby={d}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            maxLength={32}
            value={form.username}
            placeholder={suggestion.length >= 3 ? suggestion : undefined}
            onChange={(e) => set("username", e.target.value.toLowerCase())}
          />
        )}
      </Field>
      <Field label="Contraseña" hint="Mínimo 12 caracteres. Lo más fácil: una frase de 3 palabras, por ejemplo «torno azul mañana»." error={tooShort ? `Faltan ${12 - form.password.length} caracteres.` : null}>
        {(id, d) => <PasswordInput id={id} describedBy={d} value={form.password} onChange={(v) => set("password", v)} autoComplete="new-password" />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Celular (opcional)">
          {(id, d) => <Input id={id} aria-describedby={d} type="tel" autoComplete="tel" inputMode="tel" maxLength={30} value={form.phone} onChange={(e) => set("phone", e.target.value)} />}
        </Field>
        <Field label="¿En qué puesto trabajas?">
          {(id, d) => (
            <Select id={id} aria-describedby={d} value={form.requestedPositionId} onChange={(e) => set("requestedPositionId", e.target.value)}>
              <option value="">Prefiero no decir</option>
              {info.positions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Field label="Nota para el coordinador (opcional)">
        {(id, d) => <Textarea id={id} aria-describedby={d} rows={2} maxLength={300} value={form.note} onChange={(e) => set("note", e.target.value)} />}
      </Field>
      {info.requiresAccessCode && (
        <Field label="Código del taller" hint="Te lo da el coordinador.">
          {(id, d) => (
            <Input id={id} aria-describedby={d} autoComplete="off" autoCapitalize="none" required value={form.accessCode} onChange={(e) => set("accessCode", e.target.value)} />
          )}
        </Field>
      )}
      {/* Honeypot: invisible to people, irresistible to bots. */}
      <div aria-hidden className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
        <label>
          Sitio web
          <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => set("website", e.target.value)} />
        </label>
      </div>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-night/60 p-3.5">
        <input
          type="checkbox"
          checked={form.consent}
          onChange={(e) => set("consent", e.target.checked)}
          className="mt-0.5 size-5 shrink-0 accent-[var(--color-glow)]"
        />
        <span className="text-sm text-ink-soft">
          Autorizo a {info.legal.companyName || info.workshopName} a tratar mis datos personales para gestionar mi trabajo en el taller, según la{" "}
          <Link href="/legal/datos" target="_blank" className="font-semibold text-glow underline-offset-4 hover:underline">
            política de tratamiento de datos
          </Link>{" "}
          (Ley 1581 de 2012).
        </span>
      </label>
      {error && (
        <p role="alert" className="rounded-xl border border-blocked/40 bg-blocked/10 px-3.5 py-2.5 text-sm text-[#ffb3b8]">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" block loading={busy} icon={<UserPlus className="size-5" />}>
        Solicitar acceso
      </Button>
      <p className="flex items-center justify-center gap-1.5 text-xs text-faint">
        <KeyRound className="size-3.5" aria-hidden /> Tu contraseña se guarda cifrada; nadie puede verla.
      </p>
    </form>
  );
}
