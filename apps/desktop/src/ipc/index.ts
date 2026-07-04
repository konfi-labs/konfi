import { BrowserWindow } from "electron";
import { setupAiImagesHandlers } from "./ai-images";
import { setupDarkModeHandlers } from "./dark-mode";
import { setupFilesystemHandlers } from "./filesystem";
import { setupOrderFilesHandlers } from "./order-files";
import { setupPdfHandlers } from "./pdf";
import { setupThumbnailHandlers } from "./thumbnail";
import { setupUpdaterHandlers } from "./updater";
import { setupWindowHandlers } from "./window";

export const setupIpcHandlers = (
  mainWindow: BrowserWindow | null,
  isPackaged: boolean,
) => {
  setupDarkModeHandlers(mainWindow);
  setupFilesystemHandlers();
  setupWindowHandlers(mainWindow);
  setupPdfHandlers(isPackaged);
  setupThumbnailHandlers(isPackaged);
  setupOrderFilesHandlers(isPackaged);
  setupUpdaterHandlers();
  setupAiImagesHandlers();
};
