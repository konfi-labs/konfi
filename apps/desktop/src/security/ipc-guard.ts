import { app, ipcMain, type IpcMainInvokeEvent } from "electron";
import { ADMIN_URL, ALLOWED_ORIGINS, DEV_ADMIN_URL } from "../utils/constants";

const computeAllowedOrigins = (): Set<string> => {
  const origins = new Set<string>();

  const prodBase = ADMIN_URL;
  const addOrigin = (rawUrl: string | null | undefined) => {
    if (!rawUrl) return;
    try {
      const origin = new URL(rawUrl).origin;
      origins.add(origin);
    } catch (error) {
      console.warn("[IPC Guard] Ignoring invalid origin:", rawUrl, error);
    }
  };

  if (!app.isPackaged) {
    addOrigin(DEV_ADMIN_URL);
  }

  addOrigin(prodBase);

  ALLOWED_ORIGINS.forEach((value) => addOrigin(value));

  return origins;
};

const allowedOrigins = computeAllowedOrigins();

export const isAllowedSender = (event: IpcMainInvokeEvent): boolean => {
  try {
    const url = event.senderFrame?.url || event.sender?.getURL?.() || "";
    if (!url) {
      return false;
    }
    const origin = new URL(url).origin;
    if (process.platform === "win32") {
      return Array.from(allowedOrigins).some(
        (candidate) => candidate.toLowerCase() === origin.toLowerCase(),
      );
    }
    return allowedOrigins.has(origin);
  } catch (error) {
    console.warn("[IPC Guard] Failed to validate sender:", error);
    return false;
  }
};

export const secureHandle = <Args extends unknown[], Ret>(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: Args) => Promise<Ret> | Ret,
) => {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, async (event, ...args: Args) => {
    if (!isAllowedSender(event)) {
      console.warn(
        `[IPC Guard] Blocked unauthorized request on '${channel}' from`,
        event.senderFrame?.url,
      );
      throw new Error("Unauthorized IPC sender");
    }
    return handler(event, ...args);
  });
};
