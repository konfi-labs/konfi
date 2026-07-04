import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fallbackStorefrontAssets } from "@/lib/storefront-editor/metadata-assets";

const mocks = vi.hoisted(() => ({
  getCachedStorefrontSharing: vi.fn(),
  getStoreRuntimeConfigForRequest: vi.fn(),
  unstableRethrow: vi.fn(),
}));

vi.mock("@/lib/firebase/serverApp", () => ({
  getStoreRuntimeConfigForRequest: mocks.getStoreRuntimeConfigForRequest,
}));

vi.mock("@/lib/storefront-editor/content", () => ({
  getCachedStorefrontSharing: mocks.getCachedStorefrontSharing,
}));

vi.mock("next/navigation", () => ({
  unstable_rethrow: mocks.unstableRethrow,
}));

let manifest: (typeof import("./manifest"))["default"];

describe("store manifest metadata route", () => {
  beforeAll(async () => {
    ({ default: manifest } = await import("./manifest"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("COMPANY_DESCRIPTION", "Generic store");
    vi.stubEnv("COMPANY_MAIN_COLOR", "#ffffff");
    vi.stubEnv("LONG_COMPANY_NAME", "Konfi");
    vi.stubEnv("SHORT_COMPANY_NAME", "Konfi");
  });

  it("returns the generic manifest for an unconnected SaaS host", async () => {
    mocks.getStoreRuntimeConfigForRequest.mockResolvedValue(null);

    const result = await manifest();

    expect(result).toMatchObject({
      background_color: "#ffffff",
      description: "Generic store",
      display: "standalone",
      name: "Konfi",
      short_name: "Konfi",
      start_url: "/",
      theme_color: "#ffffff",
    });
    expect(result.icons).toContainEqual({
      src: fallbackStorefrontAssets.favicon,
      sizes: "any",
      type: "image/icon-x",
    });
    expect(mocks.getCachedStorefrontSharing).not.toHaveBeenCalled();
  });

  it("keeps tenant sharing lookup scoped to resolved runtime config", async () => {
    mocks.getStoreRuntimeConfigForRequest.mockResolvedValue({
      channelId: "channel-1",
    });
    mocks.getCachedStorefrontSharing.mockResolvedValue({
      faviconUrl: "https://cdn.example.com/favicon.ico",
      id: "sharing",
    });

    await expect(manifest()).resolves.toMatchObject({
      icons: [
        {
          src: "https://cdn.example.com/favicon.ico",
          sizes: "any",
        },
      ],
    });
    expect(mocks.getCachedStorefrontSharing).toHaveBeenCalledWith("channel-1");
  });
});
