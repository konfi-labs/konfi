"use server";

import { getAdminDb } from "@/lib/firebase/serverApp";
import { resolveStorefrontBaseUrl } from "@/lib/storefront-domains";
import {
  getTenantAdminScopeTenantId,
  requireTenantAdminAuthContext,
  requireTenantAdminChannelAccess,
} from "@/actions/auth-utils";
import {
  createStorefrontEditorToken,
  DEFAULT_STOREFRONT_EDITOR_TOKEN_AGE_SECONDS,
} from "@konfi/utils/server/storefront-editor-session";
import { DEFAULT_LOCALE, Locale } from "@konfi/types";

interface TenantData {
  moduleFlags?: {
    storefront?: boolean;
  };
}

interface StorefrontEditorLaunchUrlResult {
  expiresAt: number;
  url: string;
}

const supportedLocales = new Set<string>(Object.values(Locale));

function normalizeStorefrontEditorLocale(locale?: string): Locale {
  const normalizedLocale = locale?.trim().toLowerCase();

  return normalizedLocale && supportedLocales.has(normalizedLocale)
    ? (normalizedLocale as Locale)
    : DEFAULT_LOCALE;
}

async function getStorefrontEnabled(tenantId: string): Promise<boolean> {
  const tenantSnapshot = await getAdminDb()
    .collection("tenants")
    .doc(tenantId)
    .get();
  const tenant = tenantSnapshot.data() as TenantData | undefined;

  return tenant?.moduleFlags?.storefront !== false;
}

export async function createStorefrontEditorLaunchUrlAction(input: {
  channelId: string;
  locale?: string;
}): Promise<StorefrontEditorLaunchUrlResult> {
  const channelId = await requireTenantAdminChannelAccess(input.channelId);
  const { tenantContext, uid } = await requireTenantAdminAuthContext();
  const tenantId =
    getTenantAdminScopeTenantId(tenantContext) ?? tenantContext.tenantId;

  if (!tenantId) {
    throw new Error("Tenant context is required.");
  }

  if (!(await getStorefrontEnabled(tenantId))) {
    throw new Error("Storefront module is not enabled for this tenant.");
  }

  const storeBaseUrl = await resolveStorefrontBaseUrl({
    channelId,
    tenantContext,
    tenantId,
  });
  const token = createStorefrontEditorToken({
    channelId,
    tenantId,
    uid,
  });
  const session = new URL(
    `/${normalizeStorefrontEditorLocale(input.locale)}/storefront-editor/session`,
    `${storeBaseUrl}/`,
  );

  session.hash = new URLSearchParams({ token }).toString();

  return {
    expiresAt:
      Math.floor(Date.now() / 1000) +
      DEFAULT_STOREFRONT_EDITOR_TOKEN_AGE_SECONDS,
    url: session.toString(),
  };
}
