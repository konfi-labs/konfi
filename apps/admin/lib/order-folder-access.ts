"use client";

export type OrderFolderBackend = "electron-path" | "browser-handle";

export type OrderFolderPermissionStatus =
  | "granted"
  | "prompt"
  | "denied"
  | "unknown";

interface OrderFolderAccessConfigBase {
  channelId: string;
  backend: OrderFolderBackend;
  displayName: string;
  permissionStatus: OrderFolderPermissionStatus;
  lastPermissionCheckAt?: string;
}

export interface ElectronOrderFolderAccessConfig extends OrderFolderAccessConfigBase {
  backend: "electron-path";
  path: string;
}

export interface BrowserOrderFolderAccessConfig extends OrderFolderAccessConfigBase {
  backend: "browser-handle";
  handleKey: string;
}

export type OrderFolderAccessConfig =
  | ElectronOrderFolderAccessConfig
  | BrowserOrderFolderAccessConfig;

export type OrderFolderAccessSettings = Record<string, OrderFolderAccessConfig>;

export interface OrderFolderSettingsDocument {
  version: 1;
  channels: OrderFolderAccessSettings;
}

export interface ParsedOrderFolderSettings {
  settings: OrderFolderAccessSettings;
  migrated: boolean;
}

export interface BrowserOrderFileEntry {
  id: string;
  name: string;
  relativePath: string;
  size: number;
  modified: number;
  extension: string;
  mimeType: string;
  kind: "image" | "pdf" | "other";
  handle: FileSystemFileHandle;
}

export interface BrowserOrderFolderEntry {
  id: string;
  name: string;
  relativePath: string;
  children: BrowserOrderFolderNode[];
}

export type BrowserOrderFolderNode =
  | (BrowserOrderFileEntry & { type: "file" })
  | (BrowserOrderFolderEntry & { type: "folder" });

export interface BrowserOrderFolderAvailableResult {
  status: "empty" | "success";
  files: BrowserOrderFileEntry[];
  tree: BrowserOrderFolderNode[];
  orderHandle: FileSystemDirectoryHandle;
}

export type BrowserOrderFolderListResult =
  | { status: "browser-unsupported" }
  | { status: "not-configured" }
  | {
      status: "permission-required";
      permissionStatus: OrderFolderPermissionStatus;
    }
  | { status: "folder-not-found" }
  | BrowserOrderFolderAvailableResult
  | { status: "error"; message: string };

type FileSystemPermissionMode = "read" | "readwrite";

interface FileSystemPermissionHandle extends FileSystemHandle {
  queryPermission?: (descriptor?: {
    mode?: FileSystemPermissionMode;
  }) => Promise<PermissionState>;
  requestPermission?: (descriptor?: {
    mode?: FileSystemPermissionMode;
  }) => Promise<PermissionState>;
}

interface DirectoryPickerOptions {
  id?: string;
  mode?: FileSystemPermissionMode;
  startIn?:
    | "desktop"
    | "documents"
    | "downloads"
    | "music"
    | "pictures"
    | "videos";
}

interface OpenFilePickerOptions {
  id?: string;
  multiple?: boolean;
  startIn?:
    | FileSystemHandle
    | "desktop"
    | "documents"
    | "downloads"
    | "music"
    | "pictures"
    | "videos";
}

declare global {
  interface Window {
    showDirectoryPicker?: (
      options?: DirectoryPickerOptions,
    ) => Promise<FileSystemDirectoryHandle>;
    showOpenFilePicker?: (
      options?: OpenFilePickerOptions,
    ) => Promise<FileSystemFileHandle[]>;
  }
}

const DB_NAME = "konfi-order-folder-access";
const DB_VERSION = 1;
const STORE_NAME = "order-root-handles";

export const ORDER_FOLDER_SETTINGS_VERSION = 1;

export function getBrowserOrderFolderHandleKey(channelId: string): string {
  return `channel:${channelId}:orders-root`;
}

export function getBrowserOrderFolderPickerId(channelId: string): string {
  let hash = 0;
  for (let index = 0; index < channelId.length; index += 1) {
    hash = (hash * 31 + channelId.charCodeAt(index)) >>> 0;
  }
  return `ko-${hash.toString(36)}`;
}

export function isBrowserOrderFolderAccessSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.showDirectoryPicker === "function" &&
    typeof indexedDB !== "undefined"
  );
}

export function createElectronOrderFolderConfig(
  channelId: string,
  path: string,
): ElectronOrderFolderAccessConfig {
  return {
    backend: "electron-path",
    channelId,
    path,
    displayName: path,
    permissionStatus: "granted",
    lastPermissionCheckAt: new Date().toISOString(),
  };
}

export function createBrowserOrderFolderConfig(params: {
  channelId: string;
  displayName: string;
  permissionStatus: OrderFolderPermissionStatus;
}): BrowserOrderFolderAccessConfig {
  return {
    backend: "browser-handle",
    channelId: params.channelId,
    handleKey: getBrowserOrderFolderHandleKey(params.channelId),
    displayName: params.displayName,
    permissionStatus: params.permissionStatus,
    lastPermissionCheckAt: new Date().toISOString(),
  };
}

export function serializeOrderFolderSettings(
  settings: OrderFolderAccessSettings,
): string {
  const document: OrderFolderSettingsDocument = {
    version: ORDER_FOLDER_SETTINGS_VERSION,
    channels: settings,
  };
  return JSON.stringify(document);
}

export function parseOrderFolderSettings(
  raw: string | null,
): ParsedOrderFolderSettings {
  if (!raw) {
    return { settings: {}, migrated: false };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isObjectRecord(parsed)) {
      return { settings: {}, migrated: false };
    }

    if (parsed.version === ORDER_FOLDER_SETTINGS_VERSION) {
      const channels = isObjectRecord(parsed.channels)
        ? parseStructuredSettings(parsed.channels)
        : {};
      return { settings: channels, migrated: false };
    }

    return {
      settings: parseLegacyPathSettings(parsed),
      migrated: true,
    };
  } catch (error) {
    console.error("Error parsing order folder settings:", error);
    return { settings: {}, migrated: false };
  }
}

export async function requestBrowserOrderRootAccess(
  channelId: string,
): Promise<BrowserOrderFolderAccessConfig | null> {
  if (!isBrowserOrderFolderAccessSupported() || !window.showDirectoryPicker) {
    return null;
  }

  try {
    const handle = await window.showDirectoryPicker({
      id: getBrowserOrderFolderPickerId(channelId),
      mode: "read",
    });
    await persistBrowserOrderRootHandle(channelId, handle);
    await requestPersistentBrowserOrderFolderStorage();
    const permissionStatus = await queryBrowserOrderFolderPermission(handle);
    return createBrowserOrderFolderConfig({
      channelId,
      displayName: handle.name,
      permissionStatus,
    });
  } catch (error) {
    if (isAbortError(error)) {
      return null;
    }
    throw error;
  }
}

export async function persistBrowserOrderRootHandle(
  channelId: string,
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  const db = await openOrderFolderAccessDb();
  await runStoreRequest(db, "readwrite", (store) =>
    store.put(handle, getBrowserOrderFolderHandleKey(channelId)),
  );
}

export async function restoreBrowserOrderRootHandle(
  config: BrowserOrderFolderAccessConfig,
): Promise<FileSystemDirectoryHandle | undefined> {
  if (!isBrowserOrderFolderAccessSupported()) {
    return undefined;
  }

  const db = await openOrderFolderAccessDb();
  const value = await runStoreRequest(db, "readonly", (store) =>
    store.get(config.handleKey),
  );
  if (isFileSystemDirectoryHandle(value)) {
    return value;
  }
  return undefined;
}

export async function removeBrowserOrderRootHandle(
  channelId: string,
): Promise<void> {
  if (typeof indexedDB === "undefined") {
    return;
  }

  const db = await openOrderFolderAccessDb();
  await runStoreRequest(db, "readwrite", (store) =>
    store.delete(getBrowserOrderFolderHandleKey(channelId)),
  );
}

export async function requestPersistentBrowserOrderFolderStorage(): Promise<boolean> {
  if (
    typeof navigator === "undefined" ||
    typeof navigator.storage?.persisted !== "function" ||
    typeof navigator.storage.persist !== "function"
  ) {
    return false;
  }

  try {
    const alreadyPersisted = await navigator.storage.persisted();
    if (alreadyPersisted) {
      return true;
    }

    return navigator.storage.persist();
  } catch (error) {
    console.warn("Failed to persist browser order folder storage:", error);
    return false;
  }
}

export async function queryBrowserOrderFolderPermission(
  handle: FileSystemDirectoryHandle,
): Promise<OrderFolderPermissionStatus> {
  return getBrowserOrderFolderPermission(handle, false);
}

export async function requestBrowserOrderFolderPermission(
  handle: FileSystemDirectoryHandle,
): Promise<OrderFolderPermissionStatus> {
  return getBrowserOrderFolderPermission(handle, true);
}

export async function listBrowserOrderFolderFiles(params: {
  config?: OrderFolderAccessConfig;
  orderNumber: number;
  requestPermission?: boolean;
}): Promise<BrowserOrderFolderListResult> {
  if (!isBrowserOrderFolderAccessSupported()) {
    return { status: "browser-unsupported" };
  }

  if (!params.config || params.config.backend !== "browser-handle") {
    return { status: "not-configured" };
  }

  const rootHandle = await restoreBrowserOrderRootHandle(params.config);
  if (!rootHandle) {
    return {
      status: "permission-required",
      permissionStatus: params.config.permissionStatus,
    };
  }

  const permissionStatus = params.requestPermission
    ? await requestBrowserOrderFolderPermission(rootHandle)
    : await queryBrowserOrderFolderPermission(rootHandle);
  if (permissionStatus !== "granted") {
    return { status: "permission-required", permissionStatus };
  }
  if (params.requestPermission) {
    await requestPersistentBrowserOrderFolderStorage();
  }

  return listFilesFromBrowserOrderRoot(rootHandle, params.orderNumber);
}

export async function listFilesFromBrowserOrderRoot(
  rootHandle: FileSystemDirectoryHandle,
  orderNumber: number,
): Promise<BrowserOrderFolderListResult> {
  try {
    const orderHandle = await rootHandle.getDirectoryHandle(
      String(orderNumber),
      { create: false },
    );
    const files: BrowserOrderFileEntry[] = [];
    const tree = await listBrowserDirectoryTree(orderHandle, "", files);

    files.sort((first, second) =>
      first.relativePath.localeCompare(second.relativePath),
    );

    if (files.length === 0) {
      return { status: "empty", files, tree, orderHandle };
    }
    return { status: "success", files, tree, orderHandle };
  } catch (error) {
    if (isNotFoundError(error)) {
      return { status: "folder-not-found" };
    }
    console.error("Failed to list browser order files:", error);
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Failed to list browser order files",
    };
  }
}

export async function openBrowserOrderFolderPicker(
  orderHandle: FileSystemDirectoryHandle,
): Promise<"opened" | "unsupported" | "cancelled"> {
  if (typeof window === "undefined" || !window.showOpenFilePicker) {
    return "unsupported";
  }

  try {
    await window.showOpenFilePicker({
      multiple: true,
      startIn: orderHandle,
    });
    return "opened";
  } catch (error) {
    if (isAbortError(error)) {
      return "cancelled";
    }
    throw error;
  }
}

async function listBrowserDirectoryTree(
  directoryHandle: FileSystemDirectoryHandle,
  parentPath: string,
  files: BrowserOrderFileEntry[],
): Promise<BrowserOrderFolderNode[]> {
  const nodes: BrowserOrderFolderNode[] = [];

  for await (const [, handle] of directoryHandle.entries()) {
    const relativePath = parentPath
      ? `${parentPath}/${handle.name}`
      : handle.name;
    if (handle.kind === "directory") {
      nodes.push({
        type: "folder",
        id: relativePath,
        name: handle.name,
        relativePath,
        children: await listBrowserDirectoryTree(handle, relativePath, files),
      });
      continue;
    }

    const file = await handle.getFile();
    const fileEntry = createBrowserOrderFileEntry(file, handle, relativePath);
    files.push(fileEntry);
    nodes.push({ ...fileEntry, type: "file" });
  }

  return nodes.toSorted((first, second) => {
    if (first.type !== second.type) {
      return first.type === "folder" ? -1 : 1;
    }
    return first.name.localeCompare(second.name);
  });
}

function createBrowserOrderFileEntry(
  file: File,
  handle: FileSystemFileHandle,
  relativePath: string,
): BrowserOrderFileEntry {
  const extension = getFileExtension(file.name);
  const kind = getBrowserOrderFileKind(file.type, extension);
  return {
    id: `${relativePath}-${file.lastModified}-${file.size}`,
    name: file.name,
    relativePath,
    size: file.size,
    modified: file.lastModified,
    extension,
    mimeType: file.type,
    kind,
    handle,
  };
}

function getBrowserOrderFileKind(
  mimeType: string,
  extension: string,
): BrowserOrderFileEntry["kind"] {
  if (mimeType.startsWith("image/")) {
    return "image";
  }
  if (mimeType === "application/pdf" || extension === "pdf") {
    return "pdf";
  }
  return "other";
}

function getFileExtension(name: string): string {
  const extension = name.split(".").pop();
  if (!extension || extension === name) {
    return "";
  }
  return extension.toLowerCase();
}

function parseStructuredSettings(
  rawChannels: Record<string, unknown>,
): OrderFolderAccessSettings {
  const settings: OrderFolderAccessSettings = {};
  for (const [channelId, value] of Object.entries(rawChannels)) {
    if (!isObjectRecord(value)) {
      continue;
    }
    const backend = value.backend;
    if (backend === "electron-path" && typeof value.path === "string") {
      settings[channelId] = {
        backend,
        channelId,
        path: value.path,
        displayName:
          typeof value.displayName === "string"
            ? value.displayName
            : value.path,
        permissionStatus: parsePermissionStatus(value.permissionStatus),
        lastPermissionCheckAt:
          typeof value.lastPermissionCheckAt === "string"
            ? value.lastPermissionCheckAt
            : undefined,
      };
      continue;
    }
    if (backend === "browser-handle" && typeof value.handleKey === "string") {
      settings[channelId] = {
        backend,
        channelId,
        handleKey: value.handleKey,
        displayName:
          typeof value.displayName === "string" ? value.displayName : "orders",
        permissionStatus: parsePermissionStatus(value.permissionStatus),
        lastPermissionCheckAt:
          typeof value.lastPermissionCheckAt === "string"
            ? value.lastPermissionCheckAt
            : undefined,
      };
    }
  }
  return settings;
}

function parseLegacyPathSettings(
  parsed: Record<string, unknown>,
): OrderFolderAccessSettings {
  const settings: OrderFolderAccessSettings = {};
  for (const [channelId, value] of Object.entries(parsed)) {
    if (typeof value === "string" && value.trim()) {
      settings[channelId] = createElectronOrderFolderConfig(
        channelId,
        value.trim(),
      );
    }
  }
  return settings;
}

function parsePermissionStatus(value: unknown): OrderFolderPermissionStatus {
  if (value === "granted" || value === "prompt" || value === "denied") {
    return value;
  }
  return "unknown";
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFileSystemDirectoryHandle(
  value: unknown,
): value is FileSystemDirectoryHandle {
  return (
    isObjectRecord(value) &&
    value.kind === "directory" &&
    typeof value.name === "string"
  );
}

async function getBrowserOrderFolderPermission(
  handle: FileSystemDirectoryHandle,
  shouldRequest: boolean,
): Promise<OrderFolderPermissionStatus> {
  const permissionHandle = handle as FileSystemPermissionHandle;
  try {
    const status = shouldRequest
      ? await permissionHandle.requestPermission?.({ mode: "read" })
      : await permissionHandle.queryPermission?.({ mode: "read" });
    return status ?? "unknown";
  } catch (error) {
    console.warn("Failed to query order folder permission:", error);
    return "unknown";
  }
}

function openOrderFolderAccessDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

function runStoreRequest<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  createRequest: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = createRequest(store);
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
    transaction.addEventListener("error", () => reject(transaction.error));
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotFoundError";
}
