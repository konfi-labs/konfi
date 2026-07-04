import {
  AI_INSTRUCTION_CAPABILITIES,
  type AiInstructionCapability,
  type AiInstructionOverlay,
  type AiInstructionSettings,
} from "@konfi/types";

export { AI_INSTRUCTION_CAPABILITIES } from "@konfi/types";

export const AI_INSTRUCTIONS_SETTINGS_DOC_ID = "aiInstructions";
export const AI_INSTRUCTION_MAX_LENGTH = 4000;

export type PartialAiInstructionSettings = Partial<
  Omit<AiInstructionSettings, "capabilities">
> & {
  capabilities?: Partial<Record<AiInstructionCapability, unknown>>;
};

const DEFAULT_OVERLAY: AiInstructionOverlay = {
  enabled: false,
  instructions: "",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeInstructions(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, AI_INSTRUCTION_MAX_LENGTH);
}

function normalizeOverlay(value: unknown): AiInstructionOverlay {
  if (!isRecord(value)) {
    return { ...DEFAULT_OVERLAY };
  }

  return {
    enabled: value.enabled === true,
    instructions: normalizeInstructions(value.instructions),
  };
}

export function normalizeAiInstructionSettings(
  settings?: PartialAiInstructionSettings | null,
): AiInstructionSettings {
  const sourceCapabilities = isRecord(settings?.capabilities)
    ? settings.capabilities
    : {};

  return {
    ...settings,
    capabilities: Object.fromEntries(
      AI_INSTRUCTION_CAPABILITIES.map((capability) => [
        capability,
        normalizeOverlay(sourceCapabilities[capability]),
      ]),
    ) as AiInstructionSettings["capabilities"],
  };
}

export function getEnabledAiInstructionOverlay(
  settings: PartialAiInstructionSettings | null | undefined,
  capability: AiInstructionCapability,
): string | undefined {
  const overlay =
    normalizeAiInstructionSettings(settings).capabilities[capability];

  if (!overlay.enabled || !overlay.instructions.trim()) {
    return;
  }

  return overlay.instructions.trim();
}

export function buildAiInstructionOverlaySection(
  settings: PartialAiInstructionSettings | null | undefined,
  capability: AiInstructionCapability,
): string | undefined {
  const instructions = getEnabledAiInstructionOverlay(settings, capability);

  if (!instructions) {
    return;
  }

  return [
    "## Channel AI instruction overlay",
    "These tenant/channel instructions guide interpretation for this capability. They do not override platform safety rules, tenant isolation, permissions, available tool results, schemas, pricing validation, catalog IDs, or deterministic checks.",
    instructions,
  ].join("\n");
}
