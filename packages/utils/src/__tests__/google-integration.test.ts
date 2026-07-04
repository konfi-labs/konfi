import { describe, expect, it } from "vitest";
import {
  getGoogleStorefrontChannelConfig,
  isConnectedGoogleTenantIntegration,
  mergeGoogleStorefrontChannelConfig,
  normalizeGoogleTenantIntegrationMetadata,
  tenantGoogleIntegrationDocumentId,
} from "../google-integration";

describe("google tenant integration helpers", () => {
  it("builds tenant Google integration document IDs", () => {
    expect(tenantGoogleIntegrationDocumentId("tenant-1")).toBe(
      "tenant-1_google",
    );
  });

  it("normalizes per-channel public Google config", () => {
    const metadata = normalizeGoogleTenantIntegrationMetadata({
      google: {
        channels: {
          " channel-1 ": {
            placeId: " place-1 ",
            reviewsEnabled: true,
            tagManagerEnabled: true,
            tagManagerId: " GTM-ABC123 ",
          },
          "bad/channel": {
            placeId: "ignored",
            reviewsEnabled: true,
            tagManagerEnabled: false,
          },
        },
      },
    });

    expect(metadata.google.channels).toEqual({
      "channel-1": {
        placeId: "place-1",
        reviewsEnabled: true,
        tagManagerEnabled: true,
        tagManagerId: "GTM-ABC123",
      },
    });
  });

  it("returns disabled defaults for missing channel config", () => {
    expect(getGoogleStorefrontChannelConfig(undefined, "channel-1")).toEqual({
      reviewsEnabled: false,
      tagManagerEnabled: false,
    });
  });

  it("merges a channel config without dropping other channels", () => {
    const metadata = mergeGoogleStorefrontChannelConfig({
      channelId: "channel-2",
      config: {
        reviewsEnabled: false,
        tagManagerEnabled: true,
        tagManagerId: "GTM-XYZ",
      },
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
    });

    expect(metadata.google.channels).toEqual({
      "channel-1": {
        placeId: "place-1",
        reviewsEnabled: true,
        tagManagerEnabled: false,
      },
      "channel-2": {
        reviewsEnabled: false,
        tagManagerEnabled: true,
        tagManagerId: "GTM-XYZ",
      },
    });
  });

  it("requires connected google integration docs for the requested tenant", () => {
    expect(
      isConnectedGoogleTenantIntegration(
        {
          integrationKey: "google",
          status: "connected",
          tenantId: "tenant-1",
        },
        "tenant-1",
      ),
    ).toBe(true);
    expect(
      isConnectedGoogleTenantIntegration(
        {
          integrationKey: "google",
          status: "connected",
          tenantId: "tenant-2",
        },
        "tenant-1",
      ),
    ).toBe(false);
  });
});
