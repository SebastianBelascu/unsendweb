"use client";

import { useEffect } from "react";
import { pingDeviceActivity, registerDevice } from "@/lib/api/device";
import { getAvatarChanges } from "@/lib/api/users";
import { useRealtime } from "@/lib/realtime/store";

const HEARTBEAT_MS = 30 * 60 * 1000; // 30 min, matching native

/**
 * Registers this browser as a device (so Settings shows a real name) and keeps
 * its lastActiveAt fresh via a periodic + on-focus heartbeat. Also seeds the
 * avatar-version map once so other users' photos render. Renders nothing.
 */
export function DeviceRegistrar() {
  useEffect(() => {
    registerDevice().catch(() => {});
    pingDeviceActivity().catch(() => {});
    getAvatarChanges(0)
      .then((changes) => {
        if (changes.length)
          useRealtime.getState().mergeAvatarVersions(changes);
      })
      .catch(() => {});

    const iv = setInterval(() => pingDeviceActivity().catch(() => {}), HEARTBEAT_MS);
    return () => clearInterval(iv);
  }, []);

  return null;
}
