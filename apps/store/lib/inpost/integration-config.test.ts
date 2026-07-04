import { describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import {
  getTenantInpostGeowidgetConfig,
  withTenantInpostGeowidgetConfig,
} from "./integration-config";
import type { StoreRuntimeConfig } from "@/lib/runtime-config";

vi.mock("server-only", () => ({}));

interface MockDocumentSnapshot {
  data: () => unknown;
  exists: boolean;
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

describe("tenant InPost GeoWidget integration config", () => {
  it("resolves connected SaaS GeoWidget config", async () => {
    await expect(
      getTenantInpostGeowidgetConfig({
        db: createDocumentDb({
          exists: true,
          data: () => ({
            integrationKey: "inpost",
            metadata: {
              inpost: {
                geowidgetToken: " tenant-token ",
              },
            },
            status: "connected",
            tenantId: "tenant-1",
          }),
        }),
        tenantId: "tenant-1",
      }),
    ).resolves.toEqual({
      geowidgetToken: "tenant-token",
    });
  });

  it("ignores missing or disconnected tenant docs", async () => {
    await expect(
      getTenantInpostGeowidgetConfig({
        db: createDocumentDb({
          exists: true,
          data: () => ({
            integrationKey: "inpost",
            status: "disabled",
            tenantId: "tenant-1",
          }),
        }),
        tenantId: "tenant-1",
      }),
    ).resolves.toBeUndefined();
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
        integrationKey: "inpost",
        metadata: {
          inpost: {
            geowidgetToken: "tenant-token",
          },
        },
        status: "connected",
        tenantId: "tenant-1",
      }),
    });

    await expect(
      withTenantInpostGeowidgetConfig(runtimeConfig, db),
    ).resolves.toMatchObject({
      inpost: {
        geowidgetToken: "tenant-token",
      },
    });

    const dedicatedConfig: StoreRuntimeConfig = {
      channelId: "default",
      features: { aiImageGeneration: true },
      inpost: {
        geowidgetToken: "dedicated-token",
      },
      maintenance: { enabled: false },
      storeBaseUrl: "https://store.example.com",
      tenantContext: {
        deploymentMode: "dedicated",
        requireTenantId: false,
      },
    };

    await expect(
      withTenantInpostGeowidgetConfig(dedicatedConfig, db),
    ).resolves.toBe(dedicatedConfig);
  });
});
