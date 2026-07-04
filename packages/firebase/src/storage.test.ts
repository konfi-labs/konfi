import type { ListResults, OrderItem } from "@konfi/types";
import type { FirebaseStorage } from "firebase/storage";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildProductCdnThumbnail,
  buildStorageCdnUrl,
  fetchOrderItemFiles,
  fetchThumbnail,
  list,
  listAllWithMetadata,
  upload,
  uploadMdxImage,
} from "./storage";

// Helper to temporarily set env vars
function withEnv(env: Record<string, string>, fn: () => void) {
  const previous: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) {
    previous[k] = process.env[k];
    process.env[k] = env[k];
  }
  try {
    fn();
  } finally {
    for (const k of Object.keys(env)) {
      if (previous[k] === undefined) delete process.env[k];
      else process.env[k] = previous[k];
    }
  }
}

// Mock firebase/storage module
const mockListAll = vi.fn();
const mockRef = vi.fn();
const mockGetMetadata = vi.fn();
const mockGetDownloadURL = vi.fn();
const mockUploadBytes = vi.fn();
const mockStorageList = vi.fn();

vi.mock("firebase/storage", () => ({
  listAll: (...args: unknown[]) => mockListAll(...args),
  ref: (...args: unknown[]) => mockRef(...args),
  getMetadata: (...args: unknown[]) => mockGetMetadata(...args),
  getDownloadURL: (...args: unknown[]) => mockGetDownloadURL(...args),
  getBlob: vi.fn(),
  deleteObject: vi.fn(),
  uploadBytes: (...args: unknown[]) => mockUploadBytes(...args),
  list: (...args: unknown[]) => mockStorageList(...args),
}));

// Mock lib.ts to provide a fake storage instance
vi.mock("./lib", () => ({
  storage: { name: "mock-storage" },
  initStorage: vi.fn(),
}));

describe("listAllWithMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRef.mockImplementation((_storage, path) => ({ path }));
  });

  it("returns empty map when no prefixes exist", async () => {
    mockListAll.mockResolvedValueOnce({ prefixes: [], items: [] });

    const result = await listAllWithMetadata("impose_jobs");

    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  it("correctly groups files by subfolder", async () => {
    const prefix1 = { name: "job-123" };
    const prefix2 = { name: "job-456" };
    const item1 = {
      fullPath: "impose_jobs/job-123/output.pdf",
      name: "output.pdf",
    };
    const item2 = {
      fullPath: "impose_jobs/job-456/result.tar.gz",
      name: "result.tar.gz",
    };

    // First call: list base path to get prefixes
    mockListAll.mockResolvedValueOnce({
      prefixes: [prefix1, prefix2],
      items: [],
    });
    // Second call: list prefix1 contents
    mockListAll.mockResolvedValueOnce({ prefixes: [], items: [item1] });
    // Third call: list prefix2 contents
    mockListAll.mockResolvedValueOnce({ prefixes: [], items: [item2] });

    mockGetMetadata.mockImplementation((_item) =>
      Promise.resolve({ size: 1024 }),
    );

    const result = await listAllWithMetadata("impose_jobs");

    expect(result.size).toBe(2);
    expect(result.get("job-123")).toEqual([
      {
        fullPath: "impose_jobs/job-123/output.pdf",
        name: "output.pdf",
        size: 1024,
      },
    ]);
    expect(result.get("job-456")).toEqual([
      {
        fullPath: "impose_jobs/job-456/result.tar.gz",
        name: "result.tar.gz",
        size: 1024,
      },
    ]);
  });

  it("handles empty prefixes gracefully", async () => {
    const prefix1 = { name: "empty-job" };

    // First call: list base path to get prefixes
    mockListAll.mockResolvedValueOnce({ prefixes: [prefix1], items: [] });
    // Second call: list empty prefix contents
    mockListAll.mockResolvedValueOnce({ prefixes: [], items: [] });

    const result = await listAllWithMetadata("impose_jobs");

    expect(result.size).toBe(1);
    expect(result.get("empty-job")).toEqual([]);
  });

  it("gracefully degrades on metadata fetch failure", async () => {
    const prefix1 = { name: "job-123" };
    const item1 = {
      fullPath: "impose_jobs/job-123/output.pdf",
      name: "output.pdf",
    };

    mockListAll.mockResolvedValueOnce({ prefixes: [prefix1], items: [] });
    mockListAll.mockResolvedValueOnce({ prefixes: [], items: [item1] });

    // Simulate metadata fetch failure
    mockGetMetadata.mockRejectedValueOnce(new Error("Metadata fetch failed"));

    const result = await listAllWithMetadata("impose_jobs");

    expect(result.size).toBe(1);
    // Should return item without size when metadata fails
    expect(result.get("job-123")).toEqual([
      { fullPath: "impose_jobs/job-123/output.pdf", name: "output.pdf" },
    ]);
  });

  it("gracefully degrades on prefix listing failure", async () => {
    const prefix1 = { name: "job-123" };
    const prefix2 = { name: "job-456" };
    const item2 = {
      fullPath: "impose_jobs/job-456/result.tar.gz",
      name: "result.tar.gz",
    };

    mockListAll.mockResolvedValueOnce({
      prefixes: [prefix1, prefix2],
      items: [],
    });
    // First prefix fails
    mockListAll.mockRejectedValueOnce(new Error("Listing failed"));
    // Second prefix succeeds
    mockListAll.mockResolvedValueOnce({ prefixes: [], items: [item2] });

    mockGetMetadata.mockResolvedValue({ size: 2048 });

    const result = await listAllWithMetadata("impose_jobs");

    expect(result.size).toBe(2);
    // Failed prefix should have empty array
    expect(result.get("job-123")).toEqual([]);
    // Successful prefix should have files
    expect(result.get("job-456")).toEqual([
      {
        fullPath: "impose_jobs/job-456/result.tar.gz",
        name: "result.tar.gz",
        size: 2048,
      },
    ]);
  });

  it("returns empty map when base listAll fails", async () => {
    mockListAll.mockRejectedValueOnce(new Error("Base listing failed"));

    const result = await listAllWithMetadata("impose_jobs");

    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });
});

describe("buildStorageCdnUrl", () => {
  it("builds a public CDN URL from a storage path", () => {
    const url = buildStorageCdnUrl({
      cdnHost: "cdn.example.com",
      storagePath: "images/cms/content/hello world.png",
    });

    expect(url).toBe("https://cdn.example.com/cms/content/hello%20world.png");
  });

  it("returns the fallback when input is missing", () => {
    const url = buildStorageCdnUrl({
      cdnHost: "",
      storagePath: "images/cms/content/example.png",
      fallback: "fallback",
    });

    expect(url).toBe("fallback");
  });
});

describe("list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRef.mockImplementation((_storage, path) => ({ path, fullPath: path }));
  });

  it("dedupes concurrent Firebase Storage listAll requests by normalized path", async () => {
    const item = {
      fullPath: "orders/customer/order/items/item/file.pdf",
      name: "file.pdf",
    };
    mockListAll.mockResolvedValueOnce({ prefixes: [], items: [item] });

    const [firstResult, secondResult] = await Promise.all([
      list("orders/customer/order/items/item"),
      list("orders/customer/order/items/item/"),
    ]);

    expect(firstResult).toEqual([item]);
    expect(secondResult).toEqual([item]);
    expect(mockListAll).toHaveBeenCalledTimes(1);
  });

  it("invalidates cached parent list results after upload", async () => {
    const beforeUpload = {
      fullPath: "orders/customer/order/items/upload-item/before.pdf",
      name: "before.pdf",
    };
    const afterUpload = {
      fullPath: "orders/customer/order/items/upload-item/after.pdf",
      name: "after.pdf",
    };
    mockListAll
      .mockResolvedValueOnce({ prefixes: [], items: [beforeUpload] })
      .mockResolvedValueOnce({ prefixes: [], items: [afterUpload] });
    mockUploadBytes.mockResolvedValueOnce({});

    await list("orders/customer/order/items/upload-item");
    await upload([
      {
        file: new File(["file"], "after.pdf", { type: "application/pdf" }),
        url: "orders/customer/order/items/upload-item/after.pdf",
      },
    ]);
    const result = await list("orders/customer/order/items/upload-item");

    expect(result).toEqual([afterUpload]);
    expect(mockListAll).toHaveBeenCalledTimes(2);
  });

  it("prunes expired cache entries while caching new list results", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T10:00:00Z"));

    try {
      mockListAll.mockImplementation(
        async (storageRef: { fullPath: string }) => ({
          prefixes: [],
          items: [
            {
              fullPath: `${storageRef.fullPath}/file.pdf`,
              name: "file.pdf",
            },
          ],
        }),
      );

      await list("orders/customer/order/items/expired");
      vi.advanceTimersByTime(61 * 1000);
      await list("orders/customer/order/items/current");
      await list("orders/customer/order/items/expired");

      expect(mockListAll).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("fetchThumbnail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRef.mockImplementation((_storage, path) => ({ path, fullPath: path }));
  });

  it("returns the generated thumbnail when it exists", async () => {
    mockGetDownloadURL.mockResolvedValueOnce(
      "https://thumb.example.com/file.png",
    );

    const listResult = {
      storageReference: { fullPath: "carts/user-1/items/0/file.png" },
      metadata: { contentType: "image/png" },
    } as ListResults;

    const result = await fetchThumbnail(listResult, {
      name: "provided-storage",
    } as unknown as FirebaseStorage);

    expect(mockRef).toHaveBeenCalledWith(
      { name: "provided-storage" },
      "thumb_carts/user-1/items/0/thumb_file.png",
    );
    expect(result).toBe("https://thumb.example.com/file.png");
  });

  it("dedupes concurrent thumbnail and product fallback Storage list requests", async () => {
    const storage = { name: "provided-storage" } as unknown as FirebaseStorage;
    const previousCdnUrl = process.env.NEXT_PUBLIC_CDN_URL;
    const productImage = {
      fullPath: "images/channels/channel/products/product/image.png",
      name: "image.png",
    };

    mockStorageList
      .mockResolvedValueOnce({ prefixes: [], items: [] })
      .mockResolvedValueOnce({ prefixes: [], items: [productImage] });
    mockGetMetadata.mockResolvedValue({ timeCreated: "2026-05-05T10:00:00Z" });

    process.env.NEXT_PUBLIC_CDN_URL = "cdn.example.com";
    try {
      const [firstResult, secondResult] = await Promise.all([
        fetchThumbnail(
          undefined,
          storage,
          "customer",
          "order",
          0,
          "product",
          "channel",
          true,
          "store",
        ),
        fetchThumbnail(
          undefined,
          storage,
          "customer",
          "order",
          0,
          "product",
          "channel",
          true,
          "store",
        ),
      ]);

      expect(firstResult).toBe(
        "https://cdn.example.com/channels/channel/products/product/image.png",
      );
      expect(secondResult).toBe(firstResult);
      expect(mockStorageList).toHaveBeenCalledTimes(2);
    } finally {
      if (previousCdnUrl === undefined) {
        delete process.env.NEXT_PUBLIC_CDN_URL;
      } else {
        process.env.NEXT_PUBLIC_CDN_URL = previousCdnUrl;
      }
    }
  });

  it("uses selected product image files before falling back to oldest stored images", async () => {
    const storage = { name: "provided-storage" } as unknown as FirebaseStorage;
    const previousCdnUrl = process.env.NEXT_PUBLIC_CDN_URL;

    mockStorageList.mockResolvedValueOnce({ prefixes: [], items: [] });

    process.env.NEXT_PUBLIC_CDN_URL = "cdn.env.com";
    try {
      const result = await fetchThumbnail(
        undefined,
        storage,
        "customer",
        "order",
        "item",
        "product",
        "channel",
        true,
        "store",
        ["selected-image.png"],
      );

      expect(result).toBe(
        "https://cdn.env.com/channels/channel/products/product/selected-image.png",
      );
      expect(mockStorageList).toHaveBeenCalledTimes(1);
    } finally {
      if (previousCdnUrl === undefined) {
        delete process.env.NEXT_PUBLIC_CDN_URL;
      } else {
        process.env.NEXT_PUBLIC_CDN_URL = previousCdnUrl;
      }
    }
  });

  it("looks up generated order thumbnails in the tenant-prefixed item id path", async () => {
    const storage = { name: "provided-storage" } as unknown as FirebaseStorage;

    mockStorageList.mockResolvedValueOnce({
      prefixes: [],
      items: [
        {
          fullPath:
            "tenants/tenant-a/channels/store/thumb_orders/customer/order/items/item-1/thumb_artwork.png",
          name: "thumb_artwork.png",
        },
      ],
    });
    mockGetDownloadURL.mockResolvedValueOnce(
      "https://thumb.example.com/artwork.png",
    );

    const result = await fetchThumbnail(
      undefined,
      storage,
      "customer",
      "order",
      "item-1",
      "product",
      "channel",
      true,
      "store",
      undefined,
      {
        deploymentMode: "saas",
        requireTenantId: true,
        tenantId: "tenant-a",
      },
    );

    expect(mockRef).toHaveBeenCalledWith(
      storage,
      "tenants/tenant-a/channels/store/thumb_orders/customer/order/items/item-1",
    );
    expect(result).toBe("https://thumb.example.com/artwork.png");
  });
});

describe("fetchOrderItemFiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRef.mockImplementation((_storage, path) => ({ path, fullPath: path }));
  });

  it("lists order item files from tenant-prefixed item id paths", async () => {
    const storageItem = {
      fullPath:
        "tenants/tenant-a/channels/channel/orders/customer/order/items/item-1/art.pdf",
      name: "art.pdf",
    };

    mockListAll.mockResolvedValueOnce({ prefixes: [], items: [storageItem] });
    mockGetMetadata.mockResolvedValueOnce({
      contentType: "application/pdf",
      size: 128,
    });

    const result = await fetchOrderItemFiles(
      "order",
      "customer",
      [{ id: "item-1" } as OrderItem],
      {
        deploymentMode: "saas",
        requireTenantId: true,
        tenantId: "tenant-a",
      },
      "channel",
    );

    expect(mockRef).toHaveBeenCalledWith(
      { name: "mock-storage" },
      "tenants/tenant-a/channels/channel/orders/customer/order/items/item-1",
    );
    expect(result).toEqual([
      {
        storageReference: storageItem,
        metadata: {
          contentType: "application/pdf",
          size: 128,
        },
      },
    ]);
  });
});

describe("uploadMdxImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRef.mockImplementation((_storage, path) => ({ path, fullPath: path }));
    mockUploadBytes.mockResolvedValue({});
    mockGetDownloadURL.mockResolvedValue(
      "https://download.example.com/image.png",
    );
  });

  it("uploads an image and returns a CDN URL when configured", async () => {
    const file = new File(["image"], "My Image.png", { type: "image/png" });

    const result = await uploadMdxImage({
      file,
      prefix: "cms/blog",
      cdnHost: "cdn.example.com",
    });

    expect(mockUploadBytes).toHaveBeenCalledTimes(1);
    expect(result.storagePath).toMatch(
      /^images\/cms\/blog\/\d+-.*-My-Image\.png$/,
    );
    expect(result.url).toMatch(
      /^https:\/\/cdn\.example\.com\/cms\/blog\/\d+-.*-My-Image\.png$/,
    );
  });

  it("falls back to the Firebase download URL when no CDN host is available", async () => {
    const file = new File(["image"], "Example.png", { type: "image/png" });

    const result = await uploadMdxImage({
      file,
      prefix: "cms/content",
      cdnHost: "",
    });

    expect(mockGetDownloadURL).toHaveBeenCalledTimes(1);
    expect(result.url).toBe("https://download.example.com/image.png");
  });

  it("normalizes prefixes and sanitizes file names", async () => {
    const file = new File(["image"], "  ??  .PNG", { type: "image/png" });

    const result = await uploadMdxImage({
      file,
      prefix: "/images/cms/blog//",
      cdnHost: "cdn.example.com",
    });

    expect(result.storagePath).toMatch(
      /^images\/cms\/blog\/\d+-.*-image\.png$/,
    );
    expect(result.url).toMatch(
      /^https:\/\/cdn\.example\.com\/cms\/blog\/\d+-.*-image\.png$/,
    );
  });

  it("falls back to the default prefix when none is provided", async () => {
    const file = new File(["image"], "archive.tar.gz", {
      type: "application/gzip",
    });

    const result = await uploadMdxImage({
      file,
      prefix: "",
      cdnHost: "cdn.example.com",
    });

    expect(result.storagePath).toMatch(
      /^images\/cms\/content\/\d+-.*-archive-tar\.gz$/,
    );
  });
});

describe("buildProductCdnThumbnail", () => {
  it("returns fallback when required params missing", () => {
    const url = buildProductCdnThumbnail({
      productId: undefined,
      imageFiles: ["a.png"],
    });
    expect(url).toBe("/assets/empty.avif");
  });

  it("uses first image by default", () => {
    const url = buildProductCdnThumbnail({
      cdnHost: "cdn.example.com",
      channelId: "ch1",
      productId: "p1",
      imageFiles: ["one.png", "two.png"],
    });
    expect(url).toBe(
      "https://cdn.example.com/channels/ch1/products/p1/one.png",
    );
  });

  it("can choose last image", () => {
    const url = buildProductCdnThumbnail({
      cdnHost: "cdn.example.com",
      channelId: "ch1",
      productId: "p1",
      imageFiles: ["one.png", "two.png"],
      choose: "last",
    });
    expect(url).toBe(
      "https://cdn.example.com/channels/ch1/products/p1/two.png",
    );
  });

  it("encodes filename segments by default", () => {
    const url = buildProductCdnThumbnail({
      cdnHost: "cdn.example.com",
      channelId: "ch1",
      productId: "p1",
      imageFiles: ["My Image (1).png"],
    });
    expect(url).toBe(
      "https://cdn.example.com/channels/ch1/products/p1/My%20Image%20(1).png",
    );
  });

  it("can disable encoding", () => {
    const url = buildProductCdnThumbnail({
      cdnHost: "cdn.example.com",
      channelId: "ch1",
      productId: "p1",
      imageFiles: ["My Image (1).png"],
      encode: false,
    });
    expect(url).toBe(
      "https://cdn.example.com/channels/ch1/products/p1/My Image (1).png",
    );
  });

  it("falls back to env channel id when channelId absent", () => {
    withEnv(
      {
        NEXT_PUBLIC_STORE_CHANNEL_ID: "storeCh",
        NEXT_PUBLIC_CDN_URL: "cdn.env.com",
      },
      () => {
        const url = buildProductCdnThumbnail({
          productId: "p1",
          imageFiles: ["a.png"],
        });
        expect(url).toBe(
          "https://cdn.env.com/channels/storeCh/products/p1/a.png",
        );
      },
    );
  });
});
