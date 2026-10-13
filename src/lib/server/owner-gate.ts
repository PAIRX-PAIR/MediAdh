import "server-only";
import { redirect } from "next/navigation";
import { getPrincipal, isOwner } from "./auth/principal";

/** Configuration, team and audit pages: gerencia y administración only (the APIs enforce it too). */
export async function requireOwner() {
  const principal = await getPrincipal();
  if (!principal) redirect("/?acceso=1");
  if (!isOwner(principal)) redirect("/admin");
  return principal;
}
