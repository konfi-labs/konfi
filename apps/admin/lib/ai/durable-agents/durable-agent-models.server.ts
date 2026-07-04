import { MODELS } from "@konfi/firebase";
import { getAdminVertexLanguageModel } from "@/lib/ai/vertex-language-model.server";

export async function getFastVertexModel() {
  return getAdminVertexLanguageModel(MODELS.GEMINI_3_FLASH_LITE);
}

export async function getEmailOrderImportAgentModel() {
  return getAdminVertexLanguageModel(MODELS.GEMINI_3_FLASH_LITE);
}

export async function getHighPrecisionVertexModel() {
  return getAdminVertexLanguageModel(MODELS.GEMINI_3_PRO);
}
