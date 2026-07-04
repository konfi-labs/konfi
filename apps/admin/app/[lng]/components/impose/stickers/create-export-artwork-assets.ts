import type { StickerArtworkAsset } from "@konfi/wasm";
import type { StickerImpositionItem } from "@/lib/sticker-imposition/types";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error(`Failed to read ${file.name} as data URL.`));
        return;
      }

      resolve(result);
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error(`Failed to read ${file.name}.`));
    };

    reader.readAsDataURL(file);
  });
}

export async function createStickerExportArtworkAssets(params: {
  files: readonly File[];
  items: readonly StickerImpositionItem[];
}): Promise<StickerArtworkAsset[]> {
  const rasterCache = new Map<number, Promise<string>>();

  const resolveRasterDataUrl = (sourceFileIndex: number): Promise<string> => {
    if (rasterCache.has(sourceFileIndex)) {
      return rasterCache.get(sourceFileIndex)!;
    }

    const sourceFile = params.files[sourceFileIndex];
    if (!sourceFile) {
      return Promise.reject(
        new Error(`Missing source file at index ${sourceFileIndex}.`),
      );
    }

    const value = fileToDataUrl(sourceFile);
    rasterCache.set(sourceFileIndex, value);
    return value;
  };

  return await Promise.all(
    params.items.map(async (item) => {
      const sourceFile = params.files[item.sourceFileIndex];

      if (!sourceFile) {
        throw new Error(
          `Missing source file for ${item.filename} (index ${item.sourceFileIndex}).`,
        );
      }

      const dataUrl = await resolveRasterDataUrl(item.sourceFileIndex);

      return {
        dataUrl,
        itemId: item.id,
      } satisfies StickerArtworkAsset;
    }),
  );
}
