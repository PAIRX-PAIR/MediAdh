import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getPrincipal } from "@/lib/server/auth/principal";
import { canSeeTaskMap } from "@/lib/domain/task-map";

/** «Mapa de tareas» is enabled per user (see TASK_MAP_USERS). */
export default async function Layout({ children }: { children: ReactNode }) {
  const principal = await getPrincipal();
  if (!principal) redirect("/?acceso=1");
  if (!principal.isAdmin || !canSeeTaskMap(principal.user.username)) redirect("/admin");
  return children;
}
