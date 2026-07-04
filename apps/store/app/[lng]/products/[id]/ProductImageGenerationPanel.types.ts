"use client";

import type { StoreGenerationStyle } from "@/lib/ai/store-image-generation.shared";
import type {
  Attribute,
  Product,
  ProductImageGenerationConfig,
} from "@konfi/types";

export type GeneratedImageVariant = {
  id: string;
  imageDataUrl: string;
  side: "single" | "front" | "back";
};

export type GenerationProgressState = {
  elapsedSeconds: number;
  remainingSeconds: number;
  progressPercent: number;
  isOvertime: boolean;
  estimatedDurationSeconds: number;
};

export type GenerationResponse = {
  images: GeneratedImageVariant[];
  context: {
    pageLabel?: string;
    sizeLabel?: string;
    aspectRatioLabel?: string;
    isLargeFormat: boolean;
    printSideCount: 1 | 2;
  };
  remainingAttempts: number;
  expiresAt: string;
  expiresAtMs: number;
};

export type ImageGenerationProduct = Pick<
  Product,
  "id" | "name" | "channelId" | "customSize" | "spec" | "attributes"
>;

export type ProductImageGenerationPresentation = "inline" | "trigger";
export type ProductImageGenerationAcceptMode = "attach" | "addToCart";

export type ProductImageGenerationPanelProps = {
  product: ImageGenerationProduct;
  attributes: Attribute[];
  channelId?: string;
  selectedAttributeOptions?: Record<string, string>;
  width?: number;
  height?: number;
  pageCount?: number;
  onAcceptGeneratedImageAction?: (files: File[]) => Promise<void>;
  imageGenerationConfig?: ProductImageGenerationConfig;
  presentation?: ProductImageGenerationPresentation;
  acceptMode?: ProductImageGenerationAcceptMode;
};

export type ProductImageGenerationPanelContentProps = {
  helperText: string;
  prompt: string;
  onPromptChangeAction: (value: string) => void;
  selectedStyle: StoreGenerationStyle;
  onSelectedStyleChangeAction: (value: StoreGenerationStyle) => void;
  improvePrompt: boolean;
  onImprovePromptChangeAction: (value: boolean) => void;
  referenceFiles: File[];
  onReferenceFilesChangeAction: (files: File[]) => void;
  result: GenerationResponse | null;
  generationProgress: GenerationProgressState | null;
  isPending: boolean;
  isAccepting: boolean;
  isPromptInvalid: boolean;
  promptWordCount: number;
  selectedSize: {
    width?: number;
    height?: number;
  };
  pageCount?: number;
  isLargeFormat: boolean;
  canGenerate: boolean;
  canAcceptResult: boolean;
  acceptActionKind: ProductImageGenerationAcceptMode;
  showAuthHint: boolean;
  showAnonymousHint: boolean;
  showEmailHint: boolean;
  maxPromptWords: number;
  minPromptWords: number;
  maxReferenceFiles: number;
  maxReferenceFileSizeBytes: number;
  onGenerateAction: () => void;
  onAcceptGeneratedImageAction: () => void;
  onDownloadGeneratedImageAction: () => void;
};
