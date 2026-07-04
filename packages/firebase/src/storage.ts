import { ListResults, OrderItem } from "@konfi/types";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import { isUndefined } from "es-toolkit";
import { isEmpty } from "es-toolkit/compat";
import {
  FirebaseStorage,
  getDownloadURL as getFirebaseDownloadURL,
  getMetadata as getFirebaseMetadata,
  ref as getStorageRef,
  list as storageList,
  type ListResult as FirebaseStorageListResult,
  UploadResult,
} from "firebase/storage";
import { initStorage, storage as firebaseStorage } from "./lib";
import { tenantStoragePaths } from "./tenant-paths";

const STORAGE_LIST_CACHE_TTL_MS = 60 * 1000;
const STORAGE_LIST_CACHE_MAX_ENTRIES = 250;

interface StorageListCacheEntry {
  expiresAt: number;
  path: string;
  promise: Promise<FirebaseStorageListResult>;
}

const storageListCache = new Map<string, StorageListCacheEntry>();

function pruneStorageListCache(now = Date.now()) {
  for (const [cacheKey, entry] of storageListCache) {
    if (entry.expiresAt <= now) {
      storageListCache.delete(cacheKey);
    }
  }

  while (storageListCache.size > STORAGE_LIST_CACHE_MAX_ENTRIES) {
    const oldestCacheKey = storageListCache.keys().next().value;
    if (typeof oldestCacheKey !== "string") {
      break;
    }

    storageListCache.delete(oldestCacheKey);
  }
}

function buildThumbStoragePath(fullPath: string) {
  const filePath = `thumb_${fullPath}`;
  const fileName = filePath.substring(
    filePath.lastIndexOf("/") + 1,
    filePath.lastIndexOf("."),
  );
  const thumbFileName = `thumb_${fileName}.png`;

  return `${filePath.substring(0, filePath.lastIndexOf("/"))}/${thumbFileName}`;
}

function resolveStorageInstance(storageInstance?: FirebaseStorage) {
  if (storageInstance) {
    return storageInstance;
  }
  if (!firebaseStorage) {
    initStorage();
  }
  return firebaseStorage;
}

export async function uploadFiles(
  data: { file?: File; url: string }[],
  storageInstance?: FirebaseStorage,
) {
  const resolvedStorage = resolveStorageInstance(storageInstance);
  const ref = (await import("firebase/storage")).ref;
  const uploadBytes = (await import("firebase/storage")).uploadBytes;
  const uploadTasks: Promise<UploadResult>[] = [];
  if (Array.isArray(data)) {
    for (let i = 0; i < data.length; i++) {
      const dataElement = data[i];
      if (dataElement.file === undefined) {
        console.info(dataElement.url, "File is undefined, skipping upload");
        continue;
      }
      const newFileRef = ref(resolvedStorage, dataElement.url);
      uploadTasks.push(uploadBytes(newFileRef, dataElement.file));
    }
    await Promise.all(uploadTasks);
    data.forEach((dataElement) => {
      if (dataElement.file !== undefined) {
        invalidateStorageListCacheForPath(dataElement.url);
      }
    });
  }
}

export async function upload(
  data: { file?: File; url: string }[],
  storageInstance?: FirebaseStorage,
) {
  try {
    await uploadFiles(data, storageInstance);
  } catch (error) {
    console.error(error);
  }
}

function normalizeStoragePath(path?: string | null) {
  return (path ?? "").trim().replace(/^\/+/, "");
}

function normalizeStorageListPath(path?: string | null) {
  return normalizeStoragePath(path).replace(/\/+$/g, "");
}

function getStorageListCacheKey(operation: "list" | "listAll", path?: string) {
  return `${operation}:${normalizeStorageListPath(path)}`;
}

function deleteMatchingStorageListCacheEntries(path?: string) {
  const normalizedPath = normalizeStorageListPath(path);
  pruneStorageListCache();

  for (const [cacheKey, entry] of storageListCache) {
    if (
      normalizedPath === "" ||
      entry.path === "" ||
      entry.path === normalizedPath ||
      entry.path.startsWith(`${normalizedPath}/`) ||
      normalizedPath.startsWith(`${entry.path}/`)
    ) {
      storageListCache.delete(cacheKey);
    }
  }
}

function invalidateStorageListCacheForPath(path?: string | null) {
  deleteMatchingStorageListCacheEntries(path ?? undefined);
}

async function getCachedStorageListResult(
  path: string | undefined,
  operation: "list" | "listAll",
  storageInstance?: FirebaseStorage,
): Promise<FirebaseStorageListResult> {
  const resolvedStorage = resolveStorageInstance(storageInstance);

  const normalizedPath = normalizeStorageListPath(path);
  const cacheKey = getStorageListCacheKey(operation, normalizedPath);
  const now = Date.now();
  pruneStorageListCache(now);
  const cached = storageListCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    return cached.promise;
  }

  const promise = (async () => {
    const storageRef = getStorageRef(resolvedStorage, normalizedPath);

    if (operation === "list") {
      return storageList(storageRef);
    }

    const listAll = (await import("firebase/storage")).listAll;
    return listAll(storageRef);
  })();

  storageListCache.set(cacheKey, {
    expiresAt: now + STORAGE_LIST_CACHE_TTL_MS,
    path: normalizedPath,
    promise,
  });
  pruneStorageListCache(now);

  promise.catch(() => {
    const current = storageListCache.get(cacheKey);
    if (current?.promise === promise) {
      storageListCache.delete(cacheKey);
    }
  });

  return promise;
}

function createStorageSafeFileName(fileName: string) {
  const trimmedFileName = fileName.trim();
  const extensionIndex = trimmedFileName.lastIndexOf(".");
  const extension =
    extensionIndex >= 0
      ? trimmedFileName.slice(extensionIndex).toLowerCase()
      : "";
  const baseName =
    extensionIndex >= 0
      ? trimmedFileName.slice(0, extensionIndex)
      : trimmedFileName;
  const sanitizedBaseName = baseName
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const sanitizedExtension = extension.replace(/[^.a-z0-9]/g, "");

  return `${sanitizedBaseName || "image"}${sanitizedExtension}`;
}

function createUniqueStorageId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  throw new Error(
    "Secure random UUID generation is required for MDX image uploads",
  );
}

function normalizeEditorImagePrefix(prefix?: string) {
  const normalizedPrefix = normalizeStoragePath(prefix)
    .replace(/^images\//, "")
    .replace(/^\/+|\/+$/g, "");

  return normalizedPrefix || "cms/content";
}

export interface BuildStorageCdnUrlParams {
  cdnHost?: string;
  storagePath?: string | null;
  fallback?: string;
  encode?: boolean;
}

export function buildStorageCdnUrl({
  cdnHost = process.env.NEXT_PUBLIC_CDN_URL || "",
  storagePath,
  fallback = "",
  encode = true,
}: BuildStorageCdnUrlParams): string {
  const normalizedStoragePath = normalizeStoragePath(storagePath);
  if (!cdnHost || !normalizedStoragePath) {
    return fallback;
  }

  const publicPath = normalizedStoragePath.replace(/^images\//, "");
  if (!publicPath) {
    return fallback;
  }

  if (!encode) {
    return `https://${cdnHost}/${publicPath}`;
  }

  const encodedPath = publicPath
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return encodedPath ? `https://${cdnHost}/${encodedPath}` : fallback;
}

export interface UploadMdxImageParams {
  file: File;
  prefix?: string;
  cdnHost?: string;
}

export interface MdxImageUploadResult {
  storagePath: string;
  url: string;
}

export async function uploadMdxImage({
  file,
  prefix = "cms/content",
  cdnHost = process.env.NEXT_PUBLIC_CDN_URL || "",
}: UploadMdxImageParams): Promise<MdxImageUploadResult> {
  try {
    if (!file || !file.name) {
      throw new Error("Missing image file for upload");
    }

    if (!firebaseStorage) {
      initStorage();
    }

    const resolvedPrefix = normalizeEditorImagePrefix(prefix);
    const fileName = createStorageSafeFileName(file.name);
    const storagePath = `images/${resolvedPrefix}/${Date.now()}-${createUniqueStorageId()}-${fileName}`;
    const { getDownloadURL, ref, uploadBytes } =
      await import("firebase/storage");
    const storageRef = ref(firebaseStorage, storagePath);

    await uploadBytes(storageRef, file, {
      cacheControl: "public,max-age=31536000,immutable",
      contentType: file.type || undefined,
    });
    invalidateStorageListCacheForPath(storagePath);

    const url =
      buildStorageCdnUrl({
        cdnHost,
        storagePath,
      }) || (await getDownloadURL(storageRef));

    return {
      storagePath,
      url,
    };
  } catch (error) {
    console.error("Error uploading MDX image:", error);
    throw error;
  }
}

export async function list(url?: string, storageInstance?: FirebaseStorage) {
  try {
    const results = await getCachedStorageListResult(
      url,
      "listAll",
      storageInstance,
    );
    return results.items;
  } catch (error) {
    console.error(error);
  }
}

export async function listPrefixes(url?: string) {
  try {
    if (!firebaseStorage) {
      initStorage();
    }
    const results = await getCachedStorageListResult(url, "listAll");
    // Return folder names for simplicity
    return results.prefixes?.map((p) => p.name) ?? [];
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function listWithMetadata(
  url?: string,
): Promise<Array<{ fullPath: string; name: string; size?: number }>> {
  try {
    if (!firebaseStorage) initStorage();
    const { getMetadata } = await import("firebase/storage");
    const results = await getCachedStorageListResult(url, "listAll");
    const withMeta = await Promise.all(
      results.items.map(async (item) => {
        try {
          const meta = await getMetadata(item);
          const size = typeof meta?.size === "number" ? meta.size : undefined;
          return { fullPath: item.fullPath, name: item.name, size };
        } catch {
          return { fullPath: item.fullPath, name: item.name };
        }
      }),
    );
    return withMeta;
  } catch (e) {
    console.error(e);
    return [];
  }
}

/**
 * List all files under a given prefix, grouped by subfolder.
 *
 * This function consolidates the two-step process of listing job folders and fetching their
 * contents into a single function call. It fetches all prefixes (subfolders) and their file
 * contents in parallel using Promise.all, guaranteeing concurrent execution.
 *
 * Note: This still makes 1 + N Firebase Storage API calls (one to list prefixes, then one per
 * prefix to list contents). The improvement is in code organization and guaranteed parallelization,
 * not in reducing total API calls. Firebase Storage SDK does not provide a recursive listing API.
 *
 * @param url - The base path to list (e.g., "impose_jobs")
 * @returns A map of subfolder names to their file metadata
 *
 * @example
 * const files = await listAllWithMetadata("impose_jobs");
 * // Returns Map:
 * // "job-123" => [{ fullPath: "impose_jobs/job-123/output.pdf", name: "output.pdf", size: 1024 }]
 * // "job-456" => [{ fullPath: "impose_jobs/job-456/result.tar.gz", name: "result.tar.gz", size: 2048 }]
 */
export async function listAllWithMetadata(
  url?: string,
): Promise<
  Map<string, Array<{ fullPath: string; name: string; size?: number }>>
> {
  const result = new Map<
    string,
    Array<{ fullPath: string; name: string; size?: number }>
  >();

  try {
    if (!firebaseStorage) initStorage();
    const listAll = (await import("firebase/storage")).listAll;
    const ref = (await import("firebase/storage")).ref;
    const { getMetadata } = await import("firebase/storage");

    // First, get all prefixes (subfolders) under the base path
    const baseResults = await listAll(ref(firebaseStorage, url));
    const prefixes = baseResults.prefixes ?? [];

    // Then, list all files under each prefix in parallel
    await Promise.all(
      prefixes.map(async (prefix) => {
        try {
          const prefixResults = await listAll(prefix);
          const withMeta = await Promise.all(
            prefixResults.items.map(async (item) => {
              try {
                const meta = await getMetadata(item);
                const size =
                  typeof meta?.size === "number" ? meta.size : undefined;
                return { fullPath: item.fullPath, name: item.name, size };
              } catch {
                // Graceful degradation: return item without size if metadata fetch fails
                return { fullPath: item.fullPath, name: item.name };
              }
            }),
          );
          result.set(prefix.name, withMeta);
        } catch {
          // Graceful degradation: return empty array for this prefix if listing fails
          result.set(prefix.name, []);
        }
      }),
    );
  } catch (e) {
    console.error(e);
  }

  return result;
}

export async function deleteObject(
  url?: string,
  storageInstance?: FirebaseStorage,
) {
  try {
    const resolvedStorage = resolveStorageInstance(storageInstance);
    const firebaseDeleteObject = (await import("firebase/storage"))
      .deleteObject;
    const ref = (await import("firebase/storage")).ref;
    await firebaseDeleteObject(ref(resolvedStorage, url));
    invalidateStorageListCacheForPath(url);
  } catch (error) {
    console.error(error);
  }
}

export async function download(
  url?: string,
  preview = false,
  storageInstance?: FirebaseStorage,
) {
  try {
    const resolvedStorage = resolveStorageInstance(storageInstance);
    const ref = (await import("firebase/storage")).ref;
    const getBlob = (await import("firebase/storage")).getBlob;
    const _ref = ref(resolvedStorage, url);
    const blob = await getBlob(_ref);
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    if (!preview) {
      link.download = _ref.name;
      document.body.appendChild(link);
    } else {
      link.target = "_blank";
      document.body.appendChild(link);
    }
    link.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window,
      }),
    );
    document.body.removeChild(link);
  } catch (error) {
    console.error(error);
  }
}

export async function fetchThumbnail(
  listResult?: ListResults,
  storage?: FirebaseStorage,
  customerId?: string,
  orderId?: string,
  itemIndexOrId?: number | string,
  productId?: string,
  productChannelId?: string,
  noFiles?: boolean,
  storeChannelId?: string,
  productImageFiles?: string[],
  tenantContext?: TenantContext,
): Promise<string> {
  try {
    if (
      !isUndefined(listResult) &&
      !isEmpty(listResult) &&
      !isUndefined(storage)
    ) {
      const thumbStorageRef = getStorageRef(
        storage,
        buildThumbStoragePath(listResult.storageReference.fullPath),
      );
      const url = await getFirebaseDownloadURL(thumbStorageRef);
      if (!url) await new Promise((resolve) => setTimeout(resolve, 5000));
      return url ? url : "";
    } else if (!isUndefined(storage) && customerId && orderId) {
      if (noFiles) {
        const itemIdentifier =
          typeof itemIndexOrId === "string" ? itemIndexOrId : itemIndexOrId;
        if (isUndefined(itemIdentifier)) {
          return "/assets/empty.avif";
        }
        // Try with item ID first if it's a string
        const storageRef = getStorageRef(
          storage,
          tenantContext
            ? tenantStoragePaths.orderItemThumbnailFolder(
                tenantContext,
                storeChannelId ?? productChannelId ?? "",
                customerId,
                orderId,
                itemIdentifier,
              )
            : `thumb_orders/${customerId}/${orderId}/items/${itemIdentifier}`,
        );
        const thumbs = await getCachedStorageListResult(
          storageRef.fullPath,
          "list",
          storage,
        );

        if (thumbs.items.length > 0) {
          const url = await getFirebaseDownloadURL(thumbs.items[0]);
          return url ? url : "/assets/empty.avif";
        } else {
          // Prefer selected product images, then fall back to the oldest stored image.
          const resolvedChannel = productChannelId || storeChannelId;
          const imageFiles = await getProductThumbnailImageFiles(
            storage,
            productId,
            resolvedChannel,
            productImageFiles,
            tenantContext,
          );
          const cdnUrl = buildProductCdnThumbnail({
            productId: productId,
            channelId: resolvedChannel,
            imageFiles,
            choose: "first",
          });
          return cdnUrl;
        }
      } else {
        const resolvedChannel = productChannelId || storeChannelId;
        const imageFiles = await getProductThumbnailImageFiles(
          storage,
          productId,
          resolvedChannel,
          productImageFiles,
          tenantContext,
        );
        const cdnUrl = buildProductCdnThumbnail({
          productId: productId,
          channelId: resolvedChannel,
          imageFiles,
          choose: "first",
        });
        return cdnUrl;
      }
    } else if (!isUndefined(storage)) {
      const resolvedChannel = productChannelId || storeChannelId;
      const imageFiles = await getProductThumbnailImageFiles(
        storage,
        productId,
        resolvedChannel,
        productImageFiles,
        tenantContext,
      );
      const cdnUrl = buildProductCdnThumbnail({
        productId: productId,
        channelId: resolvedChannel,
        imageFiles,
        choose: "first",
      });
      return cdnUrl;
    } else {
      return "/assets/empty.avif";
    }
  } catch (error) {
    if (isStorageObjectNotFoundError(error)) {
      return "";
    }

    console.error(error);
    return "/assets/empty.avif";
  }
}

async function getProductThumbnailImageFiles(
  storageInst: FirebaseStorage,
  productId?: string | null,
  channelId?: string | null,
  productImageFiles?: string[],
  tenantContext?: TenantContext,
) {
  if (Array.isArray(productImageFiles) && productImageFiles.length > 0) {
    return productImageFiles;
  }

  return findOldestProductImageFiles(
    storageInst,
    productId,
    channelId,
    tenantContext,
  );
}

function isStorageObjectNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "storage/object-not-found"
  );
}

// Attempts to find the oldest uploaded product image file in Firebase Storage and
// returns it as a relative path (from the product folder) suitable for buildProductCdnThumbnail.imageFiles
async function findOldestProductImageFiles(
  storageInst: FirebaseStorage,
  productId?: string | null,
  channelId?: string | null,
  tenantContext?: TenantContext,
): Promise<string[]> {
  try {
    if (!storageInst || !productId || !channelId) return [];

    // Helper to list and pick oldest from a given folder, returning the relative path
    const pickOldest = async (basePrefix: string) => {
      const res = await getCachedStorageListResult(
        basePrefix,
        "list",
        storageInst,
      );
      if (!res || !Array.isArray(res.items) || res.items.length === 0)
        return undefined;

      // Collect metadata to determine creation time
      const withMeta = await Promise.all(
        res.items.map(async (item) => {
          try {
            const meta = await getFirebaseMetadata(item);
            return {
              item,
              time: meta?.timeCreated
                ? new Date(meta.timeCreated).getTime()
                : 0,
            };
          } catch {
            return { item, time: 0 };
          }
        }),
      );

      withMeta.sort((a, b) => a.time - b.time);
      const oldest = withMeta[0]?.item;
      if (!oldest) return undefined;

      // Derive relative path from the product folder root
      const rootPrefix = `${
        tenantContext
          ? tenantStoragePaths.productMediaFolder(
              tenantContext,
              channelId,
              productId,
            )
          : `images/channels/${channelId}/products/${productId}`
      }/`;
      // Ensure we include nested subfolder if basePrefix extends beyond rootPrefix
      const relativeFromRoot = oldest.fullPath.startsWith(rootPrefix)
        ? oldest.fullPath.substring(rootPrefix.length)
        : oldest.name;
      return relativeFromRoot;
    };

    const root = `${
      tenantContext
        ? tenantStoragePaths.productMediaFolder(
            tenantContext,
            channelId,
            productId,
          )
        : `images/channels/${channelId}/products/${productId}`
    }/`;
    const inRoot = await pickOldest(root);
    if (inRoot) return [inRoot];

    return [];
  } catch (e) {
    console.error(e);
    return [];
  }
}

export async function fetchOrderItemFiles(
  orderId: string,
  customerId: string,
  _orderItems: OrderItem[],
  tenantContext?: TenantContext,
  channelId?: string,
) {
  try {
    const filesByItem = await Promise.all(
      _orderItems.map(async (orderItem, index) => {
        // Store path now uses item ID; fall back to the legacy index path.
        let data = await list(
          tenantContext
            ? tenantStoragePaths.orderItemFolder(
                tenantContext,
                channelId ?? "",
                customerId,
                orderId,
                orderItem.id,
              )
            : `orders/${customerId}/${orderId}/items/${orderItem.id}`,
        );

        if (isUndefined(data) || data.length === 0) {
          data = await list(
            tenantContext
              ? tenantStoragePaths.orderItemFolder(
                  tenantContext,
                  channelId ?? "",
                  customerId,
                  orderId,
                  index,
                )
              : `orders/${customerId}/${orderId}/items/${index}`,
          );
        }

        if (isUndefined(data)) {
          return [];
        }

        const filesWithMetadata = await Promise.all(
          data.map(async (result) => {
            const metadata = await getFirebaseMetadata(result);
            return isUndefined(metadata)
              ? null
              : { storageReference: result, metadata };
          }),
        );

        return filesWithMetadata.filter(
          (file): file is ListResults => file !== null,
        );
      }),
    );

    return filesByItem.flat();
  } catch (error) {
    console.error(error);
  }
  return [];
}

export interface BuildProductCdnThumbnailParams {
  cdnHost?: string;
  channelId?: string | null;
  storeChannelIdFallback?: string;
  productId?: string | null;
  imageFiles?: string[];
  choose?: "first" | "last";
  fallback?: string;
  encode?: boolean;
}

export function buildProductCdnThumbnail({
  cdnHost = process.env.NEXT_PUBLIC_CDN_URL || "",
  channelId,
  storeChannelIdFallback = process.env.NEXT_PUBLIC_STORE_CHANNEL_ID || "",
  productId,
  imageFiles = [],
  choose = "first",
  fallback = "/assets/empty.avif",
  encode = true,
}: BuildProductCdnThumbnailParams): string {
  // Guard required pieces
  const resolvedChannel = channelId || storeChannelIdFallback;
  if (!cdnHost || !resolvedChannel || !productId) return fallback;
  if (!Array.isArray(imageFiles) || imageFiles.length === 0) return fallback;

  const file =
    choose === "last" ? imageFiles[imageFiles.length - 1] : imageFiles[0];
  if (!file) return fallback;

  const base = `https://${cdnHost}/channels/${resolvedChannel}/products/${productId}/${file}`;
  if (!encode) return base;
  // Encode only the filename segment to preserve path structure (spaces etc.)
  const encodedFile = file
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `https://${cdnHost}/channels/${resolvedChannel}/products/${productId}/${encodedFile}`;
}
