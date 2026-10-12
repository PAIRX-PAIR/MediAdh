import "server-only";
import webpush, { WebPushError } from "web-push";
import type { Notification } from "@/lib/domain/schema";
import { todayIn } from "@/lib/domain/time";
import { vapidConfig } from "./env";
import { recipientsOf } from "./services/common";
import { getDb } from "./store";

const PUSH_TIMEOUT_MS = 8000;
/** Apple caps payloads at 4 KB; stay well below. */
const MAX_PAYLOAD_BYTES = 3000;

let configuredWith: string | null = null;
function ensureVapid() {
  const cfg = vapidConfig();
  if (!cfg) return null;
  if (configuredWith !== cfg.publicKey) {
    webpush.setVapidDetails(cfg.subject, cfg.publicKey, cfg.privateKey);
    configuredWith = cfg.publicKey;
  }
  return cfg;
}

/**
 * Declarative Web Push payload (Safari 18.4+ shows it without running the
 * service worker); our service worker parses the same shape everywhere else.
 */
export function buildPayload(notification: Notification, origin: string, badgeCount?: number): string {
  const navigate = new URL(notification.link ?? "/panel", origin).toString();
  const payload = {
    web_push: 8030,
    notification: {
      title: notification.title,
      body: notification.body,
      navigate,
      lang: "es-CO",
      dir: "ltr",
      tag: notification.id,
      ...(badgeCount ? { app_badge: String(badgeCount) } : {}),
    },
    urgent: notification.urgent,
    type: notification.type,
  };
  let text = JSON.stringify(payload);
  if (Buffer.byteLength(text) > MAX_PAYLOAD_BYTES) {
    payload.notification.body = `${notification.body.slice(0, 600)}…`;
    text = JSON.stringify(payload);
  }
  return text;
}

/**
 * Sends push messages for freshly committed notifications. Push is only a
 * wake-up signal: the notification itself is already stored and the app
 * fetches it on launch/visibility, so failures here are logged, not fatal.
 */
export async function dispatchPush(notifications: Notification[], origin: string) {
  if (notifications.length === 0 || !ensureVapid()) return;
  const db = getDb();
  const { users, positions, settings, push } = await db.read(["users", "positions", "settings", "push"]);
  const today = todayIn(settings.timezone);
  const dead = new Set<string>();

  const jobs: Promise<void>[] = [];
  for (const notification of notifications) {
    const recipients = recipientsOf(notification.audience, users.items, positions.items, today).filter(
      (id) => id !== notification.actorId,
    );
    for (const sub of push.items) {
      if (!recipients.includes(sub.userId)) continue;
      jobs.push(
        webpush
          .sendNotification(
            { endpoint: sub.endpoint, keys: sub.keys },
            buildPayload(notification, origin),
            { TTL: notification.urgent ? 24 * 3600 : 6 * 3600, urgency: notification.urgent ? "high" : "normal", timeout: PUSH_TIMEOUT_MS },
          )
          .then(() => undefined)
          .catch((error: unknown) => {
            if (error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410)) {
              dead.add(sub.id);
            } else {
              console.warn("[smi] push failed", (error as Error).message);
            }
          }),
      );
    }
  }
  await Promise.all(jobs);

  if (dead.size > 0) {
    await db.transact(["push"], "Elimina suscripciones push expiradas", ({ push: subs }) => {
      subs.items = subs.items.filter((s) => !dead.has(s.id));
    });
  }
}

export async function sendTestPush(userId: string, origin: string): Promise<{ sent: number; failed: number }> {
  if (!ensureVapid()) return { sent: 0, failed: 0 };
  const { push } = await getDb().read(["push"]);
  let sent = 0;
  let failed = 0;
  const payload = JSON.stringify({
    web_push: 8030,
    notification: {
      title: "Prueba de avisos",
      body: "Si ves esto, los avisos funcionan en este dispositivo.",
      navigate: new URL("/perfil", origin).toString(),
      lang: "es-CO",
      dir: "ltr",
    },
    type: "test",
  });
  await Promise.all(
    push.items
      .filter((s) => s.userId === userId)
      .map((s) =>
        webpush
          .sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload, { TTL: 600, urgency: "high", timeout: PUSH_TIMEOUT_MS })
          .then(() => void sent++)
          .catch(() => void failed++),
      ),
  );
  return { sent, failed };
}
