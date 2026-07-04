import { describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import {
  getTenantGoogleStorefrontConfig,
  listConnectedTenantGoogleStorefrontIntegrations,
  withTenantGoogleStorefrontConfig,
} from "./integration-config";
import type { StoreRuntimeConfig } from "@/lib/runtime-config";

vi.mock("server-only", () => ({}));

interface MockDocumentSnapshot {
  data: () => unknown;
  exists: boolean;
}

interface MockQuerySnapshot {
  docs: Array<{
    data: () => unknown;
  }>;
}

function createDocumentDb(snapshot: MockDocumentSnapshot): Firestore {
  return {
    collection: () => ({
      doc: () => ({
        get: async () => snapshot,
      }),
    }),
  } as unknown as Firestore;
}

function createQueryDb(snapshot: MockQuerySnapshot): Firestore {
  return {
    collection: () => ({
      where: () => ({
        where: () => ({
          get: async () => snapshot,
        }),
      }),
    }),
  } as unknown as Firestore;
}

describe("tenant Google storefront integration config", () => {
  it("resolves connected per-channel SaaS config", async () => {
    await expect(
      getTenantGoogleStorefrontConfig({
        channelId: "channel-1",
        db: createDocumentDb({
          exists: true,
          data: () => ({
            integrationKey: "google",
            metadata: {
              google: {
                channels: {
                  "channel-1": {
                    placeId: " place-1 ",
                    reviewsEnabled: true,
                    tagManagerEnabled: true,
                    tagManagerId: " GTM-ABC123 ",
                  },
                },
              },
            },
            status: "connected",
            tenantId: "tenant-1",
          }),
        }),
        tenantId: "tenant-1",
      }),
    ).resolves.toEqual({
      placeId: "place-1",
      reviewsEnabled: true,
      tagManagerEnabled: true,
      tagManagerId: "GTM-ABC123",
    });
  });

  it("returns disabled config for missing or disconnected tenant docs", async () => {
    await expect(
      getTenantGoogleStorefrontConfig({
        channelId: "channel-1",
        db: createDocumentDb({
          exists: true,
          data: () => ({
            integrationKey: "google",
            status: "disabled",
            tenantId: "tenant-1",
          }),
        }),
        tenantId: "tenant-1",
      }),
    ).resolves.toEqual({
      reviewsEnabled: false,
      tagManagerEnabled: false,
    });
  });

  it("enriches only tenant-scoped SaaS runtime config", async () => {
    const runtimeConfig: StoreRuntimeConfig = {
      channelId: "channel-1",
      features: { aiImageGeneration: true },
      maintenance: { enabled: false },
      storeBaseUrl: "https://tenant.example.com",
      tenantContext: {
        deploymentMode: "saas",
        requireTenantId: true,
        tenantId: "tenant-1",
      },
    };
    const db = createDocumentDb({
      exists: true,
      data: () => ({
        integrationKey: "google",
        metadata: {
          google: {
            channels: {
              "channel-1": {
                placeId: "place-1",
                reviewsEnabled: true,
                tagManagerEnabled: false,
              },
            },
          },
        },
        status: "connected",
        tenantId: "tenant-1",
      }),
    });

    await expect(
      withTenantGoogleStorefrontConfig(runtimeConfig, db),
    ).resolves.toMatchObject({
      google: {
        placeId: "place-1",
        reviewsEnabled: true,
        tagManagerEnabled: false,
      },
    });

    const dedicatedConfig: StoreRuntimeConfig = {
      channelId: "default",
      features: { aiImageGeneration: true },
      google: {
        placeId: "dedicated-place",
        reviewsEnabled: true,
        tagManagerEnabled: false,
      },
      maintenance: { enabled: false },
      storeBaseUrl: "https://store.example.com",
      tenantContext: {
        deploymentMode: "dedicated",
        requireTenantId: false,
      },
    };

    await expect(
      withTenantGoogleStorefrontConfig(dedicatedConfig, db),
    ).resolves.toBe(dedicatedConfig);
  });

  it("lists connected tenant integrations with normalized channel metadata", async () => {
    await expect(
      listConnectedTenantGoogleStorefrontIntegrations(
        createQueryDb({
          docs: [
            {
              data: () => ({
                integrationKey: "google",
                metadata: {
                  google: {
                    channels: {
                      " channel-1 ": {
                        placeId: " place-1 ",
                        reviewsEnabled: true,
                        tagManagerEnabled: false,
                      },
                    },
                  },
                },
                status: "connected",
                tenantId: "tenant-1",
              }),
            },
            {
              data: () => ({
                integrationKey: "google",
                status: "connected",
              }),
            },
          ],
        }),
      ),
    ).resolves.toEqual([
      {
        channels: {
          "channel-1": {
            placeId: "place-1",
            reviewsEnabled: true,
            tagManagerEnabled: false,
          },
        },
        tenantId: "tenant-1",
      },
    ]);
  });
});
