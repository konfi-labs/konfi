import { createHash, randomUUID } from "node:crypto";
import { basename, extname } from "node:path";
import { gzipSync } from "node:zlib";
import {
  createStickerImpositionArtifacts as createStickerImpositionArtifactsRaw,
  detectSourceBoxMismatch as detectSourceBoxMismatchRaw,
  exportPricingWorkbook,
  getPdfPageCount as getPdfPageCountRaw,
  imposePdfFile as imposePdfFileRaw,
  inspectPdfCutLineCandidates as inspectPdfCutLineCandidatesRaw,
  inspectImagePreflight as inspectImagePreflightRaw,
  inspectPdfPreflight as inspectPdfPreflightRaw,
  readPricingWorkbookJson,
  resolveImpositionPreview as resolveImpositionPreviewRaw,
  resolveStickerImpositionPreview as resolveStickerImpositionPreviewRaw,
} from "./dist/wasm.js";

export async function init() {
  await Promise.resolve();
}

function parseJsonPayload(label, payload) {
  try {
    return JSON.parse(payload);
  } catch (error) {
    throw new Error(
      `Failed to parse ${label} JSON: ${error instanceof Error ? error.message : String(error)}`,
      {
        cause: error,
      },
    );
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

function sanitizeArchiveEntrySegment(
  segment,
  fallbackBaseName,
  defaultExtension,
) {
  const originalName =
    typeof segment === "string" && segment.trim().length > 0
      ? segment
      : `${fallbackBaseName}${defaultExtension}`;
  const baseName = sanitizePathCharacters(basename(originalName));
  const extension = extname(baseName) || defaultExtension;
  const fileStem = baseName.slice(
    0,
    Math.max(0, baseName.length - extension.length),
  );
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
  const baseName = basename(originalName, extname(originalName));
  const safeBase = sanitizeSlug(baseName, `file-${index + 1}`);
  return sanitizeArchiveEntryName(`i_${safeBase}.pdf`, `i-file-${index + 1}`);
}

function buildArchiveFilename(filename) {
  const originalName =
    typeof filename === "string" && filename.trim().length > 0
      ? filename
      : "output";
  const safeBase = sanitizeSlug(
    basename(originalName, extname(originalName)),
    "output",
  );
  return `${safeBase}-${randomUUID().slice(0, 8)}.tar.gz`;
}

function writeString(buffer, value, offset, length) {
  const encoded = Buffer.from(value, "ascii");
  encoded.subarray(0, length).copy(buffer, offset);
}

function writeOctal(buffer, value, offset, length) {
  const normalized = Math.max(0, Math.trunc(value));
  const octal = normalized.toString(8).padStart(length - 1, "0");
  writeString(buffer, octal.slice(-(length - 1)), offset, length - 1);
  buffer[offset + length - 1] = 0;
}

function createTarHeader(name, size, modifiedAtMs) {
  const header = Buffer.alloc(512, 0);
  writeString(header, sanitizeArchiveEntryName(name, "output"), 0, 100);
  writeOctal(header, 0o644, 100, 8);
  writeOctal(header, 0, 108, 8);
  writeOctal(header, 0, 116, 8);
  writeOctal(header, size, 124, 12);
  writeOctal(header, Math.floor(modifiedAtMs / 1000), 136, 12);
  header.fill(0x20, 148, 156);
  header[156] = "0".charCodeAt(0);
  writeString(header, "ustar", 257, 5);
  header[262] = 0;
  writeString(header, "00", 263, 2);

  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  const checksumField = checksum.toString(8).padStart(6, "0");
  writeString(header, checksumField, 148, 6);
  header[154] = 0;
  header[155] = 0x20;

  return header;
}

function createTarGzArchive(files) {
  const now = Date.now();
  const chunks = [];

  for (const file of files) {
    const bytes = Buffer.from(file.bytes);
    const header = createTarHeader(file.filename, bytes.length, now);
    chunks.push(header, bytes);

    const remainder = bytes.length % 512;
    if (remainder !== 0) {
      chunks.push(Buffer.alloc(512 - remainder, 0));
    }
  }

  chunks.push(Buffer.alloc(1024, 0));

  return new Uint8Array(gzipSync(Buffer.concat(chunks)));
}

function hashBytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function collapseStickerArtifactFiles(files) {
  const manifestFile = files.find((file) => file.filename === "manifest.json");

  if (!manifestFile) {
    return files;
  }

  let manifest;

  try {
    manifest = JSON.parse(Buffer.from(manifestFile.bytes).toString("utf8"));
  } catch {
    return files;
  }

  if (
    !manifest ||
    typeof manifest !== "object" ||
    !Array.isArray(manifest.sheets)
  ) {
    return files;
  }

  const fileMap = new Map(files.map((file) => [file.filename, file]));
  const groups = [];
  const signatureToGroupIndex = new Map();

  for (const sheet of manifest.sheets) {
    if (
      !sheet ||
      typeof sheet !== "object" ||
      typeof sheet.printFile !== "string" ||
      typeof sheet.cutFile !== "string"
    ) {
      return files;
    }

    const printFile = fileMap.get(sheet.printFile);
    const cutFile = fileMap.get(sheet.cutFile);

    if (!printFile || !cutFile) {
      return files;
    }

    const signature = `${hashBytes(printFile.bytes)}:${hashBytes(cutFile.bytes)}`;
    const existingIndex = signatureToGroupIndex.get(signature);

    if (existingIndex === undefined) {
      signatureToGroupIndex.set(signature, groups.length);
      groups.push({
        cutFile,
        printFile,
        repeatCount: 1,
        sheet,
      });
      continue;
    }

    groups[existingIndex].repeatCount += 1;
  }

  if (groups.length === manifest.sheets.length) {
    return files;
  }

  const referencedFilenames = new Set(["manifest.json"]);
  for (const sheet of manifest.sheets) {
    referencedFilenames.add(sheet.printFile);
    referencedFilenames.add(sheet.cutFile);
  }

  const nextFiles = [];

  for (const [index, group] of groups.entries()) {
    const sheetNumber = index + 1;
    const suffix = group.repeatCount > 1 ? `-x${group.repeatCount}` : "";

    nextFiles.push({
      bytes: group.printFile.bytes,
      filename: `print/sheet-${sheetNumber}${suffix}.pdf`,
    });
    nextFiles.push({
      bytes: group.cutFile.bytes,
      filename: `cut/sheet-${sheetNumber}${suffix}.pdf`,
    });
  }

  nextFiles.push({
    bytes: new Uint8Array(
      Buffer.from(
        JSON.stringify(
          {
            ...manifest,
            sheetCount: groups.length,
            sheets: groups.map((group, index) => {
              const sheetNumber = index + 1;
              const suffix =
                group.repeatCount > 1 ? `-x${group.repeatCount}` : "";

              return {
                ...group.sheet,
                cutFile: `cut/sheet-${sheetNumber}${suffix}.pdf`,
                index: sheetNumber,
                printFile: `print/sheet-${sheetNumber}${suffix}.pdf`,
                repeatCount: group.repeatCount,
              };
            }),
            totalSheetCount:
              typeof manifest.sheetCount === "number"
                ? manifest.sheetCount
                : manifest.sheets.length,
          },
          null,
          2,
        ),
        "utf8",
      ),
    ),
    filename: "manifest.json",
  });
  for (const file of files) {
    if (!referencedFilenames.has(file.filename)) {
      nextFiles.push(file);
    }
  }

  return nextFiles;
}

export async function readPricingWorkbookJsonFromBytes(bytes) {
  await init();

  return JSON.parse(readPricingWorkbookJson(bytes));
}

export async function getPdfPageCount(bytes) {
  await init();

  return parseInt(getPdfPageCountRaw(bytes), 10);
}

export async function inspectPdfPreflightFromBytes(bytes) {
  await init();

  return parseJsonPayload(
    "PDF preflight issues",
    inspectPdfPreflightRaw(bytes),
  );
}

export async function inspectPdfCutLineCandidatesFromBytes(bytes) {
  await init();

  return parseJsonPayload(
    "PDF cut-line candidates",
    inspectPdfCutLineCandidatesRaw(bytes),
  );
}

export async function inspectImagePreflightFromBytes(bytes, contentType) {
  await init();

  return parseJsonPayload(
    "image preflight issues",
    inspectImagePreflightRaw(bytes, contentType),
  );
}

export async function resolveImpositionPreview(request) {
  await init();

  return parseJsonPayload(
    "imposition preview",
    resolveImpositionPreviewRaw(normalizeImpositionRequest(request)),
  );
}

export async function resolveStickerImpositionPreview(request) {
  await init();

  return parseJsonPayload(
    "sticker imposition preview",
    resolveStickerImpositionPreviewRaw(
      normalizeStickerImpositionRequest(request),
    ),
  );
}

export async function createStickerImpositionArchive({ request, assets }) {
  await init();

  const artifactRequest = toStickerArtifactRequest(request, assets);
  const artifacts = parseJsonPayload(
    "sticker imposition artifacts",
    createStickerImpositionArtifactsRaw(JSON.stringify(artifactRequest)),
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
        ? new Uint8Array(Buffer.from(file.content, "base64"))
        : new Uint8Array(Buffer.from(file.content, "utf8")),
      filename: file.filename,
    };
  });
  const collapsedFiles = collapseStickerArtifactFiles(files);

  return {
    bytes: createTarGzArchive(collapsedFiles),
    contentType: "application/gzip",
    filename: `sticker-imposition-${randomUUID().slice(0, 8)}.tar.gz`,
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

export async function imposePdfFileToBytes({ request, bytes, contentType }) {
  await init();

  return imposePdfFileRaw(
    normalizeImpositionRequest(request),
    bytes,
    contentType,
  );
}

async function notifyArchiveProgress(onProgress, progress) {
  if (typeof onProgress !== "function") {
    return;
  }

  await onProgress(progress);
}

function detectSourceBoxMismatchSafely(requestJson, file) {
  try {
    return detectSourceBoxMismatchRaw(
      requestJson,
      file.bytes,
      file.contentType,
    );
  } catch {
    return false;
  }
}

export async function imposeFilesToArchive({ request, files, onProgress }) {
  await init();

  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("At least one file is required for imposition.");
  }

  const requestJson = normalizeImpositionRequest(request);
  const imposedFiles = [];
  const warnings = [];
  let completedFiles = 0;
  let failedFiles = 0;

  for (const [index, file] of files.entries()) {
    const displayName =
      typeof file?.filename === "string" && file.filename.trim().length > 0
        ? file.filename
        : `file-${index + 1}`;

    await notifyArchiveProgress(onProgress, {
      completedFiles,
      failedFiles,
      fileIndex: index + 1,
      filename: displayName,
      phase: "started",
      totalFiles: files.length,
    });

    try {
      const bytes = imposePdfFileRaw(requestJson, file.bytes, file.contentType);
      imposedFiles.push({
        filename: buildImposedPdfFilename(file.filename, index),
        bytes,
      });
      completedFiles += 1;

      if (detectSourceBoxMismatchSafely(requestJson, file)) {
        warnings.push({
          code: "impose.warnings.sourcePdfBoxMismatch",
          values: { filename: displayName },
        });
      }
      if (
        requestUsesFastContentAwareBleed(requestJson) &&
        isPdfContentType(file.contentType)
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
    bytes: createTarGzArchive(imposedFiles),
    contentType: "application/gzip",
    filename: buildArchiveFilename(files[0]?.filename),
    files: imposedFiles,
    warnings,
  };
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

export default init;
