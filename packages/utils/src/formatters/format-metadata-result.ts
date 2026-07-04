import { dbMetadata } from "@konfi/types";

function normalizeMetadataValue(value?: string) {
  if (!value) {
    return undefined;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : undefined;
}

export function formatMetadataResult(metadataResult: dbMetadata) {
  const title = normalizeMetadataValue(metadataResult.title);
  const description = normalizeMetadataValue(metadataResult.description);
  const keywords = normalizeMetadataValue(metadataResult.keywords);
  const ogTitle = normalizeMetadataValue(metadataResult.ogTitle);
  const ogDescription = normalizeMetadataValue(metadataResult.ogDescription);
  const ogImage = normalizeMetadataValue(metadataResult.ogImage);

  const openGraph =
    ogTitle || ogDescription || ogImage
      ? {
          title: ogTitle,
          description: ogDescription,
          ...(ogImage
            ? {
                images: [
                  {
                    height: 630,
                    url: ogImage,
                    width: 1200,
                  },
                ],
              }
            : {}),
        }
      : undefined;

  const twitter =
    ogTitle || ogDescription || ogImage
      ? {
          title: ogTitle,
          description: ogDescription,
          ...(ogImage
            ? {
                card: "summary_large_image",
                images: [ogImage],
              }
            : {}),
        }
      : undefined;

  return {
    title,
    description,
    keywords,
    openGraph,
    twitter,
  };
}
