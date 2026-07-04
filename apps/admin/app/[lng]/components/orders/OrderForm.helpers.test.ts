import { describe, expect, it } from "vitest";
import { AddressTypeEnum, Channel, Warehouse } from "@konfi/types";
import {
  createQuickOrderCustomerPatch,
  getChannelPickupWarehouseAddress,
  getCreateOrderPaymentAutoSelectionNotice,
  getAdminOrderDetailsHref,
  hasCreateOrderBillingPrefillNotice,
  normalizePickupAreaWarehouseIds,
} from "./OrderForm.helpers";

describe("normalizePickupAreaWarehouseIds", () => {
  it("returns an empty list for nullish and non-array warehouse state", () => {
    expect(normalizePickupAreaWarehouseIds(null)).toEqual([]);
    expect(normalizePickupAreaWarehouseIds(undefined)).toEqual([]);
  });

  it("keeps only unique non-empty warehouse IDs", () => {
    expect(
      normalizePickupAreaWarehouseIds([
        " warehouse-1 ",
        null,
        "",
        "warehouse-2",
        "warehouse-1",
        42,
      ]),
    ).toEqual(["warehouse-1", "warehouse-2"]);
  });
});

describe("getAdminOrderDetailsHref", () => {
  it("includes the channel id used to resolve the order document", () => {
    expect(getAdminOrderDetailsHref("en", "order-1", "channel-1")).toBe(
      "/en/orders/order-1?channelId=channel-1",
    );
  });

  it("encodes channel ids in the query string", () => {
    expect(getAdminOrderDetailsHref("pl", "order-1", "channel/main")).toBe(
      "/pl/orders/order-1?channelId=channel%2Fmain",
    );
  });
});

describe("hasCreateOrderBillingPrefillNotice", () => {
  it("returns true when the selected customer has a billing address", () => {
    expect(
      hasCreateOrderBillingPrefillNotice({
        addresses: [{ type: "SHIPPING" }, { type: "BILLING" }],
      }),
    ).toBe(true);
  });

  it("returns false when the selected customer has no billing address", () => {
    expect(
      hasCreateOrderBillingPrefillNotice({
        addresses: [{ type: "SHIPPING" }],
      }),
    ).toBe(false);
    expect(hasCreateOrderBillingPrefillNotice(null)).toBe(false);
  });
});

describe("getCreateOrderPaymentAutoSelectionNotice", () => {
  it("prefers deferred payments over bank transfer", () => {
    expect(
      getCreateOrderPaymentAutoSelectionNotice({
        allowedDefferedPayments: true,
        allowedBankPayments: true,
      }),
    ).toBe("deferred");
  });

  it("returns bank transfer when only bank payments are allowed", () => {
    expect(
      getCreateOrderPaymentAutoSelectionNotice({
        allowedDefferedPayments: false,
        allowedBankPayments: true,
      }),
    ).toBe("bankTransfer");
  });

  it("returns null when no customer payment rule applies", () => {
    expect(
      getCreateOrderPaymentAutoSelectionNotice({
        allowedDefferedPayments: false,
        allowedBankPayments: false,
      }),
    ).toBeNull();
    expect(getCreateOrderPaymentAutoSelectionNotice(undefined)).toBeNull();
  });
});

describe("createQuickOrderCustomerPatch", () => {
  it("syncs a trimmed quick order full name into the plain customer label", () => {
    expect(createQuickOrderCustomerPatch("  Anna Kowalska  ")).toEqual({
      customer: "Anna Kowalska",
      contactName: "Anna Kowalska",
    });
  });

  it("keeps quick orders anonymous when no name was provided", () => {
    expect(createQuickOrderCustomerPatch("   ")).toEqual({
      customer: "",
      contactName: "",
    });
    expect(createQuickOrderCustomerPatch(undefined)).toEqual({
      customer: "",
      contactName: "",
    });
  });
});

describe("getChannelPickupWarehouseAddress", () => {
  const channel = {
    warehouses: ["warehouse-1", "warehouse-2"],
  } as Pick<Channel, "warehouses">;
  const activeWarehouse = {
    id: "warehouse-2",
    name: "Main warehouse",
    active: true,
    address: {
      name: "",
      type: AddressTypeEnum.SHIPPING,
      street: "Marszalkowska",
      number: "10",
      local: "",
      zip: "00-001",
      city: "Warsaw",
      country: "Polska",
      active: true,
    },
  } as Warehouse;

  it("returns the first complete active warehouse address linked to the channel", () => {
    expect(
      getChannelPickupWarehouseAddress(channel, [
        {
          ...activeWarehouse,
          id: "warehouse-1",
          address: {
            ...activeWarehouse.address!,
            street: "",
          },
        },
        activeWarehouse,
      ]),
    ).toMatchObject({
      name: "Main warehouse",
      street: "Marszalkowska",
      type: AddressTypeEnum.SHIPPING,
      active: true,
    });
  });

  it("returns null when no linked warehouse has a complete pickup address", () => {
    expect(
      getChannelPickupWarehouseAddress(channel, [
        {
          ...activeWarehouse,
          id: "warehouse-1",
          address: null,
        },
      ]),
    ).toBeNull();
  });
});
