"use client";

import { useMemo } from "react";
import { useSync } from "@/components/providers/sync-provider";
import { nextUp, occupancy, planOrders, prioritize, type PlanContext } from "@/lib/domain/planning";
import type { Machine } from "@/lib/domain/schema";
import type { AttachmentView, ClientView, OrderView } from "@/lib/domain/views";

/**
 * Live production model for the admin console: everything is derived from the
 * sync payload, so the queue, occupancy and priorities update on every sync.
 */
export function useProduction() {
  const { data } = useSync();
  const p = data.production;

  return useMemo(() => {
    const orders: OrderView[] = p.orders ?? [];
    const machines: Machine[] = p.machines;
    const clients: ClientView[] = p.clients ?? [];
    const ctx: PlanContext = {
      machines,
      calendar: p.calendar,
      timezone: data.settings.timezone,
      now: Date.parse(data.serverTime),
      today: data.today,
    };
    // Planning functions only read fields that views keep (history is irrelevant to them).
    const asOrders = orders.map((o) => ({ ...o, history: [] }));
    const schedule = planOrders(asOrders, ctx, 21);
    const ranking = prioritize(
      {
        orders: asOrders,
        clientTier: (id) => clients.find((c) => c.id === id)?.tier ?? 1,
        blockedReason: (orderId, workItemId) =>
          data.tasks.find((t) => t.orderId === orderId && t.workItemId === workItemId)?.blockedReason ?? null,
      },
      ctx,
      schedule,
    );
    const machineById = new Map(machines.map((m) => [m.id, m]));
    const attachmentsOf = (ids: string[]): AttachmentView[] => ids.map((id) => p.attachments.find((a) => a.id === id)).filter((a): a is AttachmentView => Boolean(a));
    return {
      ctx,
      orders,
      asOrders,
      machines,
      machineById,
      clients,
      quotes: p.quotes ?? [],
      settings: p.settings,
      ipc: p.ipc ?? [],
      schedule,
      occupancy: occupancy(schedule, machines, 14),
      ranking,
      next: nextUp(ranking),
      attachmentsOf,
    };
  }, [p, data.settings.timezone, data.serverTime, data.today, data.tasks]);
}

export type Production = ReturnType<typeof useProduction>;
