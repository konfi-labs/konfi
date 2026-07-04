import { CurrencyEnum } from "@konfi/types";
import { describe, expect, it } from "vitest";
import { buildTenantChannelMirrorDocument } from "./tenant-channel-mirror";

describe("buildTenantChannelMirrorDocument", () => {
  it("builds an active storefront channel mirror from runtime channel data", () => {
    expect(
      buildTenantChannelMirrorDocument({
        channel: {
          active: true,
          currency: CurrencyEnum.PLN,
          name: "Sklep Łódź",
        },
        storefrontEnabled: true,
        tenantId: "tenant-a",
      }),
    ).toEqual({
      currency: CurrencyEnum.PLN,
      name: "Sklep Łódź",
      slug: "sklep-odz",
      status: "active",
      storefrontEnabled: true,
      tenantId: "tenant-a",
    });
  });

  it("marks disabled runtime channels as disabled in the control plane", () => {
    expect(
      buildTenantChannelMirrorDocument({
        channel: {
          active: false,
          currency: CurrencyEnum.EUR,
          name: "EU Store",
        },
        storefrontEnabled: false,
        tenantId: "tenant-a",
      }),
    ).toMatchObject({
      currency: CurrencyEnum.EUR,
      slug: "eu-store",
      status: "disabled",
      storefrontEnabled: false,
    });
  });
});
