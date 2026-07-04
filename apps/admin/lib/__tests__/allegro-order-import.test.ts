import { Timestamp } from "firebase/firestore";
import {
  CurrencyEnum,
  OrderFilesStatus,
  PaymentStatus,
  PaymentType,
  PriceTypeEnum,
  PrintingMethod,
  Product,
  ShippingOptions,
  Unit,
} from "@konfi/types";
import { OrderCreateSchema } from "@konfi/utils";
import { describe, expect, it } from "vitest";
import {
  createAllegroExternalSource,
  mapAllegroOrderToDuplicateDraft,
  type AllegroOrder,
} from "../allegro-order-import";

function createFallbackProduct(): Product {
  const now = Timestamp.now();

  return {
    id: "fallback-product-id",
    name: "Usługi poligraficzne",
    createdBy: { id: "member-1", name: "Test User" },
    createdAt: now,
    updatedBy: { id: "member-1", name: "Test User" },
    updatedAt: now,
    active: true,
    prices: [],
    defaultPrice: { value: 0, currency: CurrencyEnum.PLN, threshold: 0 },
    lowPrice: { value: 0, currency: CurrencyEnum.PLN, threshold: 0 },
    highPrice: { value: 0, currency: CurrencyEnum.PLN, threshold: 0 },
    description: "Fallback product",
    volumes: [],
    attributes: [],
    attributeOptions: {},
    customSize: false,
    allowCustomPrice: true,
    recommended: false,
    difficulty: 1,
    shipping: { types: [] },
    spec: {
      images: [],
      defaultOrder: 1,
      minimumOrder: 1,
      maximumOrder: 1000,
      step: 1,
    },
    category: { id: "category-1", name: "Category" },
    seo: {
      slug: "fallback-product",
      title: "Fallback Product",
      description: "Fallback Product",
    },
    productType: null,
    priceType: PriceTypeEnum.SINGLE,
    prefferedUnit: Unit.PCS,
    availability: {
      published: true,
      availableForPurchase: true,
    },
    keywords: [],
    channelId: "channel-1",
  };
}

function createAllegroOrder(): AllegroOrder {
  return {
    id: "allegro-order-1",
    revision: "revision-1",
    status: "BOUGHT",
    buyer: {
      id: "buyer-1",
      email: "buyer@example.com",
      login: "buyer-login",
      firstName: "Example",
      lastName: "Customer",
      phoneNumber: "000000001",
    },
    invoice: {
      required: true,
      address: {
        street: "Example Invoice Street 2",
        city: "Example City",
        zipCode: "00-002",
        countryCode: "PL",
        company: {
          name: "Example Company Sp. z o.o.",
          taxId: "000-00-00-001",
          ids: [{ type: "PL_NIP", value: "000-00-00-001" }],
        },
        naturalPerson: {
          firstName: "Example",
          lastName: "Customer",
        },
      },
    },
    lineItems: [
      {
        id: "line-item-1",
        offer: {
          id: "offer-1",
          name: "Produkt Allegro",
          external: { id: "external-offer-1" },
        },
        quantity: 2,
        originalPrice: { amount: "12.50", currency: "PLN" },
        price: { amount: "10.00", currency: "PLN" },
        boughtAt: "2026-03-16T10:00:00.000Z",
      },
    ],
    payment: {
      id: "payment-1",
      type: "CARD",
      finishedAt: "2026-03-16T10:05:00.000Z",
      paidAmount: { amount: "20.00", currency: "PLN" },
    },
    delivery: {
      method: { id: "delivery-1", name: "InPost Paczkomat 24/7" },
      cost: { amount: "15.00", currency: "PLN" },
      address: {
        firstName: "Example",
        lastName: "Customer",
        street: "Example Street 1",
        city: "Example City",
        zipCode: "00-001",
        countryCode: "PL",
      },
      pickupPoint: {
        id: "pickup-1",
        name: "WAW01A",
        address: "Example Pickup Street 2, Example City",
      },
    },
    fulfillment: {
      status: "NEW",
      shipmentSummary: { lineItemsSent: "NONE" },
    },
    summary: {
      totalToPay: { amount: "35.00", currency: "PLN" },
    },
    updatedAt: "2026-03-16T11:00:00.000Z",
    messageToSeller: "Please print ASAP",
  };
}

describe("allegro order import mapper", () => {
  it("creates external source metadata from allegro order", () => {
    const metadata = createAllegroExternalSource(createAllegroOrder());

    expect(metadata.provider).toBe("ALLEGRO");
    expect(metadata.externalOrderId).toBe("allegro-order-1");
    expect(metadata.externalPaymentId).toBe("payment-1");
    expect(metadata.fulfillmentProvider).toBe("SELLER");
    expect(metadata.externallyFulfilled).toBe(false);
    expect(metadata.lineItems).toHaveLength(1);
    expect(metadata.lineItems?.[0]?.externalOfferId).toBe("offer-1");
  });

  it("marks Allegro warehouse orders as externally fulfilled", () => {
    const allegroOrder = createAllegroOrder();
    allegroOrder.fulfillment.provider = { id: "ALLEGRO" };

    const metadata = createAllegroExternalSource(allegroOrder);

    expect(metadata.fulfillmentProvider).toBe("ALLEGRO");
    expect(metadata.externallyFulfilled).toBe(true);
  });

  it("maps allegro order to duplicate draft order", () => {
    const draft = mapAllegroOrderToDuplicateDraft({
      allegroOrder: createAllegroOrder(),
      fallbackProduct: createFallbackProduct(),
      channel: { id: "channel-1", currency: CurrencyEnum.PLN },
    });

    expect(draft.customer).toBe("Example Customer");
    expect(draft.contact.email).toBe("buyer@example.com");
    expect(draft.paymentType).toBe(PaymentType.ALLEGRO);
    expect(draft.paymentStatus).toBe(PaymentStatus.COMPLETED);
    expect(draft.filesStatus).toBe(OrderFilesStatus.WAITING_FOR_FILES);
    expect(draft.shippingOption).toBe(ShippingOptions.PACZKOMATY_INPOST);
    expect(draft.shippingPrice).toBe(1500);
    expect(draft.totalPrice).toBe(3500);
    expect(draft.invoice).toBe(true);
    expect(draft.billing).toEqual({
      name: "Example Customer",
      type: "BILLING",
      nip: "000-00-00-001",
      companyName: "Example Company Sp. z o.o.",
      street: "Example Invoice Street 2",
      zip: "00-002",
      city: "Example City",
      country: "PL",
      active: true,
    });
    expect(draft.items).toHaveLength(1);
    expect(draft.items[0]?.product?.id).toBe("fallback-product-id");
    expect(draft.items[0]?.product?.disablePriceFetch).toBe(true);
    expect(draft.items[0]?.product?.provider).toEqual({
      type: "KONFI",
      productId: "fallback-product-id",
    });
    expect(draft.items[0]?.customPrice).toBe(1000);
    expect(draft.items[0]?.totalPrice).toBe(2000);
    expect(draft.externalSource?.provider).toBe("ALLEGRO");
    expect(draft.specialNotes).toBe(
      "Please print ASAP\n\nPunkt odbioru Allegro: WAW01A\n\nAdres punktu odbioru Allegro: Example Pickup Street 2, Example City",
    );
  });

  it("converts Allegro major-unit prices to minor units", () => {
    const allegroOrder = createAllegroOrder();
    allegroOrder.lineItems[0]!.price = { amount: "56.00", currency: "PLN" };
    allegroOrder.lineItems[0]!.quantity = 1;
    allegroOrder.delivery.cost = { amount: "12.34", currency: "PLN" };
    allegroOrder.summary.totalToPay = { amount: "68.34", currency: "PLN" };

    const draft = mapAllegroOrderToDuplicateDraft({
      allegroOrder,
      fallbackProduct: createFallbackProduct(),
      channel: { id: "channel-1", currency: CurrencyEnum.PLN },
    });

    expect(draft.items[0]?.customPrice).toBe(5600);
    expect(draft.items[0]?.totalPrice).toBe(5600);
    expect(draft.shippingPrice).toBe(1234);
    expect(draft.totalPrice).toBe(6834);
  });

  it("formats pickup point address objects in special notes", () => {
    const allegroOrder = createAllegroOrder();
    allegroOrder.delivery.pickupPoint = {
      id: "pickup-1",
      name: "WAW01A",
      address: {
        street: "Example Pickup Street 2",
        zipCode: "00-002",
        city: "Example City",
        countryCode: "PL",
      },
    };

    const draft = mapAllegroOrderToDuplicateDraft({
      allegroOrder,
      fallbackProduct: createFallbackProduct(),
      channel: { id: "channel-1", currency: CurrencyEnum.PLN },
    });

    expect(draft.specialNotes).toContain(
      "Adres punktu odbioru Allegro: Example Pickup Street 2, 00-002 Example City, PL",
    );
  });

  describe("schema regression: printingMethods", () => {
    it("mapped draft always starts with empty printingMethods", () => {
      const draft = mapAllegroOrderToDuplicateDraft({
        allegroOrder: createAllegroOrder(),
        fallbackProduct: createFallbackProduct(),
        channel: { id: "channel-1", currency: CurrencyEnum.PLN },
      });

      expect(draft.printingMethods).toEqual([]);
    });

    it("OrderCreateSchema rejects an empty printingMethods array (same as mapped draft)", () => {
      const draft = mapAllegroOrderToDuplicateDraft({
        allegroOrder: createAllegroOrder(),
        fallbackProduct: createFallbackProduct(),
        channel: { id: "channel-1", currency: CurrencyEnum.PLN },
      });

      expect(() => {
        OrderCreateSchema.validateSyncAt("printingMethods", {
          printingMethods: draft.printingMethods,
        });
      }).toThrow("Pole jest wymagane.");
    });

    it("OrderCreateSchema accepts printingMethods once a method is added to the draft", () => {
      const draft = mapAllegroOrderToDuplicateDraft({
        allegroOrder: createAllegroOrder(),
        fallbackProduct: createFallbackProduct(),
        channel: { id: "channel-1", currency: CurrencyEnum.PLN },
      });

      const result = OrderCreateSchema.validateSyncAt("printingMethods", {
        printingMethods: [...draft.printingMethods, PrintingMethod.DIGITAL],
      });

      expect(result).toEqual([PrintingMethod.DIGITAL]);
    });
  });

  describe("schema regression: items without product", () => {
    it("when fallbackProduct is null every mapped item has product: null", () => {
      const draft = mapAllegroOrderToDuplicateDraft({
        allegroOrder: createAllegroOrder(),
        fallbackProduct: null,
        channel: { id: "channel-1", currency: CurrencyEnum.PLN },
      });

      expect(draft.items.length).toBeGreaterThan(0);
      draft.items.forEach((item) => {
        expect(item.product).toBeNull();
      });
    });

    it("OrderCreateSchema rejects items slice when every item has product: null", () => {
      const draft = mapAllegroOrderToDuplicateDraft({
        allegroOrder: createAllegroOrder(),
        fallbackProduct: null,
        channel: { id: "channel-1", currency: CurrencyEnum.PLN },
      });

      expect(() => {
        OrderCreateSchema.validateSyncAt("items", { items: draft.items });
      }).toThrow();
    });

    it("OrderCreateSchema rejects an empty items array", () => {
      expect(() => {
        OrderCreateSchema.validateSyncAt("items", { items: [] });
      }).toThrow("Pole jest wymagane.");
    });
  });

  it("falls back to invoice company NIP identifiers and buyer company name", () => {
    const allegroOrder = createAllegroOrder();
    allegroOrder.buyer = {
      id: "buyer-company-1",
      email: "billing@example.com",
      login: "buyer-company-login",
      companyName: "Example Company",
      phoneNumber: "000000003",
    };
    allegroOrder.delivery.address = {
      companyName: "Example Company",
      street: "Example Road 7",
      city: "Example City",
      zipCode: "00-003",
      countryCode: "PL",
    };
    allegroOrder.invoice = {
      required: true,
      address: {
        street: "Example Road 7",
        city: "Example City",
        zipCode: "00-003",
        countryCode: "PL",
        company: {
          name: "Example Company",
          ids: [{ type: "PL_NIP", value: "000-00-00-003" }],
        },
      },
    };

    const draft = mapAllegroOrderToDuplicateDraft({
      allegroOrder,
      fallbackProduct: createFallbackProduct(),
      channel: { id: "channel-1", currency: CurrencyEnum.PLN },
    });

    expect(draft.customer).toBe("Example Company");
    expect(draft.contact.name).toBe("Example Company");
    expect(draft.shipping?.name).toBe("Example Company");
    expect(draft.billing?.name).toBe("Example Company");
    expect(draft.billing?.companyName).toBe("Example Company");
    expect(draft.billing?.nip).toBe("000-00-00-003");
  });
});
