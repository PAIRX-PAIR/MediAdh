import { ACCESS_DENIAL_MESSAGES } from "@/lib/domain/contracts";
import { resolvePrincipal } from "@/lib/server/auth/principal";
import { errorResponse, json } from "@/lib/server/http";

/** Lightweight "who am I" used by the access popup and route guards. */
export async function GET() {
  try {
    const result = await resolvePrincipal();
    if (result.status === "anonymous") return json({ status: "anonymous" });
    if (result.status === "denied") {
      return json({ status: "denied", reason: result.reason, message: ACCESS_DENIAL_MESSAGES[result.reason] });
    }
    const { user, isAdmin, incomplete, position } = result.principal;
    return json({
      status: "ok",
      user: { id: user.id, displayName: user.displayName, username: user.username, isAdmin, positionTitle: position?.title ?? null },
      incomplete,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
