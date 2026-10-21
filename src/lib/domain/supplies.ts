import type { Order, OrderStatus, RequiredSupply } from "./schema";

/** Órdenes que todavía esperan insumos; las entregadas, cerradas o canceladas ya no cuentan. */
export const SUPPLY_ORDER_STATUSES: OrderStatus[] = ["recibida", "en_proceso", "terminada", "garantia"];

export interface SupplyRow {
  orderId: string;
  folio: string;
  orderTitle: string;
  clientName: string;
  supply: RequiredSupply;
}

export interface SupplyGroup {
  key: string;
  name: string;
  unit: string;
  /** Suma de lo que piden todas las órdenes (solo las filas incluidas). */
  total: number;
  rows: SupplyRow[];
}

export const normalizeSupplyText = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Misma clave = mismo insumo (ignora tildes, mayúsculas y espacios) en la misma unidad. */
export const supplyKey = (s: Pick<RequiredSupply, "name" | "unit">) => `${normalizeSupplyText(s.name)}|${normalizeSupplyText(s.unit)}`;

type OrderLike = Pick<Order, "id" | "folio" | "title" | "clientName" | "status" | "requiredSupplies">;

/**
 * Filas del listado general. Cada fila es la línea de UNA orden, así que marcar
 * una como conseguida nunca toca la de otra orden. Las pendientes solo vienen
 * de órdenes en curso; las conseguidas se piden aparte (`includeDone`).
 */
export function supplyRows(orders: OrderLike[], opts: { includeDone?: boolean } = {}): SupplyRow[] {
  const rows: SupplyRow[] = [];
  for (const o of orders) {
    for (const supply of o.requiredSupplies ?? []) {
      const pending = supply.status === "pendiente";
      if (pending && !SUPPLY_ORDER_STATUSES.includes(o.status)) continue;
      if (!pending && !opts.includeDone) continue;
      rows.push({ orderId: o.id, folio: o.folio, orderTitle: o.title, clientName: o.clientName, supply });
    }
  }
  return rows.sort((a, b) => a.supply.requestedAt.localeCompare(b.supply.requestedAt));
}

export function groupSupplies(rows: SupplyRow[]): SupplyGroup[] {
  const groups = new Map<string, SupplyGroup>();
  for (const row of rows) {
    const key = supplyKey(row.supply);
    let g = groups.get(key);
    if (!g) {
      g = { key, name: row.supply.name, unit: row.supply.unit, total: 0, rows: [] };
      groups.set(key, g);
    }
    g.total += row.supply.quantity;
    g.rows.push(row);
  }
  return [...groups.values()].sort((a, b) => normalizeSupplyText(a.name).localeCompare(normalizeSupplyText(b.name)));
}

export const pendingSupplyCount = (orders: OrderLike[]) => supplyRows(orders).length;

export function formatQuantity(quantity: number, unit: string): string {
  const n = Number.isInteger(quantity) ? `${quantity}` : quantity.toLocaleString("es-CO", { maximumFractionDigits: 3 });
  return unit ? `${n} ${unit}` : n;
}
