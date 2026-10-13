import { adjustForInflation } from "@/lib/domain/ipc";
import { CLIENT_KIND_LABEL, CLIENT_TIER_LABEL, PROCESS_LABEL } from "@/lib/domain/labels";
import { ORDER_STATUS_LABEL, orderMoney } from "@/lib/domain/lifecycle";
import { formatNit } from "@/lib/domain/nit";
import { HOUR_KINDS, HOUR_KIND_LABEL } from "@/lib/domain/payroll";
import { dateInZone } from "@/lib/domain/time";
import { isOwner } from "@/lib/server/auth/principal";
import { HttpError, badRequest } from "@/lib/server/http";
import { route } from "@/lib/server/route";
import { getDb } from "@/lib/server/store";
import { payrollReport } from "@/lib/server/services/payroll";

/**
 * CSV for Excel (es-CO): ";" separator, UTF-8 BOM, and formula-looking cells
 * neutralised so a client name like "=HYPERLINK(…)" never executes.
 */
function csv(rows: Array<Array<string | number | null>>): string {
  const cell = (v: string | number | null) => {
    if (v === null || v === undefined) return "";
    let s = typeof v === "number" ? String(v).replace(".", ",") : v;
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return `﻿${rows.map((r) => r.map(cell).join(";")).join("\r\n")}\r\n`;
}

export const GET = route({ access: "admin" }, async ({ req, principal }) => {
  const kind = req.nextUrl.searchParams.get("tipo") ?? "ordenes";
  const db = getDb();
  const { orders, clients, machines, ipc, settings } = await db.read(["orders", "clients", "machines", "ipc", "settings"]);
  const tz = settings.timezone;
  const day = (iso: string | null) => (iso ? dateInZone(new Date(iso), tz) : null);
  let rows: Array<Array<string | number | null>>;

  if (kind === "ordenes") {
    const rate = (id: string | null) => machines.items.find((m) => m.id === id)?.hourlyRate ?? 0;
    rows = [
      [
        "Folio", "Cliente", "NIT", "Trabajo", "Estado", "Cantidad", "Ingreso", "Entrega pactada", "Entregada", "Cerrada",
        "Procesos", "Horas plan", "Horas reales", "Insumos", "Costo máquinas", "Precio", "Precio a hoy (IPC)",
        "Satisfacción", "Garantías", "Devoluciones", "Factura", "Histórico",
      ],
    ];
    for (const o of [...orders.items].sort((a, b) => (a.folio < b.folio ? -1 : 1))) {
      const client = clients.items.find((c) => c.id === o.clientId);
      const money = orderMoney(o, rate);
      const month = (o.deliveredAt ?? o.intake.receivedAt).slice(0, 7);
      const adjusted = money.price !== null ? adjustForInflation(money.price, month, ipc.items, principal.today.slice(0, 7)) : null;
      rows.push([
        o.folio,
        o.clientName,
        client?.nit ? formatNit(client.nit, client.dv) : null,
        o.title,
        ORDER_STATUS_LABEL[o.status],
        o.intake.quantity,
        day(o.intake.receivedAt),
        o.due ? `${o.due.date} ${o.due.time}` : null,
        day(o.deliveredAt),
        day(o.closedAt),
        o.workItems.map((w) => PROCESS_LABEL[w.process]).join(", "),
        o.workItems.reduce((s, w) => s + w.plannedHours, 0),
        o.workItems.reduce((s, w) => s + (w.actualHours ?? 0), 0),
        money.supplies,
        money.machineCost,
        money.price,
        adjusted?.value ?? null,
        o.satisfaction,
        o.claims.filter((c) => c.kind === "garantia").length,
        o.claims.filter((c) => c.kind === "devolucion").length,
        o.invoice.number ?? (o.invoice.pending ? "PENDIENTE" : null),
        o.historical ? "Sí" : "No",
      ]);
    }
  } else if (kind === "clientes") {
    rows = [["Nombre / razón social", "Tipo", "NIT", "Contacto", "Tel. empresa", "Tel. personal", "Correo", "Ciudad", "Dirección", "Nivel", "Órdenes", "Archivado"]];
    for (const c of clients.items) {
      rows.push([
        c.name,
        CLIENT_KIND_LABEL[c.kind],
        c.nit ? formatNit(c.nit, c.dv) : null,
        c.contactName,
        c.companyPhone,
        c.personalPhone,
        c.email,
        c.city,
        c.address,
        CLIENT_TIER_LABEL[c.tier] ?? String(c.tier),
        orders.items.filter((o) => o.clientId === c.id).length,
        c.archived ? "Sí" : "No",
      ]);
    }
  } else if (kind === "nomina") {
    if (!isOwner(principal)) throw new HttpError(403, "Solo gerencia o administración exportan la nómina.", "owner_only");
    const report = await payrollReport(principal, req.nextUrl.searchParams.get("quincena"));
    const hours = (n: number) => Math.round(n * 100) / 100;
    rows = [
      [`Nómina ${report.quincena.from} a ${report.quincena.to} · pago ${report.quincena.payDate}`],
      [
        "Persona", "Sueldo mensual", "Valor hora", "Básico quincena", "Horas trabajadas", "Horas del horario",
        ...HOUR_KINDS.flatMap((k) => [`${HOUR_KIND_LABEL[k]} (h)`, `${HOUR_KIND_LABEL[k]} ($)`]),
        "Total extras", "Auxilio de transporte", "Devengado", "Salud", "Pensión", "Neto a pagar", "Registros sin salida",
      ],
    ];
    for (const l of report.lines) {
      rows.push([
        l.name, l.monthlySalary, l.hourlyValue, l.basic, hours(l.workedHours), hours(l.scheduledHours),
        ...HOUR_KINDS.flatMap((k) => [hours(l.hours[k]), l.amounts[k]]),
        l.extrasTotal, l.transport, l.earned, l.health, l.pension, l.net, l.openEntries,
      ]);
    }
    rows.push([], ["Detalle de registros"], ["Persona", "Fecha", "Entrada", "Salida", "Nota", "Origen"]);
    for (const e of report.entries) rows.push([e.userName, e.date, e.start, e.end, e.note, e.source === "admin" ? "Coordinador" : "Operario"]);
  } else {
    throw badRequest("Tipo de exportación desconocido.");
  }

  const name = `smi-${kind}-${principal.today}.csv`;
  return new Response(csv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
