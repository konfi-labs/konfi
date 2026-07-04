import { firestore } from "@/lib/firebase/clientApp";
import { ProductImageGenerationConfig } from "@konfi/types";
import {
  getProductImageGenerationConfigPath,
  normalizeProductImageGenerationConfig,
} from "@konfi/utils";
import {
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  Timestamp,
} from "firebase/firestore";

type ProductImageGenerationConfigEditor = {
  id: string;
  name: string;
};

export async function fetchProductImageGenerationConfig(
  channelId: string,
  productId: string,
): Promise<ProductImageGenerationConfig | undefined> {
  try {
    const configPath = getProductImageGenerationConfigPath(channelId, productId);
    const configSnapshot = await getDoc(doc(firestore, configPath));

    return normalizeProductImageGenerationConfig(
      configSnapshot.exists()
        ? (configSnapshot.data() as ProductImageGenerationConfig)
        : undefined,
    );
  } catch (error) {
    console.error("Error fetching product image generation config:", error);
    throw new Error("Failed to load AI image generation settings.");
  }
}

export async function saveProductImageGenerationConfig(params: {
  channelId: string;
  productId: string;
  config: Partial<ProductImageGenerationConfig> | null | undefined;
  editor: ProductImageGenerationConfigEditor;
}): Promise<ProductImageGenerationConfig | undefined> {
  const { channelId, productId, config, editor } = params;

  try {
    const configPath = getProductImageGenerationConfigPath(channelId, productId);
    const configRef = doc(firestore, configPath);
    const normalizedConfig = normalizeProductImageGenerationConfig(config);

    if (!normalizedConfig) {
      await deleteDoc(configRef);
      return undefined;
    }

    const updatedAt = Timestamp.now();
    const nextConfig: ProductImageGenerationConfig = {
      ...normalizedConfig,
      updatedAt,
      updatedBy: {
        id: editor.id,
        name: editor.name,
      },
    };

    await setDoc(configRef, nextConfig);

    return nextConfig;
  } catch (error) {
    console.error("Error saving product image generation config:", error);
    throw new Error("Failed to save AI image generation settings.");
  }
}
