import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { resolvePrincipal } from "@/lib/server/auth/principal";
import { DEVICE_COOKIE } from "@/lib/server/services/devices";

/** Start URL of the installed app: straight to the right board, or to sign in. */
export default async function Start() {
  const result = await resolvePrincipal();
  if (result.status === "anonymous") {
    // An operator's phone authorised by QR opens on their own queue.
    if ((await cookies()).get(DEVICE_COOKIE)?.value) redirect("/operario");
    redirect("/?acceso=1");
  }
  if (result.status === "denied") redirect(`/?acceso=1&motivo=${result.reason}`);
  redirect(result.principal.isAdmin ? "/admin" : "/panel");
}
