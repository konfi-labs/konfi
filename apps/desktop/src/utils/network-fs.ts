/**
 * Network-aware filesystem utilities to prevent lag when accessing
 * SMB shares or other network paths.
 */

import * as fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import * as path from "node:path";

interface TimeoutOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

interface FileStatResult {
  size: number;
  mtimeMs: number;
  isFile: () => boolean;
  isDirectory: () => boolean;
}

interface CacheEntry<T> {
  value: T;
  timestamp: number;
}

// Default timeout for network operations (5 seconds)
const DEFAULT_TIMEOUT_MS = 5000;

// Cache for frequently accessed paths (TTL: 30 seconds)
const CACHE_TTL_MS = 30 * 1000;
const pathCache = new Map<string, CacheEntry<unknown>>();

/**
 * Wraps a promise with a timeout to prevent indefinite blocking
 */
const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string,
): Promise<T> => {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
};

/**
 * Check if a path appears to be a network path
 * - Windows: UNC paths (\\server\share) or mapped drives
 * - Unix: mounted network filesystems
 */
const isLikelyNetworkPath = (filePath: string): boolean => {
  // Windows UNC paths
  if (filePath.startsWith("\\\\") || filePath.startsWith("//")) {
    return true;
  }

  // This is a heuristic - in production, you might want to check mount points
  // or use platform-specific APIs to detect network drives
  return false;
};

/**
 * Cached wrapper for getCacheKey
 */
const getCacheKey = (operation: string, filePath: string): string => {
  return `${operation}:${path.normalize(filePath)}`;
};

/**
 * Get cached value if still valid
 */
const getCached = <T>(key: string): T | null => {
  const entry = pathCache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;

  const age = Date.now() - entry.timestamp;
  if (age > CACHE_TTL_MS) {
    pathCache.delete(key);
    return null;
  }

  return entry.value;
};

/**
 * Store value in cache
 */
const setCache = <T>(key: string, value: T): void => {
  pathCache.set(key, {
    value,
    timestamp: Date.now(),
  });
};

/**
 * Read a file with timeout protection for network paths
 */
export const readFileWithTimeout = async (
  filePath: string,
  options?: { encoding?: BufferEncoding; timeoutMs?: number },
): Promise<string | Buffer> => {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const encoding = options?.encoding;

  const cacheKey = getCacheKey("readFile", filePath);
  const cached = getCached<string | Buffer>(cacheKey);
  if (cached !== null && encoding === "utf-8") {
    return cached;
  }

  try {
    let result: string | Buffer;
    if (encoding) {
      result = await withTimeout(
        fs.readFile(filePath, encoding),
        timeoutMs,
        `Timeout reading file: ${filePath}`,
      );
    } else {
      result = await withTimeout(
        fs.readFile(filePath),
        timeoutMs,
        `Timeout reading file: ${filePath}`,
      );
    }

    // Cache text files only
    if (encoding === "utf-8") {
      setCache(cacheKey, result);
    }

    return result;
  } catch (error) {
    console.error("Error reading file:", filePath, error);
    throw error;
  }
};

/**
 * Get file stats with timeout protection
 */
export const statWithTimeout = async (
  filePath: string,
  options?: TimeoutOptions,
): Promise<FileStatResult> => {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const cacheKey = getCacheKey("stat", filePath);
  const cached = getCached<FileStatResult>(cacheKey);
  if (cached !== null) {
    return cached;
  }

  try {
    const stats = await withTimeout(
      fs.stat(filePath),
      timeoutMs,
      `Timeout getting file stats: ${filePath}`,
    );

    const result: FileStatResult = {
      size: stats.size,
      mtimeMs: stats.mtimeMs,
      isFile: () => stats.isFile(),
      isDirectory: () => stats.isDirectory(),
    };

    setCache(cacheKey, result);
    return result;
  } catch (error) {
    console.error("Error getting file stats:", filePath, error);
    throw error;
  }
};

/**
 * Read directory with timeout protection and optional caching
 */
export const readdirWithTimeout = async (
  dirPath: string,
  options?: { timeoutMs?: number; withFileTypes?: boolean },
): Promise<string[] | Dirent[]> => {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const withFileTypes = options?.withFileTypes ?? false;

  const cacheKey = getCacheKey("readdir", dirPath);
  const cached = getCached<string[] | Dirent[]>(cacheKey);
  if (cached !== null) {
    return cached;
  }

  try {
    if (withFileTypes) {
      const entries = await withTimeout(
        fs.readdir(dirPath, { withFileTypes: true }),
        timeoutMs,
        `Timeout reading directory: ${dirPath}`,
      );
      setCache(cacheKey, entries);
      return entries;
    } else {
      const entries = await withTimeout(
        fs.readdir(dirPath),
        timeoutMs,
        `Timeout reading directory: ${dirPath}`,
      );
      setCache(cacheKey, entries);
      return entries;
    }
  } catch (error) {
    console.error("Error reading directory:", dirPath, error);
    throw error;
  }
};

/**
 * Check file access with timeout
 */
export const accessWithTimeout = async (
  filePath: string,
  mode?: number,
  options?: TimeoutOptions,
): Promise<void> => {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    await withTimeout(
      fs.access(filePath, mode),
      timeoutMs,
      `Timeout checking file access: ${filePath}`,
    );
  } catch (error) {
    console.error("Error checking file access:", filePath, error);
    throw error;
  }
};

/**
 * Write file with timeout protection
 */
export const writeFileWithTimeout = async (
  filePath: string,
  data: string | Buffer,
  options?: { encoding?: BufferEncoding; timeoutMs?: number },
): Promise<void> => {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const encoding = options?.encoding;

  try {
    const writePromise = encoding
      ? fs.writeFile(filePath, data, encoding)
      : fs.writeFile(filePath, data);

    await withTimeout(
      writePromise,
      timeoutMs,
      `Timeout writing file: ${filePath}`,
    );

    // Invalidate cache for this path
    const cacheKey = getCacheKey("readFile", filePath);
    pathCache.delete(cacheKey);
  } catch (error) {
    console.error("Error writing file:", filePath, error);
    throw error;
  }
};

/**
 * Clear cache for a specific path or all paths
 */
export const clearCache = (filePath?: string): void => {
  if (filePath) {
    const normalizedPath = path.normalize(filePath);
    for (const key of pathCache.keys()) {
      if (key.includes(normalizedPath)) {
        pathCache.delete(key);
      }
    }
  } else {
    pathCache.clear();
  }
};

/**
 * Get cache statistics
 */
export const getCacheStats = () => {
  return {
    size: pathCache.size,
    entries: Array.from(pathCache.keys()),
  };
};
