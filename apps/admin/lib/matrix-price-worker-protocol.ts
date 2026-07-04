import type { JsonToPricesInput, JsonToPricesResult } from "./json-to-prices";
import type {
  MatrixGridRow,
  MatrixGridRowsSnapshot,
  MatrixWorksheetBuildInput,
  MatrixWorksheetBuildResult,
} from "./matrix-price-worksheets";
import type { XLSXParseResult } from "@konfi/types";

export type MatrixGridRowsParseInput = Omit<
  JsonToPricesInput,
  "xlsxParseResult"
> & {
  activeRows: MatrixGridRow[];
  deliveryTimesRows: MatrixGridRow[];
  pricesRows: MatrixGridRow[];
  thresholdsRows: MatrixGridRow[];
};

export type MatrixWorkbookReadInput = {
  bytes: Uint8Array;
};

export type MatrixWorkbookExportInput = {
  pricesRowData: string;
  thresholdRowData: string;
  deliveryTimesRowData: string;
  activeRowData: string;
};

export type MatrixPriceWorkerRequest =
  | {
      id: string;
      type: "build-grid-rows";
      payload: MatrixWorksheetBuildInput;
    }
  | {
      id: string;
      type: "build-worksheet-data";
      payload: MatrixWorksheetBuildInput;
    }
  | {
      id: string;
      type: "parse-grid-rows";
      payload: MatrixGridRowsParseInput;
    }
  | {
      id: string;
      type: "parse-worksheet-data";
      payload: JsonToPricesInput;
    }
  | {
      id: string;
      type: "read-workbook";
      payload: MatrixWorkbookReadInput;
    }
  | {
      id: string;
      type: "export-workbook";
      payload: MatrixWorkbookExportInput;
    };

export type MatrixPriceWorkerSuccessResponse =
  | {
      id: string;
      success: true;
      type: "build-grid-rows";
      payload: MatrixGridRowsSnapshot;
    }
  | {
      id: string;
      success: true;
      type: "build-worksheet-data";
      payload: MatrixWorksheetBuildResult;
    }
  | {
      id: string;
      success: true;
      type: "parse-grid-rows";
      payload: JsonToPricesResult;
    }
  | {
      id: string;
      success: true;
      type: "parse-worksheet-data";
      payload: JsonToPricesResult;
    }
  | {
      id: string;
      success: true;
      type: "read-workbook";
      payload: XLSXParseResult;
    }
  | {
      id: string;
      success: true;
      type: "export-workbook";
      payload: Uint8Array;
    };

export type MatrixPriceWorkerFailureResponse = {
  id: string;
  success: false;
  error: string;
};

export type MatrixPriceWorkerResponse =
  | MatrixPriceWorkerSuccessResponse
  | MatrixPriceWorkerFailureResponse;
