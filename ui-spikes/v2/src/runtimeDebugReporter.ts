import type { DeviceDebugSnapshot } from "./deviceDebugBridge";
import {
  getDebugClientId,
  getPageLoadedAtIso,
} from "./debugStateReporter";

function detectDevice(): "ipad" | "iphone" | "mac" | "other" {
  const userAgent = navigator.userAgent;
  if (
    /iPad/i.test(userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  ) {
    return "ipad";
  }
  if (/iPhone/i.test(userAgent)) return "iphone";
  if (/Macintosh|MacIntel/i.test(userAgent)) return "mac";
  return "other";
}

export function reportDebugRuntime(
  event: string,
  deviceDebugBridge: DeviceDebugSnapshot,
): void {
  void fetch("/__debug/runtime", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    keepalive: true,
    body: JSON.stringify({
      event,
      reportedAt: new Date().toISOString(),
      clientId: getDebugClientId(),
      pageLoadedAt: getPageLoadedAtIso(),
      device: detectDevice(),
      platform: navigator.platform,
      userAgent: navigator.userAgent,
      deviceDebugBridge,
    }),
  }).catch(() => {
    // Debug reporting must never affect product behavior.
  });
}
