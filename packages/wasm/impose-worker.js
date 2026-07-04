/**
 * Web Worker for all blocking WASM operations.
 *
 * All synchronous wasm-bindgen calls (impose, page count, preflight, …) run
 * here so the main thread stays fully interactive.  Results are sent back via
 * postMessage; large byte buffers are transferred (zero-copy) where possible.
 */
import {
  createStickerImpositionArtifacts as createStickerImpositionArtifactsRaw,
  detectSourceBoxMismatch as detectSourceBoxMismatchRaw,
  getPdfPageCount as getPdfPageCountRaw,
  imposePdfFile as imposePdfFileRaw,
  inspectPdfCutLineCandidates as inspectPdfCutLineCandidatesRaw,
  inspectImagePreflight as inspectImagePreflightRaw,
  inspectPdfPreflight as inspectPdfPreflightRaw,
  resolveStickerImpositionPreview as resolveStickerImpositionPreviewRaw,
  default as initWasm,
} from "./dist-web/wasm.js";

const DEFAULT_WASM_PATH = "/wasm/wasm_bg.wasm";
let initPromise = null;

function parseJsonPayload(label, payload) {
  try {
    return JSON.parse(payload);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to parse ${label} JSON: ${error.message}`, {
        cause: error,
      });
    }

    throw new Error(`Failed to parse ${label} JSON: ${String(error)}`, {
      cause: error,
    });
  }
}

function resolveInitInput(input) {
  if (typeof input === "string" && input.startsWith("/")) {
    return new URL(input, self.location.origin);
  }

  return input;
}

async function init(input = DEFAULT_WASM_PATH) {
  if (!initPromise) {
    initPromise = initWasm({
      module_or_path: resolveInitInput(input),
    }).then(() => undefined);
  }

  return initPromise;
}

function normalizeImpositionRequest(request) {
  if (typeof request === "string") {
    return request;
  }

  if (!request || typeof request !== "object") {
    throw new Error("Imposition request must be a JSON string or object.");
  }

  if ("data" in request && !request.data) {
    throw new Error("Imposition request data is required.");
  }

  return JSON.stringify(request);
}

function normalizeStickerImpositionRequest(request) {
  if (typeof request === "string") {
    return request;
  }

  if (!request || typeof request !== "object") {
    throw new Error(
      "Sticker imposition request must be a JSON string or object.",
    );
  }

  return JSON.stringify(request);
}

async function imposePdfFileToBytes({ request, bytes, contentType }) {
  await init();
  return imposePdfFileRaw(
    normalizeImpositionRequest(request),
    bytes,
    contentType,
  );
}

function detectSourceBoxMismatchSafely(requestJson, bytes, contentType) {
  try {
    return detectSourceBoxMismatchRaw(requestJson, bytes, contentType);
  } catch {
    return false;
  }
}

async function getPdfPageCount(bytes) {
  await init();
  return Number.parseInt(getPdfPageCountRaw(bytes), 10);
}

async function inspectPdfPreflightFromBytes(bytes) {
  await init();
  return parseJsonPayload(
    "PDF preflight issues",
    inspectPdfPreflightRaw(bytes),
  );
}

async function inspectPdfCutLineCandidatesFromBytes(bytes) {
  await init();
  return parseJsonPayload(
    "PDF cut-line candidates",
    inspectPdfCutLineCandidatesRaw(bytes),
  );
}

async function inspectImagePreflightFromBytes(bytes, contentType) {
  await init();
  return parseJsonPayload(
    "image preflight issues",
    inspectImagePreflightRaw(bytes, contentType),
  );
}

async function resolveStickerImpositionPreview(request) {
  await init();
  return parseJsonPayload(
    "sticker imposition preview",
    resolveStickerImpositionPreviewRaw(
      normalizeStickerImpositionRequest(request),
    ),
  );
}

async function createStickerArtifactsJson(requestJson) {
  await init();
  return createStickerImpositionArtifactsRaw(requestJson);
}

function toOwnedBuffer(bytes) {
  if (
    bytes instanceof Uint8Array &&
    bytes.byteOffset === 0 &&
    bytes.byteLength === bytes.buffer.byteLength
  ) {
    return bytes.buffer;
  }
  // Copy into a fresh buffer so we can transfer it.
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
}

self.onmessage = async function (event) {
  const { op, id } = event.data;

  try {
    switch (op) {
      case "impose": {
        const { requestJson, buffer, contentType, filename, fileIndex } =
          event.data;
        const inputBytes = new Uint8Array(buffer);
        const outputBytes = await imposePdfFileToBytes({
          request: requestJson,
          bytes: inputBytes,
          contentType,
        });
        const boxMismatch = detectSourceBoxMismatchSafely(
          normalizeImpositionRequest(requestJson),
          inputBytes,
          contentType,
        );
        const transferBuffer = toOwnedBuffer(outputBytes);
        self.postMessage(
          {
            type: "result",
            op,
            id,
            buffer: transferBuffer,
            boxMismatch,
            filename,
            fileIndex,
          },
          [transferBuffer],
        );
        break;
      }

      case "getPageCount": {
        const { buffer } = event.data;
        const bytes = new Uint8Array(buffer);
        const pageCount = await getPdfPageCount(bytes);
        self.postMessage({ type: "result", op, id, pageCount });
        break;
      }

      case "inspectPdf": {
        const { buffer } = event.data;
        const bytes = new Uint8Array(buffer);
        const issues = await inspectPdfPreflightFromBytes(bytes);
        self.postMessage({ type: "result", op, id, issues });
        break;
      }

      case "inspectPdfCutLines": {
        const { buffer } = event.data;
        const bytes = new Uint8Array(buffer);
        const candidates = await inspectPdfCutLineCandidatesFromBytes(bytes);
        self.postMessage({ type: "result", op, id, candidates });
        break;
      }

      case "inspectImage": {
        const { buffer, contentType } = event.data;
        const bytes = new Uint8Array(buffer);
        const issues = await inspectImagePreflightFromBytes(bytes, contentType);
        self.postMessage({ type: "result", op, id, issues });
        break;
      }

      case "createStickerArtifacts": {
        const { requestJson } = event.data;
        const artifactsJson = await createStickerArtifactsJson(requestJson);
        self.postMessage({ type: "result", op, id, artifactsJson });
        break;
      }

      case "resolveStickerPreview": {
        const { requestJson } = event.data;
        const preview = await resolveStickerImpositionPreview(requestJson);
        self.postMessage({ type: "result", op, id, preview });
        break;
      }

      default:
        self.postMessage({
          type: "error",
          op,
          id,
          message: `Unknown WASM worker operation: ${op}`,
        });
    }
  } catch (error) {
    self.postMessage({
      type: "error",
      op,
      id,
      message: error instanceof Error ? error.message : String(error),
      fileIndex: event.data.fileIndex,
      filename: event.data.filename,
    });
  }
};
