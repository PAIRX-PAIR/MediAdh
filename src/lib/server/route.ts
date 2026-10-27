import "server-only";
import type { NextRequest } from "next/server";
import { ACCESS_DENIAL_MESSAGES } from "@/lib/domain/contracts";
import { isOwner, resolvePrincipal, type Principal } from "./auth/principal";
import { createSessionToken, setSessionCookie, shouldRenew } from "./auth/session";
import { assertSameOrigin, errorResponse, forbidden, HttpError, unauthorized } from "./http";

/** owner = gerencia/administración (scope total); admin = también coordinación y asistencia. */
type Access = "public" | "user" | "admin" | "owner";

interface RouteOptions {
  access: Access;
  /** Allowed while the account must still change its password / accept the policy. */
  allowIncomplete?: boolean;
  /** The route sets or clears the session cookie itself: skip the sliding re-issue, which would overwrite it. */
  manageSession?: boolean;
  /** Writes allowed while an admin is "entrando como" someone else (only leaving / signing out). */
  allowImpersonated?: boolean;
}

type Ctx<A extends Access> = {
  req: NextRequest;
  params: Record<string, string>;
} & (A extends "public" ? { principal: Principal | null } : { principal: Principal });

/**
 * Wraps a Route Handler with the security checks every endpoint needs:
 * CSRF (for non-GET), authentication, authorisation and error mapping.
 * Authorisation lives here and in the services, never only in the UI or proxy.
 */
export function route<A extends Access>(
  options: RouteOptions & { access: A },
  handler: (ctx: Ctx<A>) => Promise<Response>,
) {
  return async (req: NextRequest, context: { params: Promise<Record<string, string>> }) => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);

      const result = await resolvePrincipal();
      let principal: Principal | null = null;
      if (result.status === "ok") principal = result.principal;

      // "Entrar como" is look-only: nothing can be created, changed or deleted in someone else's name.
      if (principal?.impersonator && req.method !== "GET" && req.method !== "HEAD" && !options.allowImpersonated) {
        throw new HttpError(403, `Estás viendo la app como ${principal.user.displayName}: es solo lectura. Vuelve a tu cuenta para hacer cambios.`, "impersonation_read_only");
      }

      if (options.access !== "public") {
        if (result.status === "denied") throw new HttpError(403, ACCESS_DENIAL_MESSAGES[result.reason], `access_${result.reason}`);
        if (!principal) throw unauthorized();
        if (principal.incomplete && !options.allowIncomplete) {
          throw new HttpError(403, "Completa tu perfil (contraseña y autorización de datos) para continuar.", "incomplete_profile");
        }
        if (options.access === "admin" && !principal.isAdmin) throw forbidden();
        if (options.access === "owner" && !isOwner(principal)) {
          throw new HttpError(403, "Solo gerencia o administración pueden hacer este cambio.", "owner_only");
        }
      }

      const params = context?.params ? await context.params : {};
      const response = await handler({ req, params, principal } as Ctx<A>);

      // Sliding session: re-issue long-lived tokens while the user is active.
      if (principal && !principal.impersonator && !options.manageSession && shouldRenew(principal.claims)) {
        await setSessionCookie(await createSessionToken(principal.user.id, principal.user.sessionVersion));
      }
      return response;
    } catch (error) {
      return errorResponse(error);
    }
  };
}
