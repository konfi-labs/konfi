import { describe, expect, it } from "vitest";
import type { StoreRuntimeConfig } from "./runtime-config";
import {
  isStoreMaintenancePath,
  isStorefrontEditorSessionPath,
  shouldRedirectToStoreMaintenance,
} from "./maintenance";

const runtimeConfig = (enabled: boolean): StoreRuntimeConfig => ({
  channelId: "channel-1",
  maintenance: { enabled },
  storeBaseUrl: "https://store.example.com",
  tenantContext: {
    deploymentMode: "saas",
    requireTenantId: true,
    tenantId: "tenant-1",
  },
});

describe("store maintenance routing", () => {
  it("matches localized maintenance paths", () => {
    expect(isStoreMaintenancePath("/pl/maintenance")).toBe(true);
    expect(isStoreMaintenancePath("/en/maintenance/")).toBe(true);
    expect(isStoreMaintenancePath("/pl/products")).toBe(false);
  });

  it("redirects public pages while maintenance is active", () => {
    expect(
      shouldRedirectToStoreMaintenance({
        hasEditorSession: false,
        pathname: "/pl/products",
        runtimeConfig: runtimeConfig(true),
      }),
    ).toBe(true);
  });

  it("keeps the maintenance page and editor sessions reachable", () => {
    expect(
      shouldRedirectToStoreMaintenance({
        hasEditorSession: false,
        pathname: "/pl/maintenance",
        runtimeConfig: runtimeConfig(true),
      }),
    ).toBe(false);
    expect(
      shouldRedirectToStoreMaintenance({
        hasEditorSession: false,
        pathname: "/pl/storefront-editor/session",
        runtimeConfig: runtimeConfig(true),
      }),
    ).toBe(false);
    expect(
      shouldRedirectToStoreMaintenance({
        hasEditorSession: false,
        pathname: "/en/storefront-editor/session/",
        runtimeConfig: runtimeConfig(true),
      }),
    ).toBe(false);
    expect(
      shouldRedirectToStoreMaintenance({
        hasEditorSession: false,
        pathname: null,
        runtimeConfig: runtimeConfig(true),
      }),
    ).toBe(false);
    expect(
      shouldRedirectToStoreMaintenance({
        hasEditorSession: true,
        pathname: "/pl",
        runtimeConfig: runtimeConfig(true),
      }),
    ).toBe(false);
  });

  it("matches localized storefront editor session paths", () => {
    expect(isStorefrontEditorSessionPath("/pl/storefront-editor/session")).toBe(
      true,
    );
    expect(
      isStorefrontEditorSessionPath("/en/storefront-editor/session/"),
    ).toBe(true);
    expect(isStorefrontEditorSessionPath("/pl/storefront-editor")).toBe(false);
  });

  it("does not redirect when maintenance is inactive", () => {
    expect(
      shouldRedirectToStoreMaintenance({
        hasEditorSession: false,
        pathname: "/pl/products",
        runtimeConfig: runtimeConfig(false),
      }),
    ).toBe(false);
  });
});
