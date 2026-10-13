import { schedulePush } from "@/lib/server/after-push";
import { badRequest, json, readJson } from "@/lib/server/http";
import { createAccountInput } from "@/lib/server/inputs";
import { route } from "@/lib/server/route";
import { createAccount } from "@/lib/server/services/team";

export const POST = route({ access: "owner" }, async ({ req, principal }) => {
  const input = await readJson(req, createAccountInput);
  if (input.kind === "staff" && !input.startDate) throw badRequest("Indica la fecha de inicio del contrato.");
  const { user, notifications } = await createAccount(principal, {
    ...input,
    startDate: input.startDate ?? principal.today,
    endDate: input.endDate ?? null,
  });
  schedulePush(req, notifications);
  return json({ id: user.id }, { status: 201 });
});
