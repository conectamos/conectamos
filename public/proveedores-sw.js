/* global self, clients */

const DEFAULT_URL = "/dashboard/proveedores";
const DEFAULT_ICON = "/branding/conectamos-logo.png";

function readPushPayload(event) {
  if (!event.data) return {};

  try {
    return event.data.json();
  } catch {
    try {
      return { body: event.data.text() };
    } catch {
      return {};
    }
  }
}

function safeTargetUrl(value) {
  try {
    const url = new URL(String(value || DEFAULT_URL), self.location.origin);
    return url.origin === self.location.origin
      ? url.href
      : new URL(DEFAULT_URL, self.location.origin).href;
  } catch {
    return new URL(DEFAULT_URL, self.location.origin).href;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener("push", (event) => {
  const payload = readPushPayload(event);
  const title = String(
    payload.title || "Vencimiento de proveedor"
  );
  const data =
    payload.data && typeof payload.data === "object"
      ? payload.data
      : {};

  event.waitUntil(
    self.registration.showNotification(title, {
      body: String(
        payload.body || "Tienes una factura de proveedor por revisar."
      ),
      icon: String(payload.icon || DEFAULT_ICON),
      badge: "/favicon.ico",
      tag: String(payload.tag || "factura-proveedor"),
      renotify: true,
      data: {
        ...data,
        url: safeTargetUrl(data.url),
      },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = safeTargetUrl(event.notification.data?.url);

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (windowClients) => {
        for (const client of windowClients) {
          if ("navigate" in client) {
            await client.navigate(targetUrl);
          }
          if ("focus" in client) {
            return client.focus();
          }
        }

        return clients.openWindow(targetUrl);
      })
  );
});
