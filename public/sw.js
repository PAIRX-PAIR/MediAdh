/*
 * Service worker of Procesos productivos S.M.I.
 * - Push: the server sends Declarative Web Push JSON ({ web_push: 8030, notification: {...} }).
 *   Safari 18.4+ shows it without running this file; everywhere else this handler shows it.
 * - Every push also tells open windows to sync now (postMessage "smi:push").
 * - Offline: navigations fall back to the cached /offline page. API calls are never cached.
 */
const VERSION = "smi-v1";
const SHELL = ["/offline", "/icons/192", "/icons/96", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/offline").then((r) => r || Response.error())));
    return;
  }
  // Hashed build assets never change: cache first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((cache) => cache.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});

function parsePush(event) {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { notification: { title: "Procesos productivos S.M.I.", body: event.data ? event.data.text() : "" } };
  }
  const n = data.notification || {};
  return {
    title: n.title || "Procesos productivos S.M.I.",
    body: n.body || "",
    url: n.navigate || "/inicio",
    tag: n.tag,
    badge: n.app_badge || data.app_badge,
    urgent: Boolean(data.urgent),
  };
}

self.addEventListener("push", (event) => {
  const p = parsePush(event);
  const show = self.registration.showNotification(p.title, {
    body: p.body,
    icon: "/icons/192",
    badge: "/icons/96",
    tag: p.tag,
    renotify: Boolean(p.tag),
    requireInteraction: p.urgent,
    vibrate: p.urgent ? [200, 100, 200, 100, 400] : [120],
    lang: "es-CO",
    data: { url: p.url },
  });
  const notifyClients = self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const client of list) client.postMessage({ type: "smi:push" });
  });
  const badge =
    p.badge && "setAppBadge" in self.navigator ? self.navigator.setAppBadge(Number(p.badge)).catch(() => undefined) : Promise.resolve();
  event.waitUntil(Promise.all([show, notifyClients, badge]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/inicio", self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (new URL(client.url).origin === target.origin && "focus" in client) {
          client.postMessage({ type: "smi:push" });
          return client.focus().then((c) => (c && "navigate" in c ? c.navigate(target.href) : undefined));
        }
      }
      return self.clients.openWindow(target.href);
    }),
  );
});
