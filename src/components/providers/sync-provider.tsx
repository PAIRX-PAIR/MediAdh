"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiError, UNAUTHORIZED_EVENT } from "@/lib/client/api";
import { playChime, unlockAudio } from "@/lib/client/sound";
import type { NotificationView, SyncPayload } from "@/lib/domain/views";

const VISIBLE_INTERVAL_MS = 15_000;
const HIDDEN_INTERVAL_MS = 120_000;

type ConnectionState = "online" | "syncing" | "offline" | "error";

interface SyncContextValue {
  data: SyncPayload;
  connection: ConnectionState;
  lastSyncedAt: number;
  /** Re-fetch now; call after every mutation. */
  refresh: () => Promise<void>;
  /** Notifications that arrived since the app opened and still need a popup. */
  popups: NotificationView[];
  dismissPopup: (id: string) => void;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function useSync(): SyncContextValue {
  const value = useContext(SyncContext);
  if (!value) throw new Error("useSync debe usarse dentro de <SyncProvider>");
  return value;
}

/**
 * Single source of live data for the HUD: polls /api/sync (ETag → 304 when
 * nothing changed), refreshes when the app regains focus, and turns new
 * notifications into popups with sound.
 */
export function SyncProvider({ initial, children }: { initial: SyncPayload; children: ReactNode }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [connection, setConnection] = useState<ConnectionState>("online");
  const [lastSyncedAt, setLastSyncedAt] = useState(() => Date.now());
  const [popups, setPopups] = useState<NotificationView[]>([]);
  const etag = useRef<string | null>(`"${initial.version}"`);
  const seen = useRef(new Set(initial.notifications.map((n) => n.id)));
  const inFlight = useRef<Promise<void> | null>(null);

  const ingest = useCallback((payload: SyncPayload) => {
    const fresh = payload.notifications.filter((n) => !seen.current.has(n.id) && !n.read);
    for (const n of payload.notifications) seen.current.add(n.id);
    if (fresh.length > 0) {
      setPopups((current) => [...fresh.reverse(), ...current].slice(0, 6));
      playChime(fresh.some((n) => n.urgent) ? "urgent" : "info");
      if ("setAppBadge" in navigator) void navigator.setAppBadge?.(payload.unread).catch(() => undefined);
    }
    setData(payload);
  }, []);

  const refresh = useCallback(async () => {
    if (inFlight.current) return inFlight.current;
    const run = (async () => {
      setConnection((c) => (c === "offline" ? c : "syncing"));
      try {
        const res = await fetch("/api/sync", {
          credentials: "same-origin",
          cache: "no-store",
          headers: { Accept: "application/json", ...(etag.current ? { "If-None-Match": etag.current } : {}) },
        });
        if (res.status === 304) {
          setConnection("online");
          setLastSyncedAt(Date.now());
          return;
        }
        if (res.status === 401 || res.status === 403) {
          const body = (await res.json().catch(() => ({}))) as { code?: string };
          if (body.code === "incomplete_profile") return;
          window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
          return;
        }
        if (!res.ok) throw new ApiError(res.status, "sync failed", "sync");
        etag.current = res.headers.get("etag");
        ingest((await res.json()) as SyncPayload);
        setConnection("online");
        setLastSyncedAt(Date.now());
      } catch {
        setConnection(navigator.onLine ? "error" : "offline");
      } finally {
        inFlight.current = null;
      }
    })();
    inFlight.current = run;
    return run;
  }, [ingest]);

  // Polling cadence follows visibility; refresh immediately on focus/online.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      clearTimeout(timer);
      const delay = document.visibilityState === "visible" ? VISIBLE_INTERVAL_MS : HIDDEN_INTERVAL_MS;
      timer = setTimeout(async () => {
        await refresh();
        schedule();
      }, delay);
    };
    const onWake = () => {
      if (document.visibilityState === "visible") void refresh();
      schedule();
    };
    const onOffline = () => setConnection("offline");
    schedule();
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    window.addEventListener("online", onWake);
    window.addEventListener("offline", onOffline);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      window.removeEventListener("online", onWake);
      window.removeEventListener("offline", onOffline);
    };
  }, [refresh]);

  // Push messages from the service worker trigger an immediate sync.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if ((event.data as { type?: string } | null)?.type === "smi:push") void refresh();
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [refresh]);

  // Unlock audio on the first interaction (browser autoplay policy).
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    const onUnauthorized = () => router.replace("/?acceso=1&expirada=1");
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [router]);

  const dismissPopup = useCallback((id: string) => setPopups((current) => current.filter((n) => n.id !== id)), []);

  const value = useMemo(
    () => ({ data, connection, lastSyncedAt, refresh, popups, dismissPopup }),
    [data, connection, lastSyncedAt, refresh, popups, dismissPopup],
  );
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
