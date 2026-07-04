import { nativeImage, Notification, shell } from "electron";
import * as fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import { randomUUID } from "node:crypto";
import * as os from "node:os";
import * as path from "node:path";
import {
  cleanupThumbnailCache,
  generateImageThumbnail,
  generatePdfThumbnail,
} from "../utils/thumbnails";
import { secureHandle } from "../security/ipc-guard";
import { readdirWithTimeout, statWithTimeout } from "../utils/network-fs";
import {
  getOrderRelativePath,
  isPathInside,
  resolveOrderFolderPath,
  resolveOrderRelativePath,
} from "../utils/desktop-paths";
import {
  clearPreviewRegistry,
  registerPreviewFile,
  releasePreviewFile,
  resolvePreviewFile,
} from "../utils/preview-registry";
import { convertPdfFile, type PdfConversionOptions } from "./pdf";

interface OrderFilesListPayload {
  baseFolderPath: string;
  orderNumber: number;
  itemFolder: string;
}

interface OrderFolderFilesListPayload {
  baseFolderPath: string;
  orderNumber: number;
}

interface OrderFileEntry {
  name: string;
  path: string;
  relativePath: string;
  size: number;
  modified: number;
  extension: string;
  kind: "image" | "pdf" | "other";
}

interface OrderFolderFileEntry extends OrderFileEntry {
  id: string;
}

interface OrderFolderEntry {
  id: string;
  name: string;
  relativePath: string;
  children: OrderFolderNode[];
}

type OrderFolderNode =
  | (OrderFolderFileEntry & { type: "file" })
  | (OrderFolderEntry & { type: "folder" });

interface PreviewOptions {
  width?: number;
  height?: number;
}

interface OrderFilePathPayload {
  baseFolderPath: string;
  orderNumber: number;
  relativePath: string;
}

interface OrderPreviewPayload extends OrderFilePathPayload {
  options?: PreviewOptions;
}

interface OrderPdfConversionPayload extends OrderFilePathPayload {
  options?: PdfConversionOptions;
}

interface PreviewResult {
  success: boolean;
  previewId?: string;
  previewUrl?: string;
  message?: string;
}

interface DragPayload {
  baseFolderPath: string;
  orderNumber: number;
  relativePaths: string[];
  iconPreviewId?: string | null;
}

const PREVIEW_TTL_MS = 10 * 60 * 1000; // 10 minutes
const PREVIEW_DIR = path.join(os.tmpdir(), "konfi-order-previews");
const previewTimers = new Map<string, NodeJS.Timeout>();

const DEFAULT_DRAG_ICON = nativeImage.createFromDataURL(
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAQZJREFUeNpi/P//PwMlgImBQkAwmQg0DMQAAihGhQHxfwGi/1CMwGJgYGB4/x8jKwMpBqRkYGD4nxdg9gCxH6kAGk6gNUC8H4gPgPxfjOAaWxQF4DSCaBqTzQAKTYA4j9UDYT1MT4AJpvAFkEXAdEv08E0FYD4ZoBsQz0D8Xwk0H4nJwBiM0D8H4n4L4ERE/N/A/F8XAFMNkaA+FkS0D8VwzQHwmToF4PxHB+IFNP4DYjF4PxNQPwfilIPxHC7Q/gDidgY2A+JEmA+E8S/gfifGogvgXifk2VgNgPxXi+C6IF4PxfH1QJqPxPCfgbiPUQxiww0EyCAAmUiANkMlEDaH4DMQwiRgOwHiGiBmA4j4kYtBbYP4vz8D4j0XwpiBoKwAifkMkN40wvMAAgwA2XBb9V9g/y8AAAAASUVORK5CYII=",
);

const notify = (title: string, body: string) => {
  if (!Notification.isSupported()) return;
  new Notification({ title, body }).show();
};

const ensurePreviewDir = async () => {
  await fs.mkdir(PREVIEW_DIR, { recursive: true });
};

const schedulePreviewCleanup = (previewId: string) => {
  const existing = previewTimers.get(previewId);
  if (existing) {
    clearTimeout(existing);
  }
  const timer = setTimeout(() => {
    const previewPath = releasePreviewFile(previewId);
    if (previewPath) {
      fs.unlink(previewPath).catch(() => undefined);
    }
    previewTimers.delete(previewId);
  }, PREVIEW_TTL_MS);
  previewTimers.set(previewId, timer);
};

export const refreshPreviewTTL = (previewId: string) => {
  if (previewTimers.has(previewId)) {
    schedulePreviewCleanup(previewId);
  }
};

/**
 * Sweep the preview directory and delete stale files
 * (files older than PREVIEW_TTL_MS or with no active timer)
 */
export const sweepStalePreviewsAsync = async () => {
  try {
    await ensurePreviewDir();
    const entries = await fs.readdir(PREVIEW_DIR, { withFileTypes: true });
    const now = Date.now();
    const staleThreshold = PREVIEW_TTL_MS;

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const fullPath = path.join(PREVIEW_DIR, entry.name);
      try {
        const stats = await fs.stat(fullPath);
        const age = now - stats.mtimeMs;
        // Delete if older than TTL
        if (age > staleThreshold) {
          await fs.unlink(fullPath);
          previewTimers.delete(fullPath);
        }
      } catch {
        // Ignore errors for individual files
      }
    }
  } catch (error) {
    console.warn("Failed to sweep stale previews:", error);
  }
};

/**
 * Cleanup all previews immediately (for app shutdown)
 */
export const cleanupAllPreviewsAsync = async () => {
  try {
    // Clear all timers
    for (const timer of previewTimers.values()) {
      clearTimeout(timer);
    }
    previewTimers.clear();
    clearPreviewRegistry();

    // Delete all files in preview directory
    await ensurePreviewDir();
    const entries = await fs.readdir(PREVIEW_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const fullPath = path.join(PREVIEW_DIR, entry.name);
      try {
        await fs.unlink(fullPath);
      } catch {
        // Ignore errors
      }
    }

    // Also cleanup thumbnail cache
    await cleanupThumbnailCache();
  } catch (error) {
    console.warn("Failed to cleanup all previews:", error);
  }
};

const classifyExtension = (extension: string): "image" | "pdf" | "other" => {
  switch (extension.toLowerCase()) {
    case ".png":
    case ".jpg":
    case ".jpeg":
    case ".gif":
    case ".webp":
    case ".bmp":
    case ".tiff":
    case ".tif":
      return "image";
    case ".pdf":
      return "pdf";
    default:
      return "other";
  }
};

const isMissingPathError = (error: unknown) =>
  error instanceof Error &&
  "code" in error &&
  (error.code === "ENOENT" || error.code === "ENOTDIR");

const directoryExistsQuietly = async (directoryPath: string) => {
  try {
    const stats = await fs.stat(directoryPath);
    return stats.isDirectory();
  } catch (error) {
    if (isMissingPathError(error)) {
      return false;
    }
    throw error;
  }
};

const createOrderFolderFileEntry = async (
  fullPath: string,
  name: string,
  relativePath: string,
): Promise<OrderFolderFileEntry | null> => {
  try {
    const stats = await statWithTimeout(fullPath, {
      timeoutMs: 5000,
    });
    const extension = path.extname(name);
    return {
      id: `${relativePath}-${stats.mtimeMs}-${stats.size}`,
      name,
      path: fullPath,
      relativePath,
      size: stats.size,
      modified: stats.mtimeMs,
      extension,
      kind: classifyExtension(extension),
    };
  } catch (error) {
    console.warn("Failed to stat file (timeout or error):", fullPath, error);
    return null;
  }
};

const listOrderDirectoryTree = async (
  directoryPath: string,
  parentPath: string,
  files: OrderFolderFileEntry[],
): Promise<OrderFolderNode[]> => {
  const entries = (await readdirWithTimeout(directoryPath, {
    withFileTypes: true,
    timeoutMs: 10000,
  })) as Dirent[];

  const nodes: OrderFolderNode[] = [];

  for (const entry of entries) {
    const relativePath = parentPath
      ? `${parentPath}/${entry.name}`
      : entry.name;
    const fullPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      try {
        nodes.push({
          type: "folder",
          id: relativePath,
          name: entry.name,
          relativePath,
          children: await listOrderDirectoryTree(fullPath, relativePath, files),
        });
      } catch (error) {
        console.warn("Failed to list directory:", fullPath, error);
      }
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const fileEntry = await createOrderFolderFileEntry(
      fullPath,
      entry.name,
      relativePath,
    );
    if (!fileEntry) {
      continue;
    }

    files.push(fileEntry);
    nodes.push({ ...fileEntry, type: "file" });
  }

  nodes.sort((first: OrderFolderNode, second: OrderFolderNode) => {
    if (first.type !== second.type) {
      return first.type === "folder" ? -1 : 1;
    }
    return first.name.localeCompare(second.name);
  });
  return nodes;
};

export const setupOrderFilesHandlers = (isPackaged: boolean) => {
  secureHandle(
    "orderFiles:list",
    async (_event, payload: OrderFilesListPayload) => {
      const { baseFolderPath, orderNumber, itemFolder } = payload;
      if (!baseFolderPath || !itemFolder) {
        return { success: false, message: "Missing parameters" };
      }

      try {
        const orderFolderPath = path.resolve(
          path.join(baseFolderPath, String(orderNumber)),
        );
        const itemPath = path.resolve(path.join(orderFolderPath, itemFolder));
        const relative = path.relative(orderFolderPath, itemPath);
        if (relative.startsWith("..") || path.isAbsolute(relative)) {
          return { success: false, message: "Invalid item folder path" };
        }

        const itemFolderExists = await directoryExistsQuietly(itemPath);
        if (!itemFolderExists) {
          return { success: true, files: [] };
        }

        // Use network-aware readdir with timeout (10 seconds for directory listings)
        const entries = (await readdirWithTimeout(itemPath, {
          withFileTypes: true,
          timeoutMs: 10000,
        })) as Dirent[];

        const files: OrderFileEntry[] = [];

        // Process files in parallel batches to improve performance
        const batchSize = 10;
        for (let i = 0; i < entries.length; i += batchSize) {
          const batch = entries.slice(i, i + batchSize);
          const batchResults = await Promise.allSettled(
            batch.map(async (entry) => {
              if (!entry.isFile()) return null;
              const fullPath = path.join(itemPath, entry.name);
              try {
                // Use network-aware stat with timeout
                const stats = await statWithTimeout(fullPath, {
                  timeoutMs: 5000,
                });
                const extension = path.extname(entry.name);
                const relativePath =
                  getOrderRelativePath(baseFolderPath, orderNumber, fullPath) ??
                  entry.name;
                return {
                  name: entry.name,
                  path: fullPath,
                  relativePath,
                  size: stats.size,
                  modified: stats.mtimeMs,
                  extension,
                  kind: classifyExtension(extension),
                };
              } catch (error) {
                console.warn(
                  "Failed to stat file (timeout or error):",
                  fullPath,
                  error,
                );
                return null;
              }
            }),
          );

          for (const result of batchResults) {
            if (result.status === "fulfilled" && result.value !== null) {
              files.push(result.value);
            }
          }
        }

        return { success: true, files };
      } catch (error) {
        if (isMissingPathError(error)) {
          return { success: true, files: [] };
        }

        console.error("Error listing order files:", error);
        return {
          success: false,
          message: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  );

  secureHandle(
    "orderFiles:listOrderFiles",
    async (_event, payload: OrderFolderFilesListPayload) => {
      const { baseFolderPath, orderNumber } = payload;
      if (!baseFolderPath || orderNumber === undefined) {
        return { success: false, message: "Missing parameters" };
      }

      try {
        const resolvedBasePath = path.resolve(baseFolderPath);
        const orderFolderPath = path.resolve(
          path.join(resolvedBasePath, String(orderNumber)),
        );
        if (!isPathInside(resolvedBasePath, orderFolderPath)) {
          return { success: false, message: "Invalid order folder path" };
        }

        const orderFolderExists = await directoryExistsQuietly(orderFolderPath);
        if (!orderFolderExists) {
          return { success: false, message: "Order folder not found" };
        }

        const files: OrderFolderFileEntry[] = [];
        const tree = await listOrderDirectoryTree(orderFolderPath, "", files);

        files.sort((first, second) =>
          first.relativePath.localeCompare(second.relativePath),
        );

        return { success: true, files, tree };
      } catch (error) {
        console.error("Error listing order folder files:", error);
        return {
          success: false,
          message: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  );

  secureHandle(
    "orderFiles:openOrderFolder",
    async (_event, payload: { baseFolderPath: string; orderNumber: number }) => {
      if (
        !payload ||
        typeof payload.baseFolderPath !== "string" ||
        typeof payload.orderNumber !== "number"
      ) {
        return false;
      }
      const orderFolderPath = resolveOrderFolderPath(
        payload.baseFolderPath,
        payload.orderNumber,
      );
      try {
        await fs.mkdir(orderFolderPath, { recursive: true });
        const result = await shell.openPath(orderFolderPath);
        return result === "";
      } catch (error) {
        console.error("Failed to open order folder:", error);
        return false;
      }
    },
  );

  secureHandle(
    "orderFiles:openContainingFolder",
    async (_event, payload: OrderFilePathPayload) => {
      if (
        !payload ||
        typeof payload.baseFolderPath !== "string" ||
        typeof payload.orderNumber !== "number" ||
        typeof payload.relativePath !== "string"
      ) {
        return false;
      }
      const filePath = resolveOrderRelativePath(
        payload.baseFolderPath,
        payload.orderNumber,
        payload.relativePath,
      );
      if (!filePath) return false;
      try {
        const result = await shell.openPath(path.dirname(filePath));
        return result === "";
      } catch (error) {
        console.error("Failed to open containing folder:", error);
        return false;
      }
    },
  );

  secureHandle(
    "orderFiles:flattenPdf",
    async (_event, payload: OrderPdfConversionPayload) => {
      if (
        !payload ||
        typeof payload.baseFolderPath !== "string" ||
        typeof payload.orderNumber !== "number" ||
        typeof payload.relativePath !== "string"
      ) {
        return { success: false, files: [], message: "Invalid PDF payload" };
      }
      const filePath = resolveOrderRelativePath(
        payload.baseFolderPath,
        payload.orderNumber,
        payload.relativePath,
      );
      if (!filePath) {
        return { success: false, files: [], message: "Invalid PDF path" };
      }
      const result = await convertPdfFile(
        filePath,
        path.dirname(filePath),
        { format: "pdf", pages: "all", density: 300, ...payload.options },
        isPackaged,
      );
      if (result.success) {
        notify(
          "PDF conversion completed",
          result.files.length === 1
            ? `Saved ${path.basename(result.files[0])}.`
            : `Saved ${result.files.length} files.`,
        );
      } else {
        notify("PDF conversion failed", result.message ?? "Unknown error");
      }
      return result;
    },
  );

  secureHandle(
    "orderFiles:generatePreview",
    async (
      _event,
      payload: OrderPreviewPayload,
    ): Promise<PreviewResult> => {
      if (
        !payload ||
        typeof payload.baseFolderPath !== "string" ||
        typeof payload.orderNumber !== "number" ||
        typeof payload.relativePath !== "string"
      ) {
        return { success: false, message: "Invalid preview payload" };
      }
      const filePath = resolveOrderRelativePath(
        payload.baseFolderPath,
        payload.orderNumber,
        payload.relativePath,
      );
      if (!filePath) {
        return { success: false, message: "Invalid file path" };
      }

      const { width = 256, height = 256 } = payload.options || {};
      await ensurePreviewDir();
      const outputPath = path.join(PREVIEW_DIR, `${randomUUID()}.png`);

      try {
        let image = await nativeImage.createThumbnailFromPath(filePath, {
          width,
          height,
        });
        if (!image || image.isEmpty()) {
          // Fallback for images and PDFs
          const ext = path.extname(filePath).toLowerCase();
          if (ext === ".pdf") {
            const result = await generatePdfThumbnail(
              filePath,
              outputPath,
              { page: 1, width, height },
              isPackaged,
            );
            if (result.success && result.path) {
              const preview = registerPreviewFile(result.path);
              schedulePreviewCleanup(preview.previewId);
              return { success: true, ...preview };
            }
            return { success: false, message: result.message };
          } else if (classifyExtension(ext) === "image") {
            const result = await generateImageThumbnail(filePath, outputPath, {
              width,
              height,
            });
            if (result.success && result.path) {
              const preview = registerPreviewFile(result.path);
              schedulePreviewCleanup(preview.previewId);
              return { success: true, ...preview };
            }
            return { success: false, message: result.message };
          }
          return { success: false, message: "Preview not available" };
        }

        const buffer = image.toPNG();
        await fs.writeFile(outputPath, buffer);
        const preview = registerPreviewFile(outputPath);
        schedulePreviewCleanup(preview.previewId);
        return { success: true, ...preview };
      } catch (error) {
        console.error("Error generating preview:", error);
        return {
          success: false,
          message: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  );

  secureHandle(
    "orderFiles:releasePreview",
    async (_event, previewId: string | null) => {
      if (!previewId) return false;
      const timer = previewTimers.get(previewId);
      if (timer) {
        clearTimeout(timer);
        previewTimers.delete(previewId);
      }
      const previewPath = releasePreviewFile(previewId);
      if (!previewPath) return false;
      try {
        await fs.unlink(previewPath);
        return true;
      } catch {
        return false;
      }
    },
  );

  secureHandle("orderFiles:startDrag", (event, payload: DragPayload) => {
    const { baseFolderPath, orderNumber, relativePaths, iconPreviewId } =
      payload;
    if (!Array.isArray(relativePaths) || relativePaths.length === 0) {
      return false;
    }
    const files = relativePaths
      .map((relativePath) =>
        resolveOrderRelativePath(baseFolderPath, orderNumber, relativePath),
      )
      .filter((filePath): filePath is string => Boolean(filePath));
    if (files.length === 0) return false;

    let iconImage: Electron.NativeImage | string | undefined;
    if (iconPreviewId) {
      const iconPath = resolvePreviewFile(iconPreviewId);
      const candidate = iconPath ? nativeImage.createFromPath(iconPath) : null;
      if (candidate && !candidate.isEmpty()) {
        iconImage = candidate;
      }
    }
    if (!iconImage) {
      iconImage = DEFAULT_DRAG_ICON;
    }

    event.sender.startDrag({
      file: files[0],
      files,
      icon: iconImage,
    });
    return true;
  });
};
