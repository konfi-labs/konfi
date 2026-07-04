"use server";

import "server-only";

import { requireTenantAdminChannelAccess } from "@/actions/auth-utils";
import { productsSuggestionFlow } from "@/lib/ai/product-suggestion";
import type {
  ProductWithAttributes,
  ProductsSuggestionInput,
} from "@/lib/ai/product-suggestion";
import type { FormattedOrderItem } from "@konfi/types";

export type GenerateOrderItemsFromClientInformationActionResult =
  | { ok: true; items: FormattedOrderItem[] }
  | { ok: false; error: string };

function normalizeProductSuggestionInputs(
  products: readonly ProductWithAttributes[],
): ProductWithAttributes[] {
  return products
    .map((product) => ({
      productId: product.productId.trim(),
      productName: product.productName.trim(),
      attributesWithOptions: product.attributesWithOptions.map((attribute) => ({
        attributeName: attribute.attributeName.trim(),
        options: attribute.options
          .map((option) => option.trim())
          .filter((option) => option.length > 0),
      })),
    }))
    .filter(
      (product) =>
        product.productId.length > 0 && product.productName.length > 0,
    );
}

export async function generateOrderItemsFromClientInformationAction(
  input: ProductsSuggestionInput,
): Promise<GenerateOrderItemsFromClientInformationActionResult> {
  const channelId = await requireTenantAdminChannelAccess(input.channelId);
  const question = input.question.trim();

  if (!question) {
    return {
      ok: false,
      error: "Customer information is required.",
    };
  }

  try {
    const items = await productsSuggestionFlow({
      channelId,
      question,
      productNamesWithAttributes: normalizeProductSuggestionInputs(
        input.productNamesWithAttributes,
      ),
    });

    return { ok: true, items };
  } catch (error) {
    console.error(
      "[generateOrderItemsFromClientInformationAction] Failed",
      error,
    );
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to generate order items.",
    };
  }
}
