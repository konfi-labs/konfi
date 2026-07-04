/**
 * Product Suggestion AI Module
 *
 * This module provides AI-powered product suggestion functionality
 * ported from the Firebase Cloud Functions implementation.
 *
 * Usage:
 * ```typescript
 * import { productsSuggestionFlow } from "@/lib/ai/product-suggestion";
 *
 * const results = await productsSuggestionFlow({
 *   channelId: "channel-id",
 *   question: "I need 500 business cards",
 *   productNamesWithAttributes: [...],
 * });
 * ```
 */

export { productsSuggestionFlow } from "@/lib/ai/product-suggestion/flow";
export type {
  ProductWithAttributes,
  ProductsSuggestionInput,
  ProductsSuggestionOutput,
  ParsedProductQuestion,
  CalculatedCombinationResult,
  VolumeSuggestionResult,
  SizeSuggestionResult,
  CustomSizeWithQuantityResult,
  MultipleSizesDetectionResult,
  ProductRequestDetailsResult,
} from "@/lib/ai/product-suggestion/types";

// Re-export individual AI functions for direct use if needed
export {
  splitQuestionByProducts,
  suggestCalculatedCombination,
  suggestVolume,
  suggestSize,
  suggestCustomSizes,
  detectMultipleSizes,
  suggestProductRequestDetails,
} from "@/lib/ai/product-suggestion/ai-functions";
