"use client";

import { Map as MapIcon, PackageSearch, Wrench } from "lucide-react";
import Link from "next/link";
import { useSync } from "@/components/providers/sync-provider";
import { PriorityPanel } from "@/components/production/priority-panel";
import { TallerTabs } from "@/components/production/taller-tabs";
import { PageHeader, StatTile } from "@/components/ui/kit";
import { useProduction } from "@/lib/client/use-production";
import { pendingSupplyCount } from "@/lib/domain/supplies";

export function ProduccionScreen() {
  const { data } = useSync();
  const prod = useProduction();
  const blocked = data.tasks.filter((t) => t.status === "bloqueada").length;
  const supplies = pendingSupplyCount(prod.orders, prod.generalSupplies);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Taller"
        title="Producción"
        description="Qué se está haciendo y con cuál orden seguir. El orden recomendado tiene en cuenta fecha de entrega, urgencia, dificultad y cliente."
      />
      <TallerTabs />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Link href="/admin/mapa">
          <StatTile label="Mapa de tareas" value={prod.orders.filter((o) => ["recibida", "en_proceso", "garantia"].includes(o.status)).length} tone="glow" icon={<MapIcon />} hint="Órdenes abiertas: ver su mapa" />
        </Link>
        <Link href="/admin/tareas?estado=bloqueada">
          <StatTile label="Bloqueos" value={blocked} tone={blocked ? "blocked" : "neutral"} icon={<Wrench />} hint="Tareas detenidas" />
        </Link>
        <Link href="/admin/insumos">
          <StatTile label="Insumos por conseguir" value={supplies} tone={supplies ? "pending" : "neutral"} icon={<PackageSearch />} hint="De las órdenes y compras sueltas" />
        </Link>
      </div>

      <PriorityPanel ranking={prod.ranking} next={prod.next} hrefFor={(id) => `/admin/ordenes?o=${id}`} />
    </div>
  );
}
