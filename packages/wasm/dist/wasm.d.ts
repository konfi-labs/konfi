/* tslint:disable */
/* eslint-disable */

export function applySpotBrush(mask: Uint8Array, artwork_mask: Uint8Array, width: number, height: number, center_x: number, center_y: number, radius_px: number, value: number): Uint8Array;

export function createStickerImpositionArtifacts(request_json: string): string;

export function detectSourceBoxMismatch(request_json: string, bytes: Uint8Array, content_type: string): boolean;

export function exportPricingWorkbook(prices_row_data: string, threshold_row_data: string, delivery_times_row_data: string, active_row_data: string): Uint8Array;

export function exportSpotPdfForPdfSource(source_pdf: Uint8Array, request_json: string): Uint8Array;

export function generateHalftoneMaskRgba(bytes: Uint8Array, width: number, height: number, alpha_threshold: number, cell_size_px: number, dot_percent: number, full_graphic: boolean): Uint8Array;

export function generateWhiteUnderbaseMaskRgba(bytes: Uint8Array, width: number, height: number, alpha_threshold: number, luma_threshold: number): Uint8Array;

export function getPdfPageCount(bytes: Uint8Array): string;

export function imposePdfFile(request_json: string, bytes: Uint8Array, content_type: string): Uint8Array;

export function inspectImagePreflight(bytes: Uint8Array, content_type: string): string;

export function inspectPdfCutLineCandidates(bytes: Uint8Array): string;

export function inspectPdfPreflight(bytes: Uint8Array): string;

export function readPricingWorkbookJson(bytes: Uint8Array): string;

export function resolveImpositionPreview(request_json: string): string;

export function resolveStickerImpositionPreview(request_json: string): string;
