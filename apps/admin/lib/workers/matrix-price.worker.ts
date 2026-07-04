/// <reference lib="webworker" />
/* eslint-disable unicorn/require-post-message-target-origin */

import {
  exportPricingWorkbookToBytes,
  readPricingWorkbookJsonFromBytes,
} from "@konfi/wasm/browser";
import { jsonToPrices } from "../json-to-prices";
import type {
  MatrixPriceWorkerRequest,
  MatrixPriceWorkerResponse,
} from "../matrix-price-worker-protocol";
import {
  buildMatrixGridRowsSnapshot,
  buildMatrixWorksheetData,
  gridRowsToXlsxParseResult,
} from "../matrix-price-worksheets";

const workerScope = self as DedicatedWorkerGlobalScope;

workerScope.addEventListener(
  "message",
  async (event: MessageEvent<MatrixPriceWorkerRequest>) => {
    const request = event.data;

    try {
      switch (request.type) {
        case "build-grid-rows": {
          workerScope.postMessage({
            id: request.id,
            success: true,
            type: request.type,
            payload: buildMatrixGridRowsSnapshot(request.payload),
          } satisfies MatrixPriceWorkerResponse);
          return;
        }

        case "build-worksheet-data": {
          workerScope.postMessage({
            id: request.id,
            success: true,
            type: request.type,
            payload: buildMatrixWorksheetData(request.payload),
          } satisfies MatrixPriceWorkerResponse);
          return;
        }

        case "parse-grid-rows": {
          workerScope.postMessage({
            id: request.id,
            success: true,
            type: request.type,
            payload: jsonToPrices({
              attributeDependencies: request.payload.attributeDependencies,
              combinationAttributes: request.payload.combinationAttributes,
              optionsLabelValuePairs: request.payload.optionsLabelValuePairs,
              watchAttributes: request.payload.watchAttributes,
              attributes: request.payload.attributes,
              memoizedCombinations: request.payload.memoizedCombinations,
              xlsxParseResult: gridRowsToXlsxParseResult({
                activeRows: request.payload.activeRows,
                deliveryTimesRows: request.payload.deliveryTimesRows,
                pricesRows: request.payload.pricesRows,
                thresholdsRows: request.payload.thresholdsRows,
                volumes: request.payload.volumes,
              }),
              volumes: request.payload.volumes,
            }),
          } satisfies MatrixPriceWorkerResponse);
          return;
        }

        case "parse-worksheet-data": {
          workerScope.postMessage({
            id: request.id,
            success: true,
            type: request.type,
            payload: jsonToPrices(request.payload),
          } satisfies MatrixPriceWorkerResponse);
          return;
        }

        case "read-workbook": {
          workerScope.postMessage({
            id: request.id,
            success: true,
            type: request.type,
            payload: await readPricingWorkbookJsonFromBytes(
              request.payload.bytes,
            ),
          } satisfies MatrixPriceWorkerResponse);
          return;
        }

        case "export-workbook": {
          workerScope.postMessage({
            id: request.id,
            success: true,
            type: request.type,
            payload: await exportPricingWorkbookToBytes(request.payload),
          } satisfies MatrixPriceWorkerResponse);
          return;
        }
      }
    } catch (error) {
      workerScope.postMessage({
        id: request.id,
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Matrix price worker failed to process the request.",
      } satisfies MatrixPriceWorkerResponse);
    }
  },
);
