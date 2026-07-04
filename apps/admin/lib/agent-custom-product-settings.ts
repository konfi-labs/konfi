import { PriceTypeEnum, Product } from "@konfi/types";

export const AGENT_CUSTOM_PRODUCT_SETTINGS_DOC_ID = "agentCustomProduct";

export interface AgentCustomProductSettings {
  defaultProductChannelId?: string;
  defaultProductId?: string;
  defaultProductName?: string;
}

export type AgentCustomProductProduct = Pick<
  Product,
  | "allowCustomPrice"
  | "defaultPrice"
  | "disablePriceFetch"
  | "id"
  | "name"
  | "prefferedUnit"
  | "priceType"
  | "provider"
  | "spec"
>;

export function canUseProductForAgentCustomProduct(
  product?: Pick<Product, "allowCustomPrice" | "priceType"> | null,
): boolean {
  return Boolean(
    product?.allowCustomPrice && product.priceType === PriceTypeEnum.SINGLE,
  );
}
