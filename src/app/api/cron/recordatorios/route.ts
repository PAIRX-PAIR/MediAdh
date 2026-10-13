import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { schedulePush } from "@/lib/server/after-push";
import { errorResponse, json } from "@/lib/server/http";
import { runScheduler } from "@/lib/server/services/scheduler";

/**
 * Vercel Cron: delivery reminders and automatic closing of services.
 * Vercel sends `Authorization: Bearer $CRON_SECRET`; anything else is refused.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const given = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const ok =
    Boolean(secret && secret.length >= 16) &&
    given.length === expected.length &&
    timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) return json({ error: "No autorizado." }, { status: 401 });
  try {
    const result = await runScheduler();
    schedulePush(req, result.notifications);
    return json({ reminders: result.reminders, closed: result.closed });
  } catch (error) {
    return errorResponse(error);
  }
}
