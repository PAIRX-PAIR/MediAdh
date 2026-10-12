"use client";

import { useCallback, useEffect, useState } from "react";
import { useSync } from "@/components/providers/sync-provider";
import { api } from "./api";

export type PushState =
  | "unsupported"
  /** iPhone/iPad in a Safari tab: push only works once added to the home screen. */
  | "ios-needs-install"
  | "not-configured"
  | "denied"
  | "default"
  | "subscribed";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

async function serverSync(sub: PushSubscription) {
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return;
  await api.push.subscribe({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth }, userAgent: navigator.userAgent.slice(0, 300) });
}

/**
 * Web Push: permission is requested only from a tap (Apple's rule) and the
 * subscription is re-synced with the server on every start, because
 * `pushsubscriptionchange` is unreliable (absent on iOS).
 */
export function usePush() {
  const { data, refresh } = useSync();
  const publicKey = data.push.publicKey;
  const [state, setState] = useState<PushState>("default");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      let next: PushState;
      if (!supported) next = isIos() && !isStandalone() ? "ios-needs-install" : "unsupported";
      else if (!data.push.configured || !publicKey) next = "not-configured";
      else if (Notification.permission === "denied") next = "denied";
      else {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          next = "subscribed";
          // Re-sync silently (the server ignores unchanged subscriptions).
          serverSync(sub).catch(() => undefined);
        } else next = "default";
      }
      if (!cancelled) setState(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [data.push.configured, publicKey]);

  const enable = useCallback(async () => {
    if (!publicKey) return;
    setBusy(true);
    setError(null);
    try {
      // Ask first, synchronously inside the tap: an await before this can consume the gesture on Safari.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "default");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
      await serverSync(sub);
      setState("subscribed");
      await refresh();
    } catch (e) {
      setError((e as Error).message || "No se pudieron activar los avisos.");
    } finally {
      setBusy(false);
    }
  }, [publicKey, refresh]);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api.push.unsubscribe(sub.endpoint).catch(() => undefined);
        await sub.unsubscribe();
      }
      setState("default");
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  return { state, enable, disable, busy, error };
}
