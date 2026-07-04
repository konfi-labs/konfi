import {
  DEFAULT_STOREFRONT_SHARING,
  type StorefrontSharingSettings,
} from "@konfi/types";

export const storefrontSharingCacheTag = "storefrontSharing";

const imageProtocols = new Set(["http:", "https:"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const imageUrlValue = (value: unknown): string | undefined => {
  const text = stringValue(value);

  if (!text) {
    return undefined;
  }

  if (text.startsWith("/")) {
    return text;
  }

  try {
    const parsedUrl = new URL(text);

    return imageProtocols.has(parsedUrl.protocol) ? text : undefined;
  } catch {
    return undefined;
  }
};

export function sanitizeStorefrontSharing(
  value: unknown,
): StorefrontSharingSettings {
  const record = isRecord(value) ? value : {};

  return {
    defaultOpenGraphImageUrl: imageUrlValue(record.defaultOpenGraphImageUrl),
    faviconUrl: imageUrlValue(record.faviconUrl),
    id: DEFAULT_STOREFRONT_SHARING.id,
  };
}
