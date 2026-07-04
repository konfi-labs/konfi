export const AI_INSTRUCTION_CAPABILITIES = [
  "printMethodResolution",
  "adminAssistant",
  "storefrontAssistant",
  "socialPosts",
] as const;

export type AiInstructionCapability =
  (typeof AI_INSTRUCTION_CAPABILITIES)[number];

export interface AiInstructionOverlay {
  enabled: boolean;
  instructions: string;
}

export type AiInstructionOverlays = Record<
  AiInstructionCapability,
  AiInstructionOverlay
>;

export interface AiInstructionSettings {
  capabilities: AiInstructionOverlays;
  tenantId?: string;
  updatedAt?: unknown;
  updatedBy?: {
    id: string;
    name?: string;
  };
}
