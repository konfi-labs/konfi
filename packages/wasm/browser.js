import {
  applySpotBrush as applySpotBrushRaw,
  createStickerImpositionArtifacts as createStickerImpositionArtifactsRaw,
  detectSourceBoxMismatch as detectSourceBoxMismatchRaw,
  exportSpotPdfForPdfSource as exportSpotPdfForPdfSourceRaw,
  exportPricingWorkbook,
  generateHalftoneMaskRgba as generateHalftoneMaskRgbaRaw,
  generateWhiteUnderbaseMaskRgba as generateWhiteUnderbaseMaskRgbaRaw,
  getPdfPageCount as getPdfPageCountRaw,
  imposePdfFile as imposePdfFileRaw,
  inspectPdfCutLineCandidates as inspectPdfCutLineCandidatesRaw,
  inspectImagePreflight as inspectImagePreflightRaw,
  inspectPdfPreflight as inspectPdfPreflightRaw,
  readPricingWorkbookJson,
  resolveImpositionPreview as resolveImpositionPreviewRaw,
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

function requestUsesFastContentAwareBleed(requestJson) {
  try {
    const request = JSON.parse(requestJson);
    const data =
      request && typeof request === "object" && request.data
        ? request.data
        : request;
    return data?.bleedType === "CONTENT_AWARE_FAST";
  } catch {
    return false;
  }
}

function resolveFileContentType(file) {
  return (
    file.contentType ||
    (typeof file.type === "string" ? file.type : "") ||
    "application/pdf"
  );
}

function isPdfContentType(contentType) {
  const normalized = String(contentType ?? "")
    .trim()
    .toLowerCase();
  return normalized === "application/pdf" || normalized === "application/x-pdf";
}

function contentAwareBleedFallbackWarning(filename) {
  return {
    code: "impose.warnings.contentAwareBleedFallbackMirror",
    values: { filename },
  };
}

function resolveInitInput(input) {
  if (typeof input === "string" && input.startsWith("/")) {
    return new URL(input, globalThis.location.origin);
  }

  return input;
}

export async function init(input = DEFAULT_WASM_PATH) {
  if (!initPromise) {
    initPromise = initWasm({
      module_or_path: resolveInitInput(input),
    }).then(() => undefined);
  }

  return initPromise;
}

export async function readPricingWorkbookJsonFromBytes(bytes) {
  await init();

  return JSON.parse(readPricingWorkbookJson(bytes));
}

// ---------------------------------------------------------------------------
// Worker helpers — routes blocking WASM calls off the main thread
// ---------------------------------------------------------------------------

let workerIdCounter = 0;

/**
 * Runs a single WASM operation in a short-lived Worker.
 * `transferList` should contain every ArrayBuffer that should be transferred
 * (not copied) to the worker — the caller must not use them afterwards.
 */
function runInWorker(message, transferList = []) {
  return new Promise((resolve, reject) => {
    const id = ++workerIdCounter;
    const worker = new Worker(new URL("./impose-worker.js", import.meta.url), {
      type: "module",
    });

    function onMessage(event) {
      if (event.data.id !== id) return;
      worker.terminate();
      if (event.data.type === "result") {
        resolve(event.data);
      } else {
        reject(new Error(event.data.message ?? "WASM worker error"));
      }
    }

    function onError(event) {
      worker.terminate();
      reject(new Error(event.message ?? "WASM worker error"));
    }

    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    worker.postMessage({ ...message, id }, transferList);
  });
}

function toTransferBuffer(bytes) {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
}

export async function getPdfPageCount(bytes) {
  // Fast-path: if already running inside a worker, call WASM directly.
  if (
    typeof WorkerGlobalScope !== "undefined" &&
    self instanceof WorkerGlobalScope
  ) {
    await init();
    return parseInt(getPdfPageCountRaw(bytes), 10);
  }

  const transferBuffer = toTransferBuffer(bytes);
  const result = await runInWorker(
    { op: "getPageCount", buffer: transferBuffer },
    [transferBuffer],
  );
  return result.pageCount;
}

export async function inspectPdfPreflightFromBytes(bytes) {
  if (
    typeof WorkerGlobalScope !== "undefined" &&
    self instanceof WorkerGlobalScope
  ) {
    await init();
    return parseJsonPayload(
      "PDF preflight issues",
      inspectPdfPreflightRaw(bytes),
    );
  }

  const transferBuffer = toTransferBuffer(bytes);
  const result = await runInWorker(
    { op: "inspectPdf", buffer: transferBuffer },
    [transferBuffer],
  );
  return result.issues;
}

export async function inspectPdfCutLineCandidatesFromBytes(bytes) {
  if (
    typeof WorkerGlobalScope !== "undefined" &&
    self instanceof WorkerGlobalScope
  ) {
    await init();
    return parseJsonPayload(
      "PDF cut-line candidates",
      inspectPdfCutLineCandidatesRaw(bytes),
    );
  }

  const transferBuffer = toTransferBuffer(bytes);
  const result = await runInWorker(
    { op: "inspectPdfCutLines", buffer: transferBuffer },
    [transferBuffer],
  );
  return result.candidates;
}

export async function inspectImagePreflightFromBytes(bytes, contentType) {
  if (
    typeof WorkerGlobalScope !== "undefined" &&
    self instanceof WorkerGlobalScope
  ) {
    await init();
    return parseJsonPayload(
      "image preflight issues",
      inspectImagePreflightRaw(bytes, contentType),
    );
  }

  const transferBuffer = toTransferBuffer(bytes);
  const result = await runInWorker(
    { op: "inspectImage", buffer: transferBuffer, contentType },
    [transferBuffer],
  );
  return result.issues;
}

export async function resolveImpositionPreview(request) {
  await init();

  return parseJsonPayload(
    "imposition preview",
    resolveImpositionPreviewRaw(normalizeImpositionRequest(request)),
  );
}

export async function resolveStickerImpositionPreview(request) {
  const requestJson = normalizeStickerImpositionRequest(request);

  // Fast-path: when already running in a worker, call raw WASM directly.
  if (
    typeof WorkerGlobalScope !== "undefined" &&
    self instanceof WorkerGlobalScope
  ) {
    await init();

    return parseJsonPayload(
      "sticker imposition preview",
      resolveStickerImpositionPreviewRaw(requestJson),
    );
  }

  // Main thread: run in worker to keep UI responsive.
  const result = await runInWorker({
    op: "resolveStickerPreview",
    requestJson,
  });

  return result.preview;
}

export async function generateWhiteUnderbaseMaskRgba({
  rgba,
  width,
  height,
  alphaThreshold,
  lumaThreshold,
}) {
  await init();

  return generateWhiteUnderbaseMaskRgbaRaw(
    rgba,
    width,
    height,
    alphaThreshold,
    lumaThreshold,
  );
}

export async function generateHalftoneMaskRgba({
  rgba,
  width,
  height,
  alphaThreshold,
  cellSizePx,
  dotPercent,
  fullGraphic,
}) {
  await init();

  return generateHalftoneMaskRgbaRaw(
    rgba,
    width,
    height,
    alphaThreshold,
    cellSizePx,
    dotPercent,
    fullGraphic,
  );
}

export async function applySpotBrush({
  mask,
  artworkMask,
  width,
  height,
  centerX,
  centerY,
  radiusPx,
  value,
}) {
  await init();

  return applySpotBrushRaw(
    mask,
    artworkMask,
    width,
    height,
    centerX,
    centerY,
    radiusPx,
    value,
  );
}

export async function exportSpotPdfForPdfSource(sourcePdf, requestJson) {
  await init();

  return exportSpotPdfForPdfSourceRaw(sourcePdf, requestJson);
}

/**
 * Internal helper used by both main thread and worker.
 * - On worker: runs the raw WASM call directly.
 * - On main thread: delegates to a worker to avoid blocking the UI.
 */
export async function createStickerArtifactsJson(requestJson) {
  if (
    typeof WorkerGlobalScope !== "undefined" &&
    self instanceof WorkerGlobalScope
  ) {
    await init();
    return createStickerImpositionArtifactsRaw(requestJson);
  }

  const result = await runInWorker({
    op: "createStickerArtifacts",
    requestJson,
  });
  return result.artifactsJson;
}

export async function imposePdfFileToBytes({ request, bytes, contentType }) {
  if (
    typeof WorkerGlobalScope !== "undefined" &&
    self instanceof WorkerGlobalScope
  ) {
    await init();

    return imposePdfFileRaw(
      normalizeImpositionRequest(request),
      bytes,
      contentType,
    );
  }

  const transferBuffer = toTransferBuffer(bytes);
  const result = await runInWorker(
    {
      op: "impose",
      requestJson: normalizeImpositionRequest(request),
      buffer: transferBuffer,
      contentType,
    },
    [transferBuffer],
  );

  return new Uint8Array(result.buffer);
}

export async function exportPricingWorkbookToBytes({
  pricesRowData,
  thresholdRowData,
  deliveryTimesRowData,
  activeRowData,
}) {
  await init();

  return exportPricingWorkbook(
    pricesRowData,
    thresholdRowData,
    deliveryTimesRowData,
    activeRowData,
  );
}

// ---------------------------------------------------------------------------
// Browser-compatible archive utilities (no Node.js APIs)
// ---------------------------------------------------------------------------

function sanitizeSlug(value, fallback) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "");

  return normalized || fallback;
}

function sanitizePathCharacters(value) {
  const reservedCharacters = '<>:"/\\|?*';

  return Array.from(value, (character) => {
    const code = character.charCodeAt(0);

    if (code < 32 || reservedCharacters.includes(character)) {
      return "-";
    }

    return character;
  }).join("");
}

function extnameFromPath(filename) {
  const dotIndex = filename.lastIndexOf(".");
  return dotIndex > 0 ? filename.slice(dotIndex) : "";
}

function basenameFromPath(filename, ext) {
  const base = filename.replace(/\\/g, "/").split("/").pop() ?? filename;
  return ext ? base.slice(0, base.length - ext.length) : base;
}

function sanitizeArchiveEntrySegment(
  segment,
  fallbackBaseName,
  defaultExtension,
) {
  const originalName =
    typeof segment === "string" && segment.trim().length > 0
      ? segment
      : `${fallbackBaseName}${defaultExtension}`;
  const base = sanitizePathCharacters(basenameFromPath(originalName));
  const extension = extnameFromPath(base) || defaultExtension;
  const fileStem = base.slice(0, Math.max(0, base.length - extension.length));
  const safeStem = sanitizeSlug(fileStem, fallbackBaseName);
  const safeExtension = extension.replace(/[^.a-z0-9]/gi, "").toLowerCase();
  const maxStemLength = Math.max(1, 100 - safeExtension.length);

  return `${safeStem.slice(0, maxStemLength)}${safeExtension}`;
}

function sanitizeArchiveEntryName(filename, fallbackBaseName) {
  const originalName =
    typeof filename === "string" && filename.trim().length > 0
      ? filename
      : `${fallbackBaseName}.pdf`;
  const segments = originalName
    .replace(/\\/g, "/")
    .split("/")
    .filter((segment) => segment && segment !== "." && segment !== "..");

  if (segments.length === 0) {
    return sanitizeArchiveEntrySegment(
      `${fallbackBaseName}.pdf`,
      fallbackBaseName,
      ".pdf",
    );
  }

  const sanitized = segments.map((segment, index) =>
    sanitizeArchiveEntrySegment(
      segment,
      index === segments.length - 1 ? fallbackBaseName : "folder",
      index === segments.length - 1 ? ".pdf" : "",
    ),
  );

  return sanitized.join("/").slice(0, 100);
}

function buildImposedPdfFilename(filename, index) {
  const originalName =
    typeof filename === "string" && filename.trim().length > 0
      ? filename
      : `file-${index + 1}`;
  const base = basenameFromPath(originalName, extnameFromPath(originalName));
  const safeBase = sanitizeSlug(base, `file-${index + 1}`);
  return sanitizeArchiveEntryName(`i_${safeBase}.pdf`, `i-file-${index + 1}`);
}

function buildArchiveFilename(filename) {
  const originalName =
    typeof filename === "string" && filename.trim().length > 0
      ? filename
      : "output";
  const safeBase = sanitizeSlug(
    basenameFromPath(originalName, extnameFromPath(originalName)),
    "output",
  );
  return `${safeBase}-${globalThis.crypto.randomUUID().slice(0, 8)}.tar.gz`;
}

function writeStringToBytes(buffer, value, offset, length) {
  const encoded = new TextEncoder().encode(value);
  for (let i = 0; i < length && i < encoded.length; i++) {
    buffer[offset + i] = encoded[i];
  }
}

function writeOctalToBytes(buffer, value, offset, length) {
  const normalized = Math.max(0, Math.trunc(value));
  const octal = normalized.toString(8).padStart(length - 1, "0");
  const truncated = octal.slice(-(length - 1));
  const encoded = new TextEncoder().encode(truncated);
  for (let i = 0; i < length - 1 && i < encoded.length; i++) {
    buffer[offset + i] = encoded[i];
  }
  buffer[offset + length - 1] = 0;
}

function createTarHeader(name, size, modifiedAtMs) {
  const header = new Uint8Array(512);
  const safeName = sanitizeArchiveEntryName(name, "output");
  writeStringToBytes(header, safeName, 0, 100);
  writeOctalToBytes(header, 0o644, 100, 8);
  writeOctalToBytes(header, 0, 108, 8);
  writeOctalToBytes(header, 0, 116, 8);
  writeOctalToBytes(header, size, 124, 12);
  writeOctalToBytes(header, Math.floor(modifiedAtMs / 1000), 136, 12);
  header.fill(0x20, 148, 156);
  header[156] = "0".charCodeAt(0);
  writeStringToBytes(header, "ustar", 257, 5);
  header[262] = 0;
  writeStringToBytes(header, "00", 263, 2);

  let checksum = 0;
  for (const byte of header) {
    checksum += byte;
  }

  const checksumField = checksum.toString(8).padStart(6, "0");
  writeStringToBytes(header, checksumField, 148, 6);
  header[154] = 0;
  header[155] = 0x20;

  return header;
}

async function gzipBytes(input) {
  const stream = new CompressionStream("gzip");
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();

  const writePromise = (async () => {
    await writer.write(input);
    await writer.close();
  })();

  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  await writePromise;

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let resultOffset = 0;
  for (const chunk of chunks) {
    result.set(chunk, resultOffset);
    resultOffset += chunk.length;
  }
  return result;
}

async function createTarGzArchive(files) {
  const now = Date.now();
  const parts = [];

  for (const file of files) {
    const bytes =
      file.bytes instanceof Uint8Array
        ? file.bytes
        : new Uint8Array(file.bytes);
    const header = createTarHeader(file.filename, bytes.length, now);
    parts.push(header, bytes);

    const remainder = bytes.length % 512;
    if (remainder !== 0) {
      parts.push(new Uint8Array(512 - remainder));
    }
  }

  parts.push(new Uint8Array(1024));

  const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
  const tarBytes = new Uint8Array(totalLength);
  let pos = 0;
  for (const part of parts) {
    tarBytes.set(part, pos);
    pos += part.length;
  }

  return gzipBytes(tarBytes);
}

function decodeBase64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function collapseStickerArtifactFiles(files) {
  // Keep original artifact list as produced by WASM.
  // This preserves cut/sheet-*.eps and cut/sheet-*.ai outputs.
  return files;
}

function toStickerArtifactRequest(request, assets) {
  const requestObject =
    typeof request === "string"
      ? parseJsonPayload("sticker imposition request", request)
      : request;

  if (!requestObject || typeof requestObject !== "object") {
    throw new Error(
      "Sticker imposition request must be a JSON string or object.",
    );
  }

  return {
    ...requestObject,
    assets: assets ?? requestObject.assets ?? [],
  };
}

export async function createStickerImpositionArchive({ request, assets }) {
  const artifactRequest = toStickerArtifactRequest(request, assets);
  const artifacts = parseJsonPayload(
    "sticker imposition artifacts",
    await createStickerArtifactsJson(JSON.stringify(artifactRequest)),
  );

  if (
    !artifacts ||
    typeof artifacts !== "object" ||
    !Array.isArray(artifacts.files)
  ) {
    throw new Error("Sticker imposition artifacts response is invalid.");
  }

  const files = artifacts.files.map((file, index) => {
    if (
      !file ||
      typeof file !== "object" ||
      typeof file.filename !== "string" ||
      typeof file.content !== "string"
    ) {
      throw new Error(`Sticker imposition artifact ${index + 1} is invalid.`);
    }

    return {
      bytes: file.isBinary
        ? decodeBase64ToBytes(file.content)
        : new TextEncoder().encode(file.content),
      filename: file.filename,
    };
  });

  const collapsedFiles = collapseStickerArtifactFiles(files);

  return {
    bytes: await createTarGzArchive(collapsedFiles),
    contentType: "application/gzip",
    filename: `sticker-imposition-${globalThis.crypto.randomUUID().slice(0, 8)}.tar.gz`,
    files: collapsedFiles,
    warnings: normalizeStickerArtifactWarnings(artifacts.warnings),
  };
}

function normalizeStickerArtifactWarnings(warnings) {
  if (!Array.isArray(warnings)) {
    return [];
  }

  return warnings
    .filter(
      (warning) =>
        warning &&
        typeof warning === "object" &&
        typeof warning.code === "string",
    )
    .map((warning) => ({ code: warning.code, values: warning.values ?? {} }));
}

async function notifyArchiveProgress(onProgress, progress) {
  if (typeof onProgress !== "function") {
    return;
  }

  await onProgress(progress);
}

function getDisplayName(file, index) {
  if (typeof file?.filename === "string" && file.filename.trim().length > 0) {
    return file.filename;
  }
  if (typeof file?.name === "string" && file.name.trim().length > 0) {
    return file.name;
  }
  return `file-${index + 1}`;
}

async function resolveFileBytes(file) {
  if (file.bytes instanceof Uint8Array) {
    return file.bytes;
  }

  // Accept File/Blob objects — read lazily to minimise peak memory usage
  if (typeof file.arrayBuffer === "function") {
    return new Uint8Array(await file.arrayBuffer());
  }

  throw new Error(
    "File entry must have either a `bytes` Uint8Array or an `arrayBuffer` method.",
  );
}

/**
 * Sends a single file to the imposition Worker and resolves with the output
 * bytes.  The input ArrayBuffer is transferred (zero-copy) to the worker so
 * the main thread never holds both the input and output simultaneously.
 */
function imposeFileInWorker(worker, requestJson, file, fileIndex, totalFiles) {
  return new Promise((resolve, reject) => {
    const id = ++workerIdCounter;

    function onMessage(event) {
      const msg = event.data;
      if (msg.id !== id) return;
      cleanup();
      if (msg.type === "result") {
        resolve({
          bytes: new Uint8Array(msg.buffer),
          boxMismatch: Boolean(msg.boxMismatch),
        });
      } else if (msg.type === "error") {
        reject(new Error(msg.message));
      }
    }

    function onError(event) {
      cleanup();
      reject(new Error(event.message ?? "Imposition worker error"));
    }

    function cleanup() {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
    }

    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);

    resolveFileBytes(file)
      .then((fileBytes) => {
        const contentType = resolveFileContentType(file);

        const transferBuffer = toTransferBuffer(fileBytes);

        worker.postMessage(
          {
            op: "impose",
            id,
            requestJson,
            buffer: transferBuffer,
            contentType,
            filename: getDisplayName(file, fileIndex - 1),
            fileIndex,
            totalFiles,
          },
          [transferBuffer],
        );
      })
      .catch(reject);
  });
}

export async function imposeFilesToArchive({ request, files, onProgress }) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("At least one file is required for imposition.");
  }

  const requestJson = normalizeImpositionRequest(request);
  const imposedFiles = [];
  const warnings = [];
  let completedFiles = 0;
  let failedFiles = 0;

  // Spawn the worker once for the whole batch so WASM is only initialised once.
  const worker = new Worker(new URL("./impose-worker.js", import.meta.url), {
    type: "module",
  });

  try {
    for (const [index, file] of files.entries()) {
      const displayName = getDisplayName(file, index);

      await notifyArchiveProgress(onProgress, {
        completedFiles,
        failedFiles,
        fileIndex: index + 1,
        filename: displayName,
        phase: "started",
        totalFiles: files.length,
      });

      try {
        const contentType = resolveFileContentType(file);
        const { bytes: outputBytes, boxMismatch } = await imposeFileInWorker(
          worker,
          requestJson,
          file,
          index + 1,
          files.length,
        );

        imposedFiles.push({
          filename: buildImposedPdfFilename(file.filename ?? file.name, index),
          bytes: outputBytes,
        });
        completedFiles += 1;

        if (boxMismatch) {
          warnings.push({
            code: "impose.warnings.sourcePdfBoxMismatch",
            values: { filename: displayName },
          });
        }
        if (
          requestUsesFastContentAwareBleed(requestJson) &&
          isPdfContentType(contentType)
        ) {
          warnings.push(contentAwareBleedFallbackWarning(displayName));
        }

        await notifyArchiveProgress(onProgress, {
          completedFiles,
          failedFiles,
          fileIndex: index + 1,
          filename: displayName,
          phase: "completed",
          totalFiles: files.length,
        });
      } catch (error) {
        failedFiles += 1;

        const warning = `Error imposing ${displayName}: ${error instanceof Error ? error.message : String(error)}`;
        warnings.push(warning);

        await notifyArchiveProgress(onProgress, {
          completedFiles,
          failedFiles,
          fileIndex: index + 1,
          filename: displayName,
          phase: "failed",
          totalFiles: files.length,
          warning,
        });
      }
    }
  } finally {
    worker.terminate();
  }

  if (imposedFiles.length === 0) {
    throw new Error(
      warnings.length > 0
        ? `Imposition failed for all files. ${warnings.join(" ")}`
        : "Imposition failed for all files.",
    );
  }

  if (imposedFiles.length === 1) {
    const [imposedFile] = imposedFiles;
    return {
      bytes: imposedFile.bytes,
      contentType: "application/pdf",
      filename: imposedFile.filename,
      files: imposedFiles,
      warnings,
    };
  }

  return {
    bytes: await createTarGzArchive(imposedFiles),
    contentType: "application/gzip",
    filename: buildArchiveFilename(files[0]?.filename ?? files[0]?.name),
    files: imposedFiles,
    warnings,
  };
}

export default init;
