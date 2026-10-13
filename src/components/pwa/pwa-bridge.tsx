"use client";

import { useEffect } from "react";

/** Registers the service worker (push + offline shell). Extended by the PWA module. */
export function PwaBridge() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  }, []);
  return null;
}
