import "server-only";
import { evaluateAccess, type AccessDenialReason, type AdminScope } from "@/lib/domain/contracts";
import type { Position, Settings, User } from "@/lib/domain/schema";
import { todayIn } from "@/lib/domain/time";
import { getDb } from "../store";
import { readSessionToken, verifySessionToken, type SessionClaims } from "./session";

export interface Principal {
  user: User;
  position: Position | null;
  isAdmin: boolean;
  /** total = todo; gestion = operación sin configuración, equipo ni sueldos; null = operario. */
  scope: AdminScope | null;
  settings: Settings;
  today: string;
  claims: SessionClaims;
  /** Account still has to set its own password or accept the data policy. */
  incomplete: boolean;
}

export type PrincipalResult =
  | { status: "ok"; principal: Principal }
  | { status: "anonymous" }
  | { status: "denied"; reason: AccessDenialReason; startDate?: string };

export function isIncomplete(user: User, settings: Settings): boolean {
  return user.mustChangePassword || user.consentVersion !== settings.legal.policyVersion;
}

/**
 * Resolves the caller from the session cookie and re-validates the account
 * against current data on every request: revoked sessions, disabled
 * accounts and expired contracts lose access immediately.
 */
export async function resolvePrincipal(): Promise<PrincipalResult> {
  const token = await readSessionToken();
  if (!token) return { status: "anonymous" };
  const claims = await verifySessionToken(token);
  if (!claims) return { status: "anonymous" };

  const { users, positions, settings } = await getDb().read(["users", "positions", "settings"]);
  const user = users.items.find((u) => u.id === claims.sub);
  if (!user || user.sessionVersion !== claims.sv) return { status: "anonymous" };

  const today = todayIn(settings.timezone);
  const access = evaluateAccess(user, positions.items, today, { staffLogin: settings.staffLogin });
  if (!access.ok) return { status: "denied", reason: access.reason, startDate: access.startDate };

  return {
    status: "ok",
    principal: {
      user,
      position: access.position,
      isAdmin: access.isAdmin,
      scope: access.scope,
      settings,
      today,
      claims,
      incomplete: isIncomplete(user, settings),
    },
  };
}

/** Gerencia y administración: configuration, team, salaries and audit. */
export function isOwner(principal: Pick<Principal, "isAdmin" | "scope">): boolean {
  return principal.isAdmin && principal.scope === "total";
}

export async function getPrincipal(): Promise<Principal | null> {
  const result = await resolvePrincipal();
  return result.status === "ok" ? result.principal : null;
}
