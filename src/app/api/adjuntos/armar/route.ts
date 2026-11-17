import { readJson, json } from "@/lib/server/http";
import { attachmentAssemblyInput } from "@/lib/server/inputs-production";
import { route } from "@/lib/server/route";
import { assembleAttachment } from "@/lib/server/services/attachments";

/** Arma un PDF con sus partes ya subidas y lo guarda como adjunto de la OT o la cotización. */
export const POST = route({ access: "admin" }, async ({ req, principal }) => {
  const input = await readJson(req, attachmentAssemblyInput);
  const attachment = await assembleAttachment(principal, input);
  const { path: _p, ref: _r, ...view } = attachment;
  void _p;
  void _r;
  return json({ attachment: view });
});
