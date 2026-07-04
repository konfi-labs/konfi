export interface Preview3DAssets {
  backUrl?: string;
  frontUrl?: string;
  urls: string[];
}

export function normalizePreview3DAssets(previewURLs: readonly string[]) {
  const urls = Array.from(
    new Set(
      previewURLs.map((url) => url.trim()).filter((url) => url.length > 0),
    ),
  ).sort((left, right) => left.localeCompare(right));

  return {
    backUrl: urls[1],
    frontUrl: urls[0],
    urls,
  } satisfies Preview3DAssets;
}
