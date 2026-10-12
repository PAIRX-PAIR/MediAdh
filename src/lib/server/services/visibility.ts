import "server-only";
import type { Notification } from "@/lib/domain/schema";
import type { Principal } from "../auth/principal";

/**
 * Whether `principal` may see a notification. Position-addressed messages are
 * only shown to the person holding the position since their contract was
 * created, so a new hire does not read the previous holder's history.
 */
export function isVisibleTo(n: Notification, principal: Principal): boolean {
  switch (n.audience.kind) {
    case "all":
      return true;
    case "admins":
      return principal.isAdmin;
    case "user":
      return n.audience.userId === principal.user.id;
    case "position": {
      const position = principal.position;
      if (!position || position.id !== n.audience.positionId || !position.contract) return false;
      return n.createdAt >= position.contract.createdAt;
    }
  }
}
