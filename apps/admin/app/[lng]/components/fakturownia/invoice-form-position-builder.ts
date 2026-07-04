import {
  calculateQuantityForMultipleSizes,
  formatTotal,
  minorToMajorSafe,
  multiplyCurrency,
  roundTotal,
  roundUnitPrice,
  toFiscalQuantity,
} from "@konfi/utils";
import { DiscountTypeEnum, Unit, UnitReadable } from "@konfi/types";
import type { OrderItem } from "@konfi/types";
import { normalizeDisplayTotal } from "./cash-calculations";
import type {
  InvoiceFormValues,
  InvoicePositionFormValue,
  PositionPriceAdjustment,
} from "./invoice-form-types";
import { RECIPIENT_ROLE_OPTIONS } from "./invoice-form-types";
import { FAKTUROWNIA_OTHER_ROLE } from "@/lib/fakturownia/invoice-payload";

export const resolveRecipientRole = (
  values: Pick<InvoiceFormValues, "recipientRole" | "recipientRoleDescription">,
) => {
  if (values.recipientRole === "other") {
    // Fakturownia only accepts roles from its whitelist; custom text goes to
    // role_description alongside the "Rola inna" role.
    const trimmedDescription = values.recipientRoleDescription?.trim();
    return trimmedDescription ? FAKTUROWNIA_OTHER_ROLE : undefined;
  }

  const selectedRole = RECIPIENT_ROLE_OPTIONS.find(
    (option) => option.value === values.recipientRole,
  );

  return selectedRole?.apiValue;
};

export const resolveRecipientRoleDescription = (
  values: Pick<InvoiceFormValues, "recipientRole" | "recipientRoleDescription">,
) => {
  if (values.recipientRole !== "other") {
    return undefined;
  }
  const trimmedDescription = values.recipientRoleDescription?.trim();
  return trimmedDescription || undefined;
};

export const fetchDataFromGovernmentNipApi = async (nip: string) => {
  try {
    const date = new Date(Date.now());
    const cleanedNip = nip.replace(/[ -]/g, "");
    const res = await fetch(
      `https://wl-api.mf.gov.pl/api/search/nip/${cleanedNip}?date=${date.toISOString().slice(0, 10)}`,
      {
        cache: "no-cache",
      },
    );
    const body = await res.json();
    if (body.code || body.result?.subject === null) {
      return null;
    }
    const subject = body.result?.subject;
    if (!subject) {
      return null;
    }

    // Parse address
    let address = subject.workingAddress;
    if (!address) {
      address = subject.residenceAddress;
    }
    if (!address) {
      return null;
    }

    let street = "";
    let postalCode = "";
    let city = "";

    const [streetPart, zipAndCity] = address.split(", ");
    if (streetPart) {
      street = streetPart.trim();
    }
    if (zipAndCity) {
      const firstSpaceIndex = zipAndCity.indexOf(" ");
      if (firstSpaceIndex === -1) {
        postalCode = zipAndCity;
        city = "";
      } else {
        postalCode = zipAndCity.slice(0, firstSpaceIndex);
        city = zipAndCity.slice(firstSpaceIndex + 1);
      }
    }

    return {
      name: subject.name || "",
      taxNo: subject.nip || "",
      street: street.trim(),
      postCode: postalCode || "",
      city: city || "",
      country: "PL",
    };
  } catch (error) {
    console.error("Error fetching from government NIP API:", error);
    return null;
  }
};

export const formatStreetLine = (
  street?: string | null,
  houseNumber?: string | null,
  flatNumber?: string | null,
) => {
  const streetPart = street?.trim() ?? "";
  const numberPart = houseNumber?.trim() ?? "";
  const flatPart = flatNumber?.trim() ?? "";
  const streetWithNumber = numberPart
    ? `${streetPart} ${numberPart}`.trim()
    : streetPart;
  if (!flatPart) {
    return streetWithNumber;
  }
  return `${streetWithNumber}/${flatPart}`.trim();
};

export const convertMinorToMajor = minorToMajorSafe;

export const formatCurrencyValue = formatTotal;

export const roundCurrency = roundTotal;

export const areCurrencyEqual = (current: number | undefined, next: number) => {
  if (typeof current !== "number" || Number.isNaN(current)) {
    return Math.abs(next) < 0.0005;
  }
  return Math.abs(current - next) < 0.0005;
};

export const formatDisplayTotal = (value: number) =>
  formatTotal(normalizeDisplayTotal(value));

const formatUnitLabelForName = (
  unit: string,
  t: (key: string, options?: { defaultValue?: string }) => string,
) => {
  const trimmed = unit.trim();
  const readable =
    UnitReadable[trimmed as keyof typeof UnitReadable] || trimmed;
  return t(`Unit.${trimmed}`, { defaultValue: readable || trimmed });
};

const formatQuantityForName = (quantity: number) => {
  if (!Number.isFinite(quantity)) {
    return "";
  }
  // Keep up to 3 decimals (consistent with fiscal quantity truncation), avoid trailing zeros.
  const rounded = Math.round(quantity * 1000) / 1000;
  return String(rounded);
};

const calculateFakturowniaFinalGrossFromUnit = (params: {
  unitGross: number;
  quantity: number;
  discountPercent: number;
}) => {
  const safeUnit = Number.isFinite(params.unitGross) ? params.unitGross : 0;
  const safeQty = Number.isFinite(params.quantity) ? params.quantity : 0;
  const discountPercent = Number.isFinite(params.discountPercent)
    ? params.discountPercent
    : 0;

  // Use multiplyCurrency to avoid floating-point precision issues that can cause
  // 1 grosz/cent differences (e.g., 0.70 * 16.95 = 11.864999... instead of 11.865)
  const undiscounted = multiplyCurrency(safeUnit, safeQty);
  if (discountPercent <= 0) {
    return undiscounted;
  }
  const multiplier = 1 - Math.min(Math.max(discountPercent, 0), 100) / 100;
  return roundCurrency(undiscounted * multiplier);
};

export const buildPositionFromOrderItem = (
  item: OrderItem,
  t: (key: string, options?: { defaultValue?: string }) => string,
): {
  position: InvoicePositionFormValue;
  adjustment?: Omit<PositionPriceAdjustment, "positionIndex">;
} => {
  const rawQuantity = item.quantity || 1;
  const rawVolume =
    item.volume && typeof item.volume === "number" ? item.volume : 0;

  // Calculate m² from customSizes if available
  const hasCustomSizes =
    item.customSizes &&
    Array.isArray(item.customSizes) &&
    item.customSizes.length > 0;
  const customSizesM2 = hasCustomSizes
    ? calculateQuantityForMultipleSizes(
        item.customSizes!,
        item.product &&
          typeof item.product !== "string" &&
          item.product.designSpec?.includeBleed
          ? item.product.designSpec.bleed
          : undefined,
      )
    : 0;

  // Use customSizes m² if available, otherwise use volume or quantity
  const useCustomSizesM2 = hasCustomSizes && customSizesM2 > 0;
  const useVolumeAsQuantity =
    !useCustomSizesM2 && rawQuantity === 1 && rawVolume > 1;
  const rawInvoiceQuantity = useCustomSizesM2
    ? customSizesM2
    : useVolumeAsQuantity
      ? rawVolume
      : rawQuantity;

  const quantity = toFiscalQuantity(rawInvoiceQuantity);

  const totalGross = convertMinorToMajor(item.totalPrice);
  const defaultTax = 23;

  // Calculate discount percentage first
  const discountPercent = (() => {
    if (!item.discount) {
      return 0;
    }
    if (item.discount.type !== DiscountTypeEnum.PERCENTAGE) {
      return 0;
    }
    const discountValue = item.discount.discountValue;
    if (typeof discountValue !== "number" || !Number.isFinite(discountValue)) {
      return 0;
    }
    if (discountValue <= 0) {
      return 0;
    }
    if (discountValue >= 100) {
      return 100;
    }
    return roundTotal(discountValue);
  })();

  /**
   * Order item totals are already fiscally sanitized during order creation (enforceFiscalTotalPrecision).
   * To avoid double-sanitization, we skip toFiscalUnitPrice here and derive unit prices by dividing
   * the sanitized totals and rounding with roundUnitPrice (gross-first flow matching Fakturownia settings).
   */
  // Calculate unit prices
  // IMPORTANT: Order item totalPrice is already fiscally sanitized (enforced during order creation
  // via enforceFiscalTotalPrecision). We only need to derive unit prices using Fakturownia's rounding
  // without additional fiscal truncation to avoid double-sanitization that could alter final amounts.
  // toFiscalUnitPrice truncates while roundUnitPrice rounds - applying both causes price drift.
  let priceGross: number;
  if (discountPercent > 0) {
    // Reverse-calculate: discountedPrice / (1 - discount%) = originalPrice
    // If there's a discount, item.totalPrice is already discounted, so we need to reverse-calculate
    // the original undiscounted price for Fakturownia API (which will apply the discount again)
    const safeQuantity = quantity > 0 ? quantity : 1;
    const discountedUnitPrice = totalGross / safeQuantity;
    const originalUnitPrice = discountedUnitPrice / (1 - discountPercent / 100);
    // Round to Fakturownia precision (skip toFiscalUnitPrice truncation to avoid double-sanitization)
    priceGross = roundUnitPrice(originalUnitPrice);
  } else {
    const safeQuantity = quantity > 0 ? quantity : 1;
    const baseUnitPrice = totalGross / safeQuantity;
    // Round to Fakturownia precision (skip toFiscalUnitPrice truncation to avoid double-sanitization)
    priceGross = roundUnitPrice(baseUnitPrice);
  }
  const priceNet =
    defaultTax > 0
      ? roundUnitPrice(priceGross / (1 + defaultTax / 100))
      : priceGross;

  // For display in the form, use the actual totals from the order to ensure accuracy
  const displayTotalGross = totalGross;
  const displayTotalNet =
    defaultTax > 0
      ? roundTotal(totalGross / (1 + defaultTax / 100))
      : totalGross;

  // Fakturownia applies discounts itself, so totals sent to the API must use the undiscounted values
  // Use multiplyCurrency to avoid floating-point precision issues that can cause 1 grosz/cent differences
  const undiscountedTotalGross = multiplyCurrency(priceGross, quantity);
  const undiscountedTotalNet = multiplyCurrency(priceNet, quantity);
  const fakturowniaTotalGross =
    discountPercent > 0 ? undiscountedTotalGross : displayTotalGross;
  const fakturowniaTotalNet =
    discountPercent > 0 ? undiscountedTotalNet : displayTotalNet;

  // Build name from product or description
  const baseName =
    (typeof item.product !== "string" && item.product?.name
      ? item.name
        ? item.name
        : item.product.name
      : undefined) ||
    item.name ||
    item.description ||
    t("fakturownia.invoiceCreate.unknownProduct", {
      defaultValue: "Unknown product",
    });

  // Build description with dimensions
  let description = item.description;
  if (
    item.customSizes &&
    Array.isArray(item.customSizes) &&
    item.customSizes.length > 0
  ) {
    // Use custom sizes when available
    const customSizeUnitLabel = formatUnitLabelForName(Unit.PCS, t);
    const sizesText = item.customSizes
      .map(
        (size) =>
          `${size.width}x${size.height} mm × ${size.quantity} ${customSizeUnitLabel}`,
      )
      .join(", ");
    description = description ? `${description}\n${sizesText}` : sizesText;
  } else if (item.width && item.height) {
    // Use item width/height when no custom sizes
    const dimensionText = `${item.width}x${item.height} mm`;
    description = description
      ? `${description}\n${dimensionText}`
      : dimensionText;
  }

  const originalUnit = useCustomSizesM2 ? Unit.M2 : item.unit || Unit.PCS;
  const originalUnitLabel = formatUnitLabelForName(originalUnit, t);
  const quantityText = formatQuantityForName(quantity);

  // Detect mismatch between what Fakturownia would compute from unit/qty/discount vs the order total.
  // Even if we pass explicit totals, Fakturownia may recalculate totals from unit prices.
  const calculatedFinalGross = calculateFakturowniaFinalGrossFromUnit({
    unitGross: priceGross,
    quantity,
    discountPercent,
  });
  const expectedFinalGross = displayTotalGross;
  const hasMismatch = !areCurrencyEqual(
    expectedFinalGross,
    calculatedFinalGross,
  );

  if (hasMismatch) {
    const nameWithQty =
      quantityText && quantityText !== "1"
        ? `${baseName} (${quantityText} ${originalUnitLabel})`
        : baseName;

    if (discountPercent > 0) {
      // For discount mismatches: avoid relying on Fakturownia discount rounding.
      // Embed discount in the name, clear discountPercent and force exact totals with qty=1.
      const nameWithQtyAndDiscount = `${nameWithQty} (-${discountPercent}%)`;
      return {
        position: {
          name: nameWithQtyAndDiscount,
          description,
          quantity: 1,
          unit: Unit.PCS,
          priceNet: displayTotalNet,
          priceGross: displayTotalGross,
          tax: defaultTax.toString(),
          totalNet: displayTotalNet,
          totalGross: displayTotalGross,
          discountPercent: 0,
          sourceTotalGross: displayTotalGross,
          sourceQuantity: quantity,
          sourceUnit: originalUnit,
          sourceDiscountPercent: discountPercent,
        },
        adjustment: {
          name: baseName,
          originalQuantity: quantity,
          originalUnit,
          originalDiscountPercent: discountPercent,
          expectedTotalGross: expectedFinalGross,
          calculatedTotalGross: calculatedFinalGross,
          strategy: "QUANTITY_AND_DISCOUNT_TO_NAME",
        },
      };
    }

    // For non-discount mismatches: embed quantity in the name and force exact totals with qty=1.
    return {
      position: {
        name: nameWithQty,
        description,
        quantity: 1,
        unit: Unit.PCS,
        priceNet: displayTotalNet,
        priceGross: displayTotalGross,
        tax: defaultTax.toString(),
        totalNet: displayTotalNet,
        totalGross: displayTotalGross,
        discountPercent: 0,
        sourceTotalGross: displayTotalGross,
        sourceQuantity: quantity,
        sourceUnit: originalUnit,
        sourceDiscountPercent: 0,
      },
      adjustment: {
        name: baseName,
        originalQuantity: quantity,
        originalUnit,
        originalDiscountPercent: 0,
        expectedTotalGross: expectedFinalGross,
        calculatedTotalGross: calculatedFinalGross,
        strategy: "QUANTITY_TO_NAME",
      },
    };
  }

  return {
    position: {
      name: baseName,
      description,
      quantity,
      unit: originalUnit,
      priceNet,
      priceGross,
      tax: defaultTax.toString(),
      totalNet: fakturowniaTotalNet,
      totalGross: fakturowniaTotalGross,
      discountPercent,
      sourceTotalGross: displayTotalGross,
      sourceQuantity: quantity,
      sourceUnit: originalUnit,
      sourceDiscountPercent: discountPercent,
    },
  };
};
