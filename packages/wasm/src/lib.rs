use wasm_bindgen::prelude::*;

mod common;
mod content_aware_bleed;
mod imposition;
mod preflight;
mod spot_color;
mod sticker_imposition;

#[path = "pricing-xlsx/mod.rs"]
mod pricing_xlsx_impl;

pub mod pricing_xlsx {
    pub use crate::pricing_xlsx_impl::{
        PricingWorkbookData, PricingWorkbookInput, PricingWorkbookJson, export_workbook_to_bytes,
        read_workbook_json_from_bytes,
    };
}

use preflight::{collect_image_issues_from_bytes, collect_pdf_issues_from_bytes};
use pricing_xlsx::{PricingWorkbookInput, export_workbook_to_bytes, read_workbook_json_from_bytes};

fn to_js_error(error: String) -> JsValue {
    JsValue::from_str(&error)
}

#[wasm_bindgen(js_name = readPricingWorkbookJson)]
pub fn read_pricing_workbook_json(bytes: &[u8]) -> Result<String, JsValue> {
    let workbook = read_workbook_json_from_bytes(bytes).map_err(to_js_error)?;

    serde_json::to_string(&workbook)
        .map_err(|error| to_js_error(format!("Failed to serialize workbook JSON: {error}")))
}

#[wasm_bindgen(js_name = exportPricingWorkbook)]
pub fn export_pricing_workbook(
    prices_row_data: &str,
    threshold_row_data: &str,
    delivery_times_row_data: &str,
    active_row_data: &str,
) -> Result<Vec<u8>, JsValue> {
    let input = PricingWorkbookInput {
        prices_row_data: prices_row_data.to_owned(),
        threshold_row_data: threshold_row_data.to_owned(),
        delivery_times_row_data: delivery_times_row_data.to_owned(),
        active_row_data: active_row_data.to_owned(),
    };

    let workbook_data = input.into_workbook_data().map_err(to_js_error)?;
    export_workbook_to_bytes(&workbook_data).map_err(to_js_error)
}

#[wasm_bindgen(js_name = inspectPdfPreflight)]
pub fn inspect_pdf_preflight(bytes: &[u8]) -> Result<String, JsValue> {
    let issues = collect_pdf_issues_from_bytes(bytes).map_err(to_js_error)?;
    serde_json::to_string(&issues)
        .map_err(|error| to_js_error(format!("Failed to serialize PDF preflight issues: {error}")))
}

#[wasm_bindgen(js_name = inspectPdfCutLineCandidates)]
pub fn inspect_pdf_cut_line_candidates(bytes: &[u8]) -> Result<String, JsValue> {
    sticker_imposition::inspect_pdf_cut_line_candidates_json(bytes).map_err(to_js_error)
}

#[wasm_bindgen(js_name = inspectImagePreflight)]
pub fn inspect_image_preflight(bytes: &[u8], content_type: &str) -> Result<String, JsValue> {
    let issues = collect_image_issues_from_bytes(bytes, content_type).map_err(to_js_error)?;
    serde_json::to_string(&issues).map_err(|error| {
        to_js_error(format!(
            "Failed to serialize image preflight issues: {error}"
        ))
    })
}

#[wasm_bindgen(js_name = resolveImpositionPreview)]
pub fn resolve_imposition_preview(request_json: &str) -> Result<String, JsValue> {
    imposition::resolve_preview_json(request_json).map_err(to_js_error)
}

#[wasm_bindgen(js_name = resolveStickerImpositionPreview)]
pub fn resolve_sticker_imposition_preview(request_json: &str) -> Result<String, JsValue> {
    sticker_imposition::resolve_preview_json(request_json).map_err(to_js_error)
}

#[wasm_bindgen(js_name = generateWhiteUnderbaseMaskRgba)]
pub fn generate_white_underbase_mask_rgba(
    bytes: &[u8],
    width: u32,
    height: u32,
    alpha_threshold: u8,
    luma_threshold: u8,
) -> Result<Vec<u8>, JsValue> {
    spot_color::generate_white_underbase_mask_rgba(
        bytes,
        width,
        height,
        alpha_threshold,
        luma_threshold,
    )
    .map_err(to_js_error)
}

#[wasm_bindgen(js_name = generateHalftoneMaskRgba)]
pub fn generate_halftone_mask_rgba(
    bytes: &[u8],
    width: u32,
    height: u32,
    alpha_threshold: u8,
    cell_size_px: u32,
    dot_percent: u8,
    full_graphic: bool,
) -> Result<Vec<u8>, JsValue> {
    spot_color::generate_halftone_mask_rgba(
        bytes,
        width,
        height,
        alpha_threshold,
        cell_size_px,
        dot_percent,
        full_graphic,
    )
    .map_err(to_js_error)
}

#[wasm_bindgen(js_name = applySpotBrush)]
pub fn apply_spot_brush(
    mask: &[u8],
    artwork_mask: &[u8],
    width: u32,
    height: u32,
    center_x: i32,
    center_y: i32,
    radius_px: u32,
    value: u8,
) -> Result<Vec<u8>, JsValue> {
    spot_color::apply_spot_brush(
        mask,
        artwork_mask,
        width,
        height,
        center_x,
        center_y,
        radius_px,
        value,
    )
    .map_err(to_js_error)
}

#[wasm_bindgen(js_name = exportSpotPdfForPdfSource)]
pub fn export_spot_pdf_for_pdf_source(
    source_pdf: &[u8],
    request_json: &str,
) -> Result<Vec<u8>, JsValue> {
    spot_color::export_spot_pdf_for_pdf_source(source_pdf, request_json).map_err(to_js_error)
}

#[wasm_bindgen(js_name = createStickerImpositionArtifacts)]
pub fn create_sticker_imposition_artifacts(request_json: &str) -> Result<String, JsValue> {
    sticker_imposition::create_artifacts_json(request_json).map_err(to_js_error)
}

#[wasm_bindgen(js_name = imposePdfFile)]
pub fn impose_pdf_file(
    request_json: &str,
    bytes: &[u8],
    content_type: &str,
) -> Result<Vec<u8>, JsValue> {
    imposition::impose_file_to_pdf_bytes(request_json, bytes, content_type).map_err(to_js_error)
}

#[wasm_bindgen(js_name = getPdfPageCount)]
pub fn get_pdf_page_count(bytes: &[u8]) -> Result<String, JsValue> {
    imposition::get_pdf_page_count(bytes).map_err(to_js_error)
}

#[wasm_bindgen(js_name = detectSourceBoxMismatch)]
pub fn detect_source_box_mismatch(
    request_json: &str,
    bytes: &[u8],
    content_type: &str,
) -> Result<bool, JsValue> {
    imposition::detect_source_box_mismatch(request_json, bytes, content_type).map_err(to_js_error)
}
