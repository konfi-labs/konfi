import {
  Discount,
  PaymentType,
  PriceTypeEnum,
  ShippingOptions,
  ShippingTypes,
  Unit,
  type OrderItem,
  type PaymentMethodsSettings,
} from "@konfi/types";
import { normalizePaymentMethodsSettings } from "@konfi/utils";
import {
  getCartAvailablePaymentTypes,
  getCartAvailableShippingOptions,
  INITIAL_CART_SHIPPING_OPTION,
  resolveCartSelection,
} from "./cart-selections";

const createOrderItem = (shippingTypes: ShippingTypes[]): OrderItem =>
  ({
    id: "item-1",
    name: "Item",
    description: "Test item",
    customFormat: false,
    totalPrice: 1000,
    customPrice: null,
    quantity: 1,
    discount: new Discount().object,
    unit: Unit.PCS,
    product: {
      id: "product-1",
      name: "Product",
      priceType: PriceTypeEnum.SINGLE,
      shipping: {
        types: shippingTypes,
      },
    },
  }) as unknown as OrderItem;

describe("cart selections", () => {
  it("uses InPost courier as the initial shipping option", () => {
    expect(INITIAL_CART_SHIPPING_OPTION).toBe(ShippingOptions.INPOST);
  });

  it("derives available shipping options directly from cart items", () => {
    expect(
      getCartAvailableShippingOptions([
        createOrderItem([
          ShippingTypes.COURIER,
          ShippingTypes.PERSONAL_COLLECTION,
        ]),
        createOrderItem([ShippingTypes.COURIER]),
      ]),
    ).toEqual([
      ShippingOptions.INPOST,
      ShippingOptions.DHL,
      ShippingOptions.DPD,
      ShippingOptions.FEDEX,
    ]);
  });

  it("derives available payment types from the selected shipping option", () => {
    expect(
      getCartAvailablePaymentTypes(ShippingOptions.DHL, {
        allowedBankPayments: true,
        allowedDefferedPayments: false,
        allowedOnPickupPayments: false,
      }),
    ).toEqual([
      PaymentType.STRIPE,
      PaymentType.PRZELEWY24,
      PaymentType.BANK_TRANSFER,
    ]);
  });

  it("keeps Przelewy24 available only for PLN checkout currency", () => {
    const customer = {
      allowedBankPayments: true,
      allowedDefferedPayments: false,
      allowedOnPickupPayments: false,
    };

    expect(
      getCartAvailablePaymentTypes(ShippingOptions.DHL, customer, false, "PLN"),
    ).toContain(PaymentType.PRZELEWY24);

    expect(
      getCartAvailablePaymentTypes(ShippingOptions.DHL, customer, false, "EUR"),
    ).toEqual([PaymentType.STRIPE, PaymentType.BANK_TRANSFER]);
  });

  it("removes online payment methods when tenant providers are not configured", () => {
    expect(
      getCartAvailablePaymentTypes(
        ShippingOptions.DHL,
        undefined,
        false,
        "PLN",
        undefined,
        {
          przelewy24Configured: false,
          stripeConfigured: false,
        },
      ),
    ).toEqual([]);
  });

  it("keeps configured cash on delivery when online providers are not configured", () => {
    const paymentMethodsSettings: PaymentMethodsSettings =
      normalizePaymentMethodsSettings({
        methods: [
          {
            id: PaymentType.ON_DELIVERY,
            name: "Cash on delivery",
            providerKind: "delivery",
            allowedShippingMethodIds: [ShippingOptions.DHL],
            icon: "local_shipping",
            colorPalette: "orange",
            enabled: true,
            archived: false,
            order: 0,
            storefrontEnabled: true,
          },
        ],
      });

    expect(
      getCartAvailablePaymentTypes(
        ShippingOptions.DHL,
        undefined,
        false,
        "PLN",
        paymentMethodsSettings,
        {
          przelewy24Configured: false,
          stripeConfigured: false,
        },
      ),
    ).toEqual([PaymentType.ON_DELIVERY]);
  });

  it("keeps the current selection when it is still available", () => {
    expect(
      resolveCartSelection(ShippingOptions.INPOST, [
        ShippingOptions.DHL,
        ShippingOptions.INPOST,
      ]),
    ).toBe(ShippingOptions.INPOST);
  });

  it("falls back to the first available option when the current one is invalid", () => {
    expect(
      resolveCartSelection(ShippingOptions.PERSONAL_COLLECTION, [
        ShippingOptions.DHL,
        ShippingOptions.INPOST,
      ]),
    ).toBe(ShippingOptions.DHL);
  });
});
