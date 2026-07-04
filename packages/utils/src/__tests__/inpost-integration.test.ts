import { describe, expect, it } from "vitest";
import {
  isConnectedInpostTenantIntegration,
  normalizeInpostTenantIntegrationMetadata,
  tenantInpostIntegrationDocumentId,
} from "../inpost-integration";

describe("inpost tenant integration helpers", () => {
  it("builds tenant InPost integration document IDs", () => {
    expect(tenantInpostIntegrationDocumentId("tenant-1")).toBe(
      "tenant-1_inpost",
    );
  });

  it("normalizes public InPost GeoWidget config", () => {
    expect(
      normalizeInpostTenantIntegrationMetadata({
        inpost: {
          geowidgetToken: " tenant-token ",
        },
      }),
    ).toEqual({
      inpost: {
        geowidgetToken: "tenant-token",
      },
    });
  });

  it("requires connected inpost integration docs for the requested tenant", () => {
    expect(
      isConnectedInpostTenantIntegration(
        {
          integrationKey: "inpost",
          status: "connected",
          tenantId: "tenant-1",
        },
        "tenant-1",
      ),
    ).toBe(true);
    expect(
      isConnectedInpostTenantIntegration(
        {
          integrationKey: "inpost",
          status: "connected",
          tenantId: "tenant-2",
        },
        "tenant-1",
      ),
    ).toBe(false);
  });
});
