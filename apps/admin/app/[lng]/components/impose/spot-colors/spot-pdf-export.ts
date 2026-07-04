import {
  exportPdfSourceSpotPdf,
  getAdjustedSpotLayerMask,
  getCombinedSpotLayerMask,
  type RasterizedSpotAsset,
  type SpotLayer,
  type SpotMaskExportMode,
  type SpotName,
} from "./spot-color-client";
import { normalizeSpotChokeBleedMm } from "./spot-mask-adjustment";

export type SpotExportProfileId =
  | "black-spots"
  | "spot-1-red-spot-2-blue"
  | "varnish-spot-3-4-black";

export type SpotExportProfile = {
  colors: readonly string[];
  id: SpotExportProfileId;
};

export const SPOT_EXPORT_NAMES: readonly SpotName[] = [
  "Spot_1",
  "Spot_2",
  "Spot_3",
  "Spot_4",
] as const;

export const SPOT_EXPORT_PROFILES: readonly SpotExportProfile[] = [
  {
    colors: ["#ff0000", "#0000ff", "#000000", "#000000"],
    id: "spot-1-red-spot-2-blue",
  },
  {
    colors: ["#000000", "#000000", "#000000", "#000000"],
    id: "black-spots",
  },
  {
    colors: ["#000000", "#000000", "#000000", "#000000"],
    id: "varnish-spot-3-4-black",
  },
] as const;

function getSpotExportProfile(
  profileId: SpotExportProfileId,
): SpotExportProfile {
  return (
    SPOT_EXPORT_PROFILES.find((profile) => profile.id === profileId) ??
    SPOT_EXPORT_PROFILES[0]
  );
}

function hasPaintedPixels(mask: Uint8Array): boolean {
  return mask.some((value) => value > 0);
}

type ExportableSpotLayer = {
  layer: SpotLayer;
  spotName: SpotName;
};

export function getExportableSpotLayers(
  layers: readonly SpotLayer[],
): SpotLayer[] {
  return layers.filter(
    (layer) =>
      layer.visible &&
      layer.spotNames.length > 0 &&
      hasPaintedPixels(getCombinedSpotLayerMask(layer)),
  );
}

function getExportableSpotLayerEntries(
  layers: readonly SpotLayer[],
): ExportableSpotLayer[] {
  return getExportableSpotLayers(layers).flatMap((layer) =>
    layer.spotNames.map((spotName) => ({ layer, spotName })),
  );
}

export function getSpotExportColor(params: {
  spotName: SpotName;
  profileId: SpotExportProfileId;
}): string {
  const profile = getSpotExportProfile(params.profileId);
  const spotIndex = SPOT_EXPORT_NAMES.indexOf(params.spotName);
  return profile.colors[spotIndex] ?? "#000000";
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

function sanitizePdfFilename(filename: string): string {
  const withoutExtension = filename.replace(/\.[^.]+$/, "");
  const normalized = withoutExtension
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "spot-colors";
}

export function getSpotPdfExportFilename(asset: RasterizedSpotAsset): string {
  return `${sanitizePdfFilename(asset.filename)}-spot-colors.pdf`;
}

function escapePdfString(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

function escapePdfName(value: string): string {
  return value.replace(
    /[^a-zA-Z0-9_-]/g,
    (character) => `#${character.charCodeAt(0).toString(16).padStart(2, "0")}`,
  );
}

function decimal(value: number): string {
  if (Number.isInteger(value)) return value.toString();

  return Number(value.toFixed(4)).toString();
}

function normalizeRgbColor(color: string): [number, number, number] {
  const [red, green, blue] = parseHexColor(color);
  return [red / 255, green / 255, blue / 255];
}

function createRgbImageBytes(rgba: Uint8Array): Uint8Array {
  const rgb = new Uint8Array((rgba.length / 4) * 3);

  for (
    let rgbaIndex = 0, rgbIndex = 0;
    rgbaIndex < rgba.length;
    rgbaIndex += 4, rgbIndex += 3
  ) {
    rgb[rgbIndex] = rgba[rgbaIndex];
    rgb[rgbIndex + 1] = rgba[rgbaIndex + 1];
    rgb[rgbIndex + 2] = rgba[rgbaIndex + 2];
  }

  return rgb;
}

function createAlphaMaskBytes(rgba: Uint8Array): Uint8Array {
  const alpha = new Uint8Array(rgba.length / 4);

  for (
    let rgbaIndex = 3, alphaIndex = 0;
    rgbaIndex < rgba.length;
    rgbaIndex += 4, alphaIndex += 1
  ) {
    alpha[alphaIndex] = rgba[rgbaIndex];
  }

  return alpha;
}

function createOneBitMaskBytes(params: {
  height: number;
  mask: Uint8Array;
  width: number;
}): Uint8Array {
  const { height, mask, width } = params;
  const rowStride = Math.ceil(width / 8);
  const output = new Uint8Array(rowStride * height);

  for (let y = 0; y < height; y += 1) {
    const inputRowOffset = y * width;
    const outputRowOffset = y * rowStride;

    for (let x = 0; x < width; x += 1) {
      if (mask[inputRowOffset + x] < 128) continue;

      output[outputRowOffset + Math.floor(x / 8)] |= 0x80 >> (x % 8);
    }
  }

  return output;
}

function createTintMaskBytes(mask: Uint8Array): Uint8Array {
  return new Uint8Array(mask);
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }

  return output;
}

function createPdf(params: {
  objects: readonly {
    body?: string;
    stream?: { data: Uint8Array; dict: string };
  }[];
  rootObjectId: number;
}): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [
    encoder.encode("%PDF-1.4\n%\xD0\xD4\xC5\xD8\n"),
  ];
  const offsets = [0];
  let byteOffset = chunks[0].length;

  params.objects.forEach((object, index) => {
    offsets.push(byteOffset);
    const objectId = index + 1;
    const header = encoder.encode(`${objectId} 0 obj\n`);
    chunks.push(header);
    byteOffset += header.length;

    if (object.stream) {
      const streamHeader = encoder.encode(`${object.stream.dict}\nstream\n`);
      const streamFooter = encoder.encode("\nendstream\n");
      chunks.push(streamHeader, object.stream.data, streamFooter);
      byteOffset +=
        streamHeader.length + object.stream.data.length + streamFooter.length;
    } else {
      const body = encoder.encode(`${object.body ?? ""}\n`);
      chunks.push(body);
      byteOffset += body.length;
    }

    const footer = encoder.encode("endobj\n");
    chunks.push(footer);
    byteOffset += footer.length;
  });

  const xrefOffset = byteOffset;
  const xrefLines = [
    "xref",
    `0 ${params.objects.length + 1}`,
    "0000000000 65535 f ",
    ...offsets
      .slice(1)
      .map((offset) => `${offset.toString().padStart(10, "0")} 00000 n `),
    "trailer",
    `<< /Size ${params.objects.length + 1} /Root ${params.rootObjectId} 0 R /Info ${params.objects.length} 0 R >>`,
    "startxref",
    xrefOffset.toString(),
    "%%EOF",
    "",
  ];
  chunks.push(encoder.encode(xrefLines.join("\n")));

  return concatBytes(chunks);
}

export async function exportSpotPdf(params: {
  asset: RasterizedSpotAsset;
  layers: readonly SpotLayer[];
  maskMode: SpotMaskExportMode;
  profileId: SpotExportProfileId;
}): Promise<Uint8Array> {
  const { asset, layers, maskMode, profileId } = params;
  const layerMasks = new Map<string, Uint8Array>();
  const getExportMask = (layer: SpotLayer): Uint8Array => {
    const existingMask = layerMasks.get(layer.id);
    if (existingMask) return existingMask;

    const mask = getAdjustedSpotLayerMask({ asset, layer });
    layerMasks.set(layer.id, mask);
    return mask;
  };
  const exportableSpotLayers = getExportableSpotLayerEntries(layers).filter(
    (spotLayer) => hasPaintedPixels(getExportMask(spotLayer.layer)),
  );

  if (exportableSpotLayers.length === 0) {
    throw new Error("There are no visible painted spot layers to export.");
  }

  if (asset.contentType === "application/pdf") {
    return await exportPdfSourceSpotPdf({
      asset,
      layers: exportableSpotLayers.map((spotLayer) => ({
        color: getSpotExportColor({ profileId, spotName: spotLayer.spotName }),
        mask: getExportMask(spotLayer.layer),
        mode: spotLayer.layer.mode,
        sourceVectorMask:
          spotLayer.layer.sourceVectorMask &&
          normalizeSpotChokeBleedMm(spotLayer.layer.chokeBleedMm) === 0,
        spotName: spotLayer.spotName,
      })),
      maskMode,
      title: asset.filename,
    });
  }

  const pageWidth = decimal(asset.pageWidthPt);
  const pageHeight = decimal(asset.pageHeightPt);
  const objects: {
    body?: string;
    stream?: { data: Uint8Array; dict: string };
  }[] = [];
  const catalogObjectId = 1;
  const pagesObjectId = 2;
  const pageObjectId = 3;
  const contentObjectId = 4;
  const processImageObjectId = 5;
  const softMaskObjectId = 6;
  const firstSpotMaskObjectId = 7;
  const firstColorSpaceObjectId =
    firstSpotMaskObjectId + exportableSpotLayers.length;

  const xObjects = [
    `/Process ${processImageObjectId} 0 R`,
    ...exportableSpotLayers.map(
      (_spotLayer, index) =>
        `/SpotMask${index + 1} ${firstSpotMaskObjectId + index} 0 R`,
    ),
  ].join(" ");
  const colorSpaces = exportableSpotLayers
    .map(
      (_spotLayer, index) =>
        `/SpotCS${index + 1} ${firstColorSpaceObjectId + index} 0 R`,
    )
    .join(" ");
  const extGStates =
    "/SpotOverprint << /Type /ExtGState /OP true /op true /OPM 1 >>";

  const contentLines: string[] = [];

  exportableSpotLayers.forEach((spotLayer, index) => {
    contentLines.push(
      "q",
      ...(spotLayer.layer.mode === "overprint" ? ["/SpotOverprint gs"] : []),
      `${pageWidth} 0 0 ${pageHeight} 0 0 cm`,
      ...(maskMode === "binary" ? [`/SpotCS${index + 1} cs`, "1 scn"] : []),
      `/SpotMask${index + 1} Do`,
      "Q",
    );
  });

  contentLines.push(
    "q",
    `${pageWidth} 0 0 ${pageHeight} 0 0 cm`,
    "/Process Do",
    "Q",
  );

  const contentBytes = new TextEncoder().encode(contentLines.join("\n"));

  objects.push({
    body: `<< /Type /Catalog /Pages ${pagesObjectId} 0 R >>`,
  });
  objects.push({
    body: `<< /Type /Pages /Kids [${pageObjectId} 0 R] /Count 1 >>`,
  });
  objects.push({
    body: [
      "<< /Type /Page",
      `/Parent ${pagesObjectId} 0 R`,
      `/MediaBox [0 0 ${pageWidth} ${pageHeight}]`,
      `/Resources << /XObject << ${xObjects} >> /ColorSpace << ${colorSpaces} >> /ExtGState << ${extGStates} >> >>`,
      `/Contents ${contentObjectId} 0 R`,
      ">>",
    ].join(" "),
  });
  objects.push({
    stream: {
      data: contentBytes,
      dict: `<< /Length ${contentBytes.length} >>`,
    },
  });

  const rgbBytes = createRgbImageBytes(asset.rgba);
  objects.push({
    stream: {
      data: rgbBytes,
      dict: [
        "<< /Type /XObject /Subtype /Image",
        `/Width ${asset.width} /Height ${asset.height}`,
        "/ColorSpace /DeviceRGB /BitsPerComponent 8",
        `/SMask ${softMaskObjectId} 0 R`,
        `/Length ${rgbBytes.length}`,
        ">>",
      ].join(" "),
    },
  });

  const alphaBytes = createAlphaMaskBytes(asset.rgba);
  objects.push({
    stream: {
      data: alphaBytes,
      dict: [
        "<< /Type /XObject /Subtype /Image",
        `/Width ${asset.width} /Height ${asset.height}`,
        "/ColorSpace /DeviceGray /BitsPerComponent 8",
        `/Length ${alphaBytes.length}`,
        ">>",
      ].join(" "),
    },
  });

  exportableSpotLayers.forEach((spotLayer, index) => {
    const maskBytes =
      maskMode === "binary"
        ? createOneBitMaskBytes({
            height: asset.height,
            mask: getExportMask(spotLayer.layer),
            width: asset.width,
          })
        : createTintMaskBytes(getExportMask(spotLayer.layer));
    objects.push({
      stream: {
        data: maskBytes,
        dict:
          maskMode === "binary"
            ? [
                "<< /Type /XObject /Subtype /Image /ImageMask true",
                `/Width ${asset.width} /Height ${asset.height}`,
                "/BitsPerComponent 1 /Decode [1 0]",
                `/Length ${maskBytes.length}`,
                ">>",
              ].join(" ")
            : [
                "<< /Type /XObject /Subtype /Image",
                `/Width ${asset.width} /Height ${asset.height}`,
                `/ColorSpace /SpotCS${index + 1}`,
                "/BitsPerComponent 8 /Decode [0 1]",
                `/Length ${maskBytes.length}`,
                ">>",
              ].join(" "),
      },
    });
  });

  exportableSpotLayers.forEach((spotLayer) => {
    const spotName = spotLayer.spotName;
    const [red, green, blue] = normalizeRgbColor(
      getSpotExportColor({ profileId, spotName }),
    );

    objects.push({
      body: [
        "[/Separation",
        `/${escapePdfName(spotName)}`,
        "/DeviceRGB",
        `<< /FunctionType 2 /Domain [0 1] /C0 [1 1 1] /C1 [${decimal(red)} ${decimal(green)} ${decimal(blue)}] /N 1 >>`,
        "]",
      ].join(" "),
    });
  });

  objects.push({
    body: `<< /Title (${escapePdfString(asset.filename)}) /Producer (Konfi Spot Color Export) >>`,
  });

  return createPdf({
    objects,
    rootObjectId: catalogObjectId,
  });
}

export function downloadBytes(params: {
  bytes: Uint8Array;
  filename: string;
  type: string;
}): void {
  const blob = new Blob([params.bytes.slice()], { type: params.type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = params.filename;
  link.click();
  URL.revokeObjectURL(url);
}
