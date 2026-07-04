import { FormattedOrderItem } from "@konfi/types";

/**
 * Product with attributes structure for AI matching
 */
export interface ProductWithAttributes {
  productId: string;
  productName: string;
  attributesWithOptions: {
    attributeName: string;
    options: string[];
  }[];
}

/**
 * Input for the product suggestion flow
 */
export interface ProductsSuggestionInput {
  channelId: string;
  question: string;
  productNamesWithAttributes: ProductWithAttributes[];
  tenantId?: string;
}

/**
 * Parsed question with product ID
 */
export interface ParsedProductQuestion {
  question: string;
  productId: string;
  candidateProductIds?: string[];
}

/**
 * Suggested calculated combination result
 */
export interface CalculatedCombinationResult {
  calculatedCombination: string;
}

/**
 * Volume suggestion result
 */
export interface VolumeSuggestionResult {
  volume: number;
}

/**
 * Size suggestion result
 */
export interface SizeSuggestionResult {
  width: number;
  height: number;
}

/**
 * Custom size with quantity
 */
export interface CustomSizeWithQuantityResult {
  width: number;
  height: number;
  quantity: number;
}

/**
 * Multiple sizes detection result
 */
export interface MultipleSizesDetectionResult {
  hasMultipleSizes: boolean;
  sizesCount: number;
}

/**
 * Combined request details inferred from one product-specific customer question.
 */
export interface ProductRequestDetailsResult
  extends VolumeSuggestionResult,
    SizeSuggestionResult,
    MultipleSizesDetectionResult {
  customSizes: CustomSizeWithQuantityResult[];
}

/**
 * Output of the product suggestion flow
 */
export type ProductsSuggestionOutput = FormattedOrderItem[];
