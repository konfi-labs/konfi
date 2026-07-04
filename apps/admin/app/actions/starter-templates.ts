"use server";

import {
  getAuthenticatedAdminClaims,
  requireSuperAdminAuth,
} from "@/actions/auth-utils";
import { getAdminDb, getTenantContext } from "@/lib/firebase/serverApp";
import {
  exportStarterTemplate,
  importStarterTemplate,
  type FirestoreLike,
  type StarterTemplateImportResult,
  type StarterTemplateManifest,
} from "@/lib/starter-templates";

function getStarterTemplateDb(): FirestoreLike {
  return getAdminDb() as unknown as FirestoreLike;
}

export async function exportStarterTemplateAction(input: {
  name?: string;
  sourceChannelId: string;
  sourceTenantId?: string | null;
}): Promise<StarterTemplateManifest> {
  await requireSuperAdminAuth();

  return exportStarterTemplate({
    db: getStarterTemplateDb(),
    name: input.name,
    sourceChannelId: input.sourceChannelId,
    sourceTenantContext: getTenantContext(input.sourceTenantId),
  });
}

export async function importStarterTemplateAction(input: {
  allowOverwrite?: boolean;
  channelName?: string;
  manifest: StarterTemplateManifest;
  targetChannelId: string;
  targetTenantId?: string | null;
}): Promise<StarterTemplateImportResult> {
  await requireSuperAdminAuth();

  const claims = await getAuthenticatedAdminClaims();
  const claimName =
    typeof claims.name === "string" && claims.name.trim()
      ? claims.name.trim()
      : typeof claims.email === "string" && claims.email.trim()
        ? claims.email.trim()
        : "Admin";

  return importStarterTemplate({
    actor: {
      id: claims.uid,
      name: claimName,
    },
    allowOverwrite: input.allowOverwrite,
    channelName: input.channelName,
    db: getStarterTemplateDb(),
    manifest: input.manifest,
    targetChannelId: input.targetChannelId,
    targetTenantContext: getTenantContext(input.targetTenantId),
  });
}
