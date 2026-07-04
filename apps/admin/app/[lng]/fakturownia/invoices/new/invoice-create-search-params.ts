import type { InvoiceKind } from "@konfi/fakturownia/out/client/models";

type SearchParamsReader = {
  get(name: string): string | null;
  getAll(name: string): string[];
};

export type InvoiceCreateSearchParams = {
  channelId?: string;
  kind?: InvoiceKind;
  orderId?: string;
  orderIds?: string[];
};

function normalizedOptionalValue(value: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function parseInvoiceOrderIds(
  values: readonly string[],
): string[] | undefined {
  const normalized = values
    .flatMap((item) => item.split(","))
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return normalized.length > 0 ? normalized : undefined;
}

export function parseInvoiceKind(
  value: string | null,
): InvoiceKind | undefined {
  return value === "vat" ||
    value === "proforma" ||
    value === "receipt" ||
    value === "estimate"
    ? value
    : undefined;
}

export function readInvoiceCreateSearchParams(
  searchParams: SearchParamsReader,
): InvoiceCreateSearchParams {
  return {
    channelId: normalizedOptionalValue(searchParams.get("channelId")),
    kind: parseInvoiceKind(searchParams.get("kind")),
    orderId: normalizedOptionalValue(searchParams.get("orderId")),
    orderIds: parseInvoiceOrderIds(searchParams.getAll("orderIds")),
  };
}
