import "server-only";
import { evaluateAccess } from "@/lib/domain/contracts";
import { todayIn } from "@/lib/domain/time";
import { isOwner, type Principal } from "../auth/principal";
import { createSessionToken } from "../auth/session";
import { badRequest, forbidden, HttpError, notFound } from "../http";
import { getDb } from "../store";
import { audit } from "./common";

/**
 * "Entrar como": a gerencia admin (scope total) opens the app exactly as
 * another person sees it, without their password. The session is read-only
 * (enforced in `route()`), expires within a few hours, is tied to the admin's
 * own session and is written to the audit log when it starts and ends.
 */
export async function startImpersonation(principal: Principal, targetId: string): Promise<{ token: string; isAdmin: boolean }> {
  if (principal.impersonator) throw badRequest("Primero vuelve a tu cuenta.", "already_impersonating");
  if (!isOwner(principal)) throw forbidden("Solo gerencia o administración pueden entrar como otro usuario.");
  if (targetId === principal.user.id) throw badRequest("Ya estás en tu cuenta.");

  return getDb().transact(["users", "positions", "settings", "audit"], "Entrar como otro usuario", ({ users, positions, settings, audit: log }) => {
    const target = users.items.find((u) => u.id === targetId);
    if (!target) throw notFound("Usuario no encontrado.");
    const access = evaluateAccess(target, positions.items, todayIn(settings.timezone), { staffLogin: true });
    if (!access.ok) throw new HttpError(409, `${target.displayName} no tiene acceso vigente a la app (cuenta inactiva o sin contrato).`, "target_without_access");
    audit(log, { id: principal.user.id, name: principal.user.displayName }, "entrar_como_inicio", target.id, target.displayName);
    return { target, isAdmin: access.isAdmin };
  }).then(async ({ target, isAdmin }) => ({
    token: await createSessionToken(target.id, target.sessionVersion, { id: principal.user.id, sessionVersion: principal.user.sessionVersion }),
    isAdmin,
  }));
}

/** Back to the admin's own account. The admin was re-validated by `resolvePrincipal` on this very request. */
export async function stopImpersonation(principal: Principal): Promise<string> {
  const actor = principal.impersonator;
  if (!actor) throw badRequest("No estás viendo la app como otro usuario.", "not_impersonating");
  const admin = await getDb().transact(["users", "audit"], "Volver a mi cuenta", ({ users, audit: log }) => {
    const user = users.items.find((u) => u.id === actor.id);
    if (!user) throw forbidden();
    audit(log, { id: user.id, name: user.displayName }, "entrar_como_fin", principal.user.id, principal.user.displayName);
    return user;
  });
  return createSessionToken(admin.id, admin.sessionVersion);
}
