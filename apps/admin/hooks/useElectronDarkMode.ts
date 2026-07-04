"use client";

import { useColorMode } from "@konfi/components/ui/color-mode";
import { useEffect } from "react";

/**
 * Hook to sync Electron's native dark mode with Chakra UI's color mode
 * Only active when running in Electron environment
 */
export function useElectronDarkMode() {
  const { setColorMode } = useColorMode();

  useEffect(() => {
    // Only run in Electron environment
    if (typeof window === "undefined" || !window.konfiDesktop?.appearance) {
      return;
    }

    // Get initial dark mode state and sync
    window.konfiDesktop.appearance.getDarkMode().then((isDark) => {
      setColorMode(isDark ? "dark" : "light");
    });

    // Listen for dark mode changes from Electron
    const cleanup = window.konfiDesktop.appearance.onDarkModeChange(
      (isDark) => {
        setColorMode(isDark ? "dark" : "light");
      },
    );

    return cleanup;
  }, [setColorMode]);
}
