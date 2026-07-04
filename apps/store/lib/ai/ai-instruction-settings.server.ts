import "server-only";

import { getAdminDb } from "@/lib/firebase/serverApp";
import { tenantFirestorePaths } from "@konfi/firebase";
import type { AiInstructionSettings, TenantContext } from "@konfi/types";
import {
  AI_INSTRUCTIONS_SETTINGS_DOC_ID,
  type PartialAiInstructionSettings,
  normalizeAiInstructionSettings,
} from "@konfi/utils";

export async function loadStoreAiInstructionSettings({
  channelId,
  tenantContext,
}: {
  channelId?: string;
  tenantContext: TenantContext;
}): Promise<AiInstructionSettings> {
  if (!channelId?.trim()) {
    return normalizeAiInstructionSettings();
  }

  const snapshot = await getAdminDb()
    .doc(
      tenantFirestorePaths.settingsDoc(
        tenantContext,
        channelId,
        AI_INSTRUCTIONS_SETTINGS_DOC_ID,
      ),
    )
    .get();

  return normalizeAiInstructionSettings(
    snapshot.exists ? (snapshot.data() as PartialAiInstructionSettings) : null,
  );
}
