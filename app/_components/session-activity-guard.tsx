"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const INACTIVITY_LIMIT_MS = 60 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 60 * 1000;
const CHECK_INTERVAL_MS = 30 * 1000;
const REQUEST_TIMEOUT_MS = 15 * 1000;

export default function SessionActivityGuard() {
  const pathname = usePathname();

  useEffect(() => {
    let disposed = false;
    let authState: "unknown" | "active" | "inactive" = "unknown";
    let checkingSession = false;
    let heartbeatPending = false;
    let lastActivityAt = Date.now();
    let lastHeartbeatAt = 0;
    let lastSessionCheckAt = 0;
    let activityRevision = 1;
    let acknowledgedRevision = 0;
    const requests = new Set<AbortController>();

    const request = async (url: string, method = "GET") => {
      const controller = new AbortController();
      requests.add(controller);
      const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(url, {
          method,
          cache: "no-store",
          credentials: "include",
          signal: controller.signal,
        });
        const data: unknown = response.ok && method === "GET" ? await response.json() : null;
        return { ok: response.ok, status: response.status, data };
      } finally {
        window.clearTimeout(timeout);
        requests.delete(controller);
      }
    };

    const checkSession = async () => {
      if (disposed || checkingSession) return;
      checkingSession = true;
      try {
        const response = await request("/api/session");
        if (disposed) return;

        // Only the server can confirm that the current shared session expired.
        // A local tab's idle clock must never revoke another active tab's session.
        if (response.status === 401) {
          authState = "inactive";
          if (pathname !== "/") window.location.href = "/";
          return;
        }

        if (!response.ok || !response.data || typeof response.data !== "object") return;
        const user = response.data as { id?: unknown };
        if (typeof user.id !== "number" || !Number.isInteger(user.id) || user.id <= 0) return;
        authState = "active";
      } catch {
        // Network, timeout and malformed responses do not prove the session expired.
      } finally {
        lastSessionCheckAt = Date.now();
        checkingSession = false;
      }
    };

    const heartbeat = async () => {
      if (
        disposed || authState !== "active" || heartbeatPending ||
        document.visibilityState === "hidden" ||
        Date.now() - lastHeartbeatAt < HEARTBEAT_INTERVAL_MS ||
        activityRevision === acknowledgedRevision
      ) return;

      heartbeatPending = true;
      const attemptedAt = Date.now();
      const attemptedRevision = activityRevision;
      try {
        const response = await request("/api/session/heartbeat", "POST");
        if (disposed) return;
        if (response.status === 401 || response.status === 403) {
          // A delayed heartbeat may belong to the session before navigation/login.
          // Recheck the current cookie instead of redirecting on that old response.
          await checkSession();
          return;
        }
        if (!response.ok) return;
        // Keep activity that happened while this request was pending.
        acknowledgedRevision = attemptedRevision;
      } catch {
        // Retry after the normal interval without clearing the current session.
      } finally {
        lastHeartbeatAt = attemptedAt;
        heartbeatPending = false;
      }
    };

    const markActivity = () => {
      if (disposed || authState !== "active" || document.visibilityState === "hidden") return;
      lastActivityAt = Date.now();
      activityRevision += 1;
    };

    const initialize = async () => {
      await checkSession();
      if (!disposed) await heartbeat();
    };
    void initialize();

    const interval = window.setInterval(() => {
      if (disposed || authState === "inactive") return;
      if (authState === "unknown" || Date.now() - lastActivityAt >= INACTIVITY_LIMIT_MS) {
        // This read does not renew lastSeen. The server still enforces one hour
        // of inactivity, including when every tab has stopped receiving activity.
        if (Date.now() - lastSessionCheckAt >= HEARTBEAT_INTERVAL_MS) void checkSession();
        return;
      }
      void heartbeat();
    }, CHECK_INTERVAL_MS);

    const events: Array<keyof WindowEventMap> = [
      "click", "keydown", "mousemove", "scroll", "touchstart", "focus", "pageshow",
    ];
    events.forEach(event => window.addEventListener(event, markActivity, { passive: true }));
    document.addEventListener("visibilitychange", markActivity);

    return () => {
      disposed = true;
      window.clearInterval(interval);
      requests.forEach(controller => controller.abort());
      events.forEach(event => window.removeEventListener(event, markActivity));
      document.removeEventListener("visibilitychange", markActivity);
    };
  }, [pathname]);

  return null;
}
