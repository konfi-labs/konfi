import { describe, expect, it, vi } from "vitest";
import type { RasterizedSpotAsset, SpotLayer } from "./spot-color-client";
import { exportSpotPdf } from "./spot-pdf-export";

vi.mock("./spot-color-client", () => ({
  exportPdfSourceSpotPdf: vi.fn(),
  getAdjustedSpotLayerMask: ({ layer }: { layer: SpotLayer; }) => {
    if (!layer.halftoneMask) {
      return layer.mask;
    }

    return Uint8Array.from(layer.mask, (value, index) =>
      Math.max(value, layer.halftoneMask?.[index] ?? 0),
    );
  },
  getCombinedSpotLayerMask: (layer: SpotLayer) => {
    if (!layer.halftoneMask) {
      return layer.mask;
    }

    return Uint8Array.from(layer.mask, (value, index) =>
      Math.max(value, layer.halftoneMask?.[index] ?? 0),
    );
  },
}));

const asset: RasterizedSpotAsset = {
  artworkMask: new Uint8Array([255]),
  contentType: "image/png",
  dataUrl: "data:image/png;base64,",
  filename: "spot-source.png",
  height: 1,
  pageHeightPt: 72,
  pageWidthPt: 72,
  rgba: new Uint8Array([255, 255, 255, 255]),
  sourceBytes: new Uint8Array(),
  sourceFingerprint: "spot-source",
  width: 1,
};

const layers: SpotLayer[] = [
  {
    chokeBleedMm: 0,
    color: "#ffffff",
    halftoneMask: new Uint8Array([128]),
    id: "white",
    mask: new Uint8Array([0]),
    mode: "overprint",
    name: "WHITE",
    sourceVectorMask: false,
    spotNames: ["Spot_1"],
    visible: true,
  },
];

async function exportPdfText(maskMode: "binary" | "tint"): Promise<string> {
  const bytes = await exportSpotPdf({
    asset,
    layers,
    maskMode,
    profileId: "spot-1-red-spot-2-blue",
  });

  return new TextDecoder().decode(bytes);
}

function findBytes(bytes: Uint8Array, pattern: string, start = 0): number {
  const patternBytes = new TextEncoder().encode(pattern);

  for (
    let index = start;
    index <= bytes.length - patternBytes.length;
    index += 1
  ) {
    if (patternBytes.every((byte, offset) => bytes[index + offset] === byte)) {
      return index;
    }
  }

  return -1;
}

function firstImageMaskStreamByte(bytes: Uint8Array): number {
  const imageMaskIndex = findBytes(bytes, "/ImageMask true");
  const streamIndex = findBytes(bytes, "stream\n", imageMaskIndex);

  if (streamIndex < 0) {
    throw new Error("Image mask stream not found.");
  }

  return bytes[streamIndex + "stream\n".length];
}

describe("exportSpotPdf", () => {
  it("exports binary spot masks as thresholded one-bit image masks", async () => {
    const pdfText = await exportPdfText("binary");

    expect(pdfText).toContain("/ImageMask true");
    expect(pdfText).toContain("/BitsPerComponent 1");
    expect(pdfText).toContain("/Decode [1 0]");
  });

  it("exports tint spot masks as eight-bit separation images", async () => {
    const pdfText = await exportPdfText("tint");

    expect(pdfText).toContain("/ColorSpace /SpotCS1");
    expect(pdfText).toContain("/BitsPerComponent 8");
    expect(pdfText).toContain("/Decode [0 1]");
  });

  it("draws spot masks behind the process image", async () => {
    const pdfText = await exportPdfText("binary");

    expect(pdfText.indexOf("/SpotMask1 Do")).toBeGreaterThanOrEqual(0);
    expect(pdfText.indexOf("/SpotMask1 Do")).toBeLessThan(
      pdfText.indexOf("/Process Do"),
    );
  });

  it("does not promote low-alpha antialias pixels in binary masks", async () => {
    const bytes = await exportSpotPdf({
      asset: {
        ...asset,
        pageWidthPt: 144,
        rgba: new Uint8Array([255, 255, 255, 255, 255, 255, 255, 255]),
        width: 2,
      },
      layers: [
        {
          ...layers[0],
          halftoneMask: undefined,
          mask: new Uint8Array([127, 128]),
        },
      ],
      maskMode: "binary",
      profileId: "spot-1-red-spot-2-blue",
    });

    expect(firstImageMaskStreamByte(bytes)).toBe(0b0100_0000);
  });
});
