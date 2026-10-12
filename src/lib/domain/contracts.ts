import type { Contract, Position, User } from "./schema";
import { daysBetween } from "./time";

export const EXPIRING_SOON_DAYS = 7;

export type ContractStatus = "vacante" | "programado" | "vigente" | "por_vencer" | "vencido" | "terminado";

/**
 * Contract state is derived from dates on every read instead of being stored,
 * so an expired contract frees its position at midnight (workshop time) without
 * any scheduled job.
 */
export function contractStatus(contract: Contract | null, today: string): ContractStatus {
  if (!contract) return "vacante";
  if (contract.endedAt) return "terminado";
  if (today < contract.startDate) return "programado";
  if (contract.endDate !== null && today > contract.endDate) return "vencido";
  if (contract.endDate !== null && daysBetween(today, contract.endDate) <= EXPIRING_SOON_DAYS) {
    return "por_vencer";
  }
  return "vigente";
}

export function isContractActive(status: ContractStatus): boolean {
  return status === "vigente" || status === "por_vencer";
}

/** Holder of the position today, or null when the position is effectively vacant. */
export function activeHolderId(position: Position, today: string): string | null {
  const status = contractStatus(position.contract, today);
  return isContractActive(status) ? position.contract!.userId : null;
}

export function isPositionVacant(position: Position, today: string): boolean {
  return activeHolderId(position, today) === null;
}

/** A position may receive a new contract when nobody holds it now or later. */
export function canAssignNewContract(position: Position, today: string): boolean {
  const status = contractStatus(position.contract, today);
  return status === "vacante" || status === "vencido" || status === "terminado";
}

export type AccessDecision =
  | { ok: true; position: Position | null; isAdmin: boolean }
  | { ok: false; reason: AccessDenialReason; startDate?: string };

export type AccessDenialReason =
  | "pending"
  | "rejected"
  | "disabled"
  | "no_contract"
  | "contract_not_started";

/**
 * Single source of truth for "may this account use the app right now".
 * Called on login AND on every authenticated request, so an expired contract
 * or a disabled account loses access immediately, even with a live session.
 */
export function evaluateAccess(user: User, positions: Position[], today: string): AccessDecision {
  if (user.status === "pending") return { ok: false, reason: "pending" };
  if (user.status === "rejected") return { ok: false, reason: "rejected" };
  if (user.status === "disabled") return { ok: false, reason: "disabled" };

  if (user.kind === "admin") return { ok: true, position: null, isAdmin: true };

  // A person may have an expired contract in one position and a new one in
  // another, so evaluate every contract they hold and keep the best.
  const held = positions.filter((p) => p.contract?.userId === user.id);
  const active = held.find((p) => isContractActive(contractStatus(p.contract, today)));
  if (active) return { ok: true, position: active, isAdmin: active.grantsAdmin };

  const scheduled = held.find((p) => contractStatus(p.contract, today) === "programado");
  if (scheduled?.contract) {
    return { ok: false, reason: "contract_not_started", startDate: scheduled.contract.startDate };
  }
  return { ok: false, reason: "no_contract" };
}

export const ACCESS_DENIAL_MESSAGES: Record<AccessDenialReason, string> = {
  pending: "Tu cuenta está pendiente de aprobación. Un administrador debe admitir tu acceso.",
  rejected: "Tu solicitud de acceso no fue aprobada. Habla con el coordinador.",
  disabled: "Tu cuenta está desactivada. Habla con el coordinador.",
  no_contract: "No tienes un contrato vigente. El acceso se habilita cuando el coordinador registre tu contrato.",
  contract_not_started: "Tu contrato aún no ha iniciado.",
};
