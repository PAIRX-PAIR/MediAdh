import { redirect } from "next/navigation";
import { resolvePrincipal } from "@/lib/server/auth/principal";

/** Start URL of the installed app: straight to the right board, or to sign in. */
export default async function Start() {
  const result = await resolvePrincipal();
  if (result.status === "anonymous") redirect("/?acceso=1");
  if (result.status === "denied") redirect(`/?acceso=1&motivo=${result.reason}`);
  redirect(result.principal.isAdmin ? "/admin" : "/panel");
}
