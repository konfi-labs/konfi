/**
 * Configuration for AI models.
 * Contains model IDs, names, descriptions, and capabilities.
 */

export const MODELS = {
  GEMINI_FLASH_LATEST: "gemini-3.5-flash",
  GEMINI_PRO_LATEST: "gemini-3.5-flash",
  ASSISTANT_FAST: "assistant-fast",
  ASSISTANT_THINKING: "assistant-thinking",
  ASSISTANT_PRO: "assistant-pro",
  GEMINI_3_PRO: "gemini-3.5-flash",
  GEMINI_3_1_PRO_PREVIEW: "gemini-3.1-pro-preview",
  GEMINI_3_FLASH: "gemini-3.5-flash",
  GEMINI_3_FLASH_PREVIEW: "gemini-3-flash-preview",
  GEMINI_3_FLASH_LITE: "gemini-3.1-flash-lite",
  NANO_BANANA_2_LITE: "gemini-3.1-flash-lite-image",
  NANO_BANANA_2: "gemini-3.1-flash-image",
  NANO_BANANA_PRO: "gemini-3-pro-image-preview",
  FLUX_2_KLEIN: "bfl/flux-2-klein-9b",
  GPT_IMAGE_2: "openai/gpt-image-2",
  QUIVER_ARROW: "quiverai/arrow-1.1",
  // Video models
  VEO_31: "veo-3.1-generate-001",
  VEO_31_FAST: "veo-3.1-fast-generate-001",
};

export interface ModelConfig {
  id: string;
  name: string;
  labelKey?: string;
  description: string;
  capabilities: string[];
  maxTokens: number;
  providerModelId?: string;
  isExperimental?: boolean;
  supportsThoughts?: boolean;
}

export const modelConfigs: Record<string, ModelConfig> = {
  [MODELS.ASSISTANT_FAST]: {
    id: MODELS.ASSISTANT_FAST,
    name: "Fast",
    labelKey: "assistant.models.fast",
    description: "Best speed for everyday chat tasks",
    capabilities: ["text", "code", "images", "audio", "video"],
    maxTokens: 65535,
    providerModelId: MODELS.GEMINI_FLASH_LATEST,
    supportsThoughts: false,
  },
  [MODELS.ASSISTANT_THINKING]: {
    id: MODELS.ASSISTANT_THINKING,
    name: "Thinking",
    labelKey: "assistant.models.thinking",
    description: "More deliberate reasoning for tougher prompts",
    capabilities: ["text", "code", "images", "audio", "video"],
    maxTokens: 65535,
    providerModelId: MODELS.GEMINI_FLASH_LATEST,
    supportsThoughts: true,
  },
  [MODELS.ASSISTANT_PRO]: {
    id: MODELS.ASSISTANT_PRO,
    name: "Pro",
    labelKey: "assistant.models.pro",
    description: "Highest quality responses with advanced reasoning",
    capabilities: ["text", "code", "images", "audio", "video"],
    maxTokens: 65535,
    providerModelId: MODELS.GEMINI_PRO_LATEST,
    supportsThoughts: true,
  },
};

const legacyAssistantModelMap: Record<string, string> = {
  [MODELS.GEMINI_3_FLASH]: MODELS.ASSISTANT_FAST,
  [MODELS.GEMINI_3_FLASH_PREVIEW]: MODELS.ASSISTANT_FAST,
  [MODELS.GEMINI_3_FLASH_LITE]: MODELS.ASSISTANT_FAST,
  [MODELS.GEMINI_3_PRO]: MODELS.ASSISTANT_PRO,
  [MODELS.GEMINI_3_1_PRO_PREVIEW]: MODELS.ASSISTANT_PRO,
};

export const assistantModelConfigs: ModelConfig[] = [
  modelConfigs[MODELS.ASSISTANT_FAST],
  modelConfigs[MODELS.ASSISTANT_THINKING],
  modelConfigs[MODELS.ASSISTANT_PRO],
];

export function resolveAssistantModelId(modelId?: string): string {
  if (!modelId) {
    return MODELS.ASSISTANT_FAST;
  }

  if (modelConfigs[modelId]) {
    return modelId;
  }

  return legacyAssistantModelMap[modelId] ?? MODELS.ASSISTANT_FAST;
}

export function getAssistantModelConfig(modelId?: string): ModelConfig {
  const resolvedModelId = resolveAssistantModelId(modelId);
  return modelConfigs[resolvedModelId];
}
