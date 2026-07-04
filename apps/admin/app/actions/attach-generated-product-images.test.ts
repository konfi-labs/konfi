import { describe, expect, it, vi } from "vitest";

vi.mock("@/actions/auth-utils", () => ({
  getAuthenticatedAdminUid: vi.fn(),
}));

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: vi.fn(),
  getFirebaseAdminApp: vi.fn(),
}));

vi.mock("firebase-admin/storage", () => ({
  getStorage: vi.fn(),
}));

import {
  assertOwnedGeneratedStoragePath,
  getStoragePathExtension,
  normalizeProductImageDestinationPrefix,
} from "./attach-generated-product-images.utils";

describe("attach generated product images helpers", () => {
  it("normalizes the product image destination prefix", () => {
    expect(
      normalizeProductImageDestinationPrefix(
        "images/channels/channel-1/products/product-1/",
      ),
    ).toBe("channels/channel-1/products/product-1");
  });

  it("rejects invalid destination prefixes", () => {
    expect(() =>
      normalizeProductImageDestinationPrefix("channels/channel-1/other/path"),
    ).toThrow(/invalid/i);
  });

  it("accepts generated image paths owned by the current admin", () => {
    expect(() =>
      assertOwnedGeneratedStoragePath(
        "ai/generated/accounts/admin-123/2026-03-29/bfl/flux-2-klein-9b/file.png",
        "admin-123",
      ),
    ).not.toThrow();
  });

  it("rejects generated image paths from other admins", () => {
    expect(() =>
      assertOwnedGeneratedStoragePath(
        "ai/generated/accounts/other-admin/2026-03-29/bfl/flux-2-klein-9b/file.png",
        "admin-123",
      ),
    ).toThrow(/current admin/i);
  });

  it("falls back to png when a storage path has no extension", () => {
    expect(
      getStoragePathExtension("ai/generated/accounts/admin-123/file"),
    ).toBe(".png");
  });
});
