import "server-only";
import { after, type NextRequest } from "next/server";
import type { Notification } from "@/lib/domain/schema";
import { dispatchPush } from "./push";

export function appOrigin(req: NextRequest): string {
  return process.env.APP_URL?.replace(/\/$/, "") || req.nextUrl.origin;
}

/** Sends push messages after the response is flushed so the UI never waits on push services. */
export function schedulePush(req: NextRequest, notifications: Notification[] | undefined) {
  if (!notifications || notifications.length === 0) return;
  const origin = appOrigin(req);
  after(async () => {
    try {
      await dispatchPush(notifications, origin);
    } catch (error) {
      console.warn("[smi] push dispatch failed", (error as Error).message);
    }
  });
}
