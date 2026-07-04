import type { AiInstructionSettings } from "@konfi/types";
import { buildAiInstructionOverlaySection } from "@konfi/utils";

export function buildAdminAssistantSystemPrompt({
  clientSystemPrompt,
  defaultSystemPrompt,
  finalAnswerGuardrail,
  settings,
}: {
  clientSystemPrompt?: string;
  defaultSystemPrompt: string;
  finalAnswerGuardrail: string;
  settings?: AiInstructionSettings | null;
}) {
  return [
    clientSystemPrompt,
    defaultSystemPrompt,
    buildAiInstructionOverlaySection(settings, "adminAssistant"),
    finalAnswerGuardrail,
  ]
    .filter((section): section is string => Boolean(section?.trim()))
    .join("\n\n");
}
