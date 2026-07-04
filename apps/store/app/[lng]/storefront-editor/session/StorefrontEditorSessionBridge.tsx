"use client";

import type { Locale } from "@konfi/types";
import { useEffect } from "react";

interface StorefrontEditorSessionBridgeProps {
  lng: Locale;
}

const isSessionResponse = (value: unknown): value is { redirectTo: string } =>
  Boolean(
    value &&
    typeof value === "object" &&
    typeof (value as { redirectTo?: unknown }).redirectTo === "string",
  );

export default function StorefrontEditorSessionBridge({
  lng,
}: StorefrontEditorSessionBridgeProps) {
  useEffect(() => {
    const controller = new AbortController();
    const fallbackPath = `/${lng}`;
    const previewPath = `/${lng}?preview=1`;
    const token = new URLSearchParams(window.location.hash.slice(1)).get(
      "token",
    );

    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`,
    );

    if (!token) {
      window.location.replace(fallbackPath);
      return () => controller.abort();
    }

    const establishSession = async () => {
      const response = await fetch("/api/storefront-editor/session", {
        body: JSON.stringify({ lng, token }),
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
        signal: controller.signal,
      });

      if (!response.ok) {
        window.location.replace(fallbackPath);
        return;
      }

      const body = (await response.json().catch(() => null)) as unknown;

      window.location.replace(
        isSessionResponse(body) ? body.redirectTo : previewPath,
      );
    };

    void establishSession().catch(() => {
      if (!controller.signal.aborted) {
        window.location.replace(fallbackPath);
      }
    });

    return () => controller.abort();
  }, [lng]);

  return null;
}
