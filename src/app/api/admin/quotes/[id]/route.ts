import { json, notFound, readJson } from "@/lib/server/http";
import { quotePatchInput } from "@/lib/server/inputs-production";
import { route } from "@/lib/server/route";
import { deleteQuote, updateQuote } from "@/lib/server/services/quotes";
import { getDb } from "@/lib/server/store";

export const GET = route({ access: "admin" }, async ({ params }) => {
  const { quotes } = await getDb().read(["quotes"]);
  const quote = quotes.items.find((q) => q.id === params.id);
  if (!quote) throw notFound("Cotización no encontrada.");
  return json({ quote });
});

export const PATCH = route({ access: "admin" }, async ({ req, principal, params }) => {
  const patch = await readJson(req, quotePatchInput);
  const quote = await updateQuote(principal, params.id!, patch);
  return json({ quote });
});

export const DELETE = route({ access: "admin" }, async ({ principal, params }) => {
  await deleteQuote(principal, params.id!);
  return json({ ok: true });
});
