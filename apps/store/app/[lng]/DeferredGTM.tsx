"use client";

import { useEffect } from "react";

/**
 * Defers loading Google Tag Manager until the first user interaction
 * (scroll, click, touch, or keydown) to keep it off the critical path
 * and avoid blocking LCP.
 */
export default function DeferredGTM({ gtmId }: { gtmId: string; }) {
  useEffect(() => {
    if (!gtmId) return;

    let loaded = false;

    function loadGTM() {
      if (loaded) return;
      loaded = true;

      const script = document.createElement("script");
      script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}`;
      script.async = true;
      document.head.appendChild(script);

      cleanup();
    }

    const events = ["scroll", "click", "touchstart", "keydown"] as const;

    function cleanup() {
      for (const event of events) {
        window.removeEventListener(event, loadGTM, { capture: true });
      }
    }

    for (const event of events) {
      window.addEventListener(event, loadGTM, {
        once: true,
        capture: true,
        passive: true,
      });
    }

    return cleanup;
  }, [gtmId]);

  return null;
}
