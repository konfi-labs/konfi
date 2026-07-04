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

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly applySpotBrush: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number, number, number];
    readonly createStickerImpositionArtifacts: (a: number, b: number) => [number, number, number, number];
    readonly detectSourceBoxMismatch: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly exportPricingWorkbook: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly exportSpotPdfForPdfSource: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly generateHalftoneMaskRgba: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly generateWhiteUnderbaseMaskRgba: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly getPdfPageCount: (a: number, b: number) => [number, number, number, number];
    readonly imposePdfFile: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly inspectImagePreflight: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly inspectPdfCutLineCandidates: (a: number, b: number) => [number, number, number, number];
    readonly inspectPdfPreflight: (a: number, b: number) => [number, number, number, number];
    readonly readPricingWorkbookJson: (a: number, b: number) => [number, number, number, number];
    readonly resolveImpositionPreview: (a: number, b: number) => [number, number, number, number];
    readonly resolveStickerImpositionPreview: (a: number, b: number) => [number, number, number, number];
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
