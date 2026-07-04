import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  Menu,
  net,
  protocol,
  screen,
  shell,
} from "electron";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { checkForUpdates, initAutoUpdater } from "./auto-updater";
import { setupIpcHandlers } from "./ipc";
import {
  cleanupAllPreviewsAsync,
  sweepStalePreviewsAsync,
} from "./ipc/order-files";
import { ADMIN_URL, COMPANY_URL, DEV_ADMIN_URL } from "./utils/constants";
import {
  augmentPATHWithBundledTools,
  configureGhostscriptEnv,
} from "./utils/ghostscript";
import { DEFAULT_LOCALE, getMenuLabel } from "./utils/menu-i18n";
import { resolvePreviewFile } from "./utils/preview-registry";
import {
  getTitleBarOverlayOptions,
  getDefaultWindowOptions,
  TITLEBAR_HEIGHT,
  updateTitleBarOverlay,
} from "./utils/window-config";
import { loadWindowState, saveWindowState } from "./utils/window-state";

// Register the custom scheme before app ready (privileged for subresource loads)
protocol.registerSchemesAsPrivileged([
  {
    scheme: "konfi-preview",
    privileges: {
      standard: true,
      secure: true,
      corsEnabled: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);

const getMime = (filePath: string): string => {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".bmp":
      return "image/bmp";
    case ".tif":
    case ".tiff":
      return "image/tiff";
    default:
      return "application/octet-stream";
  }
};

const isSafeHttpProtocol = (value: string) =>
  value === "http:" || value === "https:";
const isSafeExternalProtocol = (value: string) =>
  isSafeHttpProtocol(value) || value === "mailto:" || value === "tel:";

let mainWindow: BrowserWindow | null = null;

const IS_DEV = !app.isPackaged;

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  });
}

class PreviewProtocolError extends Error {
  public readonly status: number;

  public constructor(message: string, status: number) {
    super(message);
    this.name = "PreviewProtocolError";
    this.status = status;
  }
}

interface ResolvedPreviewPath {
  readonly previewId: string;
  readonly resolvedPath: string;
}

const resolvePreviewRequest = (rawUrl: string): ResolvedPreviewPath => {
  const requestUrl = new URL(rawUrl);
  if (requestUrl.hostname !== "preview") {
    throw new PreviewProtocolError(`Invalid preview host: ${rawUrl}`, 400);
  }
  const previewId = decodeURIComponent(requestUrl.pathname.replace(/^\/+/u, ""));
  const resolvedPath = previewId ? resolvePreviewFile(previewId) : null;

  if (!resolvedPath) {
    throw new PreviewProtocolError(`Unknown preview id: ${previewId}`, 404);
  }
  return { previewId, resolvedPath };
};
const createWindow = async () => {
  const windowState = await loadWindowState(
    app.getPath("userData"),
    screen.getAllDisplays().map((display) => display.workArea),
  );
  mainWindow = new BrowserWindow(
    getDefaultWindowOptions({
      x: windowState.x,
      y: windowState.y,
      width: windowState.width,
      height: windowState.height,
    }),
  );
  mainWindow.webContents.setZoomFactor(windowState.zoomFactor);
  if (windowState.maximized) {
    mainWindow.maximize();
  }

  updateTitleBarOverlay(mainWindow);

  const baseAdminUrl = IS_DEV ? DEV_ADMIN_URL : ADMIN_URL;
  const adminUrl = `${baseAdminUrl}/${DEFAULT_LOCALE}`;
  const allowedHost = new URL(baseAdminUrl).host;

  // Restrict navigation to only the admin app domain
  mainWindow.webContents.on("will-navigate", (event, url) => {
    try {
      const targetUrl = new URL(url);
      if (!isSafeHttpProtocol(targetUrl.protocol)) {
        console.warn(
          "Blocked navigation to unsafe protocol:",
          targetUrl.protocol,
        );
        event.preventDefault();
        return;
      }
      const { host } = targetUrl;
      if (host !== allowedHost) {
        console.warn("Blocked navigation to disallowed host:", host);
        event.preventDefault();
      }
    } catch (error) {
      console.error("Invalid URL in will-navigate:", url, error);
      event.preventDefault();
    }
  });

  // Configure window open handler to preserve settings for new windows
  // This handles links with target="_blank" and window.open() calls
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const targetUrl = new URL(url);
      if (!isSafeHttpProtocol(targetUrl.protocol)) {
        if (isSafeExternalProtocol(targetUrl.protocol)) {
          shell.openExternal(url).catch((error) => {
            console.error("Failed to open external URL:", url, error);
          });
        } else {
          console.warn(
            "Blocked external URL with unsafe protocol:",
            targetUrl.protocol,
          );
        }
        return { action: "deny" };
      }

      const { host } = targetUrl;

      // Allow opening windows only on the admin host
      if (host === allowedHost) {
        return {
          action: "allow",
          overrideBrowserWindowOptions: getDefaultWindowOptions({
            width: 1400,
            height: 900,
          }),
        };
      }

      // Open external HTTP(S) links in system browser
      shell.openExternal(url).catch((error) => {
        console.error("Failed to open external URL:", url, error);
      });

      return { action: "deny" };
    } catch (error) {
      console.error("Invalid URL in setWindowOpenHandler:", url, error);
      return { action: "deny" };
    }
  });

  mainWindow.webContents.session.setPermissionRequestHandler(
    (_webContents, _permission, callback) => {
      callback(false);
    },
  );

  mainWindow.webContents.on("will-attach-webview", (event) => {
    console.warn("Blocked attempt to attach webview.");
    event.preventDefault();
  });

  mainWindow.webContents.on("context-menu", (_event, params) => {
    const template: Electron.MenuItemConstructorOptions[] = [];

    if (params.linkURL) {
      try {
        const linkUrl = new URL(params.linkURL);
        if (isSafeExternalProtocol(linkUrl.protocol)) {
          template.push(
            {
              label: getMenuLabel("openLink"),
              click: () => {
                void shell.openExternal(params.linkURL);
              },
            },
            {
              label: getMenuLabel("copyLink"),
              click: () => {
                clipboard.writeText(params.linkURL);
              },
            },
            { type: "separator" },
          );
        }
      } catch {
        // Ignore invalid renderer-provided links.
      }
    }

    if (params.isEditable) {
      template.push(
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "delete" },
        { type: "separator" },
        { role: "selectAll" },
      );
    } else if (params.selectionText) {
      template.push({ role: "copy" });
    }

    if (template.length > 0) {
      Menu.buildFromTemplate(template).popup({
        window: mainWindow ?? undefined,
      });
    }
  });

  // When a new window is created via window.open(), apply theme
  mainWindow.webContents.on("did-create-window", (newWindow) => {
    updateTitleBarOverlay(newWindow);

    // Open DevTools in development for child windows too
    if (IS_DEV) {
      newWindow.webContents.openDevTools();
    }
  });

  // Listen for zoom level changes and update titlebar height accordingly
  mainWindow.webContents.on("zoom-changed", (_event, zoomDirection) => {
    if (!mainWindow) return;

    const currentZoom = mainWindow.webContents.getZoomFactor();
    let newZoom = currentZoom;

    // Predefined zoom levels
    const ZOOM_LEVELS = [0.8, 0.9, 1.0, 1.1, 1.25];
    const TOLERANCE = 0.01; // Small tolerance for floating point comparison

    if (zoomDirection === "in") {
      // Find next zoom level (with tolerance to avoid skipping due to rounding)
      for (const level of ZOOM_LEVELS) {
        if (level > currentZoom + TOLERANCE) {
          newZoom = level;
          break;
        }
      }
      if (newZoom === currentZoom) {
        newZoom = ZOOM_LEVELS[ZOOM_LEVELS.length - 1]; // Max zoom
      }
    } else if (zoomDirection === "out") {
      // Find previous zoom level (with tolerance to avoid skipping due to rounding)
      for (let i = ZOOM_LEVELS.length - 1; i >= 0; i--) {
        if (ZOOM_LEVELS[i] < currentZoom - TOLERANCE) {
          newZoom = ZOOM_LEVELS[i];
          break;
        }
      }
      if (newZoom === currentZoom) {
        newZoom = ZOOM_LEVELS[0]; // Min zoom
      }
    }

    mainWindow.webContents.setZoomFactor(newZoom);

    // Update titlebar overlay height for Windows
    if (process.platform === "win32") {
      // Windows titlebar has a minimum height of 30px, don't scale below 100%
      const adjustedHeight = TITLEBAR_HEIGHT * newZoom;
      mainWindow.setTitleBarOverlay(getTitleBarOverlayOptions(adjustedHeight));
    }
  });

  // Load the URL
  mainWindow.loadURL(adminUrl);

  // Add error handling for failed URL loads
  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL) => {
      console.error("Failed to load URL:", validatedURL);
      console.error("Error code:", errorCode);
      console.error("Error description:", errorDescription);

      // Show error message to user
      dialog.showErrorBox(
        "Failed to Load Admin App",
        `Could not load the admin application from ${validatedURL}.\n\nError: ${errorDescription}\n\nPlease check your internet connection and try again.`,
      );
    },
  );

  // Open DevTools in development
  if (IS_DEV) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.on("close", () => {
    if (!mainWindow) return;
    void saveWindowState(app.getPath("userData"), mainWindow).catch((error) => {
      console.warn("Failed to persist desktop window state:", error);
    });
  });
};

/**
 * Create application menu with update check option
 */
const createApplicationMenu = () => {
  const isMac = process.platform === "darwin";

  const template: Electron.MenuItemConstructorOptions[] = [
    // App menu (macOS only)
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              {
                label: getMenuLabel("checkForUpdates"),
                click: checkForUpdates,
              },
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          },
        ]
      : []),
    // File menu
    {
      label: getMenuLabel("fileMenu"),
      submenu: [isMac ? { role: "close" as const } : { role: "quit" as const }],
    },
    // Edit menu
    {
      label: getMenuLabel("editMenu"),
      submenu: [
        { role: "undo" as const },
        { role: "redo" as const },
        { type: "separator" as const },
        { role: "cut" as const },
        { role: "copy" as const },
        { role: "paste" as const },
        ...(isMac
          ? [
              { role: "pasteAndMatchStyle" as const },
              { role: "delete" as const },
              { role: "selectAll" as const },
              { type: "separator" as const },
              {
                label: getMenuLabel("speechMenu"),
                submenu: [
                  { role: "startSpeaking" as const },
                  { role: "stopSpeaking" as const },
                ],
              },
            ]
          : [
              { role: "delete" as const },
              { type: "separator" as const },
              { role: "selectAll" as const },
            ]),
      ],
    },
    // View menu
    {
      label: getMenuLabel("viewMenu"),
      submenu: [
        { role: "reload" as const },
        { role: "forceReload" as const },
        { role: "toggleDevTools" as const },
        { type: "separator" as const },
        { role: "resetZoom" as const },
        { role: "zoomIn" as const },
        { role: "zoomOut" as const },
        { type: "separator" as const },
        { role: "togglefullscreen" as const },
      ],
    },
    // Window menu
    {
      label: getMenuLabel("windowMenu"),
      submenu: [
        { role: "minimize" as const },
        ...(isMac
          ? [
              { type: "separator" as const },
              { role: "front" as const },
              { type: "separator" as const },
              { role: "window" as const },
            ]
          : [{ role: "close" as const }]),
      ],
    },
    // Help menu
    {
      role: "help" as const,
      submenu: [
        ...(!isMac
          ? [
              {
                label: getMenuLabel("checkForUpdates"),
                click: checkForUpdates,
              },
              { type: "separator" as const },
            ]
          : []),
        {
          label: getMenuLabel("learnMore"),
          click: async () => {
            const { shell } = await import("electron");
            await shell.openExternal(COMPANY_URL);
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) {
    return;
  }

  // Ensure bundled tools are discoverable and properly wired
  augmentPATHWithBundledTools(app.isPackaged);
  await configureGhostscriptEnv(app.isPackaged);

  // Cleanup stale preview files and thumbnail cache from previous sessions
  await sweepStalePreviewsAsync();

  // Import and run thumbnail cache cleanup
  const { cleanupThumbnailCache } = await import("./utils/thumbnails");
  await cleanupThumbnailCache();

  // Serve local preview images safely via custom protocol
  protocol.handle("konfi-preview", async (request) => {
    try {
      const { previewId, resolvedPath } = resolvePreviewRequest(request.url);
      const response = await net.fetch(pathToFileURL(resolvedPath).toString());
      if (!response.headers.has("content-type")) {
        response.headers.set("content-type", getMime(resolvedPath));
      }
      void import("./ipc/order-files").then(({ refreshPreviewTTL }) =>
        refreshPreviewTTL?.(previewId),
      );
      return response;
    } catch (err) {
      if (err instanceof PreviewProtocolError) {
        const body =
          err.status === 403
            ? "Forbidden"
            : err.status === 415
              ? "Unsupported Media Type"
              : "Bad Request";
        return new Response(body, { status: err.status });
      }
      return new Response("Not Found", { status: 404 });
    }
  });

  await createWindow();

  // Setup all IPC handlers
  setupIpcHandlers(mainWindow, app.isPackaged);

  // Initialize auto-updater (only in production)
  initAutoUpdater(app.isPackaged);

  // Create application menu with update check option
  createApplicationMenu();

  // Register reload shortcut (Ctrl/Cmd+R) in development
  if (IS_DEV) {
    globalShortcut.register("CommandOrControl+R", () => {
      if (mainWindow) {
        mainWindow.reload();
      }
    });

    // Also register F5 as an alternative
    globalShortcut.register("F5", () => {
      if (mainWindow) {
        mainWindow.reload();
      }
    });
  }

  app.on("activate", () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Clean up shortcuts and previews before quitting
app.on("will-quit", async (event) => {
  event.preventDefault();
  globalShortcut.unregisterAll();
  await cleanupAllPreviewsAsync();
  app.exit(0);
});
