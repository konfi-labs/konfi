import type { SWRConfiguration } from "swr";
import { LEGACY_PAYMENT_OPTIONS_FOR_SHIPPING_OPTIONS } from "./payment-methods";

export const paymentOptionsForShippingOptions =
  LEGACY_PAYMENT_OPTIONS_FOR_SHIPPING_OPTIONS;

export const DEFAULT_COMBINATION = "default";

export const swrConfig: SWRConfiguration = {
  revalidateOnFocus: false,
};

export const SCROLL_MASK_CSS = {
  "--scroll-shadow-size": "4rem",
  maskImage:
    "linear-gradient(#000,#000,transparent 0,#000 var(--scroll-shadow-size),#000 calc(100% - var(--scroll-shadow-size)),transparent)",
  "&[data-at-top]": {
    maskImage:
      "linear-gradient(180deg,#000 calc(100% - var(--scroll-shadow-size)),transparent)",
  },
  "&[data-at-bottom]": {
    maskImage:
      "linear-gradient(0deg,#000 calc(100% - var(--scroll-shadow-size)),transparent)",
  },
};

// Alpha suffix used for dark translucent backgrounds (e.g. 900/33)
export const DARK_ALPHA = "/33" as const;
