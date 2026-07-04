import "server-only";

import { cookies } from "next/headers";
import type { StoreRuntimeConfig } from "@/lib/runtime-config";
export {
  createStorefrontEditorToken,
  DEFAULT_STOREFRONT_EDITOR_TOKEN_AGE_SECONDS,
  MAX_STOREFRONT_EDITOR_TOKEN_AGE_SECONDS,
  type StorefrontEditorSession,
  verifyStorefrontEditorToken,
} from "@konfi/utils/server/storefront-editor-session";
import {
  type StorefrontEditorSession,
  verifyStorefrontEditorToken,
} from "@konfi/utils/server/storefront-editor-session";

export const STOREFRONT_EDITOR_COOKIE = "__konfi_storefront_editor";

export async function getStorefrontEditorSessionForRequest(
  runtimeConfig: StoreRuntimeConfig,
): Promise<StorefrontEditorSession | null> {
  let token: string | undefined;

  try {
    token = (await cookies()).get(STOREFRONT_EDITOR_COOKIE)?.value;
  } catch {
    return null;
  }

  const session = verifyStorefrontEditorToken(token);

  if (
    !session ||
    session.channelId !== runtimeConfig.channelId ||
    session.tenantId !== runtimeConfig.tenantContext.tenantId
  ) {
    return null;
  }

  return session;
}
