/**
 * Determines whether a product change should trigger quantity/configuration resets.
 *
 * Returns true only when:
 * - The product actually changed (prevProductId !== productId)
 * - The product was already initialized when the component mounted (prevents
 *   resets during the initial hydration of an existing order item in edit mode)
 * - The item was not auto-generated
 */
export function computeProductChanged({
  prevProductId,
  productId,
  hasInitializedProduct,
  generated,
}: {
  prevProductId: string | undefined;
  productId: string | undefined;
  hasInitializedProduct: boolean;
  generated: boolean;
}): boolean {
  if (!hasInitializedProduct || generated) return false;
  return prevProductId !== productId;
}

/**
 * Returns the initial value for `hasInitializedProduct`.
 *
 * When a `productId` is already known at mount time (edit mode) the component
 * is considered initialized immediately, so the clear-configuration / reset
 * logic is skipped on the very first effect run.
 *
 * When no `productId` exists yet (create mode) initialization is deferred
 * until the user selects a product for the first time.
 */
export function computeInitialHasInitializedProduct(
  productId: string | undefined,
): boolean {
  return Boolean(productId);
}

/**
 * Determines whether the inline editor should fall back to a read-only view
 * because the referenced product can no longer be resolved.
 */
export function shouldShowUnavailableProductFallback({
  productId,
  resolvedProduct,
  isLoadingProduct,
  isValidatingProduct,
}: {
  productId: string | undefined;
  resolvedProduct: unknown;
  isLoadingProduct: boolean;
  isValidatingProduct: boolean;
}): boolean {
  if (!productId || productId.startsWith("fk_")) {
    return false;
  }

  if (isLoadingProduct || isValidatingProduct) {
    return false;
  }

  return !resolvedProduct;
}

/**
 * Determines whether the saved configuration can no longer be reconstructed
 * for a matrix product after initialization finished.
 */
export function shouldShowIncompatibleConfigurationFallback({
  currentProduct,
  init,
  isMatrixProduct,
  selectedAttributeOptions,
}: {
  currentProduct: unknown;
  init: boolean;
  isMatrixProduct: boolean;
  selectedAttributeOptions:
  | { [key: string]: string | number; }
  | undefined
  | null;
}): boolean {
  if (!currentProduct || init || !isMatrixProduct) {
    return false;
  }

  return selectedAttributeOptions === undefined;
}

/**
 * Determines whether the "clear configuration on product change" effect
 * should actually clear the form fields.
 *
 * The effect must only clear when:
 * - `productId` is defined (there is a product selected)
 * - The item was not auto-generated
 * - The product has already been initialized (we are not in the first-render
 *   hydration pass of an existing order item)
 * - We know what the previous productId was
 * - The product id actually changed
 */
export function shouldClearConfiguration({
  productId,
  generated,
  hasInitializedProduct,
  prevProductId,
}: {
  productId: string | undefined;
  generated: boolean;
  hasInitializedProduct: boolean;
  prevProductId: string | undefined;
}): boolean {
  if (
    productId === undefined ||
    generated ||
    !hasInitializedProduct ||
    prevProductId === undefined
  ) {
    return false;
  }
  return prevProductId !== productId;
}

/**
 * Determines whether the customer discount should be seeded onto a new order item.
 *
 * The customer discount is seeded only when ALL of the following hold:
 * - `discount` is null/undefined — the item genuinely has no discount configured
 *   yet. An item with `discountValue === 0` has an *explicitly disabled* discount
 *   and must NOT be overwritten.
 * - Custom discount mode is not active (`enableCustomDiscount === false`).
 * - The customer actually has a positive discount for this product (`customerDiscount > 0`).
 *
 * This prevents the customer's global discount from being silently re-applied
 * when editing an order item where the admin previously disabled or customised
 * the discount.
 */
export function shouldSeedCustomerDiscount({
  discount,
  enableCustomDiscount,
  customerDiscount,
  hasPersistedConfiguration,
}: {
  discount: { discountValue: number; } | null | undefined;
  enableCustomDiscount: boolean;
  customerDiscount: number;
  hasPersistedConfiguration: boolean;
}): boolean {
  const shouldInheritCustomerDiscount =
    discount == null ||
    (!hasPersistedConfiguration && discount.discountValue === 0);

  return (
    shouldInheritCustomerDiscount &&
    !enableCustomDiscount &&
    customerDiscount > 0
  );
}

/**
 * Resolves the product that should drive the heavy combination editor.
 *
 * The editor may temporarily keep the last hydrated product while the same
 * product is being re-fetched, but it must never reuse that product after the
 * selected product id changes or is cleared. Reusing the old product is what
 * makes attributes, descriptions, prices and volumes bleed into the next item.
 */
export function resolveCombinationInputBaseProduct<TProduct extends { id?: string; }>({
  currentProductId,
  isFormattedProduct,
  isLoadingProduct,
  isValidatingProduct,
  latestProduct,
  latestProductId,
  resolvedProduct,
}: {
  currentProductId: string | undefined;
  isFormattedProduct: boolean;
  isLoadingProduct: boolean;
  isValidatingProduct: boolean;
  latestProduct: TProduct | undefined;
  latestProductId: string | undefined;
  resolvedProduct: TProduct | undefined;
}): TProduct | undefined {
  if (resolvedProduct) {
    return resolvedProduct;
  }

  if (!currentProductId || latestProductId !== currentProductId) {
    return undefined;
  }

  if (isFormattedProduct || isLoadingProduct || isValidatingProduct) {
    return latestProduct;
  }

  return undefined;
}

export function createCombinationInputBaseKey({
  fieldArrayItemId,
  orderItemId,
  productId,
}: {
  fieldArrayItemId: string | undefined;
  orderItemId: string | undefined;
  productId: string | undefined;
}): string {
  return [
    fieldArrayItemId?.trim() || "field",
    orderItemId?.trim() || "item",
    productId?.trim() || "no-product",
  ].join(":");
}

export type OrderItemConfigurationResetValue = {
  field: string;
  value: unknown;
};

/**
 * Fields that belong to a specific selected product/configuration.
 *
 * These must be cleared before a new product is written to the form. The heavy
 * combination editor is keyed by product id, so it mounts fresh for the new
 * product and cannot rely on its own previous-product state to clear stale form
 * values. Keeping this list in one place prevents old descriptions, volumes or
 * selected options from being interpreted as the new product's initial config.
 */
export function getOrderItemConfigurationResetValues({
  preserveCustomPrice = false,
}: {
  preserveCustomPrice?: boolean;
} = {}): OrderItemConfigurationResetValue[] {
  const values: OrderItemConfigurationResetValue[] = [
    { field: "name", value: "" },
    { field: "combination", value: null },
    { field: "calculatedCombination", value: null },
    { field: "description", value: "" },
    { field: "volume", value: undefined },
    { field: "customFormat", value: false },
    { field: "totalPrice", value: 0 },
    { field: "width", value: 0 },
    { field: "height", value: 0 },
    { field: "quantity", value: 1 },
    { field: "customSizes", value: [] },
    { field: "advancedAttributeSelections", value: undefined },
    { field: "pageCount", value: undefined },
    { field: "expressPercent", value: undefined },
    { field: "preview", value: undefined },
  ];

  if (!preserveCustomPrice) {
    values.push({ field: "customPrice", value: 0 });
  }

  return values;
}

/**
 * Determines whether an order item should start in custom discount mode.
 *
 * Treat an existing discount object as an override whenever its value differs
 * from the customer's default discount for the current product. This keeps an
 * explicitly disabled `0%` item discount from being interpreted as
 * "use customer discount".
 */
export function computeInitialEnableCustomDiscount({
  discount,
  customerDiscount,
  hasPersistedConfiguration,
}: {
  discount: { discountValue: number; } | null | undefined;
  customerDiscount: number;
  hasPersistedConfiguration: boolean;
}): boolean {
  if (discount == null) {
    return false;
  }

  if (!hasPersistedConfiguration && discount.discountValue === 0) {
    return false;
  }

  return discount.discountValue !== customerDiscount;
}

/**
 * Resolves the MATRIX volume value for edit-mode hydration paths.
 *
 * When hydrating an existing item for the same product, preserve the saved
 * volume so the UI does not jump to a different volume tier. This helper is
 * shared by the initial form hydration and the derived dialog configuration so
 * both paths honor the same edit-mode preservation rule. Only pick a new
 * volume via `getFirstUsableMatrixVolume` when the product actually changed or
 * the saved volume is missing/invalid.
 */
export function resolveMatrixVolume({
  volume,
  productChanged,
  getFirstUsableMatrixVolume,
}: {
  volume: number | undefined;
  productChanged: boolean;
  getFirstUsableMatrixVolume: () => number;
}): number {
  const hasPersistedVolume = typeof volume === "number" && volume > 0;

  if (!productChanged && hasPersistedVolume) {
    return volume;
  }

  return getFirstUsableMatrixVolume();
}

/**
 * Resolves the non-MATRIX volume value during initialization.
 *
 * When hydrating an existing item for the same product, preserve the saved
 * volume so pricing does not jump to the minimum/default tier. Only reseed the
 * value from quantity/minimum order after an actual product change.
 */
export function resolveNonMatrixVolume({
  volume,
  quantity,
  minimumOrder,
  productChanged,
}: {
  volume: number | undefined;
  quantity: number;
  minimumOrder: number | undefined;
  productChanged: boolean;
}): number {
  const hasPersistedVolume = volume != null && volume > 0;

  if (!productChanged && hasPersistedVolume) {
    return volume;
  }

  if (quantity > 0) {
    return quantity;
  }

  return minimumOrder || 1;
}
