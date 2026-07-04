import { AppImageUpdater, MacUpdater, NsisUpdater } from "electron-updater";
import log from "electron-log";
import { app, dialog, Notification } from "electron";
import { ADMIN_URL } from "./utils/constants";

/**
 * Auto-updater module for the desktop application
 * Handles automatic updates using electron-updater with GitHub releases
 */

type DesktopAutoUpdater = AppImageUpdater | MacUpdater | NsisUpdater;

// Configure logging for debugging auto-update process
log.transports.file.level = "info";

let desktopAutoUpdater: DesktopAutoUpdater | null = null;

let hasInitializedAutoUpdater = false;
let hasRegisteredAutoUpdaterEvents = false;
let manualCheckInProgress = false;

const adminSessionRequiredMessage =
  "Please sign in to the admin app with an administrator account before checking for updates.";

const getUpdateFeedUrl = () => {
  return new URL("/api/desktop-updater", ADMIN_URL).toString();
};

const syncAutoUpdaterRequestHeaders = async (): Promise<boolean> => {
  const autoUpdater = getAutoUpdater();
  const authCookies = await autoUpdater.netSession.cookies.get({
    url: ADMIN_URL,
  });

  if (authCookies.length === 0) {
    autoUpdater.requestHeaders = null;
    return false;
  }

  const cookieHeader = authCookies
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");

  if (!cookieHeader) {
    autoUpdater.requestHeaders = null;
    return false;
  }

  autoUpdater.requestHeaders = {
    Cookie: cookieHeader,
  };

  return true;
};

const showAdminSessionRequiredDialog = async () => {
  await dialog.showMessageBox({
    type: "info",
    title: "Administrator Sign-In Required",
    message: adminSessionRequiredMessage,
  });
};

const downloadAvailableUpdate = async (autoUpdater: DesktopAutoUpdater) => {
  const hasAdminSession = await syncAutoUpdaterRequestHeaders();

  if (!hasAdminSession) {
    await showAdminSessionRequiredDialog();
    return;
  }

  await autoUpdater.downloadUpdate();
};

const createAutoUpdater = (): DesktopAutoUpdater => {
  const providerOptions = {
    channel: "latest",
    provider: "generic" as const,
    url: getUpdateFeedUrl(),
  };

  switch (process.platform) {
    case "darwin":
      return new MacUpdater(providerOptions);
    case "linux":
      return new AppImageUpdater(providerOptions);
    default:
      return new NsisUpdater(providerOptions);
  }
};

const getAutoUpdater = (): DesktopAutoUpdater => {
  if (desktopAutoUpdater) {
    return desktopAutoUpdater;
  }

  const updater = createAutoUpdater();
  updater.logger = log;
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = true;
  updater.allowDowngrade = false;
  updater.allowPrerelease = false;
  desktopAutoUpdater = updater;

  return updater;
};

const showNoUpdatesDialog = () => {
  dialog.showMessageBox({
    type: "info",
    title: "No Updates",
    message: `You are running the latest version (${app.getVersion()}).`,
  });
};

const showNativeNotification = (title: string, body: string) => {
  if (!Notification.isSupported()) return;
  new Notification({ title, body }).show();
};

/**
 * Initialize the auto-updater
 * This should be called once the app is ready
 */
export function initAutoUpdater(isPackaged: boolean): void {
  if (!isPackaged) {
    log.info("Auto-updater disabled in development mode");
    return;
  }

  if (hasInitializedAutoUpdater) {
    log.info("Auto-updater already initialized");
    return;
  }

  hasInitializedAutoUpdater = true;

  log.info("Initializing auto-updater", {
    feedUrl: getUpdateFeedUrl(),
    platform: process.platform,
    version: app.getVersion(),
  });

  // Register event handlers before the first check so startup events are not missed.
  setupAutoUpdaterEvents();

  // Check for updates on app start (silent check)
  void (async () => {
    const hasAdminSession = await syncAutoUpdaterRequestHeaders();

    if (!hasAdminSession) {
      log.info(
        "Skipping startup update check because no authenticated admin session was found.",
      );
      return;
    }

    await getAutoUpdater().checkForUpdates();
  })().catch((error: unknown) => {
    log.error("Startup update check failed:", error);
  });
}

/**
 * Check for updates manually (triggered by user)
 */
export async function checkForUpdates(): Promise<void> {
  if (!app.isPackaged) {
    await dialog.showMessageBox({
      type: "info",
      title: "Updates Unavailable",
      message: "Auto-update is only available in packaged desktop builds.",
    });
    return;
  }

  try {
    log.info("Manually checking for updates...");
    const hasAdminSession = await syncAutoUpdaterRequestHeaders();

    if (!hasAdminSession) {
      await showAdminSessionRequiredDialog();
      return;
    }

    manualCheckInProgress = true;
    const result = await getAutoUpdater().checkForUpdates();
    if (!result) {
      manualCheckInProgress = false;
      showNoUpdatesDialog();
    }
  } catch (error) {
    manualCheckInProgress = false;
    log.error("Error checking for updates:", error);
    dialog.showErrorBox(
      "Update Check Failed",
      "Failed to check for updates. Please try again later.",
    );
  }
}

/**
 * Set up auto-updater event handlers
 */
function setupAutoUpdaterEvents(): void {
  if (hasRegisteredAutoUpdaterEvents) {
    return;
  }

  hasRegisteredAutoUpdaterEvents = true;

  const autoUpdater = getAutoUpdater();

  autoUpdater.on("checking-for-update", () => {
    log.info("Checking for update...");
  });

  autoUpdater.on("update-available", (info) => {
    manualCheckInProgress = false;
    log.info("Update available:", info.version);
    dialog
      .showMessageBox({
        type: "info",
        title: "Update Available",
        message: `A new version ${info.version} is available. Would you like to download it now?`,
        buttons: ["Download", "Later"],
        defaultId: 0,
        cancelId: 1,
      })
      .then((result) => {
        if (result.response === 0) {
          void downloadAvailableUpdate(autoUpdater).catch((error: unknown) => {
            log.error("Failed to download update:", error);
            dialog.showErrorBox(
              "Update Download Failed",
              "The update could not be downloaded. Please try again later.",
            );
          });
        }
      });
  });

  autoUpdater.on("update-not-available", (info) => {
    if (manualCheckInProgress) {
      showNoUpdatesDialog();
      manualCheckInProgress = false;
    }

    log.info("Update not available:", info.version);
  });

  autoUpdater.on("error", (error) => {
    if (manualCheckInProgress) {
      manualCheckInProgress = false;
      dialog.showErrorBox(
        "Update Check Failed",
        "Failed to check for updates. Please try again later.",
      );
    }

    log.error("Auto-updater error:", error);
  });

  autoUpdater.on("download-progress", (progressObj) => {
    const logMessage = `Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}% (${progressObj.transferred}/${progressObj.total})`;
    log.info(logMessage);
  });

  autoUpdater.on("update-downloaded", (info) => {
    manualCheckInProgress = false;
    log.info("Update downloaded:", info.version);
    showNativeNotification(
      "Update Ready",
      `Konfi Desktop ${info.version} is ready to install.`,
    );
    dialog
      .showMessageBox({
        type: "info",
        title: "Update Ready",
        message: `Update ${info.version} has been downloaded. The application will restart to install the update.`,
        buttons: ["Restart Now", "Later"],
        defaultId: 0,
        cancelId: 1,
      })
      .then((result) => {
        if (result.response === 0) {
          autoUpdater.quitAndInstall(false, true);
        }
      });
  });
}
