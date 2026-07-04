import { app } from "electron";
import { checkForUpdates } from "../auto-updater";
import { secureHandle } from "../security/ipc-guard";

/**
 * IPC handlers for desktop updater actions.
 */
export const setupUpdaterHandlers = () => {
  secureHandle("updater:checkForUpdates", async () => {
    await checkForUpdates();
  });

  secureHandle("updater:getVersion", async () => {
    return app.getVersion();
  });
};
