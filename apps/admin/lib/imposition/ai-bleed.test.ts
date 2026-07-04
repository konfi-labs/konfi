import { bleedType } from "@konfi/types";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { IMPOSITION_WARNING_CODES } from "./warnings";

vi.mock("server-only", () => ({}));

const mockGenerateText = vi.fn();
const mockVertexModel = vi.fn((model: string) => `vertex:${model}`);
const mockRasterizePdfFirstPageToPng = vi.fn();
const mockFinalizeAiUsage = vi.fn();
const mockReleaseAiUsageReservation = vi.fn();
const mockReserveAiUsage = vi.fn();

vi.mock("ai", () => ({
  generateText: (params: unknown) => mockGenerateText(params),
}));

vi.mock("@/lib/ai/server-vertex", () => ({
  getVertexClient: () => mockVertexModel,
}));

vi.mock("@/lib/ai/usage-metering", () => ({
  finalizeAiUsage: (params: unknown) => mockFinalizeAiUsage(params),
  releaseAiUsageReservation: (params: unknown) =>
    mockReleaseAiUsageReservation(params),
  reserveAiUsage: (params: unknown) => mockReserveAiUsage(params),
}));

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: () => ({}),
  getTenantContext: () => ({
    deploymentMode: "dedicated",
    tenantId: "tenant-1",
  }),
}));

vi.mock("./pdf-rasterize", () => ({
  rasterizePdfFirstPageToPng: (params: unknown) =>
    mockRasterizePdfFirstPageToPng(params),
}));

let prepareImpositionInputForAiBleed: (typeof import("./ai-bleed"))["prepareImpositionInputForAiBleed"];
let calculateBleedInsetsPx: (typeof import("./ai-bleed"))["calculateBleedInsetsPx"];

async function createEdgePatternPngBuffer(params: {
  width: number;
  height: number;
  left: { r: number; g: number; b: number; alpha?: number };
  right: { r: number; g: number; b: number; alpha?: number };
  top: { r: number; g: number; b: number; alpha?: number };
  bottom: { r: number; g: number; b: number; alpha?: number };
  center: { r: number; g: number; b: number; alpha?: number };
}): Promise<Buffer> {
  const { width, height, left, right, top, bottom, center } = params;
  const data = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const color =
        x === 0
          ? left
          : x === width - 1
            ? right
            : y === 0
              ? top
              : y === height - 1
                ? bottom
                : center;

      data[offset] = color.r;
      data[offset + 1] = color.g;
      data[offset + 2] = color.b;
      data[offset + 3] = Math.round((color.alpha ?? 1) * 255);
    }
  }

  return sharp(data, {
    raw: {
      width,
      height,
      channels: 4,
    },
    limitInputPixels: false,
  })
    .png()
    .toBuffer();
}

async function createPngBuffer(params: {
  width: number;
  height: number;
  color: { r: number; g: number; b: number; alpha?: number };
}): Promise<Buffer> {
  const { width, height, color } = params;

  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: {
        r: color.r,
        g: color.g,
        b: color.b,
        alpha: color.alpha ?? 1,
      },
    },
  })
    .png()
    .toBuffer();
}

async function readRgbaPixel(params: {
  buffer: Buffer | Uint8Array;
  x: number;
  y: number;
}): Promise<{ r: number; g: number; b: number; alpha: number }> {
  const { buffer, x, y } = params;
  const { data, info } = await sharp(Buffer.from(buffer), {
    limitInputPixels: false,
  })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixelOffset = (y * info.width + x) * info.channels;

  return {
    r: data[pixelOffset] ?? 0,
    g: data[pixelOffset + 1] ?? 0,
    b: data[pixelOffset + 2] ?? 0,
    alpha: data[pixelOffset + 3] ?? 0,
  };
}

describe("prepareImpositionInputForAiBleed", () => {
  beforeAll(async () => {
    ({ prepareImpositionInputForAiBleed, calculateBleedInsetsPx } =
      await import("./ai-bleed"));
  });

  beforeEach(() => {
    mockGenerateText.mockReset();
    mockVertexModel.mockClear();
    mockRasterizePdfFirstPageToPng.mockReset();
    mockFinalizeAiUsage.mockReset();
    mockReleaseAiUsageReservation.mockReset();
    mockReserveAiUsage.mockReset();
    mockReserveAiUsage.mockResolvedValue({
      id: "reservation-1",
      tenantId: "tenant-1",
    });
  });

  it("preprocesses image batches and normalizes the payload to bleed included", async () => {
    const sourceBuffer = await createPngBuffer({
      width: 1000,
      height: 500,
      color: { r: 220, g: 80, b: 80 },
    });
    const aiBuffer = await createPngBuffer({
      width: 1060,
      height: 560,
      color: { r: 80, g: 120, b: 240 },
    });

    mockGenerateText.mockResolvedValue({
      files: [{ mediaType: "image/png", uint8Array: new Uint8Array(aiBuffer) }],
    });

    const payload = {
      bleedType: bleedType.DIFFERENTIAL_DIFFUSION,
      bleed: 3,
      customItemSizeWidth: 100,
      customItemSizeHeight: 50,
    };

    const result = await prepareImpositionInputForAiBleed({
      payload,
      files: [
        {
          bytes: new Uint8Array(sourceBuffer),
          contentType: "image/png",
          filename: "card.png",
        },
      ],
    });

    expect(result.payload.bleedType).toBe(bleedType.BLEED_INCLUDED);
    expect(result.payload.bleed).toBe(3);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].contentType).toBe("image/png");
    expect(result.files[0].filename).toBe("card-ai-bleed.png");
    expect(result.warnings).toEqual([]);
    expect(mockVertexModel).toHaveBeenCalledWith("gemini-3.1-flash-image");
    expect(mockGenerateText).toHaveBeenCalledTimes(1);

    const call = mockGenerateText.mock.calls[0][0] as {
      prompt: Array<{
        content: Array<
          | { type: "text"; text: string }
          | { type: "image"; image: string; mimeType: string }
        >;
      }>;
      providerOptions: {
        vertex: {
          responseModalities?: string[];
        };
      };
    };

    const promptContent = call.prompt[0]?.content ?? [];
    const promptText = promptContent.find(
      (entry): entry is { type: "text"; text: string } => entry.type === "text",
    );
    const promptImages = promptContent.filter(
      (entry): entry is { type: "image"; image: string; mimeType: string } =>
        entry.type === "image",
    );

    expect(promptText?.text).toMatch(/bleed/i);
    expect(promptText?.text).toMatch(/green/i);
    expect(promptImages).toHaveLength(1);
    expect(call.providerOptions.vertex.responseModalities).toEqual([
      "TEXT",
      "IMAGE",
    ]);

    const workingCanvasMetadata = await sharp(
      Buffer.from(promptImages[0].image, "base64"),
      { limitInputPixels: false },
    ).metadata();
    expect(workingCanvasMetadata.width).toBe(1060);
    expect(workingCanvasMetadata.height).toBe(560);

    const workingCanvasLeftPixel = await readRgbaPixel({
      buffer: Buffer.from(promptImages[0].image, "base64"),
      x: 0,
      y: 280,
    });
    const workingCanvasRightPixel = await readRgbaPixel({
      buffer: Buffer.from(promptImages[0].image, "base64"),
      x: 1059,
      y: 280,
    });

    expect(workingCanvasLeftPixel).toEqual({
      r: 0,
      g: 255,
      b: 0,
      alpha: 255,
    });
    expect(workingCanvasRightPixel).toEqual({
      r: 0,
      g: 255,
      b: 0,
      alpha: 255,
    });

    const workingCanvasCenterPixel = await readRgbaPixel({
      buffer: Buffer.from(promptImages[0].image, "base64"),
      x: 530,
      y: 280,
    });

    expect(workingCanvasCenterPixel).toEqual({
      r: 220,
      g: 80,
      b: 80,
      alpha: 255,
    });

    const metadata = await sharp(Buffer.from(result.files[0].bytes)).metadata();
    expect(metadata.width).toBe(1060);
    expect(metadata.height).toBe(560);
  });

  it("keeps side bleed opaque when the model returns the seed canvas unchanged", async () => {
    const sourceBuffer = await createPngBuffer({
      width: 1000,
      height: 500,
      color: { r: 220, g: 80, b: 80 },
    });

    mockGenerateText.mockImplementation(async (params: unknown) => {
      const { prompt } = params as {
        prompt: Array<{
          content: Array<
            | { type: "text"; text: string }
            | { type: "image"; image: string; mimeType: string }
          >;
        }>;
      };

      const promptImages = (prompt[0]?.content ?? []).filter(
        (entry): entry is { type: "image"; image: string; mimeType: string } =>
          entry.type === "image",
      );

      return {
        files: [
          {
            mediaType: "image/png",
            uint8Array: new Uint8Array(
              Buffer.from(promptImages[0]?.image ?? "", "base64"),
            ),
          },
        ],
      };
    });

    const payload = {
      bleedType: bleedType.DIFFERENTIAL_DIFFUSION,
      bleed: 3,
      customItemSizeWidth: 100,
      customItemSizeHeight: 50,
    };

    const result = await prepareImpositionInputForAiBleed({
      payload,
      files: [
        {
          bytes: new Uint8Array(sourceBuffer),
          contentType: "image/png",
          filename: "card.png",
        },
      ],
    });

    const leftPixel = await readRgbaPixel({
      buffer: result.files[0].bytes,
      x: 0,
      y: 280,
    });
    const rightPixel = await readRgbaPixel({
      buffer: result.files[0].bytes,
      x: 1059,
      y: 280,
    });

    expect(leftPixel).toEqual({
      r: 220,
      g: 80,
      b: 80,
      alpha: 255,
    });
    expect(rightPixel).toEqual({
      r: 220,
      g: 80,
      b: 80,
      alpha: 255,
    });
  });

  it("keeps exact edge colors when reduced working resolution is used", async () => {
    const sourceBuffer = await createEdgePatternPngBuffer({
      width: 2400,
      height: 1200,
      left: { r: 255, g: 0, b: 0 },
      right: { r: 0, g: 255, b: 0 },
      top: { r: 0, g: 0, b: 255 },
      bottom: { r: 255, g: 255, b: 0 },
      center: { r: 120, g: 80, b: 220 },
    });

    mockGenerateText.mockImplementation(async (params: unknown) => {
      const { prompt } = params as {
        prompt: Array<{
          content: Array<
            | { type: "text"; text: string }
            | { type: "image"; image: string; mimeType: string }
          >;
        }>;
      };

      const promptImages = (prompt[0]?.content ?? []).filter(
        (entry): entry is { type: "image"; image: string; mimeType: string } =>
          entry.type === "image",
      );

      return {
        files: [
          {
            mediaType: "image/png",
            uint8Array: new Uint8Array(
              Buffer.from(promptImages[0]?.image ?? "", "base64"),
            ),
          },
        ],
      };
    });

    const payload = {
      bleedType: bleedType.DIFFERENTIAL_DIFFUSION,
      bleed: 3,
      customItemSizeWidth: 100,
      customItemSizeHeight: 50,
    };

    const result = await prepareImpositionInputForAiBleed({
      payload,
      files: [
        {
          bytes: new Uint8Array(sourceBuffer),
          contentType: "image/png",
          filename: "poster.png",
        },
      ],
    });

    expect(result.warnings).toEqual([
      {
        code: IMPOSITION_WARNING_CODES.AI_BLEED_REDUCED_WORKING_RESOLUTION,
        values: {
          filename: "poster.png",
        },
      },
    ]);

    const leftBleedPixel = await readRgbaPixel({
      buffer: result.files[0].bytes,
      x: 0,
      y: 600,
    });
    const rightBleedPixel = await readRgbaPixel({
      buffer: result.files[0].bytes,
      x: 2543,
      y: 600,
    });
    const topBleedPixel = await readRgbaPixel({
      buffer: result.files[0].bytes,
      x: 1272,
      y: 0,
    });
    const bottomBleedPixel = await readRgbaPixel({
      buffer: result.files[0].bytes,
      x: 1272,
      y: 1271,
    });

    expect(leftBleedPixel).toEqual({
      r: 255,
      g: 0,
      b: 0,
      alpha: 255,
    });
    expect(rightBleedPixel).toEqual({
      r: 0,
      g: 255,
      b: 0,
      alpha: 255,
    });
    expect(topBleedPixel).toEqual({
      r: 0,
      g: 0,
      b: 255,
      alpha: 255,
    });
    expect(bottomBleedPixel).toEqual({
      r: 255,
      g: 255,
      b: 0,
      alpha: 255,
    });
  });

  it("falls back to the original batch when any file is unsupported", async () => {
    const payload = {
      bleedType: bleedType.DIFFERENTIAL_DIFFUSION,
      bleed: 3,
      customItemSizeWidth: 100,
      customItemSizeHeight: 50,
    };

    const sourceBuffer = await createPngBuffer({
      width: 100,
      height: 50,
      color: { r: 240, g: 240, b: 240 },
    });
    const unsupportedBytes = new Uint8Array([0x54, 0x45, 0x58, 0x54]);

    const result = await prepareImpositionInputForAiBleed({
      payload,
      files: [
        {
          bytes: new Uint8Array(sourceBuffer),
          contentType: "image/png",
          filename: "card.png",
        },
        {
          bytes: unsupportedBytes,
          contentType: "text/plain",
          filename: "notes.txt",
        },
      ],
    });

    expect(result.payload.bleedType).toBe(bleedType.DIFFERENTIAL_DIFFUSION);
    expect(result.files[1].filename).toBe("notes.txt");
    expect(result.warnings).toEqual([
      {
        code: IMPOSITION_WARNING_CODES.AI_BLEED_UNSUPPORTED_BATCH_FILE_TYPE,
        values: {
          filename: "notes.txt",
        },
      },
    ]);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("rasterizes PDFs before generating bleed", async () => {
    const rasterizedPdfBuffer = await createPngBuffer({
      width: 1000,
      height: 500,
      color: { r: 220, g: 80, b: 80 },
    });
    const aiBuffer = await createPngBuffer({
      width: 1060,
      height: 560,
      color: { r: 80, g: 120, b: 240 },
    });

    mockRasterizePdfFirstPageToPng.mockResolvedValue(
      new Uint8Array(rasterizedPdfBuffer),
    );
    mockGenerateText.mockResolvedValue({
      files: [{ mediaType: "image/png", uint8Array: new Uint8Array(aiBuffer) }],
    });

    const payload = {
      bleedType: bleedType.DIFFERENTIAL_DIFFUSION,
      bleed: 3,
      customItemSizeWidth: 100,
      customItemSizeHeight: 50,
    };

    const result = await prepareImpositionInputForAiBleed({
      payload,
      files: [
        {
          bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
          contentType: "application/pdf",
          filename: "sheet.pdf",
        },
      ],
    });

    expect(mockRasterizePdfFirstPageToPng).toHaveBeenCalledTimes(1);
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    expect(result.payload.bleedType).toBe(bleedType.BLEED_INCLUDED);
    expect(result.files[0]?.filename).toBe("sheet-ai-bleed.png");
    expect(result.files[0]?.contentType).toBe("image/png");
  });

  it("processes mixed portrait and landscape image batches", async () => {
    const landscapeBuffer = await createPngBuffer({
      width: 1000,
      height: 500,
      color: { r: 220, g: 80, b: 80 },
    });
    const portraitBuffer = await createPngBuffer({
      width: 500,
      height: 1000,
      color: { r: 80, g: 220, b: 120 },
    });
    const landscapeAiBuffer = await createPngBuffer({
      width: 1060,
      height: 560,
      color: { r: 80, g: 120, b: 240 },
    });
    const portraitAiBuffer = await createPngBuffer({
      width: 560,
      height: 1060,
      color: { r: 240, g: 160, b: 80 },
    });

    mockGenerateText
      .mockResolvedValueOnce({
        files: [
          {
            mediaType: "image/png",
            uint8Array: new Uint8Array(landscapeAiBuffer),
          },
        ],
      })
      .mockResolvedValueOnce({
        files: [
          {
            mediaType: "image/png",
            uint8Array: new Uint8Array(portraitAiBuffer),
          },
        ],
      });

    const payload = {
      bleedType: bleedType.DIFFERENTIAL_DIFFUSION,
      bleed: 3,
      customItemSizeWidth: 100,
      customItemSizeHeight: 50,
    };

    const result = await prepareImpositionInputForAiBleed({
      payload,
      files: [
        {
          bytes: new Uint8Array(landscapeBuffer),
          contentType: "image/png",
          filename: "landscape.png",
        },
        {
          bytes: new Uint8Array(portraitBuffer),
          contentType: "image/png",
          filename: "portrait.png",
        },
      ],
    });

    expect(result.payload.bleedType).toBe(bleedType.BLEED_INCLUDED);
    expect(result.files).toHaveLength(2);
    expect(result.files.map((file) => file.filename)).toEqual([
      "landscape-ai-bleed.png",
      "portrait-ai-bleed.png",
    ]);
    expect(result.warnings).toEqual([]);
    expect(mockGenerateText).toHaveBeenCalledTimes(2);

    const landscapeMetadata = await sharp(
      Buffer.from(result.files[0].bytes),
    ).metadata();
    const portraitMetadata = await sharp(
      Buffer.from(result.files[1].bytes),
    ).metadata();

    expect(landscapeMetadata.width).toBe(1060);
    expect(landscapeMetadata.height).toBe(560);
    expect(portraitMetadata.width).toBe(560);
    expect(portraitMetadata.height).toBe(1060);
  });

  it("falls back with a Vertex configuration warning when AI bleed is unavailable", async () => {
    const sourceBuffer = await createPngBuffer({
      width: 1000,
      height: 500,
      color: { r: 220, g: 80, b: 80 },
    });

    mockGenerateText.mockRejectedValue(
      new Error("Missing ADMIN_FIREBASE_CLIENT_EMAIL for Vertex AI."),
    );

    const payload = {
      bleedType: bleedType.DIFFERENTIAL_DIFFUSION,
      bleed: 3,
      customItemSizeWidth: 100,
      customItemSizeHeight: 50,
    };

    const result = await prepareImpositionInputForAiBleed({
      payload,
      files: [
        {
          bytes: new Uint8Array(sourceBuffer),
          contentType: "image/png",
          filename: "card.png",
        },
      ],
    });

    expect(result.payload.bleedType).toBe(bleedType.DIFFERENTIAL_DIFFUSION);
    expect(result.files[0].filename).toBe("card.png");
    expect(result.warnings).toEqual([
      {
        code: IMPOSITION_WARNING_CODES.AI_BLEED_FALLBACK_VERTEX_CONFIG_INCOMPLETE,
      },
    ]);
  });

  it("calculates horizontal and vertical bleed in pixels from item millimeters", () => {
    expect(
      calculateBleedInsetsPx({
        bleedMm: 3,
        itemWidthMm: 100,
        itemHeightMm: 50,
        sourceWidthPx: 1000,
        sourceHeightPx: 500,
      }),
    ).toEqual({
      left: 30,
      right: 30,
      top: 30,
      bottom: 30,
    });
  });
});
