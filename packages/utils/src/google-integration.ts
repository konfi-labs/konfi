import { isRecord, optionalTrimmedString } from "./metadata-values";

export const GOOGLE_TENANT_INTEGRATION_KEY = "google";
export const TENANT_INTEGRATIONS_COLLECTION = "tenantIntegrations";

export interface GoogleStorefrontChannelConfig {
  placeId?: string;
  reviewsEnabled: boolean;
  tagManagerEnabled: boolean;
  tagManagerId?: string;
}

export type GoogleStorefrontChannelsConfig = Record<
  string,
  GoogleStorefrontChannelConfig
>;

export interface GoogleTenantIntegrationMetadata {
  google: {
    channels: GoogleStorefrontChannelsConfig;
  };
}

export interface GoogleTenantIntegrationDocument {
  integrationKey?: unknown;
  metadata?: unknown;
  status?: unknown;
  tenantId?: unknown;
  updatedAt?: unknown;
  updatedByUid?: unknown;
}

export const tenantGoogleIntegrationDocumentId = (tenantId: string) =>
  `${tenantId}_${GOOGLE_TENANT_INTEGRATION_KEY}`;

function optionalBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeGoogleStorefrontChannelConfig(
  value: unknown,
): GoogleStorefrontChannelConfig {
  const config = isRecord(value) ? value : {};

  return {
    placeId: optionalTrimmedString(config.placeId),
    reviewsEnabled: optionalBoolean(config.reviewsEnabled, false),
    tagManagerEnabled: optionalBoolean(config.tagManagerEnabled, false),
    tagManagerId: optionalTrimmedString(config.tagManagerId),
  };
}

export function normalizeGoogleTenantIntegrationMetadata(
  metadata: unknown,
): GoogleTenantIntegrationMetadata {
  const metadataRecord = isRecord(metadata) ? metadata : {};
  const googleRecord = isRecord(metadataRecord.google)
    ? metadataRecord.google
    : {};
  const channelsRecord = isRecord(googleRecord.channels)
    ? googleRecord.channels
    : {};

  const channels = Object.entries(
    channelsRecord,
  ).reduce<GoogleStorefrontChannelsConfig>((result, [channelId, value]) => {
    const trimmedChannelId = channelId.trim();

    if (!trimmedChannelId || trimmedChannelId.includes("/")) {
      return result;
    }

    return {
      ...result,
      [trimmedChannelId]: normalizeGoogleStorefrontChannelConfig(value),
    };
  }, {});

  return {
    google: {
      channels,
    },
  };
}

export function getGoogleStorefrontChannelConfig(
  metadata: unknown,
  channelId: string,
): GoogleStorefrontChannelConfig {
  const normalizedMetadata = normalizeGoogleTenantIntegrationMetadata(metadata);

  return (
    normalizedMetadata.google.channels[channelId] ??
    normalizeGoogleStorefrontChannelConfig(undefined)
  );
}

export function mergeGoogleStorefrontChannelConfig({
  channelId,
  config,
  metadata,
}: {
  channelId: string;
  config: GoogleStorefrontChannelConfig;
  metadata: unknown;
}): GoogleTenantIntegrationMetadata {
  const normalizedMetadata = normalizeGoogleTenantIntegrationMetadata(metadata);

  return {
    google: {
      channels: {
        ...normalizedMetadata.google.channels,
        [channelId]: config,
      },
    },
  };
}

export function isConnectedGoogleTenantIntegration(
  integration: GoogleTenantIntegrationDocument | undefined,
  tenantId: string,
): integration is GoogleTenantIntegrationDocument {
  return (
    integration?.tenantId === tenantId &&
    integration.integrationKey === GOOGLE_TENANT_INTEGRATION_KEY &&
    integration.status === "connected"
  );
}
