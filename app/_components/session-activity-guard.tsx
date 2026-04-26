"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const INACTIVITY_LIMIT_MS = 20 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 60 * 1000;
const CHECK_INTERVAL_MS = 30 * 1000;

export default function SessionActivityGuard() {
  const pathname = usePathname();
  const authenticatedRef = useRef(false);
  const lastActivityAtRef = useRef(Date.now());
  const lastHeartbeatAtRef = useRef(0);
  const heartbeatPendingRef = useRef(false);
  const activitySinceHeartbeatRef = useRef(false);
  const loggingOutRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const refreshAuthState = async () => {
      try {
        const res = await fetch("/api/session", {
          cache: "no-store",
          credentials: "include",
        });

        if (!cancelled && res.ok) {
          authenticatedRef.current = true;
          lastActivityAtRef.current = Date.now();
          activitySinceHeartbeatRef.current = true;
          return;
        }
      } catch {}

      if (!cancelled) {
        authenticatedRef.current = false;
      }
    };

    void refreshAuthState();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    const markActivity = () => {
      if (!authenticatedRef.current) {
        return;
      }

      lastActivityAtRef.current = Date.now();
      activitySinceHeartbeatRef.current = true;
    };

    const heartbeat = async () => {
      if (
        !authenticatedRef.current ||
        heartbeatPendingRef.current ||
        Date.now() - lastHeartbeatAtRef.current < HEARTBEAT_INTERVAL_MS ||
        !activitySinceHeartbeatRef.current
      ) {
        return;
      }

      heartbeatPendingRef.current = true;

      try {
        const res = await fetch("/api/session/heartbeat", {
          method: "POST",
          credentials: "include",
        });

        if (!res.ok) {
          authenticatedRef.current = false;
          window.location.href = "/";
          return;
        }

        lastHeartbeatAtRef.current = Date.now();
        activitySinceHeartbeatRef.current = false;
      } catch {
        authenticatedRef.current = false;
        window.location.href = "/";
      } finally {
        heartbeatPendingRef.current = false;
      }
    };

    const logoutByInactivity = async () => {
      if (!authenticatedRef.current || loggingOutRef.current) {
        return;
      }

      loggingOutRef.current = true;

      try {
        await fetch("/api/logout", {
          method: "POST",
          credentials: "include",
        });
      } catch {}

      authenticatedRef.current = false;
      window.location.href = "/";
    };

    const interval = window.setInterval(() => {
      if (!authenticatedRef.current) {
        return;
      }

      if (Date.now() - lastActivityAtRef.current >= INACTIVITY_LIMIT_MS) {
        void logoutByInactivity();
        return;
      }

      void heartbeat();
    }, CHECK_INTERVAL_MS);

    const events: Array<keyof WindowEventMap> = [
      "click",
      "keydown",
      "mousemove",
      "scroll",
      "touchstart",
    ];

    events.forEach((eventName) => window.addEventListener(eventName, markActivity, { passive: true }));
    document.addEventListener("visibilitychange", markActivity);

    return () => {
      window.clearInterval(interval);
      events.forEach((eventName) =>
        window.removeEventListener(eventName, markActivity)
      );
      document.removeEventListener("visibilitychange", markActivity);
    };
  }, []);

  return null;
}
