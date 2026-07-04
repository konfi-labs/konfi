import { describe, expect, it } from "vitest";
import {
  computeInitialEnableCustomDiscount,
  computeInitialHasInitializedProduct,
  createCombinationInputBaseKey,
  computeProductChanged,
  getOrderItemConfigurationResetValues,
  resolveCombinationInputBaseProduct,
  resolveMatrixVolume,
  resolveNonMatrixVolume,
  shouldShowIncompatibleConfigurationFallback,
  shouldShowUnavailableProductFallback,
  shouldClearConfiguration,
  shouldSeedCustomerDiscount,
} from "../combination-input-utils";

type ProductStub = { id: string; name?: string; };

describe("computeInitialHasInitializedProduct", () => {
  it("returns true when a productId is already set at mount time (edit mode)", () => {
    expect(computeInitialHasInitializedProduct("product-abc")).toBe(true);
  });

  it("returns false when no productId exists at mount time (create mode)", () => {
    expect(computeInitialHasInitializedProduct(undefined)).toBe(false);
  });

  it("returns false for empty string productId", () => {
    expect(computeInitialHasInitializedProduct("")).toBe(false);
  });
});

describe("computeProductChanged", () => {
  it("returns false when the same product is loaded (edit mode, initial hydration)", () => {
    expect(
      computeProductChanged({
        prevProductId: "product-abc",
        productId: "product-abc",
        hasInitializedProduct: true,
        generated: false,
      }),
    ).toBe(false);
  });

  it("returns true when the user switches to a different product after initialization", () => {
    expect(
      computeProductChanged({
        prevProductId: "product-abc",
        productId: "product-def",
        hasInitializedProduct: true,
        generated: false,
      }),
    ).toBe(true);
  });

  it("returns false on the very first product selection in create mode (hasInitializedProduct=false)", () => {
    expect(
      computeProductChanged({
        prevProductId: undefined,
        productId: "product-abc",
        hasInitializedProduct: false,
        generated: false,
      }),
    ).toBe(false);
  });

  it("returns false when the item is generated, even if the product id changes", () => {
    expect(
      computeProductChanged({
        prevProductId: "product-abc",
        productId: "product-def",
        hasInitializedProduct: true,
        generated: true,
      }),
    ).toBe(false);
  });

  it("returns false when both prevProductId and productId are undefined", () => {
    expect(
      computeProductChanged({
        prevProductId: undefined,
        productId: undefined,
        hasInitializedProduct: false,
        generated: false,
      }),
    ).toBe(false);
  });
});

describe("shouldClearConfiguration", () => {
  it("returns false when productId is undefined", () => {
    expect(
      shouldClearConfiguration({
        productId: undefined,
        generated: false,
        hasInitializedProduct: true,
        prevProductId: "product-abc",
      }),
    ).toBe(false);
  });

  it("returns false when the item is generated", () => {
    expect(
      shouldClearConfiguration({
        productId: "product-def",
        generated: true,
        hasInitializedProduct: true,
        prevProductId: "product-abc",
      }),
    ).toBe(false);
  });

  it("returns false when the product has not been initialized yet (initial hydration guard)", () => {
    expect(
      shouldClearConfiguration({
        productId: "product-abc",
        generated: false,
        hasInitializedProduct: false,
        prevProductId: undefined,
      }),
    ).toBe(false);
  });

  it("returns false when prevProductId is undefined (no previous product known)", () => {
    expect(
      shouldClearConfiguration({
        productId: "product-abc",
        generated: false,
        hasInitializedProduct: true,
        prevProductId: undefined,
      }),
    ).toBe(false);
  });

  it("returns false when the product id has not changed (same product, edit mode hydration)", () => {
    expect(
      shouldClearConfiguration({
        productId: "product-abc",
        generated: false,
        hasInitializedProduct: true,
        prevProductId: "product-abc",
      }),
    ).toBe(false);
  });

  it("returns true when all guards pass and the product id has changed", () => {
    expect(
      shouldClearConfiguration({
        productId: "product-def",
        generated: false,
        hasInitializedProduct: true,
        prevProductId: "product-abc",
      }),
    ).toBe(true);
  });

  it("preserves quantity: opening an existing order item editor (edit mode) does NOT clear configuration", () => {
    // Simulate opening an order item that was saved with quantity = 5 and product "product-abc".
    // On mount: prevProductId = "product-abc", hasInitializedProduct = true (product already known).
    // The effect should NOT clear fields (which would reset quantity to 1).
    const productId = "product-abc";
    const prevProductId = "product-abc"; // same – no change
    const hasInitializedProduct =
      computeInitialHasInitializedProduct(productId);

    expect(hasInitializedProduct).toBe(true);
    expect(
      shouldClearConfiguration({
        productId,
        generated: false,
        hasInitializedProduct,
        prevProductId,
      }),
    ).toBe(false);
  });

  it("resets quantity: switching products in create mode clears configuration", () => {
    // Simulate the user first selecting product "product-abc" (create mode), then switching to
    // "product-def". After the first selection is established, hasInitializedProduct becomes true
    // and prevProductId is set to "product-abc".
    const prevProductId = "product-abc";
    const productId = "product-def";

    expect(
      shouldClearConfiguration({
        productId,
        generated: false,
        hasInitializedProduct: true,
        prevProductId,
      }),
    ).toBe(true);
  });
});

describe("shouldSeedCustomerDiscount", () => {
  it("seeds when the item has no discount object yet (new item)", () => {
    expect(
      shouldSeedCustomerDiscount({
        discount: undefined,
        enableCustomDiscount: false,
        customerDiscount: 10,
        hasPersistedConfiguration: false,
      }),
    ).toBe(true);
  });

  it("seeds when discount is null (explicitly cleared)", () => {
    expect(
      shouldSeedCustomerDiscount({
        discount: null,
        enableCustomDiscount: false,
        customerDiscount: 10,
        hasPersistedConfiguration: false,
      }),
    ).toBe(true);
  });

  it("seeds when a new blank item still carries the default 0% placeholder discount", () => {
    expect(
      shouldSeedCustomerDiscount({
        discount: { discountValue: 0 },
        enableCustomDiscount: false,
        customerDiscount: 10,
        hasPersistedConfiguration: false,
      }),
    ).toBe(true);
  });

  it("does NOT seed when discount was explicitly set to 0 (disabled by admin)", () => {
    // This is the critical regression guard: discountValue=0 means the admin
    // intentionally disabled the discount; it must not be overwritten.
    expect(
      shouldSeedCustomerDiscount({
        discount: { discountValue: 0 },
        enableCustomDiscount: false,
        customerDiscount: 10,
        hasPersistedConfiguration: true,
      }),
    ).toBe(false);
  });

  it("does NOT seed when an existing positive discount is already set", () => {
    expect(
      shouldSeedCustomerDiscount({
        discount: { discountValue: 15 },
        enableCustomDiscount: false,
        customerDiscount: 10,
        hasPersistedConfiguration: true,
      }),
    ).toBe(false);
  });

  it("does NOT seed when custom discount mode is active", () => {
    expect(
      shouldSeedCustomerDiscount({
        discount: undefined,
        enableCustomDiscount: true,
        customerDiscount: 10,
        hasPersistedConfiguration: false,
      }),
    ).toBe(false);
  });

  it("does NOT seed when the customer has no discount for this product", () => {
    expect(
      shouldSeedCustomerDiscount({
        discount: undefined,
        enableCustomDiscount: false,
        customerDiscount: 0,
        hasPersistedConfiguration: false,
      }),
    ).toBe(false);
  });

  it("does NOT seed when customerDiscount is negative (sanity guard)", () => {
    expect(
      shouldSeedCustomerDiscount({
        discount: undefined,
        enableCustomDiscount: false,
        customerDiscount: -5,
        hasPersistedConfiguration: false,
      }),
    ).toBe(false);
  });
});

describe("computeInitialEnableCustomDiscount", () => {
  it("returns false when the item has no discount object yet", () => {
    expect(
      computeInitialEnableCustomDiscount({
        discount: undefined,
        customerDiscount: 10,
        hasPersistedConfiguration: false,
      }),
    ).toBe(false);
  });

  it("returns false for the default 0% placeholder on a new blank item", () => {
    expect(
      computeInitialEnableCustomDiscount({
        discount: { discountValue: 0 },
        customerDiscount: 10,
        hasPersistedConfiguration: false,
      }),
    ).toBe(false);
  });

  it("returns true when the item discount is explicitly disabled while the customer has a default discount", () => {
    expect(
      computeInitialEnableCustomDiscount({
        discount: { discountValue: 0 },
        customerDiscount: 10,
        hasPersistedConfiguration: true,
      }),
    ).toBe(true);
  });

  it("returns true when the item discount differs from the customer discount", () => {
    expect(
      computeInitialEnableCustomDiscount({
        discount: { discountValue: 15 },
        customerDiscount: 10,
        hasPersistedConfiguration: true,
      }),
    ).toBe(true);
  });

  it("returns false when the item discount matches the customer discount", () => {
    expect(
      computeInitialEnableCustomDiscount({
        discount: { discountValue: 10 },
        customerDiscount: 10,
        hasPersistedConfiguration: true,
      }),
    ).toBe(false);
  });

  it("returns false when both item and customer discounts are 0", () => {
    expect(
      computeInitialEnableCustomDiscount({
        discount: { discountValue: 0 },
        customerDiscount: 0,
        hasPersistedConfiguration: true,
      }),
    ).toBe(false);
  });
});

describe("resolveNonMatrixVolume", () => {
  it("preserves an existing saved volume when hydrating the same product", () => {
    expect(
      resolveNonMatrixVolume({
        volume: 250,
        quantity: 1,
        minimumOrder: 10,
        productChanged: false,
      }),
    ).toBe(250);
  });

  it("falls back to the saved quantity when legacy non-matrix items carry volume 0", () => {
    expect(
      resolveNonMatrixVolume({
        volume: 0,
        quantity: 250,
        minimumOrder: 10,
        productChanged: false,
      }),
    ).toBe(250);
  });

  it("reseeds from quantity after an actual product change", () => {
    expect(
      resolveNonMatrixVolume({
        volume: 250,
        quantity: 3,
        minimumOrder: 10,
        productChanged: true,
      }),
    ).toBe(3);
  });

  it("falls back to minimumOrder when quantity is not usable", () => {
    expect(
      resolveNonMatrixVolume({
        volume: undefined,
        quantity: 0,
        minimumOrder: 25,
        productChanged: true,
      }),
    ).toBe(25);
  });
});

describe("resolveMatrixVolume", () => {
  it("preserves an existing saved volume when hydrating the same product (edit mode)", () => {
    const getFirstUsableMatrixVolume = () => 100; // would return different volume
    expect(
      resolveMatrixVolume({
        volume: 250,
        productChanged: false,
        getFirstUsableMatrixVolume,
      }),
    ).toBe(250);
  });

  it("does NOT call getFirstUsableMatrixVolume when volume is preserved", () => {
    let called = false;
    const getFirstUsableMatrixVolume = () => {
      called = true;
      return 100;
    };
    resolveMatrixVolume({
      volume: 250,
      productChanged: false,
      getFirstUsableMatrixVolume,
    });
    expect(called).toBe(false);
  });

  it("delegates to getFirstUsableMatrixVolume when product changed", () => {
    const getFirstUsableMatrixVolume = () => 100;
    expect(
      resolveMatrixVolume({
        volume: 250,
        productChanged: true,
        getFirstUsableMatrixVolume,
      }),
    ).toBe(100);
  });

  it("delegates to getFirstUsableMatrixVolume when volume is undefined", () => {
    const getFirstUsableMatrixVolume = () => 50;
    expect(
      resolveMatrixVolume({
        volume: undefined,
        productChanged: false,
        getFirstUsableMatrixVolume,
      }),
    ).toBe(50);
  });

  it("delegates to getFirstUsableMatrixVolume when volume is 0", () => {
    const getFirstUsableMatrixVolume = () => 50;
    expect(
      resolveMatrixVolume({
        volume: 0,
        productChanged: false,
        getFirstUsableMatrixVolume,
      }),
    ).toBe(50);
  });
});

describe("shouldShowUnavailableProductFallback", () => {
  it("returns true when a non-external product id exists but no product could be resolved", () => {
    expect(
      shouldShowUnavailableProductFallback({
        productId: "product-abc",
        resolvedProduct: undefined,
        isLoadingProduct: false,
        isValidatingProduct: false,
      }),
    ).toBe(true);
  });

  it("returns false while the product is still loading", () => {
    expect(
      shouldShowUnavailableProductFallback({
        productId: "product-abc",
        resolvedProduct: undefined,
        isLoadingProduct: true,
        isValidatingProduct: false,
      }),
    ).toBe(false);
  });

  it("returns false for external products", () => {
    expect(
      shouldShowUnavailableProductFallback({
        productId: "fk_123",
        resolvedProduct: undefined,
        isLoadingProduct: false,
        isValidatingProduct: false,
      }),
    ).toBe(false);
  });

  it("returns false when a resolved product is available", () => {
    expect(
      shouldShowUnavailableProductFallback({
        productId: "product-abc",
        resolvedProduct: { id: "product-abc" },
        isLoadingProduct: false,
        isValidatingProduct: false,
      }),
    ).toBe(false);
  });
});

describe("shouldShowIncompatibleConfigurationFallback", () => {
  it("returns true for matrix products when initialization finished without selected attribute options", () => {
    expect(
      shouldShowIncompatibleConfigurationFallback({
        currentProduct: { id: "product-abc" },
        init: false,
        isMatrixProduct: true,
        selectedAttributeOptions: undefined,
      }),
    ).toBe(true);
  });

  it("returns false while initialization is still running", () => {
    expect(
      shouldShowIncompatibleConfigurationFallback({
        currentProduct: { id: "product-abc" },
        init: true,
        isMatrixProduct: true,
        selectedAttributeOptions: undefined,
      }),
    ).toBe(false);
  });

  it("returns false when matrix selections were reconstructed", () => {
    expect(
      shouldShowIncompatibleConfigurationFallback({
        currentProduct: { id: "product-abc" },
        init: false,
        isMatrixProduct: true,
        selectedAttributeOptions: { paper: "matte", volume: 100 },
      }),
    ).toBe(false);
  });

  it("returns false for non-matrix products", () => {
    expect(
      shouldShowIncompatibleConfigurationFallback({
        currentProduct: { id: "product-abc" },
        init: false,
        isMatrixProduct: false,
        selectedAttributeOptions: undefined,
      }),
    ).toBe(false);
  });
});

describe("resolveCombinationInputBaseProduct", () => {
  it("uses the freshly resolved product immediately", () => {
    const nextProduct: ProductStub = { id: "product-next" };

    expect(
      resolveCombinationInputBaseProduct<ProductStub>({
        currentProductId: "product-next",
        isFormattedProduct: false,
        isLoadingProduct: false,
        isValidatingProduct: false,
        latestProduct: { id: "product-prev" },
        latestProductId: "product-prev",
        resolvedProduct: nextProduct,
      }),
    ).toBe(nextProduct);
  });

  it("does not reuse the previous product after the selected product id changes", () => {
    expect(
      resolveCombinationInputBaseProduct<ProductStub>({
        currentProductId: "product-next",
        isFormattedProduct: true,
        isLoadingProduct: true,
        isValidatingProduct: false,
        latestProduct: { id: "product-prev" },
        latestProductId: "product-prev",
        resolvedProduct: undefined,
      }),
    ).toBeUndefined();
  });

  it("keeps the current product mounted during same-product formatted rehydration", () => {
    const latestProduct: ProductStub = { id: "product-current" };

    expect(
      resolveCombinationInputBaseProduct<ProductStub>({
        currentProductId: "product-current",
        isFormattedProduct: true,
        isLoadingProduct: true,
        isValidatingProduct: false,
        latestProduct,
        latestProductId: "product-current",
        resolvedProduct: undefined,
      }),
    ).toBe(latestProduct);
  });

  it("returns undefined when the product selection is cleared", () => {
    expect(
      resolveCombinationInputBaseProduct<ProductStub>({
        currentProductId: undefined,
        isFormattedProduct: false,
        isLoadingProduct: false,
        isValidatingProduct: false,
        latestProduct: { id: "product-current" },
        latestProductId: "product-current",
        resolvedProduct: undefined,
      }),
    ).toBeUndefined();
  });
});

describe("createCombinationInputBaseKey", () => {
  it("changes when the selected product id changes", () => {
    const base = {
      fieldArrayItemId: "field-row",
      orderItemId: "order-item",
    };

    expect(
      createCombinationInputBaseKey({ ...base, productId: "product-a" }),
    ).not.toBe(
      createCombinationInputBaseKey({ ...base, productId: "product-b" }),
    );
  });
});

describe("getOrderItemConfigurationResetValues", () => {
  it("clears stale product-specific configuration fields", () => {
    const reset = new Map(
      getOrderItemConfigurationResetValues().map(({ field, value }) => [
        field,
        value,
      ]),
    );

    expect(reset.get("name")).toBe("");
    expect(reset.get("combination")).toBeNull();
    expect(reset.get("calculatedCombination")).toBeNull();
    expect(reset.get("description")).toBe("");
    expect(reset.get("volume")).toBeUndefined();
    expect(reset.get("quantity")).toBe(1);
    expect(reset.get("customSizes")).toEqual([]);
    expect(reset.get("advancedAttributeSelections")).toBeUndefined();
    expect(reset.get("totalPrice")).toBe(0);
    expect(reset.get("customPrice")).toBe(0);
  });

  it("can preserve external custom price when Fakturownia reseeds it explicitly", () => {
    const fields = getOrderItemConfigurationResetValues({
      preserveCustomPrice: true,
    }).map(({ field }) => field);

    expect(fields).not.toContain("customPrice");
  });
});
