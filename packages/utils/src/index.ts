import { type FormTypes } from "@konfi/types";

export const DONE_TYPING_INTERVAL = 500;

export { getStatusColor } from "./status-color";

export const getIconByFormType = (form: keyof typeof FormTypes) => {
  return form === "CREATE"
    ? "create"
    : form === "DUPLICATE"
      ? "content_copy"
      : form === "CONVERT"
        ? "conversion_path"
        : form === "UPDATE"
          ? "edit_square"
          : undefined;
};

export const TODAY = () => Date.now();

export function openNewTabWithDelay(url: string, delay: number) {
  // delay is in milliseconds
  setTimeout(() => {
    if (typeof window !== "undefined") window.open(url, "_blank")?.focus();
  }, delay);
}

export function suppressMissingOnChangeHandlerWarning() {}

export { allMap } from "./parallel-map";
export { mapWithConcurrency } from "./map-with-concurrency";
export { FAKTUROWNIA_CUSTOM_PAYMENT_TYPE_LABELS } from "./fakturownia";
export { getOrderItemDeliveryTime } from "./getters/get-estimated-delivery";

/* c8 ignore start */
export * from "./advanced-finishing";
export * from "./ai-instructions";
export * from "./agent-memory";
export * from "./anonymous-package-label-address";
export * from "./browser-platform";
export * from "./combinations";
export * from "./cost-conversion";
export * from "./array-intersection";
export * from "./business-taxonomy";
export * from "./calculated-prices";
export * from "./constants";
export * from "./contact-address-utils";
export * from "./currencies";
export * from "./currency-conversion";
export * from "./currency-rate-refresh";
export * from "./designated-pickup-areas";
export * from "./dynamic-pricing";
export * from "./dynamic-pricing-route";
export * from "./fakturownia";
export * from "./fetch-prices";
export * from "./filters";
export * from "./firestore";
export * from "./form";
export * from "./formatters";
export * from "./forms";
export * from "./getters";
export * from "./google-integration";
export * from "./inpost-integration";
export * from "./internal-transit";
export * from "./invoice-recipient";
export * from "./konfi-preview";
export * from "./inventory-ledger";
export * from "./math";
export * from "./notifications";
export * from "./order-change-requests";
export * from "./order-item-status";
export * from "./order-risk";
export * from "./order-imposition-templates";
export * from "./order-printing-methods";
export * from "./order-rule-presets";
export * from "./order-attribute-options";
export * from "./paper-sizes";
export * from "./page-count";
export * from "./price";
export * from "./payment-ledger";
export * from "./payment-integrations";
export * from "./price-lists";
export * from "./product-price-offsets";
export * from "./product-listing-prices";
export * from "./price-types";
export * from "./price-comparison";
export * from "./payment-methods";
export * from "./printing-methods";
export * from "./production-grouping";
export * from "./shipping-methods";
export * from "./order-workflow-statuses";
export * from "./support-taxonomy";
export * from "./units-proofing";
export * from "./product-image-generation";
export * from "./product-cleanup";
export * from "./ratio";
export * from "./reducers";
export * from "./request-origin";
export * from "./meta-integration";
export * from "./resend-integration";
export * from "./routes";
export * from "./safe-local-storage";
export * from "./scheduling";
export * from "./schemas";
export * from "./search";
export * from "./sheet-calculations";
export * from "./rma";
export * from "./stock";
export * from "./stock-attributes";
export * from "./stock-validation";
export * from "./store-credit";
export * from "./tax";
export * from "./validators";
export * from "./serialization";
/* c8 ignore stop */
