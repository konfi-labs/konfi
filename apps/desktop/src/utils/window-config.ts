import {
  BrowserWindow,
  BrowserWindowConstructorOptions,
  nativeTheme,
} from "electron";
import * as path from "path";

export const TITLEBAR_HEIGHT = 30; // Match the CSS height
export const MACOS_TRAFFIC_LIGHTS_HEIGHT = 14;

const TITLEBAR_COLORS = {
  light: {
    background: "#ffffff",
    symbol: "#101214",
  },
  dark: {
    background: "#040405",
    symbol: "#f9fafb",
  },
} as const;

const getTitleBarColors = () =>
  nativeTheme.shouldUseDarkColors
    ? TITLEBAR_COLORS.dark
    : TITLEBAR_COLORS.light;

export const getTitleBarOverlayOptions = (height = TITLEBAR_HEIGHT) => {
  const colors = getTitleBarColors();
  return {
    height,
    color: colors.background,
    symbolColor: colors.symbol,
  };
};

/**
 * Get default window configuration that can be reused across all windows.
 * This ensures consistent styling, security settings, and behavior.
 *
 * @param overrides - Optional overrides to customize specific window properties
 * @returns BrowserWindowConstructorOptions with default settings applied
 *
 * @example
 * // Create a window with default settings
 * const window = new BrowserWindow(getDefaultWindowOptions());
 *
 * @example
 * // Create a smaller modal window
 * const modalWindow = new BrowserWindow(getDefaultWindowOptions({
 *   width: 600,
 *   height: 400,
 *   modal: true,
 *   parent: mainWindow,
 * }));
 *
 * @example
 * // Create a child window with custom preload script
 * const childWindow = new BrowserWindow(getDefaultWindowOptions({
 *   width: 800,
 *   height: 600,
 *   webPreferences: {
 *     preload: path.join(__dirname, '..', 'custom-preload.js'),
 *     nodeIntegration: false,
 *     contextIsolation: true,
 *     sandbox: true,
 *   },
 * }));
 */
export const getDefaultWindowOptions = (
  overrides?: Partial<BrowserWindowConstructorOptions>,
): BrowserWindowConstructorOptions => {
  const colors = getTitleBarColors();

  return {
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      partition: "persist:konfi-admin",
    },
    backgroundColor: colors.background,
    titleBarStyle: "hidden",
    ...(process.platform !== "darwin"
      ? {
          titleBarOverlay: getTitleBarOverlayOptions(),
        }
      : {
          trafficLightPosition: {
            x: 20,
            y: TITLEBAR_HEIGHT / 2 - MACOS_TRAFFIC_LIGHTS_HEIGHT / 2,
          },
        }),
    acceptFirstMouse: true,
    ...overrides,
  };
};

/**
 * Update title bar overlay colors based on current dark mode setting.
 * Only works on Windows where titleBarOverlay is supported.
 *
 * @param window - The BrowserWindow to update
 */
export const updateTitleBarOverlay = (window: BrowserWindow) => {
  if (!window) return;

  // setTitleBarOverlay is only available on Windows
  if (process.platform !== "win32") return;

  window.setTitleBarOverlay(getTitleBarOverlayOptions());
};
