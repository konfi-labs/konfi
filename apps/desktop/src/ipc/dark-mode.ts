import { BrowserWindow, nativeTheme } from "electron";
import { updateTitleBarOverlay } from "../utils/window-config";
import { secureHandle } from "../security/ipc-guard";

export const setupDarkModeHandlers = (mainWindow: BrowserWindow | null) => {
  secureHandle("dark-mode:toggle", () => {
    if (nativeTheme.shouldUseDarkColors) {
      nativeTheme.themeSource = "light";
    } else {
      nativeTheme.themeSource = "dark";
    }
    if (mainWindow) {
      updateTitleBarOverlay(mainWindow);
    }
    return nativeTheme.shouldUseDarkColors;
  });

  secureHandle("dark-mode:system", () => {
    nativeTheme.themeSource = "system";
    if (mainWindow) {
      updateTitleBarOverlay(mainWindow);
    }
  });

  secureHandle("dark-mode:get", () => {
    return nativeTheme.shouldUseDarkColors;
  });

  // Listen for native theme changes and notify renderer
  nativeTheme.on("updated", () => {
    if (mainWindow) {
      updateTitleBarOverlay(mainWindow);
    }
    mainWindow?.webContents.send(
      "dark-mode:changed",
      nativeTheme.shouldUseDarkColors,
    );
  });
};
