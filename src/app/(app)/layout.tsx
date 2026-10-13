import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { SyncProvider } from "@/components/providers/sync-provider";
import { AppShell } from "@/components/shell/app-shell";
import { ToastProvider } from "@/components/ui/overlay";
import { resolvePrincipal } from "@/lib/server/auth/principal";
import { buildSync } from "@/lib/server/services/sync";

/** Authenticated area. The real checks happen here and in every API route. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const result = await resolvePrincipal();
  if (result.status === "anonymous") redirect("/?acceso=1");
  if (result.status === "denied") redirect(`/?acceso=1&motivo=${result.reason}`);
  const initial = await buildSync(result.principal);
  return (
    <ToastProvider>
      <SyncProvider initial={initial}>
        <AppShell>{children}</AppShell>
      </SyncProvider>
    </ToastProvider>
  );
}
