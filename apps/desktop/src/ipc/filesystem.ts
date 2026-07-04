import { dialog, shell } from "electron";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { getMenuLabel } from "../utils/menu-i18n";
import { secureHandle } from "../security/ipc-guard";
import {
  readFileWithTimeout,
  accessWithTimeout,
  writeFileWithTimeout,
} from "../utils/network-fs";

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024; // 500 MB limit prevents runaway uploads
const TEMP_UPLOAD_DIR_NAME = "konfi-uploads";
const UNIQUE_NAME_ATTEMPT_LIMIT = 1000;
const PREVIEW_ROOT = path.resolve(
  path.join(os.tmpdir(), "konfi-order-previews"),
);

const createUniqueTempFileHandle = async (
  directory: string,
  originalFileName: string,
) => {
  const trimmedName = originalFileName?.trim().length
    ? originalFileName.trim()
    : "upload.bin";
  const safeFileName = path.basename(trimmedName);
  const extension = path.extname(safeFileName);
  const baseName =
    safeFileName.slice(0, safeFileName.length - extension.length) || "upload";
  let attempt = 0;

  while (attempt < UNIQUE_NAME_ATTEMPT_LIMIT) {
    const suffix = attempt === 0 ? "" : ` (${attempt})`;
    const candidateName = `${baseName}${suffix}${extension}`;
    const candidatePath = path.join(directory, candidateName);

    try {
      const handle = await fs.open(candidatePath, "wx");
      return { filePath: candidatePath, handle };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err?.code === "EEXIST") {
        attempt++;
        continue;
      }
      throw error;
    }
  }

  throw new Error("Unable to allocate unique temporary upload file name");
};

export const setupFilesystemHandlers = () => {
  // IPC Handlers for filesystem operations
  secureHandle("fs:readFile", async (_event, filePath: string) => {
    try {
      const content = await readFileWithTimeout(filePath, {
        encoding: "utf-8",
      });
      return content;
    } catch (error) {
      console.error("Error reading file:", error);
      throw error;
    }
  });

  // Read file as binary buffer (for images, PDFs, etc.)
  secureHandle("fs:readFileBuffer", async (_event, filePath: string) => {
    try {
      const buffer = (await readFileWithTimeout(filePath, {
        timeoutMs: 10000,
      })) as Buffer;
      return buffer;
    } catch (error) {
      console.error("Error reading file buffer:", error);
      throw error;
    }
  });

  secureHandle(
    "fs:writeFile",
    async (_event, filePath: string, data: string) => {
      try {
        // Check if file exists
        let fileExists = false;
        try {
          await accessWithTimeout(filePath);
          fileExists = true;
        } catch {
          // File doesn't exist, safe to write
        }

        if (fileExists) {
          const result = await dialog.showMessageBox({
            type: "warning",
            title: getMenuLabel("fileAlreadyExists"),
            message: getMenuLabel(
              "fileAlreadyExistsMessage",
              path.basename(filePath),
            ),
            detail: getMenuLabel("fileAlreadyExistsDetail"),
            buttons: [getMenuLabel("cancel"), getMenuLabel("replace")],
            defaultId: 0,
            cancelId: 0,
          });

          if (result.response === 0) {
            // User clicked Cancel
            return { success: false, cancelled: true };
          }
        }

        await writeFileWithTimeout(filePath, data, { encoding: "utf-8" });
        return { success: true };
      } catch (error) {
        console.error("Error writing file:", error);
        throw error;
      }
    },
  );

  secureHandle("fs:selectDirectory", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  secureHandle("fs:selectFile", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  secureHandle("fs:getDownloadsPath", async () => {
    // Get platform-specific downloads folder
    return path.join(os.homedir(), "Downloads");
  });

  secureHandle(
    "fs:saveUploadedFile",
    async (_event, fileBuffer: ArrayBuffer, fileName: string) => {
      try {
        const size = fileBuffer.byteLength ?? 0;
        if (size > MAX_UPLOAD_BYTES) {
          console.warn("Uploaded file exceeds size limit:", fileName, size);
          return null;
        }

        // Create a temporary directory for uploaded files
        const tempDir = path.join(os.tmpdir(), TEMP_UPLOAD_DIR_NAME);
        await fs.mkdir(tempDir, { recursive: true });

        const { filePath: tempFilePath, handle } =
          await createUniqueTempFileHandle(tempDir, fileName);
        const buffer = Buffer.from(fileBuffer);

        try {
          await handle.writeFile(buffer);
        } catch (writeError) {
          try {
            await handle.close();
          } catch {
            // ignore close error
          }
          try {
            await fs.unlink(tempFilePath);
          } catch {
            // ignore cleanup error
          }
          throw writeError;
        }

        try {
          await handle.close();
        } catch {
          // ignore close error
        }

        return tempFilePath;
      } catch (error) {
        console.error("Error saving uploaded file:", error);
        return null;
      }
    },
  );

  secureHandle(
    "fs:openFolder",
    async (_event, folderPath: string, createIfNotExists: boolean = true) => {
      try {
        // Check if folder exists (with timeout for network paths)
        try {
          await accessWithTimeout(folderPath);
        } catch {
          // Folder doesn't exist
          if (createIfNotExists) {
            console.log("Folder doesn't exist, creating:", folderPath);
            await fs.mkdir(folderPath, { recursive: true });
          } else {
            console.error("Folder doesn't exist:", folderPath);
            return false;
          }
        }
        // Open folder in system file explorer
        await shell.openPath(folderPath);
        return true;
      } catch (error) {
        console.error("Error opening folder:", error);
        return false;
      }
    },
  );

  secureHandle(
    "fs:readPreviewAsBase64",
    async (_event, previewPath: string): Promise<string | null> => {
      try {
        // Security check: ensure the file is within the preview directory
        const resolvedPath = path.resolve(previewPath);
        const relative = path.relative(PREVIEW_ROOT, resolvedPath);

        if (relative.startsWith("..") || path.isAbsolute(relative)) {
          console.error(
            "Attempted to read file outside preview directory:",
            previewPath,
          );
          return null;
        }

        const data = await fs.readFile(resolvedPath);
        return data.toString("base64");
      } catch (error) {
        console.error("Failed to read preview file as base64:", error);
        return null;
      }
    },
  );
};
