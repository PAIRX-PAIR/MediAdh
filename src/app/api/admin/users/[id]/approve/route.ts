import { schedulePush } from "@/lib/server/after-push";
import { badRequest, json, readJson } from "@/lib/server/http";
import { approveInput } from "@/lib/server/inputs";
import { route } from "@/lib/server/route";
import { approveRegistration } from "@/lib/server/services/team";

export const POST = route({ access: "owner" }, async ({ req, principal, params }) => {
  const input = await readJson(req, approveInput);
  if (input.mode === "staff" && !input.startDate) throw badRequest("Indica la fecha de inicio del contrato.");
  const { notifications } = await approveRegistration(principal, params.id!, {
    ...input,
    startDate: input.startDate ?? principal.today,
    endDate: input.endDate ?? null,
  });
  schedulePush(req, notifications);
  return json({ ok: true });
});
