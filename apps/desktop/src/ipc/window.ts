import { BrowserWindow } from "electron";
import { secureHandle } from "../security/ipc-guard";
import {
  getTitleBarOverlayOptions,
  TITLEBAR_HEIGHT,
  updateTitleBarOverlay,
} from "../utils/window-config";

// Predefined zoom levels in percent: 25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500
const ZOOM_LEVELS = [
  0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5,
  3.0, 4.0, 5.0,
];

/**
 * Find the nearest zoom level from the predefined list
 */
const getNearestZoomLevel = (zoomFactor: number): number => {
  let nearest = ZOOM_LEVELS[0];
  let minDiff = Math.abs(zoomFactor - nearest);

  for (const level of ZOOM_LEVELS) {
    const diff = Math.abs(zoomFactor - level);
    if (diff < minDiff) {
      minDiff = diff;
      nearest = level;
    }
  }

  return nearest;
};

/**
 * Get the next zoom level (zoom in)
 */
const getNextZoomLevel = (currentZoom: number): number => {
  for (const level of ZOOM_LEVELS) {
    if (level > currentZoom) {
      return level;
    }
  }
  return ZOOM_LEVELS[ZOOM_LEVELS.length - 1]; // Max zoom
};

/**
 * Get the previous zoom level (zoom out)
 */
const getPreviousZoomLevel = (currentZoom: number): number => {
  for (let i = ZOOM_LEVELS.length - 1; i >= 0; i--) {
    if (ZOOM_LEVELS[i] < currentZoom) {
      return ZOOM_LEVELS[i];
    }
  }
  return ZOOM_LEVELS[0]; // Min zoom
};

export const setupWindowHandlers = (mainWindow: BrowserWindow | null) => {
  secureHandle("window:reload", async () => {
    if (mainWindow) {
      mainWindow.reload();
    }
  });

  secureHandle("window:getZoomFactor", async () => {
    if (mainWindow) {
      return mainWindow.webContents.getZoomFactor();
    }
    return 1;
  });

  secureHandle("window:setZoomFactor", async (_event, zoomFactor: number) => {
    if (mainWindow) {
      mainWindow.webContents.setZoomFactor(zoomFactor);

      // Update titlebar overlay height based on zoom factor
      if (process.platform === "win32") {
        // Windows titlebar has a minimum height of 30px, don't scale below 100%
        const adjustedHeight = Math.max(
          30,
          Math.round(TITLEBAR_HEIGHT * zoomFactor),
        );
        mainWindow.setTitleBarOverlay(
          getTitleBarOverlayOptions(adjustedHeight),
        );
      }

      return mainWindow.webContents.getZoomFactor();
    }
    return 1;
  });

  secureHandle("window:zoomIn", async () => {
    if (mainWindow) {
      const currentZoom = mainWindow.webContents.getZoomFactor();
      const newZoom = getNextZoomLevel(currentZoom);
      mainWindow.webContents.setZoomFactor(newZoom);

      // Update titlebar overlay height
      if (process.platform === "win32") {
        // Windows titlebar has a minimum height of 30px, don't scale below 100%
        const adjustedHeight = Math.max(
          30,
          Math.round(TITLEBAR_HEIGHT * newZoom),
        );
        mainWindow.setTitleBarOverlay(
          getTitleBarOverlayOptions(adjustedHeight),
        );
      }

      return newZoom;
    }
    return 1;
  });

  secureHandle("window:zoomOut", async () => {
    if (mainWindow) {
      const currentZoom = mainWindow.webContents.getZoomFactor();
      const newZoom = getPreviousZoomLevel(currentZoom);
      mainWindow.webContents.setZoomFactor(newZoom);

      // Update titlebar overlay height
      if (process.platform === "win32") {
        // Windows titlebar has a minimum height of 30px, don't scale below 100%
        const adjustedHeight = Math.max(
          30,
          Math.round(TITLEBAR_HEIGHT * newZoom),
        );
        mainWindow.setTitleBarOverlay(
          getTitleBarOverlayOptions(adjustedHeight),
        );
      }

      return newZoom;
    }
    return 1;
  });

  secureHandle("window:resetZoom", async () => {
    if (mainWindow) {
      mainWindow.webContents.setZoomFactor(1.0);

      // Reset titlebar overlay height
      if (process.platform === "win32") {
        updateTitleBarOverlay(mainWindow);
      }

      return 1.0;
    }
    return 1;
  });
};
