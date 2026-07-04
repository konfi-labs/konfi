"use client";
/* eslint-disable unicorn/require-post-message-target-origin */

import type { XLSXParseResult } from "@konfi/types";
import {
  jsonToPrices,
  type JsonToPricesInput,
  type JsonToPricesResult,
} from "./json-to-prices";
import type {
  MatrixGridRowsParseInput,
  MatrixWorkbookExportInput,
  MatrixPriceWorkerRequest,
  MatrixPriceWorkerResponse,
  MatrixPriceWorkerSuccessResponse,
} from "./matrix-price-worker-protocol";
import {
  buildMatrixGridRowsSnapshot,
  buildMatrixWorksheetData,
  gridRowsToXlsxParseResult,
  type MatrixGridRowsSnapshot,
  type MatrixWorksheetBuildInput,
  type MatrixWorksheetBuildResult,
} from "./matrix-price-worksheets";

type PendingRequest = {
  reject: (reason: Error) => void;
  resolve: (payload: MatrixPriceWorkerSuccessResponse["payload"]) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

const WORKER_TIMEOUT_MS = 10_000;

let matrixPriceWorker: Worker | null = null;
let workerFailureCount = 0;
let requestCount = 0;
const pendingRequests = new Map<string, PendingRequest>();
let browserWasmModulePromise: Promise<
  typeof import("@konfi/wasm/browser")
> | null = null;

function nextRequestId(): string {
  requestCount += 1;
  return `matrix-price-worker-${requestCount}`;
}

function loadBrowserWasmModule(): Promise<
  typeof import("@konfi/wasm/browser")
> {
  if (!browserWasmModulePromise) {
    browserWasmModulePromise = import("@konfi/wasm/browser");
  }

  return browserWasmModulePromise;
}

function rejectAllPendingRequests(error: Error) {
  pendingRequests.forEach(({ reject, timeoutId }) => {
    clearTimeout(timeoutId);
    reject(error);
  });
  pendingRequests.clear();
}

function resetWorker() {
  if (matrixPriceWorker) {
    matrixPriceWorker.terminate();
    matrixPriceWorker = null;
  }
}

function handleWorkerMessage(event: MessageEvent<MatrixPriceWorkerResponse>) {
  const response = event.data;
  const pendingRequest = pendingRequests.get(response.id);

  if (!pendingRequest) {
    return;
  }

  clearTimeout(pendingRequest.timeoutId);
  pendingRequests.delete(response.id);

  if (!response.success) {
    pendingRequest.reject(new Error(response.error));
    return;
  }

  pendingRequest.resolve(response.payload);
}

function handleWorkerFailure(message: string) {
  workerFailureCount += 1;
  const error = new Error(message);
  rejectAllPendingRequests(error);
  resetWorker();
}

function createWorker(): Worker {
  const worker = new Worker(
    new URL("./workers/matrix-price.worker.ts", import.meta.url),
    { type: "module" },
  );

  worker.addEventListener("message", handleWorkerMessage);
  worker.addEventListener("error", (event) => {
    handleWorkerFailure(
      event.message || "Matrix price worker execution failed.",
    );
  });
  worker.addEventListener("messageerror", () => {
    handleWorkerFailure("Matrix price worker returned an unreadable message.");
  });

  return worker;
}

function isWorkerAvailable(): boolean {
  if (typeof window === "undefined" || typeof Worker === "undefined") {
    return false;
  }

  // After 2 failures stop trying the worker for this session
  if (workerFailureCount >= 2) {
    return false;
  }

  return true;
}

function getWorker(): Worker | null {
  if (!isWorkerAvailable()) {
    return null;
  }

  if (!matrixPriceWorker) {
    matrixPriceWorker = createWorker();
  }

  return matrixPriceWorker;
}

function dispatchWorkerRequest(
  request: MatrixPriceWorkerRequest,
): Promise<MatrixPriceWorkerSuccessResponse["payload"]> {
  const worker = getWorker();

  if (!worker) {
    return Promise.reject(new Error("Matrix price worker is unavailable."));
  }

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pendingRequests.delete(request.id);
      handleWorkerFailure(
        `Matrix price worker timed out after ${WORKER_TIMEOUT_MS}ms (request ${request.type}).`,
      );
      reject(new Error("Matrix price worker timed out."));
    }, WORKER_TIMEOUT_MS);

    pendingRequests.set(request.id, { resolve, reject, timeoutId });
    worker.postMessage(request);
  });
}

function isMatrixWorksheetBuildResult(
  payload: MatrixPriceWorkerSuccessResponse["payload"],
): payload is MatrixWorksheetBuildResult {
  return "pricesRowData" in payload && "pricesRows" in payload;
}

function isJsonToPricesResult(
  payload: MatrixPriceWorkerSuccessResponse["payload"],
): payload is JsonToPricesResult {
  return "data" in payload && "error" in payload;
}

function isXlsxParseResult(
  payload: MatrixPriceWorkerSuccessResponse["payload"],
): payload is XLSXParseResult {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "prices" in payload &&
    "thresholds" in payload &&
    "deliveryTimes" in payload &&
    "active" in payload
  );
}

function isUint8ArrayPayload(
  payload: MatrixPriceWorkerSuccessResponse["payload"],
): payload is Uint8Array {
  return payload instanceof Uint8Array;
}

function parseGridRowsFallback(
  input: MatrixGridRowsParseInput,
): JsonToPricesResult {
  return jsonToPrices({
    attributeDependencies: input.attributeDependencies,
    combinationAttributes: input.combinationAttributes,
    optionsLabelValuePairs: input.optionsLabelValuePairs,
    watchAttributes: input.watchAttributes,
    attributes: input.attributes,
    memoizedCombinations: input.memoizedCombinations,
    xlsxParseResult: gridRowsToXlsxParseResult({
      activeRows: input.activeRows,
      deliveryTimesRows: input.deliveryTimesRows,
      pricesRows: input.pricesRows,
      thresholdsRows: input.thresholdsRows,
      volumes: input.volumes,
    }),
    volumes: input.volumes,
  });
}

export const matrixPriceWorkerClient = {
  /**
   * Build grid rows for the drawer editor.
   * Runs directly on the main thread — this is a fast O(combinations × volumes)
   * transformation and skipping the worker avoids structured-clone overhead that
   * can stall the UI for large price sets.
   */
  async buildGridRows(
    input: MatrixWorksheetBuildInput,
  ): Promise<MatrixGridRowsSnapshot> {
    return buildMatrixGridRowsSnapshot(input);
  },

  async buildWorksheetData(
    input: MatrixWorksheetBuildInput,
  ): Promise<MatrixWorksheetBuildResult> {
    const worker = getWorker();

    if (!worker) {
      return buildMatrixWorksheetData(input);
    }

    try {
      const payload = await dispatchWorkerRequest({
        id: nextRequestId(),
        type: "build-worksheet-data",
        payload: input,
      });

      if (!isMatrixWorksheetBuildResult(payload)) {
        throw new Error(
          "Matrix price worker returned an unexpected worksheet payload.",
        );
      }

      return payload;
    } catch {
      // Fallback to main thread on any worker failure
      return buildMatrixWorksheetData(input);
    }
  },

  async parseGridRows(
    input: MatrixGridRowsParseInput,
  ): Promise<JsonToPricesResult> {
    const worker = getWorker();

    if (!worker) {
      return parseGridRowsFallback(input);
    }

    try {
      const payload = await dispatchWorkerRequest({
        id: nextRequestId(),
        type: "parse-grid-rows",
        payload: input,
      });

      if (!isJsonToPricesResult(payload)) {
        throw new Error(
          "Matrix price worker returned an unexpected parsed prices payload.",
        );
      }

      return payload;
    } catch {
      return parseGridRowsFallback(input);
    }
  },

  async parseWorksheetData(
    input: JsonToPricesInput,
  ): Promise<JsonToPricesResult> {
    const worker = getWorker();

    if (!worker) {
      return jsonToPrices(input);
    }

    try {
      const payload = await dispatchWorkerRequest({
        id: nextRequestId(),
        type: "parse-worksheet-data",
        payload: input,
      });

      if (!isJsonToPricesResult(payload)) {
        throw new Error(
          "Matrix price worker returned an unexpected worksheet parse payload.",
        );
      }

      return payload;
    } catch {
      return jsonToPrices(input);
    }
  },

  async readWorkbook(bytes: Uint8Array): Promise<XLSXParseResult> {
    const worker = getWorker();

    if (!worker) {
      const { readPricingWorkbookJsonFromBytes } =
        await loadBrowserWasmModule();
      return readPricingWorkbookJsonFromBytes(bytes);
    }

    try {
      const payload = await dispatchWorkerRequest({
        id: nextRequestId(),
        type: "read-workbook",
        payload: { bytes },
      });

      if (!isXlsxParseResult(payload)) {
        throw new Error(
          "Matrix price worker returned an unexpected workbook payload.",
        );
      }

      return payload;
    } catch {
      const { readPricingWorkbookJsonFromBytes } =
        await loadBrowserWasmModule();
      return readPricingWorkbookJsonFromBytes(bytes);
    }
  },

  async exportWorkbook(input: MatrixWorkbookExportInput): Promise<Uint8Array> {
    const worker = getWorker();

    if (!worker) {
      const { exportPricingWorkbookToBytes } = await loadBrowserWasmModule();
      return exportPricingWorkbookToBytes(input);
    }

    try {
      const payload = await dispatchWorkerRequest({
        id: nextRequestId(),
        type: "export-workbook",
        payload: input,
      });

      if (!isUint8ArrayPayload(payload)) {
        throw new Error(
          "Matrix price worker returned an unexpected workbook bytes payload.",
        );
      }

      return payload;
    } catch {
      const { exportPricingWorkbookToBytes } = await loadBrowserWasmModule();
      return exportPricingWorkbookToBytes(input);
    }
  },
};
