"use client";

import { useEffect, useRef } from "react";

export function useScreenWakeLock(enabled: boolean, onError: (message: string) => void) {
  const lockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (!("wakeLock" in navigator)) {
      onError("Screen wake lock isn't supported by this browser.");
      return;
    }

    let cancelled = false;
    const requestLock = async () => {
      if (cancelled || document.visibilityState !== "visible" || lockRef.current) return;
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) {
          await lock.release();
          return;
        }

        lockRef.current = lock;
        lock.addEventListener("release", () => {
          if (lockRef.current === lock) lockRef.current = null;
          if (!cancelled && document.visibilityState === "visible") void requestLock();
        });
      } catch {
        if (!cancelled) onError("Couldn't keep the screen awake. Check browser support and permissions.");
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void requestLock();
      else lockRef.current = null;
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    void requestLock();
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      const lock = lockRef.current;
      lockRef.current = null;
      if (lock) void lock.release().catch(() => onError("Couldn't release the screen wake lock."));
    };
  }, [enabled, onError]);
}
