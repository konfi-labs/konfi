import {
  listFilesFromBrowserOrderRoot,
  getBrowserOrderFolderPickerId,
  parseOrderFolderSettings,
  queryBrowserOrderFolderPermission,
  requestPersistentBrowserOrderFolderStorage,
  serializeOrderFolderSettings,
} from "./order-folder-access";
import { describe, expect, it, vi } from "vitest";

describe("order-folder-access", () => {
  it("keeps directory picker ids under the browser limit", () => {
    const pickerId = getBrowserOrderFolderPickerId(
      "qnukXLmJ3JZ5dbAd9nA8-long-channel-id",
    );

    expect(pickerId.length).toBeLessThanOrEqual(32);
    expect(pickerId).toMatch(/^ko-[a-z0-9]+$/);
  });

  it("migrates legacy channel path settings into electron-path configs", () => {
    const parsed = parseOrderFolderSettings(
      JSON.stringify({
        channelA: "C:\\Orders",
        channelB: "  \\\\TRUENAS\\shared\\orders  ",
        ignored: "",
      }),
    );

    expect(parsed.migrated).toBe(true);
    expect(parsed.settings.channelA).toMatchObject({
      backend: "electron-path",
      channelId: "channelA",
      path: "C:\\Orders",
    });
    expect(parsed.settings.channelB).toMatchObject({
      backend: "electron-path",
      channelId: "channelB",
      path: "\\\\TRUENAS\\shared\\orders",
    });
    expect(parsed.settings.ignored).toBeUndefined();
  });

  it("parses structured browser-handle configs", () => {
    const raw = serializeOrderFolderSettings({
      channelA: {
        backend: "browser-handle",
        channelId: "channelA",
        displayName: "orders",
        handleKey: "channel:channelA:orders-root",
        permissionStatus: "prompt",
      },
    });

    const parsed = parseOrderFolderSettings(raw);

    expect(parsed.migrated).toBe(false);
    expect(parsed.settings.channelA).toMatchObject({
      backend: "browser-handle",
      displayName: "orders",
      permissionStatus: "prompt",
    });
  });

  it("maps browser permission query failures to unknown", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const handle = {
      kind: "directory",
      name: "orders",
      isSameEntry: async () => false,
      queryPermission: async () => {
        throw new Error("permission unavailable");
      },
    } as unknown as FileSystemDirectoryHandle;

    await expect(queryBrowserOrderFolderPermission(handle)).resolves.toBe(
      "unknown",
    );
    warnSpy.mockRestore();
  });

  it("requests persistent storage for browser folder handles", async () => {
    const persist = vi.fn(async () => true);
    const persisted = vi.fn(async () => false);
    const restoreStorage = mockNavigatorStorage({
      persist,
      persisted,
    });

    try {
      await expect(requestPersistentBrowserOrderFolderStorage()).resolves.toBe(
        true,
      );

      expect(persisted).toHaveBeenCalledOnce();
      expect(persist).toHaveBeenCalledOnce();
    } finally {
      restoreStorage();
    }
  });

  it("does not request persistent storage when already persisted", async () => {
    const persist = vi.fn(async () => true);
    const persisted = vi.fn(async () => true);
    const restoreStorage = mockNavigatorStorage({
      persist,
      persisted,
    });

    try {
      await expect(requestPersistentBrowserOrderFolderStorage()).resolves.toBe(
        true,
      );

      expect(persisted).toHaveBeenCalledOnce();
      expect(persist).not.toHaveBeenCalled();
    } finally {
      restoreStorage();
    }
  });

  it("returns folder-not-found when the order number folder is missing", async () => {
    const rootHandle = {
      kind: "directory",
      name: "orders",
      isSameEntry: async () => false,
      getDirectoryHandle: async () => {
        throw new DOMException("Missing", "NotFoundError");
      },
    } as unknown as FileSystemDirectoryHandle;

    await expect(
      listFilesFromBrowserOrderRoot(rootHandle, 1234),
    ).resolves.toEqual({ status: "folder-not-found" });
  });

  it("lists files from the order number folder", async () => {
    const pdfFile = new File(["pdf"], "proof.pdf", {
      type: "application/pdf",
      lastModified: 10,
    });
    const imageFile = new File(["image"], "preview.png", {
      type: "image/png",
      lastModified: 20,
    });
    const orderHandle = createDirectoryHandle("1234", [
      createFileHandle(pdfFile),
      createFileHandle(imageFile),
      createDirectoryHandle("item-folder", []),
    ]);
    const rootHandle = {
      kind: "directory",
      name: "orders",
      isSameEntry: async () => false,
      getDirectoryHandle: async (name: string) => {
        if (name !== "1234") {
          throw new DOMException("Missing", "NotFoundError");
        }
        return orderHandle;
      },
    } as unknown as FileSystemDirectoryHandle;

    const result = await listFilesFromBrowserOrderRoot(rootHandle, 1234);

    expect(result.status).toBe("success");
    if (result.status !== "success") {
      return;
    }
    expect(result.orderHandle).toBe(orderHandle);
    expect(result.files).toHaveLength(2);
    expect(result.files.map((file) => file.name)).toEqual([
      "preview.png",
      "proof.pdf",
    ]);
    expect(result.tree.map((node) => node.name)).toEqual([
      "item-folder",
      "preview.png",
      "proof.pdf",
    ]);
    expect(result.files.map((file) => file.kind)).toEqual(["image", "pdf"]);
  });

  it("includes files from nested folders in the tree and flat file list", async () => {
    const nestedFile = new File(["nested"], "nested.pdf", {
      type: "application/pdf",
      lastModified: 30,
    });
    const rootFile = new File(["root"], "root.png", {
      type: "image/png",
      lastModified: 40,
    });
    const nestedFolder = createDirectoryHandle("production", [
      createFileHandle(nestedFile),
    ]);
    const orderHandle = createDirectoryHandle("1234", [
      createFileHandle(rootFile),
      nestedFolder,
    ]);
    const rootHandle = {
      kind: "directory",
      name: "orders",
      isSameEntry: async () => false,
      getDirectoryHandle: async () => orderHandle,
    } as unknown as FileSystemDirectoryHandle;

    const result = await listFilesFromBrowserOrderRoot(rootHandle, 1234);

    expect(result.status).toBe("success");
    if (result.status !== "success") {
      return;
    }
    expect(result.files.map((file) => file.relativePath)).toEqual([
      "production/nested.pdf",
      "root.png",
    ]);
    expect(result.tree[0]).toMatchObject({
      type: "folder",
      name: "production",
    });
    const firstNode = result.tree[0];
    if (firstNode?.type !== "folder") {
      throw new Error("Expected first tree node to be a folder");
    }
    expect(firstNode.children[0]).toMatchObject({
      type: "file",
      name: "nested.pdf",
      relativePath: "production/nested.pdf",
    });
  });
});

function createFileHandle(file: File): FileSystemFileHandle {
  return {
    kind: "file",
    name: file.name,
    isSameEntry: async () => false,
    getFile: async () => file,
  } as unknown as FileSystemFileHandle;
}

function createDirectoryHandle(
  name: string,
  handles: Array<FileSystemFileHandle | FileSystemDirectoryHandle>,
): FileSystemDirectoryHandle {
  return {
    kind: "directory",
    name,
    isSameEntry: async () => false,
    getDirectoryHandle: async () => {
      throw new DOMException("Missing", "NotFoundError");
    },
    entries: () => createEntriesIterator(handles),
  } as unknown as FileSystemDirectoryHandle;
}

async function* createEntriesIterator(
  handles: Array<FileSystemFileHandle | FileSystemDirectoryHandle>,
): AsyncGenerator<[string, FileSystemFileHandle | FileSystemDirectoryHandle]> {
  for (const handle of handles) {
    yield [handle.name, handle];
  }
}

function mockNavigatorStorage(
  storage: Pick<StorageManager, "persist" | "persisted">,
) {
  const previousDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "navigator",
  );
  const currentNavigator =
    typeof globalThis.navigator === "undefined" ? {} : globalThis.navigator;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: Object.assign(
      Object.create(Object.getPrototypeOf(currentNavigator)),
      currentNavigator,
      {
        storage,
      },
    ),
  });

  return () => {
    if (previousDescriptor) {
      Object.defineProperty(globalThis, "navigator", previousDescriptor);
      return;
    }

    delete (globalThis as unknown as { navigator?: Navigator }).navigator;
  };
}
