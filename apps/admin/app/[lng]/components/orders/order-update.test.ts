import { describe, expect, it, vi } from "vitest";
import {
  AddressTypeEnum,
  OrderFilesStatus,
  OrderStatus,
  PaymentStatus,
  PaymentType,
  ShippingOptions,
  Unit,
  type FormattedOrderItem,
  type Settings,
} from "@konfi/types";
import {
  createAdminOrderUpdatePayload,
  createAdminOrderItemsUpdatePatch,
} from "./order-update";

vi.mock("@/lib/firebase/clientApp", () => ({
  firestore: {},
}));

function createStoreSettings(): Settings {
  return {
    buying: {
      enabled: false,
      max: 0,
      min: 0,
    },
    freeShipping: {
      enabled: false,
      min: 0,
    },
    shippingOptionsPrices: {
      [ShippingOptions.PERSONAL_COLLECTION]: 0,
    },
    underConstruction: {
      enabled: false,
      message: "",
    },
    express: {
      enabled: false,
      percent: 0,
    },
  };
}

function createOrderItem(): FormattedOrderItem {
  return {
    id: "item-1",
    name: "Business cards",
    product: {
      id: "product-1",
      name: "Business cards",
      channelId: "channel-1",
      spec: {
        images: ["front.png"],
      },
    },
    description: "Business cards",
    customFormat: false,
    customPrice: null,
    totalPrice: 12_300,
    width: 90,
    height: 50,
    quantity: 1,
    discount: {
      code: null,
      discountedAmount: 0,
      discountValue: 0,
      type: "PERCENTAGE",
    },
    unit: Unit.PCS,
  };
}

describe("createAdminOrderUpdatePayload", () => {
  it("persists invoice notes while preserving invoice recipient billing fields", () => {
    const payload = createAdminOrderUpdatePayload(
      {
        customer: "Acme",
        contact: {
          name: "Anna Buyer",
          email: "anna@example.com",
          phone: "123456789",
          active: true,
        },
        email: "anna@example.com",
        anonymousPackageShipping: false,
        anonymousPackageLabelAddress: null,
        invoice: true,
        items: [createOrderItem()],
        shippingOption: ShippingOptions.PERSONAL_COLLECTION,
        shipping: {
          name: "Anna Buyer",
          type: AddressTypeEnum.SHIPPING,
          street: "Shipping 1",
          number: "",
          local: "",
          zip: "00-001",
          city: "Warsaw",
          country: "Polska",
          active: true,
        },
        designatedPickupAreaId: "",
        billing: {
          name: "Acme Billing",
          type: AddressTypeEnum.BILLING,
          nip: "1111111111",
          companyName: "Acme",
          invoiceRecipientEnabled: true,
          invoiceRecipientRole: "other",
          invoiceRecipientRoleDescription: "Grant coordinator",
          invoiceRecipientName: "Recipient Office",
          invoiceRecipientNip: "2222222222",
          invoiceRecipientStreet: "Recipient 2",
          invoiceRecipientZip: "00-002",
          invoiceRecipientCity: "Gdansk",
          street: "Billing 1",
          number: "",
          local: "",
          zip: "00-001",
          city: "Warsaw",
          country: "Polska",
          active: true,
        },
        exactTime: false,
        deadlineString: "2026-06-09",
        specialNotes: "Production note",
        invoiceNotes: "Visible invoice note",
        status: OrderStatus.NEW,
        paymentType: PaymentType.PROFORMA,
        paymentStatus: PaymentStatus.NEW,
        filesStatus: OrderFilesStatus.FILES_ARE_READY,
        difficulty: 5,
        priority: 2,
        updatedBy: {
          id: "member-1",
          name: "Member",
        },
        isTest: false,
        appliedPromotionCodes: [],
        paymentDocumentId: "",
        printingMethods: [],
        carriedOutBy: [],
        mailLink: "",
        sendStatusChangeEmail: false,
        active: true,
      },
      createStoreSettings(),
    );

    expect(payload.invoiceNotes).toBe("Visible invoice note");
    expect(payload.billing).toMatchObject({
      invoiceRecipientEnabled: true,
      invoiceRecipientRole: "other",
      invoiceRecipientRoleDescription: "Grant coordinator",
      invoiceRecipientName: "Recipient Office",
      invoiceRecipientNip: "2222222222",
      invoiceRecipientStreet: "Recipient 2",
      invoiceRecipientZip: "00-002",
      invoiceRecipientCity: "Gdansk",
      jstRecipientEnabled: false,
      jstRecipientName: "",
      jstRecipientNip: "",
      jstRecipientStreet: "",
      jstRecipientZip: "",
      jstRecipientCity: "",
    });
    expect(payload.items[0].product).toEqual({
      id: "product-1",
      name: "Business cards",
      channelId: "channel-1",
      spec: {
        images: ["front.png"],
      },
    });
  });

  it("preserves a valid product snapshot exactly (id, name, channelId, spec.images survive untouched)", () => {
    const item = createOrderItem();
    const payload = createAdminOrderUpdatePayload(
      {
        customer: "Acme",
        contact: { name: "Anna", email: "anna@example.com", phone: "", active: true },
        email: "anna@example.com",
        anonymousPackageShipping: false,
        anonymousPackageLabelAddress: null,
        invoice: false,
        items: [item],
        shippingOption: ShippingOptions.PERSONAL_COLLECTION,
        shipping: {
          name: "Anna",
          type: AddressTypeEnum.SHIPPING,
          street: "Street 1",
          number: "",
          local: "",
          zip: "00-001",
          city: "Warsaw",
          country: "Polska",
          active: true,
        },
        designatedPickupAreaId: "",
        billing: null,
        exactTime: false,
        deadlineString: "2026-06-09",
        specialNotes: "",
        invoiceNotes: "",
        status: OrderStatus.NEW,
        paymentType: PaymentType.PROFORMA,
        paymentStatus: PaymentStatus.NEW,
        filesStatus: OrderFilesStatus.FILES_ARE_READY,
        difficulty: 5,
        priority: 2,
        updatedBy: { id: "member-1", name: "Member" },
        isTest: false,
        appliedPromotionCodes: [],
        paymentDocumentId: "",
        printingMethods: [],
        carriedOutBy: [],
        mailLink: "",
        sendStatusChangeEmail: false,
        active: true,
      },
      createStoreSettings(),
    );

    expect(payload.items[0].product).toEqual({
      id: "product-1",
      name: "Business cards",
      channelId: "channel-1",
      spec: { images: ["front.png"] },
    });
  });

  it("throws when an item has no product (product: undefined)", () => {
    const item = { ...createOrderItem(), product: undefined };
    expect(() =>
      createAdminOrderItemsUpdatePatch(
        {
          items: [item as unknown as FormattedOrderItem],
          shippingOption: ShippingOptions.PERSONAL_COLLECTION,
          updatedBy: { id: "member-1", name: "Member" },
        },
        createStoreSettings(),
      ),
    ).toThrow(/missing required product identity/);
  });

  it("throws when an item has empty-identity product ({ id: '', name: '' })", () => {
    const item: FormattedOrderItem = {
      ...createOrderItem(),
      product: {
        id: "",
        name: "",
        channelId: "",
        spec: { images: [] },
      },
    };
    expect(() =>
      createAdminOrderItemsUpdatePatch(
        {
          items: [item],
          shippingOption: ShippingOptions.PERSONAL_COLLECTION,
          updatedBy: { id: "member-1", name: "Member" },
        },
        createStoreSettings(),
      ),
    ).toThrow(/missing required product identity/);
  });
});
