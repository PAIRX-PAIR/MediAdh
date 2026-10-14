"use client";

import { ChevronLeft, ChevronRight, Plus, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { MoneyInput, Segmented } from "@/components/ui/kit";
import { Modal, useConfirm } from "@/components/ui/overlay";
import { Button, Field, IconButton, Input, Spinner } from "@/components/ui/primitives";
import { api, type PayrollReport } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { formatDate } from "@/lib/domain/labels";
import { formatCop } from "@/lib/domain/quote";

/**
 * Pagos de una persona (gerencia y administración): sueldo mensual, auxilio de
 * transporte y bonificaciones o descuentos de cada quincena, con el neto al día.
 */
export function PayEditorModal({ userId, name, onClose, onSaved }: { userId: string; name: string; onClose: () => void; onSaved?: () => void }) {
  const [quincena, setQuincena] = useState<string | undefined>(undefined);
  const [report, setReport] = useState<PayrollReport | null>(null);
  const [version, setVersion] = useState(0);
  const reload = () => setVersion((v) => v + 1);

  useEffect(() => {
    api.payroll
      .report(quincena)
      .then(setReport)
      .catch(() => undefined);
  }, [quincena, version]);

  const person = report?.people.find((p) => p.id === userId);
  const line = report?.lines.find((l) => l.userId === userId);

  return (
    <Modal open onClose={onClose} title={`Pagos · ${name}`} description="Solo gerencia y administración ven y editan esta información." size="lg">
      {!report ? (
        <Spinner />
      ) : (
        <div className="flex flex-col gap-5">
          <SalaryForm
            key={`${userId}-${person?.monthlySalary}-${person?.transportAllowance}`}
            userId={userId}
            salary={person?.monthlySalary ?? null}
            transport={person?.transportAllowance ?? false}
            onSaved={() => {
              reload();
              onSaved?.();
            }}
          />

          <section aria-labelledby="ajustes-title" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="ajustes-title" className="font-semibold text-ink">
                Quincena del {formatDate(report.quincena.from, { day: "numeric" })} al {formatDate(report.quincena.to, { day: "numeric", month: "long" })}
              </h3>
              <span className="flex items-center gap-1">
                <IconButton label="Quincena anterior" onClick={() => setQuincena(report.previous)}>
                  <ChevronLeft className="size-5" />
                </IconButton>
                <IconButton label="Quincena siguiente" onClick={() => setQuincena(report.next)}>
                  <ChevronRight className="size-5" />
                </IconButton>
              </span>
            </div>
            <AdjustmentsEditor userId={userId} report={report} onChanged={reload} />
            {line && (
              <dl className="tabular flex flex-col gap-1 rounded-xl border border-line bg-night/40 p-3 text-sm">
                <Row label={`Básico (${line.paidDays} días)`} value={formatCop(line.basic)} />
                <Row label="Horas extra" value={formatCop(line.extrasTotal)} />
                <Row label="Auxilio de transporte" value={formatCop(line.transport)} />
                <Row label="Bonificaciones" value={formatCop(line.bonuses)} />
                <Row label="Salud y pensión" value={`− ${formatCop(line.health + line.pension)}`} />
                <Row label="Descuentos" value={`− ${formatCop(line.otherDeductions)}`} />
                <div className="mt-1 flex justify-between border-t border-line pt-1 font-semibold">
                  <dt className="text-ink">Neto a pagar (pago {formatDate(report.quincena.payDate, { day: "numeric", month: "short" })})</dt>
                  <dd className="text-glow">{formatCop(line.net)}</dd>
                </div>
              </dl>
            )}
          </section>

          <p className="text-xs text-muted">
            Recargos de horas extra, salud, pensión y valor del auxilio:{" "}
            <Link href="/admin/nomina" className="font-semibold text-glow hover:underline">
              Nómina → Reglas
            </Link>
            . Carga prestacional y metas:{" "}
            <Link href="/admin/finanzas" className="font-semibold text-glow hover:underline">
              Ganancias
            </Link>
            .
          </p>
        </div>
      )}
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}

function SalaryForm({ userId, salary, transport, onSaved }: { userId: string; salary: number | null; transport: boolean; onSaved: () => void }) {
  const [value, setValue] = useState<number | null>(salary);
  const [allowance, setAllowance] = useState(transport);
  const { run, busy } = useAction();
  return (
    <section aria-labelledby="sueldo-title" className="rounded-xl border border-line bg-night/40 p-3">
      <h3 id="sueldo-title" className="mb-2 font-semibold text-ink">
        Sueldo
      </h3>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Sueldo mensual">{(id) => <MoneyInput id={id} value={value} onChange={setValue} />}</Field>
        <label className="flex h-11 items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" checked={allowance} onChange={(e) => setAllowance(e.target.checked)} className="size-5 accent-[var(--color-glow)]" />
          Recibe auxilio de transporte
        </label>
        <Button
          loading={busy === "pay"}
          icon={<Save className="size-4" />}
          onClick={async () => {
            const ok = await run("pay", () => api.payroll.setPay(userId, { monthlySalary: value, transportAllowance: allowance }), "Sueldo guardado");
            if (ok) onSaved();
          }}
        >
          Guardar
        </Button>
      </div>
    </section>
  );
}

/** Bonificaciones y descuentos of one person in the report's quincena. */
export function AdjustmentsEditor({ userId, report, onChanged }: { userId: string; report: PayrollReport; onChanged: () => void }) {
  const [kind, setKind] = useState<"bono" | "descuento">("descuento");
  const [concept, setConcept] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const { run, busy } = useAction();
  const { confirm, dialog } = useConfirm();
  const items = report.lines.find((l) => l.userId === userId)?.adjustments ?? [];
  return (
    <div className="flex flex-col gap-2">
      {items.length === 0 ? (
        <p className="text-sm text-muted">Sin bonificaciones ni descuentos en esta quincena.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line/60 rounded-xl border border-line">
          {items.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 truncate text-ink">
                {a.kind === "bono" ? "Bonificación" : "Descuento"} · {a.concept}
              </span>
              <span className="flex items-center gap-2">
                <span className={a.kind === "bono" ? "tabular text-done" : "tabular text-pending"}>
                  {a.kind === "bono" ? "+" : "−"} {formatCop(a.amount)}
                </span>
                <IconButton
                  label="Quitar"
                  onClick={async () => {
                    if (await confirm({ title: `¿Quitar «${a.concept}»?`, confirmLabel: "Quitar", danger: true })) {
                      const ok = await run(`rm-${a.id}`, () => api.payroll.removeAdjustment(a.id), "Quitado");
                      if (ok) onChanged();
                    }
                  }}
                >
                  <Trash2 className="size-4" />
                </IconButton>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-line p-3">
        <Segmented<"bono" | "descuento">
          label="Tipo"
          value={kind}
          onChange={setKind}
          options={[
            { value: "descuento", label: "Descuento" },
            { value: "bono", label: "Bonificación" },
          ]}
        />
        <Field label="Concepto" className="min-w-40 flex-1">
          {(id) => <Input id={id} maxLength={80} placeholder={kind === "bono" ? "Bono por meta" : "Anticipo, préstamo…"} value={concept} onChange={(e) => setConcept(e.target.value)} />}
        </Field>
        <Field label="Valor">{(id) => <MoneyInput id={id} className="w-40" value={amount} onChange={setAmount} />}</Field>
        <Button
          loading={busy === "add"}
          disabled={!concept.trim() || !amount}
          icon={<Plus className="size-4" />}
          onClick={async () => {
            const ok = await run(
              "add",
              () => api.payroll.addAdjustment({ userId, quincena: report.quincena.key, kind, concept: concept.trim(), amount: amount! }),
              kind === "bono" ? "Bonificación agregada" : "Descuento agregado",
            );
            if (ok) {
              setConcept("");
              setAmount(null);
              onChanged();
            }
          }}
        >
          Agregar
        </Button>
      </div>
      {dialog}
    </div>
  );
}
