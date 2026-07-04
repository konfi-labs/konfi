import {
  exportSpotPdfForPdfSource,
  generateHalftoneMaskRgba,
  generateWhiteUnderbaseMaskRgba,
} from "@konfi/wasm/browser";
import {
  DEFAULT_SPOT_CHOKE_BLEED_MM,
  adjustSpotMask,
  normalizeSpotChokeBleedMm,
} from "./spot-mask-adjustment";

export type SpotLayerMode = "knockout" | "overprint";
export type SpotMaskExportMode = "binary" | "tint";
export type SpotName = "Spot_1" | "Spot_2" | "Spot_3" | "Spot_4";
export type SpotProofView = "composite" | "plate";
export type SpotToolMode = "erase" | "paint";

export type SpotSourceFile = {
  file: File;
  id: string;
  name: string;
  size: number;
  type: string;
};

export type SpotDirtyRect = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export type SpotLayer = {
  chokeBleedMm: number;
  color: string;
  halftoneMask?: Uint8Array;
  id: string;
  mask: Uint8Array;
  mode: SpotLayerMode;
  name: string;
  sourceVectorMask: boolean;
  spotNames: SpotName[];
  visible: boolean;
};

export type RasterizedSpotAsset = {
  artworkMask: Uint8Array;
  contentType: string;
  dataUrl: string;
  filename: string;
  height: number;
  pageCount?: number;
  pageHeightPt: number;
  pageWidthPt: number;
  rgba: Uint8Array;
  sourceBytes: Uint8Array;
  sourceFingerprint: string;
  width: number;
};

export type WhiteUnderbaseSettings = {
  alphaThreshold: number;
  lumaThreshold: number;
};

export type HalftoneSettings = {
  alphaThreshold: number;
  cellSizePx: number;
  dotPercent: number;
  fullGraphic: boolean;
};

export type SpotPreviewRevision = {
  filename: string;
  generatedAt: string;
  halftoneSettings: HalftoneSettings;
  height: number;
  layers: {
    chokeBleedMm: number;
    color: string;
    coveragePercent: number;
    id: string;
    mode: SpotLayerMode;
    name: string;
    sourceVectorMask: boolean;
    spotNames: SpotName[];
    visible: boolean;
  }[];
  settings: WhiteUnderbaseSettings;
  sourceFingerprint: string;
  width: number;
};

export type SpotWorkspaceSnapshot = {
  asset: {
    contentType: string;
    filename: string;
    height: number;
    sourceFingerprint: string;
    width: number;
  };
  halftoneSettings: HalftoneSettings;
  layers: {
    chokeBleedMm?: number;
    color: string;
    halftoneMaskBase64?: string;
    id: string;
    maskBase64: string;
    mode: SpotLayerMode;
    name: string;
    sourceVectorMask?: boolean;
    spotNames?: SpotName[];
    visible: boolean;
  }[];
  revision: SpotPreviewRevision;
  settings: WhiteUnderbaseSettings;
  version: 1;
};

export type SpotPdfSourceExportLayer = {
  color: string;
  mask: Uint8Array;
  mode: SpotLayerMode;
  sourceVectorMask: boolean;
  spotName: SpotName;
};

const PDF_PREVIEW_WORKER_SRC = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export const DEFAULT_SPOT_LAYERS = [
  { color: "#ffffff", id: "white", name: "WHITE", spotNames: ["Spot_1"] },
  { color: "#ff2d55", id: "cut", name: "CUT", spotNames: ["Spot_2"] },
  {
    color: "#7c3aed",
    id: "varnish",
    name: "VARNISH",
    spotNames: ["Spot_3", "Spot_4"],
  },
] as const;

const SPOT_NAMES: readonly SpotName[] = [
  "Spot_1",
  "Spot_2",
  "Spot_3",
  "Spot_4",
] as const;
const SPOT_WORKSPACE_DB_NAME = "konfi-spot-workspaces";
const SPOT_WORKSPACE_DB_VERSION = 1;
const SPOT_WORKSPACE_STORE_NAME = "workspaces";

type SpotWorkspaceStorageRecord = {
  key: string;
  updatedAt: string;
  value: string;
};

function inferContentType(file: File): string {
  if (file.type) return file.type;

  const filename = file.name.toLowerCase();
  if (filename.endsWith(".pdf")) return "application/pdf";
  if (filename.endsWith(".png")) return "image/png";
  if (filename.endsWith(".jpg") || filename.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (filename.endsWith(".webp")) return "image/webp";
  if (filename.endsWith(".tif") || filename.endsWith(".tiff")) {
    return "image/tiff";
  }

  return "application/octet-stream";
}

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function createSourceFingerprint(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    return `${bytes.length}:${bytes[0] ?? 0}:${bytes[bytes.length - 1] ?? 0}`;
  }

  const digestInput = bytes.slice().buffer as ArrayBuffer;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", digestInput);
  return bytesToHex(digest);
}

function canvasToAsset(params: {
  canvas: HTMLCanvasElement;
  contentType: string;
  filename: string;
  pageCount?: number;
  pageHeightPt: number;
  pageWidthPt: number;
  sourceBytes: Uint8Array;
  sourceFingerprint: string;
}): RasterizedSpotAsset {
  const {
    canvas,
    contentType,
    filename,
    pageCount,
    pageHeightPt,
    pageWidthPt,
    sourceBytes,
    sourceFingerprint,
  } = params;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    throw new Error("Failed to read spot preview canvas.");
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const rgba = new Uint8Array(imageData.data);
  const artworkMask = new Uint8Array(canvas.width * canvas.height);

  for (let index = 0; index < artworkMask.length; index += 1) {
    artworkMask[index] = rgba[index * 4 + 3];
  }

  return {
    artworkMask,
    contentType,
    dataUrl: canvas.toDataURL("image/png"),
    filename,
    height: canvas.height,
    pageCount,
    pageHeightPt,
    pageWidthPt,
    rgba,
    sourceBytes,
    sourceFingerprint,
    width: canvas.width,
  };
}

async function rasterizeImageFile(params: {
  bytes: Uint8Array;
  file: File;
  sourceFingerprint: string;
}): Promise<RasterizedSpotAsset> {
  const { bytes, file, sourceFingerprint } = params;
  const bitmap = await createImageBitmap(file);

  try {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, bitmap.width);
    canvas.height = Math.max(1, bitmap.height);

    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      throw new Error("Failed to create spot preview canvas.");
    }

    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    return canvasToAsset({
      canvas,
      contentType: inferContentType(file),
      filename: file.name,
      pageHeightPt: canvas.height,
      pageWidthPt: canvas.width,
      sourceBytes: bytes,
      sourceFingerprint,
    });
  } finally {
    bitmap.close();
  }
}

async function rasterizePdfFile(params: {
  bytes: Uint8Array;
  file: File;
  sourceFingerprint: string;
}): Promise<RasterizedSpotAsset> {
  const { bytes, file, sourceFingerprint } = params;
  const sourceBytes = bytes.slice();
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_PREVIEW_WORKER_SRC;
  const loadingTask = pdfjsLib.getDocument({ data: bytes.slice() });
  const pdf = await loadingTask.promise;

  try {
    const page = await pdf.getPage(1);

    try {
      const baseViewport = page.getViewport({ scale: 1 });
      const dpiScale = 300 / 72;
      const scale = Math.min(
        dpiScale,
        1800 / Math.max(baseViewport.width, baseViewport.height),
      );
      const viewport = page.getViewport({ scale: Math.max(0.1, scale) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);

      const canvasContext = canvas.getContext("2d", {
        willReadFrequently: true,
      });
      if (!canvasContext) {
        throw new Error("Failed to create PDF spot preview canvas.");
      }

      await page.render({
        background: "rgba(0, 0, 0, 0)",
        canvas,
        canvasContext,
        viewport,
      }).promise;

      return canvasToAsset({
        canvas,
        contentType: "application/pdf",
        filename: file.name,
        pageCount: pdf.numPages,
        pageHeightPt: baseViewport.height,
        pageWidthPt: baseViewport.width,
        sourceBytes,
        sourceFingerprint,
      });
    } finally {
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }
}

export async function rasterizeSpotAsset(
  file: File,
): Promise<RasterizedSpotAsset> {
  const contentType = inferContentType(file);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sourceFingerprint = await createSourceFingerprint(bytes);

  if (contentType === "application/pdf") {
    return rasterizePdfFile({ bytes, file, sourceFingerprint });
  }

  if (contentType.startsWith("image/")) {
    return rasterizeImageFile({ bytes, file, sourceFingerprint });
  }

  throw new Error("Spot color authoring supports images and PDFs.");
}

export function createInitialSpotLayers(pixelCount: number): SpotLayer[] {
  return DEFAULT_SPOT_LAYERS.map((layer) => ({
    ...layer,
    chokeBleedMm: DEFAULT_SPOT_CHOKE_BLEED_MM,
    mask: new Uint8Array(pixelCount),
    mode: layer.id === "white" || layer.id === "cut" ? "overprint" : "knockout",
    sourceVectorMask: false,
    spotNames: [...layer.spotNames],
    visible: true,
  }));
}

export function createCustomSpotLayer(params: {
  color: string;
  name: string;
  pixelCount: number;
}): SpotLayer {
  const id = `custom-${crypto.randomUUID()}`;

  return {
    chokeBleedMm: DEFAULT_SPOT_CHOKE_BLEED_MM,
    color: params.color,
    id,
    mask: new Uint8Array(params.pixelCount),
    mode: "overprint",
    name: params.name.trim() || "SPOT",
    sourceVectorMask: false,
    spotNames: ["Spot_4"],
    visible: true,
  };
}

export function getCombinedSpotLayerMask(layer: SpotLayer): Uint8Array {
  if (!layer.halftoneMask) {
    return layer.mask;
  }

  const combinedMask = new Uint8Array(layer.mask.length);

  for (let index = 0; index < layer.mask.length; index += 1) {
    combinedMask[index] = Math.max(
      layer.mask[index],
      layer.halftoneMask[index],
    );
  }

  return combinedMask;
}

export async function generateWhiteUnderbaseMask(params: {
  asset: RasterizedSpotAsset;
  settings: WhiteUnderbaseSettings;
}): Promise<Uint8Array> {
  const { asset, settings } = params;
  return generateWhiteUnderbaseMaskRgba({
    alphaThreshold: settings.alphaThreshold,
    height: asset.height,
    lumaThreshold: settings.lumaThreshold,
    rgba: asset.rgba,
    width: asset.width,
  });
}

export async function generateHalftoneMask(params: {
  asset: RasterizedSpotAsset;
  settings: HalftoneSettings;
}): Promise<Uint8Array> {
  const { asset, settings } = params;
  return generateHalftoneMaskRgba({
    alphaThreshold: settings.alphaThreshold,
    cellSizePx: settings.cellSizePx,
    dotPercent: settings.dotPercent,
    fullGraphic: settings.fullGraphic,
    height: asset.height,
    rgba: asset.rgba,
    width: asset.width,
  });
}

export function applySpotLayerBrushInPlace(params: {
  asset: RasterizedSpotAsset;
  layer: SpotLayer;
  point: { x: number; y: number };
  radiusPx: number;
  toolMode: SpotToolMode;
}): SpotDirtyRect | null {
  const { asset, layer, point, radiusPx, toolMode } = params;
  const radius = Math.max(1, Math.round(radiusPx));
  const centerX = Math.round(point.x);
  const centerY = Math.round(point.y);
  const minX = Math.max(0, centerX - radius);
  const maxX = Math.min(asset.width - 1, centerX + radius);
  const minY = Math.max(0, centerY - radius);
  const maxY = Math.min(asset.height - 1, centerY + radius);

  if (minX > maxX || minY > maxY) return null;

  const isPainting = toolMode === "paint";
  const radiusSq = radius * radius;
  let changed = false;

  for (let y = minY; y <= maxY; y += 1) {
    const rowOffset = y * asset.width;

    for (let x = minX; x <= maxX; x += 1) {
      const dx = x - centerX;
      const dy = y - centerY;

      if (dx * dx + dy * dy > radiusSq) continue;

      const index = rowOffset + x;
      const value = isPainting ? asset.artworkMask[index] : 0;

      if (asset.artworkMask[index] === 0 || layer.mask[index] === value) {
        continue;
      }

      layer.mask[index] = value;
      if (toolMode === "erase" && layer.halftoneMask) {
        layer.halftoneMask[index] = 0;
      }
      layer.sourceVectorMask = false;
      changed = true;
    }
  }

  if (!changed) return null;

  return {
    height: maxY - minY + 1,
    width: maxX - minX + 1,
    x: minX,
    y: minY,
  };
}

function parseHexColor(color: string): [number, number, number] {
  const normalized = color.replace("#", "");
  const value = Number.parseInt(
    normalized.length === 3
      ? Array.from(normalized, (character) => `${character}${character}`).join(
          "",
        )
      : normalized,
    16,
  );

  if (!Number.isFinite(value)) {
    return [255, 255, 255];
  }

  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function renderSpotProofToCanvas(params: {
  asset: RasterizedSpotAsset;
  canvas: HTMLCanvasElement;
  layers: readonly SpotLayer[];
  selectedLayerId: string;
  view: SpotProofView;
}): void {
  const { asset, canvas, layers, selectedLayerId, view } = params;
  const context = canvas.getContext("2d");
  if (!context) return;

  canvas.width = asset.width;
  canvas.height = asset.height;

  if (view === "plate") {
    const selectedLayer = layers.find((layer) => layer.id === selectedLayerId);
    const plate = context.createImageData(asset.width, asset.height);

    for (let index = 0; index < asset.width * asset.height; index += 1) {
      const baseAlpha = selectedLayer?.mask[index] ?? 0;
      const halftoneAlpha = selectedLayer?.halftoneMask?.[index] ?? 0;
      const value = 255 - Math.max(baseAlpha, halftoneAlpha);
      const outputIndex = index * 4;
      plate.data[outputIndex] = value;
      plate.data[outputIndex + 1] = value;
      plate.data[outputIndex + 2] = value;
      plate.data[outputIndex + 3] = 255;
    }

    context.putImageData(plate, 0, 0);
    return;
  }

  const composite = context.createImageData(asset.width, asset.height);
  composite.data.set(asset.rgba);

  for (const layer of layers) {
    if (!layer.visible) continue;

    const [red, green, blue] = parseHexColor(layer.color);

    for (let index = 0; index < layer.mask.length; index += 1) {
      const baseAlpha = layer.mask[index];
      const halftoneAlpha = layer.halftoneMask?.[index] ?? 0;
      const maskAlpha = Math.max(baseAlpha, halftoneAlpha) / 255;
      if (maskAlpha <= 0) continue;

      const outputIndex = index * 4;
      const overlayAlpha = layer.mode === "overprint" ? 0.5 : 0.75;
      const alpha = maskAlpha * overlayAlpha;

      composite.data[outputIndex] = Math.round(
        composite.data[outputIndex] * (1 - alpha) + red * alpha,
      );
      composite.data[outputIndex + 1] = Math.round(
        composite.data[outputIndex + 1] * (1 - alpha) + green * alpha,
      );
      composite.data[outputIndex + 2] = Math.round(
        composite.data[outputIndex + 2] * (1 - alpha) + blue * alpha,
      );
      composite.data[outputIndex + 3] = Math.max(
        composite.data[outputIndex + 3],
        Math.round(maskAlpha * 255),
      );
    }
  }

  context.putImageData(composite, 0, 0);
}

export function renderSpotProofRegionToCanvas(params: {
  asset: RasterizedSpotAsset;
  canvas: HTMLCanvasElement;
  layers: readonly SpotLayer[];
  rect: SpotDirtyRect;
  selectedLayerId: string;
  view: SpotProofView;
}): void {
  const { asset, canvas, layers, rect, selectedLayerId, view } = params;
  const context = canvas.getContext("2d");
  if (!context) return;

  const imageData = context.createImageData(rect.width, rect.height);

  if (view === "plate") {
    const selectedLayer = layers.find((layer) => layer.id === selectedLayerId);

    for (let row = 0; row < rect.height; row += 1) {
      const sourceOffset = (rect.y + row) * asset.width + rect.x;
      const outputOffset = row * rect.width;

      for (let column = 0; column < rect.width; column += 1) {
        const sourceIndex = sourceOffset + column;
        const baseAlpha = selectedLayer?.mask[sourceIndex] ?? 0;
        const halftoneAlpha = selectedLayer?.halftoneMask?.[sourceIndex] ?? 0;
        const value = 255 - Math.max(baseAlpha, halftoneAlpha);
        const outputIndex = (outputOffset + column) * 4;
        imageData.data[outputIndex] = value;
        imageData.data[outputIndex + 1] = value;
        imageData.data[outputIndex + 2] = value;
        imageData.data[outputIndex + 3] = 255;
      }
    }

    context.putImageData(imageData, rect.x, rect.y);
    return;
  }

  const visibleLayers = layers.filter((layer) => layer.visible);
  const colors = new Map(
    visibleLayers.map((layer) => [layer.id, parseHexColor(layer.color)]),
  );

  for (let row = 0; row < rect.height; row += 1) {
    const sourceOffset = (rect.y + row) * asset.width + rect.x;
    const outputOffset = row * rect.width;

    for (let column = 0; column < rect.width; column += 1) {
      const sourceIndex = sourceOffset + column;
      const rgbaIndex = sourceIndex * 4;
      const outputIndex = (outputOffset + column) * 4;
      let red = asset.rgba[rgbaIndex];
      let green = asset.rgba[rgbaIndex + 1];
      let blue = asset.rgba[rgbaIndex + 2];
      let alpha = asset.rgba[rgbaIndex + 3];

      for (const layer of visibleLayers) {
        const baseAlpha = layer.mask[sourceIndex];
        const halftoneAlpha = layer.halftoneMask?.[sourceIndex] ?? 0;
        const maskAlpha = Math.max(baseAlpha, halftoneAlpha) / 255;
        if (maskAlpha <= 0) continue;

        const color = colors.get(layer.id) ?? [255, 255, 255];
        const overlayAlpha = layer.mode === "overprint" ? 0.5 : 0.75;
        const nextAlpha = maskAlpha * overlayAlpha;
        red = Math.round(red * (1 - nextAlpha) + color[0] * nextAlpha);
        green = Math.round(green * (1 - nextAlpha) + color[1] * nextAlpha);
        blue = Math.round(blue * (1 - nextAlpha) + color[2] * nextAlpha);
        alpha = Math.max(alpha, Math.round(maskAlpha * 255));
      }

      imageData.data[outputIndex] = red;
      imageData.data[outputIndex + 1] = green;
      imageData.data[outputIndex + 2] = blue;
      imageData.data[outputIndex + 3] = alpha;
    }
  }

  context.putImageData(imageData, rect.x, rect.y);
}

export function createSpotPreviewRevision(params: {
  asset: RasterizedSpotAsset;
  halftoneSettings: HalftoneSettings;
  layers: readonly SpotLayer[];
  settings: WhiteUnderbaseSettings;
}): SpotPreviewRevision {
  const { asset, halftoneSettings, layers, settings } = params;
  const pixelCount = asset.width * asset.height;

  return {
    filename: asset.filename,
    generatedAt: new Date().toISOString(),
    halftoneSettings,
    height: asset.height,
    layers: layers.map((layer) => {
      const mask = getCombinedSpotLayerMask(layer);
      const paintedPixels = mask.reduce(
        (total, value) => total + (value > 0 ? 1 : 0),
        0,
      );

      return {
        chokeBleedMm: normalizeSpotChokeBleedMm(layer.chokeBleedMm),
        color: layer.color,
        coveragePercent: Number(
          ((paintedPixels / Math.max(1, pixelCount)) * 100).toFixed(2),
        ),
        id: layer.id,
        mode: layer.mode,
        name: layer.name,
        sourceVectorMask: layer.sourceVectorMask,
        spotNames: layer.spotNames,
        visible: layer.visible,
      };
    }),
    settings,
    sourceFingerprint: asset.sourceFingerprint,
    width: asset.width,
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }

  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSpotLayerMode(value: unknown): value is SpotLayerMode {
  return value === "knockout" || value === "overprint";
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isSpotName(value: unknown): value is SpotName {
  return SPOT_NAMES.some((spotName) => spotName === value);
}

function getLegacySpotName(layerIndex: number): SpotName {
  return SPOT_NAMES[layerIndex] ?? "Spot_4";
}

export function createSpotWorkspaceSnapshot(params: {
  asset: RasterizedSpotAsset;
  halftoneSettings: HalftoneSettings;
  layers: readonly SpotLayer[];
  revision: SpotPreviewRevision;
  settings: WhiteUnderbaseSettings;
}): SpotWorkspaceSnapshot {
  const { asset, halftoneSettings, layers, revision, settings } = params;

  return {
    asset: {
      contentType: asset.contentType,
      filename: asset.filename,
      height: asset.height,
      sourceFingerprint: asset.sourceFingerprint,
      width: asset.width,
    },
    halftoneSettings,
    layers: layers.map((layer) => ({
      chokeBleedMm: normalizeSpotChokeBleedMm(layer.chokeBleedMm),
      color: layer.color,
      ...(layer.halftoneMask
        ? { halftoneMaskBase64: bytesToBase64(layer.halftoneMask) }
        : {}),
      id: layer.id,
      maskBase64: bytesToBase64(layer.mask),
      mode: layer.mode,
      name: layer.name,
      sourceVectorMask: layer.sourceVectorMask,
      spotNames: layer.spotNames,
      visible: layer.visible,
    })),
    revision,
    settings,
    version: 1,
  };
}

export function restoreSpotLayersFromSnapshot(params: {
  pixelCount: number;
  snapshot: SpotWorkspaceSnapshot;
}): SpotLayer[] {
  const { pixelCount, snapshot } = params;

  return snapshot.layers.map((layer, layerIndex) => {
    const storedMask = base64ToBytes(layer.maskBase64);
    const storedHalftoneMask = layer.halftoneMaskBase64
      ? base64ToBytes(layer.halftoneMaskBase64)
      : undefined;
    const mask =
      storedMask.length === pixelCount
        ? storedMask
        : new Uint8Array(pixelCount);
    const halftoneMask =
      storedHalftoneMask?.length === pixelCount
        ? storedHalftoneMask
        : undefined;

    const spotNames =
      layer.spotNames && layer.spotNames.length > 0
        ? layer.spotNames
        : [getLegacySpotName(layerIndex)];

    return {
      chokeBleedMm: normalizeSpotChokeBleedMm(layer.chokeBleedMm),
      color: layer.color,
      ...(halftoneMask ? { halftoneMask } : {}),
      id: layer.id,
      mask,
      mode: layer.mode,
      name: layer.name,
      sourceVectorMask: layer.sourceVectorMask === true,
      spotNames,
      visible: layer.visible,
    };
  });
}

export function parseSpotWorkspaceSnapshot(
  value: string,
): SpotWorkspaceSnapshot | null {
  const parsed = JSON.parse(value) as unknown;

  if (!isRecord(parsed) || parsed.version !== 1) return null;
  if (!isRecord(parsed.asset) || !Array.isArray(parsed.layers)) return null;
  if (!isRecord(parsed.settings) || !isRecord(parsed.halftoneSettings)) {
    return null;
  }

  const layers = parsed.layers;
  const isValidLayer = layers.every((layer) => {
    if (!isRecord(layer)) return false;
    return (
      isString(layer.color) &&
      isString(layer.id) &&
      (layer.halftoneMaskBase64 === undefined ||
        isString(layer.halftoneMaskBase64)) &&
      isString(layer.maskBase64) &&
      isSpotLayerMode(layer.mode) &&
      isString(layer.name) &&
      (layer.sourceVectorMask === undefined ||
        isBoolean(layer.sourceVectorMask)) &&
      (layer.spotNames === undefined ||
        (Array.isArray(layer.spotNames) &&
          layer.spotNames.every(isSpotName))) &&
      (layer.chokeBleedMm === undefined || isNumber(layer.chokeBleedMm)) &&
      isBoolean(layer.visible)
    );
  });

  if (!isValidLayer) return null;

  return parsed as SpotWorkspaceSnapshot;
}

export function getSpotWorkspaceStorageKey(asset: RasterizedSpotAsset): string {
  return `admin.spotColors.workspace.${asset.sourceFingerprint}`;
}

export function exportPdfSourceSpotPdf(params: {
  asset: RasterizedSpotAsset;
  layers: readonly SpotPdfSourceExportLayer[];
  maskMode: SpotMaskExportMode;
  title: string;
}): Promise<Uint8Array> {
  const layers = params.layers.map((layer) => ({
    color: layer.color,
    mask: Array.from(layer.mask),
    mode: layer.mode,
    sourceVectorMask: layer.sourceVectorMask,
    spotName: layer.spotName,
  }));

  return exportSpotPdfForPdfSource(
    params.asset.sourceBytes,
    JSON.stringify({
      height: params.asset.height,
      layers,
      maskMode: params.maskMode,
      pageHeightPt: params.asset.pageHeightPt,
      pageWidthPt: params.asset.pageWidthPt,
      title: params.title,
      width: params.asset.width,
    }),
  );
}

export function getAdjustedSpotLayerMask(params: {
  asset: RasterizedSpotAsset;
  layer: SpotLayer;
}): Uint8Array {
  const { asset, layer } = params;

  return adjustSpotMask({
    chokeBleedMm: layer.chokeBleedMm,
    height: asset.height,
    mask: getCombinedSpotLayerMask(layer),
    pageHeightPt: asset.pageHeightPt,
    pageWidthPt: asset.pageWidthPt,
    width: asset.width,
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("error", () => {
      reject(request.error ?? new Error("IndexedDB request failed."));
    });
    request.addEventListener("success", () => resolve(request.result));
  });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("abort", () => {
      reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
    });
    transaction.addEventListener("error", () => {
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    });
    transaction.addEventListener("complete", () => resolve());
  });
}

function openSpotWorkspaceDatabase(): Promise<IDBDatabase> {
  if (!globalThis.indexedDB) {
    return Promise.reject(new Error("IndexedDB is not available."));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(
      SPOT_WORKSPACE_DB_NAME,
      SPOT_WORKSPACE_DB_VERSION,
    );

    request.addEventListener("error", () => {
      reject(request.error ?? new Error("Failed to open IndexedDB."));
    });
    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(SPOT_WORKSPACE_STORE_NAME)) {
        database.createObjectStore(SPOT_WORKSPACE_STORE_NAME, {
          keyPath: "key",
        });
      }
    });
    request.addEventListener("success", () => resolve(request.result));
  });
}

export async function saveSpotWorkspaceSnapshot(params: {
  asset: RasterizedSpotAsset;
  snapshot: SpotWorkspaceSnapshot;
}): Promise<void> {
  const database = await openSpotWorkspaceDatabase();

  try {
    const transaction = database.transaction(
      SPOT_WORKSPACE_STORE_NAME,
      "readwrite",
    );
    const record: SpotWorkspaceStorageRecord = {
      key: getSpotWorkspaceStorageKey(params.asset),
      updatedAt: new Date().toISOString(),
      value: JSON.stringify(params.snapshot),
    };
    transaction.objectStore(SPOT_WORKSPACE_STORE_NAME).put(record);
    await waitForTransaction(transaction);
  } finally {
    database.close();
  }
}

export async function loadSpotWorkspaceSnapshot(
  asset: RasterizedSpotAsset,
): Promise<SpotWorkspaceSnapshot | null> {
  const key = getSpotWorkspaceStorageKey(asset);
  const database = await openSpotWorkspaceDatabase();

  try {
    const transaction = database.transaction(
      SPOT_WORKSPACE_STORE_NAME,
      "readonly",
    );
    const request = transaction.objectStore(SPOT_WORKSPACE_STORE_NAME).get(key);
    const record = (await requestToPromise(request)) as
      | SpotWorkspaceStorageRecord
      | undefined;
    await waitForTransaction(transaction);

    if (record) {
      return parseSpotWorkspaceSnapshot(record.value);
    }
  } finally {
    database.close();
  }

  const storedSnapshot = localStorage.getItem(key);
  const snapshot = storedSnapshot
    ? parseSpotWorkspaceSnapshot(storedSnapshot)
    : null;

  if (snapshot) {
    await saveSpotWorkspaceSnapshot({ asset, snapshot });
    localStorage.removeItem(key);
  }

  return snapshot;
}
