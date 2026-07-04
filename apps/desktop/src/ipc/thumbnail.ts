import * as fs from "fs/promises";
import * as path from "path";
import {
  generateImageThumbnail,
  generatePdfThumbnail,
} from "../utils/thumbnails";
import { secureHandle } from "../security/ipc-guard";
import { normalizeRelativePath, resolveOrderFolderPath } from "../utils/desktop-paths";

export const setupThumbnailHandlers = (isPackaged: boolean) => {
  // Generate thumbnail from PDF using Ghostscript
  secureHandle(
    "thumbnail:generateFromPdf",
    async (
      _event,
      pdfPath: string,
      outputPath: string,
      options?: {
        page?: number;
        width?: number;
        height?: number;
      },
    ) => generatePdfThumbnail(pdfPath, outputPath, options ?? {}, isPackaged),
  );

  // Generate thumbnail from image using Sharp
  secureHandle(
    "thumbnail:generateFromImage",
    async (
      _event,
      imagePath: string,
      outputPath: string,
      options?: {
        width?: number;
        height?: number;
      },
    ) => generateImageThumbnail(imagePath, outputPath, options ?? {}),
  );

  // Copy file to order folder
  secureHandle(
    "orderFiles:copyUploadedFileToItem",
    async (
      _event,
      payload: {
        fileBuffer: ArrayBuffer;
        fileName: string;
        baseFolderPath: string;
        orderNumber: number;
        itemFolder: string;
      },
    ) => {
      try {
        if (
          !payload ||
          !(payload.fileBuffer instanceof ArrayBuffer) ||
          typeof payload.fileName !== "string" ||
          typeof payload.baseFolderPath !== "string" ||
          typeof payload.orderNumber !== "number" ||
          typeof payload.itemFolder !== "string"
        ) {
          return { success: false, message: "Invalid upload payload", path: null };
        }

        const itemFolder = normalizeRelativePath(payload.itemFolder);
        if (!itemFolder) {
          return { success: false, message: "Invalid item folder path", path: null };
        }

        const orderRoot = resolveOrderFolderPath(
          payload.baseFolderPath,
          payload.orderNumber,
        );
        const itemFolderPath = path.resolve(path.join(orderRoot, itemFolder));
        await fs.mkdir(itemFolderPath, { recursive: true });

        const safeFileName = path.basename(payload.fileName);
        const destPath = path.resolve(path.join(itemFolderPath, safeFileName));
        const buffer = Buffer.from(payload.fileBuffer);
        await fs.writeFile(destPath, buffer);

        return {
          success: true,
          message: "File copied successfully",
          path: destPath,
        };
      } catch (error) {
        console.error("Error copying uploaded file:", error);
        return {
          success: false,
          message: error instanceof Error ? error.message : "Unknown error",
          path: null,
        };
      }
    },
  );

  secureHandle(
    "file:copyToOrderFolder",
    async (
      _event,
      sourcePath: string,
      orderFolderPath: string,
      itemName: string,
      fileName: string,
    ) => {
      try {
        // Create item subfolder inside the order directory
        const orderRoot = path.resolve(orderFolderPath);
        const itemFolderPath = path.resolve(path.join(orderRoot, itemName));
        const relativeItem = path.relative(orderRoot, itemFolderPath);
        if (relativeItem.startsWith("..") || path.isAbsolute(relativeItem)) {
          return {
            success: false,
            message: "Invalid item folder path",
            path: null,
          };
        }
        await fs.mkdir(itemFolderPath, { recursive: true });

        // Destination path (sanitize file name)
        const safeFileName = path.basename(fileName);
        const destPath = path.resolve(path.join(itemFolderPath, safeFileName));
        const relativeDest = path.relative(orderRoot, destPath);
        if (relativeDest.startsWith("..") || path.isAbsolute(relativeDest)) {
          return {
            success: false,
            message: "Invalid destination path",
            path: null,
          };
        }

        // Copy file
        await fs.copyFile(sourcePath, destPath);

        return {
          success: true,
          message: "File copied successfully",
          path: destPath,
        };
      } catch (error) {
        console.error("Error copying file:", error);
        return {
          success: false,
          message: error instanceof Error ? error.message : "Unknown error",
          path: null,
        };
      }
    },
  );
};
