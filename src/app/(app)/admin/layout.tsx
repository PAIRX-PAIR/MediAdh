import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getPrincipal } from "@/lib/server/auth/principal";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const principal = await getPrincipal();
  if (!principal) redirect("/?acceso=1");
  if (!principal.isAdmin) redirect("/panel");
  return children;
}
