import { roundTotal, roundUnitPrice } from "@konfi/utils";

export interface InvoiceTotalsPosition {
  totalNet?: number | null;
  totalGross?: number | null;
  discountPercent?: number | null;
}

export interface InvoiceTotals {
  net: number;
  gross: number;
}

export interface FakturowniaPriceListPositionLike {
  productId?: string | null;
}

export interface FakturowniaProductSnapshot {
  id?: string;
  name?: string;
  description?: string;
  code?: string;
  currency?: string;
  quantityUnit?: string;
  taxString?: string;
  taxNumber?: number;
  priceNet?: number;
  priceGross?: number;
}

export interface FakturowniaProductSnapshotSource {
  id?: unknown;
  product_id?: unknown;
  productId?: unknown;
  name?: unknown;
  description?: unknown;
  code?: unknown;
  sku?: unknown;
  currency?: unknown;
  quantityUnit?: unknown;
  quantity_unit?: unknown;
  tax?: unknown;
  tax_rate?: unknown;
  priceNet?: unknown;
  price_net?: unknown;
  priceGross?: unknown;
  price_gross?: unknown;
}

export interface FakturowniaClientTaxNoSource {
  additionalData?: Record<string, unknown>;
  buyerId?: number | string | null;
  taxNo?: string | null;
}

export interface FakturowniaClientRecipientSource extends FakturowniaClientTaxNoSource {
  city?: string | null;
  name?: string | null;
  postCode?: string | null;
  street?: string | null;
}

export interface FakturowniaRecipientMatchTarget {
  buyerId?: string | null;
  city?: string | null;
  name?: string | null;
  postCode?: string | null;
  street?: string | null;
}

export interface FakturowniaBuyerMatchTarget {
  city?: string | null;
  name?: string | null;
  postCode?: string | null;
  street?: string | null;
  taxNo?: string | null;
}

export const extractTaxIdDigits = (value?: string | null) =>
  value ? value.replace(/\D/g, "") : "";

export const getFakturowniaClientTaxNo = (
  client: FakturowniaClientTaxNoSource,
) =>
  toOptionalString(client.taxNo) ??
  toOptionalString(client.additionalData?.tax_no);

export const getFakturowniaClientBuyerId = (
  client: FakturowniaClientTaxNoSource,
) =>
  toOptionalString(client.buyerId) ??
  toOptionalString(client.additionalData?.buyer_id) ??
  toOptionalString(client.additionalData?.buyerId);

export const findUniqueFakturowniaClientByRecipient = <
  TClient extends FakturowniaClientRecipientSource,
>(
  clients: readonly TClient[],
  target: FakturowniaRecipientMatchTarget,
) => {
  const normalizedName = normalizeClientName(target.name);
  if (!normalizedName) {
    return undefined;
  }

  const nameMatches: TClient[] = [];
  for (const client of clients) {
    const clientTaxNo = getFakturowniaClientTaxNo(client);
    if (normalizeClientName(client.name) === normalizedName && clientTaxNo) {
      nameMatches.push(client);
    }
  }

  const linkedMatches = nameMatches.filter(
    (client) =>
      target.buyerId && getFakturowniaClientBuyerId(client) === target.buyerId,
  );
  if (linkedMatches.length === 1) {
    return linkedMatches[0];
  }
  if (linkedMatches.length > 1) {
    const linkedAddressMatches = linkedMatches.filter((client) =>
      isFakturowniaRecipientAddressMatch(client, target),
    );
    return linkedAddressMatches.length === 1
      ? linkedAddressMatches[0]
      : undefined;
  }

  const addressMatches = nameMatches.filter((client) =>
    isFakturowniaRecipientAddressMatch(client, target),
  );
  if (addressMatches.length === 1) {
    return addressMatches[0];
  }
  if (addressMatches.length > 1) {
    return undefined;
  }

  return nameMatches.length === 1 ? nameMatches[0] : undefined;
};

export const findUniqueExactFakturowniaBuyerClient = <
  TClient extends FakturowniaClientRecipientSource,
>(
  clients: readonly TClient[],
  target: FakturowniaBuyerMatchTarget,
) => {
  const normalizedName = normalizeClientName(target.name);
  const normalizedTaxNo = extractTaxIdDigits(target.taxNo);
  const normalizedStreet = normalizeAddressText(target.street);
  const normalizedPostCode = normalizePostCode(target.postCode);
  const normalizedCity = normalizeAddressText(target.city);

  if (
    !normalizedName ||
    !normalizedTaxNo ||
    !normalizedStreet ||
    !normalizedPostCode ||
    !normalizedCity
  ) {
    return undefined;
  }

  const matches = clients.filter(
    (client) =>
      normalizeClientName(client.name) === normalizedName &&
      extractTaxIdDigits(getFakturowniaClientTaxNo(client)) ===
        normalizedTaxNo &&
      normalizeAddressText(client.street) === normalizedStreet &&
      normalizePostCode(client.postCode) === normalizedPostCode &&
      normalizeAddressText(client.city) === normalizedCity,
  );

  return matches.length === 1 ? matches[0] : undefined;
};

export const createPriceListPositionMap = <
  TPosition extends FakturowniaPriceListPositionLike,
>(priceList: {
  positions: readonly TPosition[];
}): Record<string, TPosition> => {
  const map: Record<string, TPosition> = {};
  for (const position of priceList.positions) {
    if (position.productId) {
      map[position.productId] = position;
    }
  }
  return map;
};

export const normalizeCurrencyNumber = (value?: number | null) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return undefined;
  }
  return roundUnitPrice(value);
};

export const toTaxString = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === "number" && !Number.isNaN(value)) {
    return value.toString();
  }
  const trimmed = String(value).trim();
  return trimmed === "" ? undefined : trimmed;
};

export const toTaxNumeric = (value: number | string | null | undefined) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const normalized = Number(value.replace(",", "."));
    if (Number.isFinite(normalized)) {
      return normalized;
    }
  }
  return undefined;
};

export const toTaxDisplayValue = (
  value: number | string | null | undefined,
) => {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === "number" && !Number.isNaN(value)) {
    return `${value}%`;
  }
  const trimmed = String(value).trim();
  return trimmed === "" ? undefined : trimmed;
};

const toOptionalString = (value: unknown) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toString();
  }
  return undefined;
};

const normalizeClientName = (value: unknown) =>
  toOptionalString(value)?.replace(/\s+/g, " ").toLowerCase();

const normalizeAddressText = (value: unknown) =>
  toOptionalString(value)
    ?.toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ");

const normalizePostCode = (value: unknown) =>
  toOptionalString(value)
    ?.replace(/[^a-z0-9]/gi, "")
    .toLowerCase();

const isFakturowniaRecipientAddressMatch = (
  client: FakturowniaClientRecipientSource,
  target: FakturowniaRecipientMatchTarget,
) => {
  const targetStreet = normalizeAddressText(target.street);
  const targetPostCode = normalizePostCode(target.postCode);
  const targetCity = normalizeAddressText(target.city);

  let checkedFields = 0;

  if (targetStreet) {
    checkedFields += 1;
    if (normalizeAddressText(client.street) !== targetStreet) {
      return false;
    }
  }
  if (targetPostCode) {
    checkedFields += 1;
    if (normalizePostCode(client.postCode) !== targetPostCode) {
      return false;
    }
  }
  if (targetCity) {
    checkedFields += 1;
    if (normalizeAddressText(client.city) !== targetCity) {
      return false;
    }
  }

  return checkedFields > 0;
};

const normalizeCurrencyUnknown = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return normalizeCurrencyNumber(value);
  }
  if (typeof value === "string") {
    const normalized = Number(value.replace(/\s+/g, "").replace(",", "."));
    if (Number.isFinite(normalized)) {
      return normalizeCurrencyNumber(normalized);
    }
  }
  return undefined;
};

export const buildProductSnapshot = (
  product: FakturowniaProductSnapshotSource,
): FakturowniaProductSnapshot => {
  const id = toOptionalString(
    product.id ?? product.product_id ?? product.productId,
  );
  const name = toOptionalString(product.name);
  const description = toOptionalString(product.description);
  const code = toOptionalString(product.code ?? product.sku);
  const currency = toOptionalString(product.currency);
  const quantityUnit = toOptionalString(
    product.quantityUnit ?? product.quantity_unit,
  );
  const taxSource = product.tax ?? product.tax_rate;
  const taxString = toTaxString(
    taxSource as number | string | null | undefined,
  );
  const taxNumber = toTaxNumeric(
    taxSource as number | string | null | undefined,
  );

  const priceNet = normalizeCurrencyUnknown(
    product.priceNet ?? product.price_net,
  );
  const priceGross = normalizeCurrencyUnknown(
    product.priceGross ?? product.price_gross,
  );

  return {
    id,
    name,
    description,
    code,
    currency,
    quantityUnit,
    taxString,
    taxNumber,
    priceNet,
    priceGross,
  };
};

export const hasDiscountedPosition = (
  positions?: readonly InvoiceTotalsPosition[] | null,
) => {
  if (!Array.isArray(positions)) {
    return false;
  }
  return positions.some((position) => {
    const discountPercent = Number(position.discountPercent) || 0;
    return discountPercent > 0;
  });
};

export const calculateUndiscountedTotals = (
  positions?: readonly InvoiceTotalsPosition[] | null,
): InvoiceTotals => {
  if (!Array.isArray(positions)) {
    return { net: 0, gross: 0 };
  }
  return positions.reduce(
    (acc, position) => {
      const totalNet = Number(position.totalNet) || 0;
      const totalGross = Number(position.totalGross) || 0;
      return {
        net: acc.net + totalNet,
        gross: acc.gross + totalGross,
      };
    },
    { net: 0, gross: 0 },
  );
};

export const calculateDiscountedTotals = (
  positions?: readonly InvoiceTotalsPosition[] | null,
): InvoiceTotals => {
  if (!Array.isArray(positions)) {
    return { net: 0, gross: 0 };
  }
  return positions.reduce(
    (acc, position) => {
      const totalNet = Number(position.totalNet) || 0;
      const totalGross = Number(position.totalGross) || 0;
      const discountPercent = Number(position.discountPercent) || 0;
      const discountMultiplier = 1 - discountPercent / 100;
      const discountedNet = roundTotal(totalNet * discountMultiplier);
      const discountedGross = roundTotal(totalGross * discountMultiplier);
      return {
        net: acc.net + discountedNet,
        gross: acc.gross + discountedGross,
      };
    },
    { net: 0, gross: 0 },
  );
};

export const calculateTotalDiscountAmount = (
  undiscountedGross: number,
  discountedGross: number,
) => roundTotal(undiscountedGross - discountedGross);
