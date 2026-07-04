const PRODUCT_IMAGE_DESTINATION_PREFIX_PATTERN =
  /^channels\/([^/]+)\/products\/([^/]+)$/;

export type ProductImageDestination = {
  channelId: string;
  productId: string;
  prefix: string;
};

export function parseProductImageDestinationPrefix(
  prefix: string,
): ProductImageDestination {
  const normalizedPrefix = prefix
    .trim()
    .replace(/^images\//, "")
    .replace(/\/+$/, "");
  const match = PRODUCT_IMAGE_DESTINATION_PREFIX_PATTERN.exec(normalizedPrefix);

  if (!match) {
    throw new Error("Invalid product image destination prefix.");
  }

  return {
    channelId: match[1],
    productId: match[2],
    prefix: normalizedPrefix,
  };
}

export function normalizeProductImageDestinationPrefix(prefix: string): string {
  return parseProductImageDestinationPrefix(prefix).prefix;
}

export function assertOwnedGeneratedStoragePath(
  storagePath: string,
  adminUid: string,
): void {
  const normalizedStoragePath = storagePath.trim().replace(/^\/+/, "");
  const expectedPrefix = `ai/generated/accounts/${adminUid}/`;

  if (!normalizedStoragePath.startsWith(expectedPrefix)) {
    throw new Error("Generated image does not belong to the current admin.");
  }
}

export function getStoragePathExtension(storagePath: string): string {
  const fileName = storagePath.split("/").pop() ?? "";
  const extensionMatch = fileName.match(/\.[a-zA-Z0-9]+$/);
  return extensionMatch?.[0] ?? ".png";
}
