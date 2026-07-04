import {
  AddressTypeEnum,
  CurrencyEnum,
  Discount,
  OrderFilesStatus,
  OrderItem,
  OrderStatus,
  PaymentStatus,
  PaymentType,
  PriceTypeEnum,
  PrintingMethod,
  ShippingOptions,
  Unit,
} from "@konfi/types";
import {
  AdminQuickOrderCreateSchema,
  AddressSchema,
  OrderCreateSchema,
  OrderUpdateSchema,
  QuoteCreateSchema,
  stripEmptyOrderItems,
} from "../../index";

const emptyOrderItem: OrderItem = {
  id: "",
  product: null,
  combination: "",
  name: "",
  description: "",
  volume: 0,
  customFormat: false,
  totalPrice: 0,
  customPrice: 0,
  width: 0,
  height: 0,
  quantity: 1,
  discount: new Discount().object,
  unit: Unit.PCS,
};

const configuredOrderItem: OrderItem = {
  ...emptyOrderItem,
  name: "Business cards",
  description: "350 gsm, double-sided",
  volume: 500,
  totalPrice: 12000,
};

const minimalProduct = {
  id: "prod-1",
  name: "Business cards",
  prices: [],
  attributes: [],
  volumes: [],
  customSize: false,
  allowCustomPrice: false,
  recommended: false,
  difficulty: 1,
  priceType: PriceTypeEnum.SINGLE,
  prefferedUnit: Unit.PCS,
  spec: {
    images: [],
    defaultOrder: 1,
    minimumOrder: 1,
    maximumOrder: 1000,
    step: 1,
  },
  channelId: "ch-1",
  category: { id: "category-1", name: "Print" },
  productType: {
    id: "product-type-1",
    name: "Business cards",
    attributes: [],
    isShippable: true,
  },
  defaultPrice: { currency: CurrencyEnum.PLN },
  lowPrice: { currency: CurrencyEnum.PLN },
  highPrice: { currency: CurrencyEnum.PLN },
};

const itemWithProduct: OrderItem = {
  ...configuredOrderItem,
  product: minimalProduct as OrderItem["product"],
};

const quickOrderInput = {
  customer: "",
  contact: {
    name: "",
    email: "",
    phone: "",
    active: true,
  },
  email: "",
  externalSource: null,
  anonymousPackageShipping: false,
  anonymousPackageLabelAddress: {},
  invoice: false,
  items: [itemWithProduct],
  shippingOption: ShippingOptions.PERSONAL_COLLECTION,
  shipping: null,
  billing: null,
  exactTime: false,
  deadlineString: "2026-07-01",
  specialNotes: "",
  invoiceNotes: "",
  mailLink: "",
  status: OrderStatus.NEW,
  paymentType: PaymentType.ON_PICKUP,
  paymentStatus: PaymentStatus.NEW,
  filesStatus: OrderFilesStatus.FILES_ARE_READY,
  difficulty: 5,
  priority: 2,
  isTest: false,
  createdBy: {
    id: "member-1",
    name: "Admin",
  },
  appliedPromotionCodes: [],
  paymentDocumentId: "",
  proformaDocumentId: "",
  printingMethods: [],
  carriedOutBy: [],
  saveCustomer: false,
  saveContact: false,
  sendStatusChangeEmail: false,
  saveShippingAddress: false,
  saveBillingAddress: false,
  active: true,
};

describe("OrderCreateSchema", () => {
  describe("customer and contact", () => {
    it("still rejects blank customer and contact name in the standard schema", () => {
      expect(() => {
        OrderCreateSchema.validateSyncAt("customer", { customer: "" });
      }).toThrow();

      expect(() => {
        OrderCreateSchema.validateSyncAt("contact.name", {
          contact: { name: "" },
        });
      }).toThrow();
    });
  });

  describe("invoice recipient address fields", () => {
    it("casts invoice recipient defaults on addresses", () => {
      const result = AddressSchema.cast(
        {
          name: "Buyer",
          type: AddressTypeEnum.BILLING,
        },
        { assert: false },
      );

      expect(result).toMatchObject({
        invoiceRecipientEnabled: false,
        invoiceRecipientRole: "recipient",
        invoiceRecipientRoleDescription: "",
        invoiceRecipientName: "",
        invoiceRecipientNip: "",
        invoiceRecipientStreet: "",
        invoiceRecipientZip: "",
        invoiceRecipientCity: "",
      });
    });

    it("requires custom role description when invoice recipient role is other", async () => {
      await expect(
        AddressSchema.validate({
          name: "Buyer",
          type: AddressTypeEnum.BILLING,
          invoiceRecipientEnabled: true,
          invoiceRecipientRole: "other",
          invoiceRecipientRoleDescription: "",
        }),
      ).rejects.toThrow();
    });
  });

  describe("externalSource", () => {
    it("should allow missing externalSource", () => {
      const result = OrderCreateSchema.validateSyncAt("externalSource", {});

      expect(result ?? null).toBeNull();
    });

    it("should treat an empty externalSource object as null", () => {
      const result = OrderCreateSchema.validateSyncAt("externalSource", {
        externalSource: {},
      });

      expect(result).toBeNull();
    });

    it("should still require externalOrderId for non-empty externalSource", () => {
      expect(() => {
        OrderCreateSchema.validateSyncAt("externalSource", {
          externalSource: {
            provider: "ALLEGRO",
          },
        });
      }).toThrow();
    });

    it("should validate a complete externalSource", () => {
      const result = OrderCreateSchema.validateSyncAt("externalSource", {
        externalSource: {
          provider: "ALLEGRO",
          externalOrderId: "ALLEGRO-123",
        },
      });

      expect(result).toMatchObject({
        provider: "ALLEGRO",
        externalOrderId: "ALLEGRO-123",
      });
    });
  });

  describe("shipping", () => {
    it("rejects a missing shipping destination when shipping option is selected", () => {
      expect(() => {
        OrderCreateSchema.validateSyncAt("shipping", {
          shippingOption: ShippingOptions.PERSONAL_COLLECTION,
          shipping: null,
        });
      }).toThrow();
    });

    it("rejects an incomplete shipping destination", () => {
      expect(() => {
        OrderCreateSchema.validateSyncAt("shipping", {
          shippingOption: ShippingOptions.COMPANY_COURIER,
          shipping: {
            type: AddressTypeEnum.SHIPPING,
            street: "",
            zip: "00-001",
            city: "Warsaw",
            country: "Polska",
            active: true,
          },
        });
      }).toThrow();
    });

    it("accepts a complete shipping destination", () => {
      const result = OrderCreateSchema.validateSyncAt("shipping", {
        shippingOption: ShippingOptions.PERSONAL_COLLECTION,
        shipping: {
          name: "Main warehouse",
          type: AddressTypeEnum.SHIPPING,
          street: "Marszalkowska",
          zip: "00-001",
          city: "Warsaw",
          country: "Polska",
          active: true,
        },
      });

      expect(result).toMatchObject({
        street: "Marszalkowska",
        zip: "00-001",
        city: "Warsaw",
      });
    });
  });

  describe("printingMethods", () => {
    it("rejects an empty printing methods selection", () => {
      expect(() => {
        OrderCreateSchema.validateSyncAt("printingMethods", {
          printingMethods: [],
        });
      }).toThrow();
    });

    it("rejects a missing printing methods selection", () => {
      expect(() => {
        OrderCreateSchema.validateSyncAt("printingMethods", {});
      }).toThrow();
    });

    it("accepts at least one printing method", () => {
      const result = OrderCreateSchema.validateSyncAt("printingMethods", {
        printingMethods: [PrintingMethod.DIGITAL],
      });

      expect(result).toEqual([PrintingMethod.DIGITAL]);
    });
  });

  describe("items", () => {
    it("strips empty order items before order create schema casting", () => {
      const result = OrderCreateSchema.cast(
        {
          items: [emptyOrderItem, itemWithProduct],
        },
        { assert: false },
      );

      expect(result.items).toHaveLength(1);
      expect(result.items?.[0]).toMatchObject({
        name: "Business cards",
        product: { id: "prod-1", name: "Business cards" },
      });
    });

    it("strips empty order items before quote create schema casting", () => {
      const result = QuoteCreateSchema.cast(
        {
          items: [emptyOrderItem, configuredOrderItem],
        },
        { assert: false },
      );

      expect(result.items).toHaveLength(1);
      expect(result.items?.[0]).toMatchObject(configuredOrderItem);
    });

    it("strips empty order items from raw form submissions", () => {
      const result = stripEmptyOrderItems({
        items: [emptyOrderItem, configuredOrderItem],
      });

      expect(result.items).toEqual([configuredOrderItem]);
    });

    it("rejects order create when all items are blank placeholders (empty after strip)", () => {
      expect(() => {
        OrderCreateSchema.validateSyncAt("items", {
          items: [emptyOrderItem],
        });
      }).toThrow("Pole jest wymagane.");
    });

    it("rejects order create when a non-blank item has no product (product: null)", () => {
      expect(() => {
        OrderCreateSchema.validateSyncAt("items", {
          items: [configuredOrderItem],
        });
      }).toThrow();
    });

    it("rejects order create when an item has an empty-identity product ({ id: '', name: '' })", () => {
      const itemWithEmptyProduct: OrderItem = {
        ...configuredOrderItem,
        product: { ...minimalProduct, id: "", name: "" } as OrderItem["product"],
      };

      expect(() => {
        OrderCreateSchema.validateSyncAt("items", {
          items: [itemWithEmptyProduct],
        });
      }).toThrow();
    });

    it("accepts order create when items contain at least one valid product item", () => {
      const result = OrderCreateSchema.validateSyncAt("items", {
        items: [itemWithProduct],
      });

      expect(result).toHaveLength(1);
    });

    it("rejects order update when all items are blank placeholders (empty after strip)", () => {
      expect(() => {
        OrderUpdateSchema.validateSyncAt("items", {
          items: [emptyOrderItem],
        });
      }).toThrow("Pole jest wymagane.");
    });

    it("rejects order update when a non-blank item has no product", () => {
      expect(() => {
        OrderUpdateSchema.validateSyncAt("items", {
          items: [configuredOrderItem],
        });
      }).toThrow();
    });

    it("accepts order update when items contain at least one valid product item", () => {
      const result = OrderUpdateSchema.validateSyncAt("items", {
        items: [itemWithProduct],
      });

      expect(result).toHaveLength(1);
    });

    it("accepts quote create when all items are blank placeholders (quotes keep no min-1 rule)", () => {
      const result = QuoteCreateSchema.validateSyncAt("items", {
        items: [emptyOrderItem],
      });

      expect(result).toEqual([]);
    });
  });
});

describe("AdminQuickOrderCreateSchema", () => {
  it("accepts optional customer, contact name, phone, printing methods, and pickup shipping", async () => {
    await expect(
      AdminQuickOrderCreateSchema.validate(quickOrderInput, {
        abortEarly: false,
      }),
    ).resolves.toMatchObject({
      customer: "",
      contact: {
        name: "",
        phone: "",
      },
      printingMethods: [],
      shipping: null,
      shippingOption: ShippingOptions.PERSONAL_COLLECTION,
    });
  });

  it("rejects non-pickup delivery without a shipping destination", async () => {
    await expect(
      AdminQuickOrderCreateSchema.validate(
        {
          ...quickOrderInput,
          shippingOption: ShippingOptions.COMPANY_COURIER,
          shipping: null,
        },
        { abortEarly: false },
      ),
    ).rejects.toThrow();
  });

  it("accepts invoice data when quick order invoice is enabled", async () => {
    await expect(
      AdminQuickOrderCreateSchema.validate(
        {
          ...quickOrderInput,
          invoice: true,
          billing: {
            name: "Acme",
            type: AddressTypeEnum.BILLING,
            companyName: "Acme",
            nip: "1234567890",
            street: "Marszalkowska",
            zip: "00-001",
            city: "Warsaw",
            country: "Polska",
            active: true,
          },
        },
        { abortEarly: false },
      ),
    ).resolves.toMatchObject({
      invoice: true,
      billing: {
        companyName: "Acme",
        nip: "1234567890",
      },
    });
  });

  it("still requires valid order items", async () => {
    await expect(
      AdminQuickOrderCreateSchema.validate(
        {
          ...quickOrderInput,
          items: [],
        },
        { abortEarly: false },
      ),
    ).rejects.toThrow();
  });
});
