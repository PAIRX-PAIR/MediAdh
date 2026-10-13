import { notFound, redirect } from "next/navigation";
import { PrintButton } from "@/components/production/print-button";
import { DIFFICULTY_LABEL, PROCESS_LABEL, formatDate } from "@/lib/domain/labels";
import { formatNit } from "@/lib/domain/nit";
import { formatCop, quoteTotals, quoteValidUntil, warrantyText } from "@/lib/domain/quote";
import { getPrincipal } from "@/lib/server/auth/principal";
import { getDb } from "@/lib/server/store";

export const metadata = { title: "Cotización" };

/** Printable quote (paper/PDF). Light, plain layout; only admins can open it. */
export default async function PrintQuote({ params }: { params: Promise<{ id: string }> }) {
  const principal = await getPrincipal();
  if (!principal) redirect("/?acceso=1");
  if (!principal.isAdmin) redirect("/panel");
  const { id } = await params;
  const { quotes, clients, settings } = await getDb().read(["quotes", "clients", "settings"]);
  const quote = quotes.items.find((q) => q.id === id);
  if (!quote) notFound();
  const client = clients.items.find((c) => c.id === quote.clientId);
  const t = quoteTotals(quote);
  const legal = settings.legal;
  // Client-facing prices: each line carries its share of the margin, so the lines add up to the subtotal.
  const factor = t.cost > 0 ? t.subtotal / t.cost : 1;
  const rows = [
    ...quote.materials.map((m) => ({ id: m.id, label: m.description, qty: String(m.quantity), cost: m.quantity * m.unitCost, units: m.quantity })),
    ...quote.labor.map((l) => ({ id: l.id, label: `${PROCESS_LABEL[l.process]}${l.description ? ` · ${l.description}` : ""}`, qty: `${l.hours} h`, cost: l.hours * l.rate, units: l.hours })),
  ].map((r) => ({ ...r, value: Math.round(r.cost * factor) }));
  const drift = t.subtotal - rows.reduce((sum, r) => sum + r.value, 0);
  if (rows.length > 0) rows[rows.length - 1]!.value += drift;
  const warranty = warrantyText(quote.labor, settings.production.warrantyDays);
  const issued = quote.issuedAt ?? quote.createdAt;

  return (
    <div className="min-h-dvh bg-white text-[#0b1426] print:min-h-0">
      <div className="mx-auto max-w-3xl px-8 py-10 print:px-0 print:py-0">
        <div className="mb-6 flex justify-end gap-2 print:hidden">
          <PrintButton />
        </div>
        <header className="flex items-start justify-between gap-6 border-b-2 border-[#14336a] pb-5">
          <div>
            <p className="text-2xl font-bold text-[#14336a]">{legal.companyName || settings.workshopName}</p>
            <p className="text-sm text-[#3b4a66]">
              {legal.nit ? `NIT ${legal.nit}` : ""}
              {legal.address ? ` · ${legal.address}` : ""}
              {legal.city ? `, ${legal.city}` : ""}
            </p>
            <p className="text-sm text-[#3b4a66]">
              {[legal.phone, legal.email, legal.website].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#3b4a66]">Cotización</p>
            <p className="text-2xl font-bold">{quote.folio}</p>
            <p className="text-sm text-[#3b4a66]">Fecha: {formatDate(issued, { day: "numeric", month: "long", year: "numeric" })}</p>
            <p className="text-sm text-[#3b4a66]">Válida hasta: {formatDate(quoteValidUntil(quote), { day: "numeric", month: "long", year: "numeric" })}</p>
          </div>
        </header>

        <section className="mt-6 grid grid-cols-2 gap-6 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#3b4a66]">Cliente</p>
            <p className="font-semibold">{quote.clientName}</p>
            {client?.nit && <p>NIT/C.C. {formatNit(client.nit, client.kind === "empresa" ? client.dv : null)}</p>}
            {client?.contactName && <p>Atención: {client.contactName}</p>}
            {(client?.companyPhone || client?.email) && <p>{[client.companyPhone, client.email].filter(Boolean).join(" · ")}</p>}
            {client?.city && <p>{client.city}</p>}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#3b4a66]">Trabajo</p>
            <p className="font-semibold">{quote.title}</p>
            <p>
              Cantidad: {quote.quantity} · {DIFFICULTY_LABEL[quote.difficulty]}
              {quote.urgent ? " · Urgente" : ""}
            </p>
            {quote.description && <p className="mt-1 whitespace-pre-wrap text-[#3b4a66]">{quote.description}</p>}
          </div>
        </section>

        <table className="mt-8 w-full text-sm">
          <thead>
            <tr className="border-b border-[#c9d3e6] text-left text-xs uppercase tracking-wider text-[#3b4a66]">
              <th className="py-2">Concepto</th>
              <th className="py-2 text-right">Cantidad</th>
              <th className="py-2 text-right">Valor unitario</th>
              <th className="py-2 text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-[#e3e8f2]">
                <td className="py-2">{r.label}</td>
                <td className="py-2 text-right tabular-nums">{r.qty}</td>
                <td className="py-2 text-right tabular-nums">{formatCop(r.units > 0 ? Math.round(r.value / r.units) : r.value)}</td>
                <td className="py-2 text-right tabular-nums">{formatCop(r.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="ml-auto mt-6 w-72 text-sm tabular-nums">
          <div className="flex justify-between py-1">
            <dt>Subtotal</dt>
            <dd>{formatCop(t.subtotal)}</dd>
          </div>
          <div className="flex justify-between py-1">
            <dt>IVA ({quote.ivaPct} %)</dt>
            <dd>{formatCop(t.iva)}</dd>
          </div>
          <div className="mt-1 flex justify-between border-t-2 border-[#14336a] py-2 text-lg font-bold">
            <dt>Total</dt>
            <dd>{formatCop(t.total)}</dd>
          </div>
          {quote.quantity > 1 && (
            <div className="flex justify-between py-1 text-[#3b4a66]">
              <dt>Valor por pieza (sin IVA)</dt>
              <dd>{formatCop(t.unitPrice)}</dd>
            </div>
          )}
        </dl>

        {quote.notes && (
          <section className="mt-8 text-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#3b4a66]">Condiciones</p>
            <p className="whitespace-pre-wrap">{quote.notes}</p>
          </section>
        )}
        <section className="mt-8 text-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#3b4a66]">Garantía</p>
          <p>{warranty}</p>
        </section>
        <footer className="mt-12 border-t border-[#c9d3e6] pt-4 text-xs text-[#3b4a66]">
          Precios en pesos colombianos. Esta cotización no es una factura. Tratamos los datos de contacto según nuestra política de tratamiento de datos personales (Ley 1581 de
          2012).
        </footer>
      </div>
    </div>
  );
}
