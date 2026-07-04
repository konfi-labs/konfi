import type { useT } from "@/i18n/client";
import type { CollectionItem, ListCollection } from "@chakra-ui/react";
import type { ExternalProduct, ExternalProvider } from "@konfi/types";

export type ExternalProductWithId = ExternalProduct & { id: string };
export type ExternalProviderWithId = ExternalProvider & { id: string };
export type ProviderCatalogItem = {
  id: string;
  name: string;
  imageUrl?: string;
  url?: string;
};
export type ExternalImportProgress = {
  label: string;
  productId?: string | null;
  currentStageTitle: string;
  currentStageDescription: string;
  elapsedSeconds: number;
  upcomingStageTitles: string[];
};
export type AttributeCollectionItem = CollectionItem & {
  calculated?: boolean;
};
export type AttributeCollection = ListCollection<AttributeCollectionItem>;
export type TranslateFn = ReturnType<typeof useT>["t"];
