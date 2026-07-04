import { execFile } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import sharp from "sharp";
import { promisify } from "util";
import { resolveBundledExecutable } from "./ghostscript";

const execFileAsync = promisify(execFile);

// Configuration constants
const MAX_FILE_SIZE_MB = 200; // Skip files larger than 200MB
const LARGE_FILE_THRESHOLD_MB = 50; // Use lower DPI for files > 50MB
const MAX_CONCURRENT_OPERATIONS = 3; // Limit concurrent thumbnail generation
const DEFAULT_DPI = 150;
const LOW_DPI = 72;
const CACHE_DIR = path.join(os.tmpdir(), "konfi-thumbnail-cache");
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Queue for limiting concurrent operations
let activeOperations = 0;
const operationQueue: Array<() => void> = [];

export interface ThumbnailResult {
  success: boolean;
  message: string;
  path: string | null;
  fromCache?: boolean;
}

export interface PdfThumbnailOptions {
  page?: number;
  width?: number;
  height?: number;
  forceLowDpi?: boolean;
}

export interface ImageThumbnailOptions {
  width?: number;
  height?: number;
}

/**
 * Ensure cache directory exists
 */
const ensureCacheDir = async (): Promise<void> => {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch (error) {
    console.error("Failed to create cache directory:", error);
  }
};

/**
 * Generate cache key from file path and stats
 */
const generateCacheKey = (
  filePath: string,
  mtime: number,
  size: number,
): string => {
  const hash = crypto.createHash("sha256");
  hash.update(`${filePath}:${mtime}:${size}`);
  return hash.digest("hex");
};

/**
 * Get cached thumbnail if it exists and is valid
 */
const getCachedThumbnail = async (filePath: string): Promise<string | null> => {
  try {
    const stats = await fs.stat(filePath);
    const cacheKey = generateCacheKey(filePath, stats.mtimeMs, stats.size);
    const cachedPath = path.join(CACHE_DIR, `${cacheKey}.png`);

    try {
      const cacheStats = await fs.stat(cachedPath);
      const age = Date.now() - cacheStats.mtimeMs;

      if (age < CACHE_TTL_MS) {
        // Verify the cached file actually exists and is readable
        try {
          await fs.access(cachedPath, fs.constants.R_OK);
          return cachedPath;
        } catch {
          // Cached file is not readable, delete it
          await fs.unlink(cachedPath).catch(() => undefined);
        }
      } else {
        // Cache expired, delete it
        await fs.unlink(cachedPath).catch(() => undefined);
      }
    } catch {
      // Cache doesn't exist
    }
  } catch (error) {
    console.error("Error checking cache:", error);
  }
  return null;
};

/**
 * Save thumbnail to cache
 */
const saveThumbnailToCache = async (
  filePath: string,
  thumbnailPath: string,
): Promise<string> => {
  try {
    await ensureCacheDir();
    const stats = await fs.stat(filePath);
    const cacheKey = generateCacheKey(filePath, stats.mtimeMs, stats.size);
    const cachedPath = path.join(CACHE_DIR, `${cacheKey}.png`);

    await fs.copyFile(thumbnailPath, cachedPath);

    // Verify the cached file was created successfully
    try {
      await fs.access(cachedPath, fs.constants.R_OK);
      return cachedPath;
    } catch {
      // If cached file is not accessible, return original path
      console.warn(
        "Cached thumbnail file could not be verified, using original path",
      );
      return thumbnailPath;
    }
  } catch (error) {
    console.error("Error saving to cache:", error);
    return thumbnailPath;
  }
};

/**
 * Check file size and return whether it should be processed
 */
const checkFileSize = async (
  filePath: string,
): Promise<{ shouldProcess: boolean; isLarge: boolean; sizeMB: number }> => {
  try {
    const stats = await fs.stat(filePath);
    const sizeMB = stats.size / (1024 * 1024);

    return {
      shouldProcess: sizeMB <= MAX_FILE_SIZE_MB,
      isLarge: sizeMB > LARGE_FILE_THRESHOLD_MB,
      sizeMB,
    };
  } catch (error) {
    console.error("Error checking file size:", error);
    return { shouldProcess: false, isLarge: false, sizeMB: 0 };
  }
};

/**
 * Queue system to limit concurrent operations
 */
const queueOperation = <T>(operation: () => Promise<T>): Promise<T> => {
  return new Promise((resolve, reject) => {
    const executeOperation = async () => {
      activeOperations++;
      try {
        const result = await operation();
        resolve(result);
      } catch (error) {
        reject(error);
      } finally {
        activeOperations--;
        // Process next operation in queue
        const nextOp = operationQueue.shift();
        if (nextOp) {
          nextOp();
        }
      }
    };

    if (activeOperations < MAX_CONCURRENT_OPERATIONS) {
      executeOperation();
    } else {
      operationQueue.push(executeOperation);
    }
  });
};

/**
 * Clean up old cache entries
 */
export const cleanupThumbnailCache = async (): Promise<void> => {
  try {
    await ensureCacheDir();
    const entries = await fs.readdir(CACHE_DIR, { withFileTypes: true });
    const now = Date.now();

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const fullPath = path.join(CACHE_DIR, entry.name);
      try {
        const stats = await fs.stat(fullPath);
        const age = now - stats.mtimeMs;
        if (age > CACHE_TTL_MS) {
          await fs.unlink(fullPath);
        }
      } catch {
        // Ignore errors for individual files
      }
    }
  } catch (error) {
    console.warn("Failed to cleanup thumbnail cache:", error);
  }
};

export const findGhostscriptExecutable = async (
  isPackaged: boolean,
): Promise<string | null> => {
  const commands = ["gswin64c", "gswin32c", "gs"];

  for (const cmd of commands) {
    const bundled = await resolveBundledExecutable(cmd, isPackaged);
    if (bundled) return bundled;

    if (process.platform === "win32") {
      try {
        const { stdout } = await execFileAsync("where", [cmd], {
          shell: true,
          timeout: 5000,
        });
        const paths = stdout.trim().split(/\r?\n/).filter(Boolean);
        if (paths[0]) return paths[0];
      } catch {
        // continue
      }
    } else {
      try {
        const { stdout } = await execFileAsync("which", [cmd], {
          timeout: 5000,
        });
        const result = stdout.trim();
        if (result) return result;
      } catch {
        // continue
      }
    }
  }

  return null;
};

export const generatePdfThumbnail = async (
  pdfPath: string,
  outputPath: string,
  options: PdfThumbnailOptions,
  isPackaged: boolean,
): Promise<ThumbnailResult> => {
  return queueOperation(async () => {
    try {
      // Check cache first
      const cachedThumbnail = await getCachedThumbnail(pdfPath);
      if (cachedThumbnail) {
        return {
          success: true,
          message: "Thumbnail loaded from cache",
          path: cachedThumbnail,
          fromCache: true,
        };
      }

      // Check file size
      const { shouldProcess, isLarge, sizeMB } = await checkFileSize(pdfPath);
      if (!shouldProcess) {
        return {
          success: false,
          message: `File too large (${sizeMB.toFixed(1)}MB). Maximum size is ${MAX_FILE_SIZE_MB}MB.`,
          path: null,
        };
      }

      const {
        page = 1,
        width = 200,
        height = 200,
        forceLowDpi = false,
      } = options;
      const useLowDpi = forceLowDpi || isLarge;

      const gsPath = await findGhostscriptExecutable(isPackaged);
      if (!gsPath) {
        return {
          success: false,
          message: "Ghostscript not found",
          path: null,
        };
      }

      const tempDir = path.dirname(outputPath);
      await fs.mkdir(tempDir, { recursive: true });
      const tempPng = path.join(tempDir, `temp_${Date.now()}.png`);

      const dpi = useLowDpi ? LOW_DPI : DEFAULT_DPI;

      const args = [
        "-dNOPAUSE",
        "-dBATCH",
        "-dSAFER",
        "-sDEVICE=png16m",
        `-r${dpi}`,
        `-dFirstPage=${page}`,
        `-dLastPage=${page}`,
        "-dTextAlphaBits=4",
        "-dGraphicsAlphaBits=4",
        `-sOutputFile=${tempPng}`,
        pdfPath,
      ];

      await execFileAsync(gsPath, args, {
        cwd: path.dirname(gsPath),
        windowsHide: true,
        timeout: 30000,
      });

      await sharp(tempPng)
        .resize(width, height, {
          fit: "inside",
          withoutEnlargement: false,
        })
        .png({ quality: 90 })
        .toFile(outputPath);

      await fs.unlink(tempPng).catch(() => undefined);

      // Verify the output file was created
      try {
        await fs.access(outputPath, fs.constants.R_OK);
      } catch {
        return {
          success: false,
          message: "Thumbnail file was not created successfully",
          path: null,
        };
      }

      // Save to cache
      const cachedPath = await saveThumbnailToCache(pdfPath, outputPath);

      return {
        success: true,
        message: useLowDpi
          ? "Thumbnail generated (low quality for large file)"
          : "Thumbnail generated",
        path: cachedPath,
        fromCache: false,
      };
    } catch (error) {
      console.error("Error generating PDF thumbnail:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
        path: null,
      };
    }
  });
};

export const generateImageThumbnail = async (
  imagePath: string,
  outputPath: string,
  options: ImageThumbnailOptions,
): Promise<ThumbnailResult> => {
  return queueOperation(async () => {
    try {
      // Check cache first
      const cachedThumbnail = await getCachedThumbnail(imagePath);
      if (cachedThumbnail) {
        return {
          success: true,
          message: "Thumbnail loaded from cache",
          path: cachedThumbnail,
          fromCache: true,
        };
      }

      // Check file size
      const { shouldProcess, sizeMB } = await checkFileSize(imagePath);
      if (!shouldProcess) {
        return {
          success: false,
          message: `File too large (${sizeMB.toFixed(1)}MB). Maximum size is ${MAX_FILE_SIZE_MB}MB.`,
          path: null,
        };
      }

      const { width = 200, height = 200 } = options;
      const outputDir = path.dirname(outputPath);
      await fs.mkdir(outputDir, { recursive: true });

      await sharp(imagePath)
        .resize(width, height, {
          fit: "inside",
          withoutEnlargement: false,
        })
        .png({ quality: 90 })
        .toFile(outputPath);

      // Verify the output file was created
      try {
        await fs.access(outputPath, fs.constants.R_OK);
      } catch {
        return {
          success: false,
          message: "Thumbnail file was not created successfully",
          path: null,
        };
      }

      // Save to cache
      const cachedPath = await saveThumbnailToCache(imagePath, outputPath);

      return {
        success: true,
        message: "Thumbnail generated",
        path: cachedPath,
        fromCache: false,
      };
    } catch (error) {
      console.error("Error generating image thumbnail:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
        path: null,
      };
    }
  });
};
