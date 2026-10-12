import "server-only";
import { adjustForInflation } from "@/lib/domain/ipc";
import { lastMonths, machineKpis, managementIndex, monthKey, monthlyKpis, sumKpis, type KpiContext } from "@/lib/domain/kpi";
import { orderMoney } from "@/lib/domain/lifecycle";
import type { Principal } from "../auth/principal";
import { getDb } from "../store";

/**
 * Indicators over the full archive (computed on the server: the live sync
 * payload only carries recent orders). Inactive machines never count.
 */
export async function buildIndicators(principal: Principal, monthsBack: number) {
  const { orders, machines, settings, ipc } = await getDb().read(["orders", "machines", "settings", "ipc"]);
  const ctx: KpiContext = {
    machines: machines.items,
    calendar: settings.production,
    timezone: settings.timezone,
    now: Date.now(),
    today: principal.today,
  };
  const months = lastMonths(principal.today, monthsBack);
  const monthly = monthlyKpis(orders.items, ctx, months).map((k) => ({ ...k, index: managementIndex(k) }));
  const period = sumKpis(monthly, `${months[0]} → ${months[months.length - 1]}`);
  const rate = (machineId: string | null) => machines.items.find((m) => m.id === machineId)?.hourlyRate ?? 0;

  // Money: agreed price vs. real cost (supplies + machine hours), also in today's pesos.
  const latestIpc = principal.today.slice(0, 7);
  const money = months.map((month) => {
    let price = 0;
    let cost = 0;
    let adjusted = 0;
    let count = 0;
    for (const o of orders.items) {
      if (!o.deliveredAt || o.status === "cancelada" || monthKey(o.deliveredAt, ctx.timezone) !== month) continue;
      const m = orderMoney(o, rate);
      if (m.price === null) continue;
      count += 1;
      price += m.price;
      cost += m.supplies + m.machineCost;
      adjusted += adjustForInflation(m.price, month, ipc.items, latestIpc)?.value ?? m.price;
    }
    return { month, orders: count, price, cost, margin: price - cost, adjusted };
  });

  return {
    months,
    monthly,
    period: { ...period, index: managementIndex(period) },
    perMachine: machineKpis(orders.items, ctx, months),
    machines: machines.items
      .sort((a, b) => a.order - b.order)
      .map((m) => ({ id: m.id, name: m.name, process: m.process, state: m.state, activeSince: m.activeSince })),
    money,
    ipcAvailable: ipc.items.length > 0,
  };
}

export type Indicators = Awaited<ReturnType<typeof buildIndicators>>;
