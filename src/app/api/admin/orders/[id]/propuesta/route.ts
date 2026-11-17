import { schedulePush } from "@/lib/server/after-push";
import { json, readJson } from "@/lib/server/http";
import { dueProposalInput } from "@/lib/server/inputs-production";
import { route } from "@/lib/server/route";
import { proposeDue } from "@/lib/server/services/orders";

/** Producción propone una fecha de entrega (o pide reprogramarla con causa). No compromete nada. */
export const POST = route({ access: "admin" }, async ({ req, principal, params }) => {
  const input = await readJson(req, dueProposalInput);
  const { order, notifications } = await proposeDue(principal, params.id!, input);
  schedulePush(req, notifications);
  return json({ order });
});
