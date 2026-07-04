import { ProductImageGenerationConfig } from "@konfi/types";

type ProductImageGenerationConfigResponse = {
  config?: ProductImageGenerationConfig | null;
};

export async function fetchProductImageGenerationConfig(
  channelId: string,
  productId: string,
): Promise<ProductImageGenerationConfig | undefined> {
  try {
    const searchParams = new URLSearchParams({
      channelId,
      productId,
    });
    const response = await fetch(
      `/api/products/image-generation-config?${searchParams.toString()}`,
      {
        headers: {
          accept: "application/json",
        },
      },
    );

    if (response.status === 404) {
      return undefined;
    }

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}.`);
    }

    const payload =
      (await response.json()) as ProductImageGenerationConfigResponse;

    return payload.config ?? undefined;
  } catch (error) {
    console.error("Error fetching product image generation config:", error);
    return undefined;
  }
}
