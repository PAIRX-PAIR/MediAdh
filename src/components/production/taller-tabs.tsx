"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TALLER_SECTIONS } from "@/components/shell/nav";
import { cn } from "@/components/ui/primitives";

/**
 * Las cuatro secciones del Taller (Órdenes de trabajo · Programación · Máquinas · Producción).
 * Es el mismo componente en las cuatro pantallas, en escritorio y en celular, para que la navegación
 * sea igual en todas partes.
 */
export function TallerTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Secciones del Taller" className="mb-5">
      <ul className="grid grid-cols-4 gap-1.5 rounded-2xl border border-line bg-night/50 p-1.5">
        {TALLER_SECTIONS.map((s) => {
          const active = pathname.startsWith(s.href);
          const Icon = s.icon;
          return (
            <li key={s.href} className="min-w-0">
              <Link
                href={s.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-center font-display text-[11px] font-semibold leading-tight transition sm:flex-row sm:gap-2 sm:text-sm",
                  active ? "bg-navy-700/60 text-ink shadow-glow" : "text-muted hover:bg-white/5 hover:text-ink",
                )}
              >
                <Icon className={cn("size-4 shrink-0 sm:size-5", active && "text-glow")} aria-hidden />
                <span className="min-w-0 truncate">
                  <span className="sm:hidden">{s.short}</span>
                  <span className="hidden sm:inline">{s.label}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
