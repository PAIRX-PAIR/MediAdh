import "server-only";
import { randomUUID } from "node:crypto";
import { activeHolderId } from "@/lib/domain/contracts";
import {
  RETENTION,
  type Audience,
  type AuditEntry,
  type Collection,
  type Notification,
  type NotificationType,
  type Position,
  type User,
} from "@/lib/domain/schema";
import type { Principal } from "../auth/principal";

export const newId = () => randomUUID();
export const nowIso = () => new Date().toISOString();

export function folio(prefix: string, seq: number) {
  return `${prefix}-${String(seq).padStart(4, "0")}`;
}

export function nextSeq<T>(collection: Collection<T>): number {
  collection.seq += 1;
  return collection.seq;
}

export interface Actor {
  id: string | null;
  name: string | null;
}

export const actorOf = (principal: Principal | null): Actor =>
  principal ? { id: principal.user.id, name: principal.user.displayName } : { id: null, name: null };

export function audit(
  log: Collection<AuditEntry>,
  actor: Actor,
  action: string,
  target: string | null = null,
  detail: string | null = null,
) {
  log.items.push({ id: newId(), at: nowIso(), actorId: actor.id, actorName: actor.name, action, target, detail });
  if (log.items.length > RETENTION.audit) log.items.splice(0, log.items.length - RETENTION.audit);
}

export interface NewNotification {
  audience: Audience;
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
  urgent?: boolean;
}

export function pushNotification(
  notifications: Collection<Notification>,
  actor: Actor,
  input: NewNotification,
): Notification {
  const notification: Notification = {
    id: newId(),
    audience: input.audience,
    type: input.type,
    title: input.title.slice(0, 140),
    body: input.body.slice(0, 400),
    link: input.link ?? null,
    urgent: input.urgent ?? false,
    actorId: actor.id,
    createdAt: nowIso(),
    // The author has obviously seen it.
    readBy: actor.id ? [actor.id] : [],
  };
  notifications.items.push(notification);
  if (notifications.items.length > RETENTION.notifications) {
    notifications.items.splice(0, notifications.items.length - RETENTION.notifications);
  }
  return notification;
}

/** Users who currently have admin rights (standalone admins + holders of admin positions). */
export function adminUserIds(users: User[], positions: Position[], today: string): string[] {
  const ids = new Set<string>();
  for (const u of users) if (u.kind === "admin" && u.status === "active") ids.add(u.id);
  for (const p of positions) {
    if (!p.grantsAdmin) continue;
    const holder = activeHolderId(p, today);
    if (holder && users.find((u) => u.id === holder)?.status === "active") ids.add(holder);
  }
  return [...ids];
}

/** Concrete recipients of a notification right now. */
export function recipientsOf(audience: Audience, users: User[], positions: Position[], today: string): string[] {
  switch (audience.kind) {
    case "admins":
      return adminUserIds(users, positions, today);
    case "user":
      return [audience.userId];
    case "position": {
      const position = positions.find((p) => p.id === audience.positionId);
      const holder = position ? activeHolderId(position, today) : null;
      return holder ? [holder] : [];
    }
    case "all": {
      const ids = new Set(adminUserIds(users, positions, today));
      for (const p of positions) {
        const holder = activeHolderId(p, today);
        if (holder) ids.add(holder);
      }
      return [...ids];
    }
  }
}

export function normalizeUsername(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}

export const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])$/;
