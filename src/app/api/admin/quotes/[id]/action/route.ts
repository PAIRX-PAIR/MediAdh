import { schedulePush } from "@/lib/server/after-push";
import { json, readJson } from "@/lib/server/http";
import { quoteActionInput } from "@/lib/server/inputs-production";
import { route } from "@/lib/server/route";
import { approveQuote, duplicateQuote, setQuoteStatus } from "@/lib/server/services/quotes";

export const POST = route({ access: "admin" }, async ({ req, principal, params }) => {
  const input = await readJson(req, quoteActionInput);
  const id = params.id!;
  switch (input.action) {
    case "send":
      return json({ quote: await setQuoteStatus(principal, id, "enviada") });
    case "reject":
      return json({ quote: await setQuoteStatus(principal, id, "rechazada") });
    case "draft":
      return json({ quote: await setQuoteStatus(principal, id, "borrador") });
    case "duplicate":
      return json({ quote: await duplicateQuote(principal, id) }, { status: 201 });
    case "approve": {
      const { quote, order, notifications } = await approveQuote(principal, id, input);
      schedulePush(req, notifications);
      return json({ quote, order });
    }
  }
});
