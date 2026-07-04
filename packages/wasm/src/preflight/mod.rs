pub mod image;
pub mod issue;
mod matrix;
pub(crate) mod pdf_utils;
mod rules;

use issue::{Issue, make_issue};
use lopdf::Document;
use pdf_utils::page_ids;
use serde_json::json;

pub use image::{
    RasterColorSpace, RasterImageEncoding, collect_image_issues_from_bytes, decode_raster_image,
    decode_raster_image_as_raw,
};

pub fn collect_document_issues(document: &Document) -> Vec<Issue> {
    if document.trailer.has(b"Encrypt") {
        return vec![make_issue(
            "Can't preflight an encrypted PDF",
            "String",
            json!({}),
        )];
    }

    rules::collect_issues(document)
}

pub fn collect_pdf_issues_from_bytes(bytes: &[u8]) -> Result<Vec<Issue>, String> {
    let document =
        Document::load_mem(bytes).map_err(|error| format!("Failed to parse PDF: {error}"))?;

    if page_ids(&document).is_empty() {
        return Err("PDF contains no pages".to_string());
    }

    Ok(collect_document_issues(&document))
}
