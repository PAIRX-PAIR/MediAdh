import { json, readJson } from "@/lib/server/http";
import { quoteInput } from "@/lib/server/inputs-production";
import { route } from "@/lib/server/route";
import { createQuote } from "@/lib/server/services/quotes";

export const POST = route({ access: "admin" }, async ({ req, principal }) => {
  const input = await readJson(req, quoteInput);
  const quote = await createQuote(principal, input);
  return json({ quote }, { status: 201 });
});
