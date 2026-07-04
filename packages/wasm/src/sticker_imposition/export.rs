use crate::content_aware_bleed::{
    BleedInsetsPx, content_aware_pad_raster_data, mirror_pad_raster_data,
};
use crate::preflight::image::DecodedRasterImage;
use crate::preflight::pdf_utils::{
    PdfPageBox, ResolvedPageBounds, as_f64, box_misaligned_with_content, get_dict_from_object,
    inherited_page_array, inherited_page_dict, page_content_bounds, page_ids, resolve_page_bounds,
};
use crate::preflight::{RasterColorSpace, RasterImageEncoding, decode_raster_image_as_raw};
use crate::sticker_imposition::cut_lines::{
    PdfCutLinePath, PdfCutLineSourceTransform, PdfPathCommand, PdfPoint,
    remove_selected_cut_line_paths_from_content,
    selected_cut_line_paths_for_placement_with_transform,
};
use crate::sticker_imposition::layout::{
    resolve_placement_cut_bounds, resolve_placement_print_bounds, resolve_plan,
};
use crate::sticker_imposition::models::{
    ManualCutMark, StickerArtworkAsset, StickerBleedFillMode, StickerCutShape, StickerPlacement,
    StickerPlan, StickerSheet, parse_request_json,
};
use base64::Engine as _;
use lopdf::content::{Content, Operation};
use lopdf::{Dictionary, Document, Object, ObjectId, Stream, dictionary};
use serde::Serialize;
use serde_json::json;
use std::collections::HashMap;

const MM_TO_POINTS: f64 = 72.0 / 25.4;
const CUT_LINE_WIDTH_PT: f64 = 0.25;
const MIRROR_BLEED_SEAM_OVERLAP_PT: f64 = 0.25;
const PDF_BOX_MATCH_TOLERANCE_PT: f64 = 1.5;
const SOURCE_PDF_BOX_MISMATCH_WARNING_CODE: &str = "impose.warnings.sourcePdfBoxMismatch";
const CONTENT_AWARE_BLEED_FALLBACK_WARNING_CODE: &str =
    "impose.warnings.contentAwareBleedFallbackMirror";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct StickerArtifactFile {
    content: String,
    filename: String,
    is_binary: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StickerArtifactWarning {
    code: String,
    values: StickerArtifactWarningValues,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StickerArtifactWarningValues {
    filename: String,
}

fn real(v: f64) -> Object {
    Object::Real(v as f32)
}

fn decode_data_url_bytes(data_url: &str) -> Result<Vec<u8>, String> {
    let comma = data_url
        .find(',')
        .ok_or_else(|| "Invalid data URL: missing comma".to_string())?;
    base64::engine::general_purpose::STANDARD
        .decode(&data_url[comma + 1..])
        .map_err(|e| format!("Failed to decode data URL base64: {e}"))
}

fn data_url_content_type(data_url: &str) -> Option<String> {
    if !data_url.starts_with("data:") {
        return None;
    }

    let comma = data_url.find(',')?;
    let header = &data_url[5..comma];
    let mime = header.split(';').next()?.trim();

    if mime.is_empty() {
        return None;
    }

    Some(mime.to_ascii_lowercase())
}

fn is_pdf_data_url(data_url: &str) -> bool {
    matches!(
        data_url_content_type(data_url).as_deref(),
        Some("application/pdf") | Some("application/x-pdf")
    )
}

fn raster_data_url_content_type(data_url: &str) -> Result<String, String> {
    let content_type = data_url_content_type(data_url)
        .ok_or_else(|| "Sticker artwork data URL is missing a content type.".to_string())?;

    if content_type == "application/pdf" || content_type == "application/x-pdf" {
        return Err("Sticker artwork raster decoder received a PDF data URL.".to_string());
    }

    Ok(content_type)
}

fn create_pdf_source_form_for_asset(
    document: &mut Document,
    pdf_bytes: &[u8],
    placement: &StickerPlacement,
    page_number: usize,
    selected_cut_line_ids: &[String],
) -> Result<(PdfSourceFormRef, bool), String> {
    let mut source = Document::load_mem(pdf_bytes)
        .map_err(|error| format!("Failed to parse sticker source PDF: {error}"))?;
    let original_page_ids = page_ids(&source);

    if original_page_ids.is_empty() {
        return Err("Sticker source PDF contains no pages.".to_string());
    }

    let page_index = page_number.saturating_sub(1);
    if page_index >= original_page_ids.len() {
        return Err(format!(
            "Sticker source PDF page {} is out of range ({} pages).",
            page_number,
            original_page_ids.len()
        ));
    }

    source.renumber_objects_with(document.max_id + 1);
    let renumbered_page_ids = page_ids(&source);
    let page_id = renumbered_page_ids[page_index];
    let source_max_id = source.max_id;

    for (object_id, object) in &source.objects {
        document.objects.insert(*object_id, object.clone());
    }
    document.max_id = document.max_id.max(source_max_id);

    let page_object = source
        .get_object(page_id)
        .map_err(|error| format!("Failed to read sticker source page: {error}"))?;
    let page_dict = get_dict_from_object(&source, page_object)
        .ok_or_else(|| "Sticker source page is not a dictionary".to_string())?;
    let mirror_trim_bounds = if (placement.mirror_bleed_enabled
        || placement_requests_content_aware_bleed(placement))
        && placement.bleed_mm > 0.0
    {
        resolve_pdf_source_mirror_trim_bounds(&source, &page_dict, placement)
    } else {
        None
    };
    let bounds = mirror_trim_bounds
        .or_else(|| resolve_pdf_source_form_bounds(&source, &page_dict, placement))
        .or_else(|| {
            resolve_page_bounds(
                &source,
                page_id,
                &[
                    PdfPageBox::CropBox,
                    PdfPageBox::MediaBox,
                    PdfPageBox::BleedBox,
                    PdfPageBox::TrimBox,
                    PdfPageBox::ArtBox,
                ],
            )
            .ok()
            .map(|(_, bounds)| bounds)
        })
        .ok_or_else(|| {
            "Sticker source PDF page is missing a usable MediaBox/CropBox/BleedBox/TrimBox."
                .to_string()
        })?;
    let (bounds, source_box_demoted) =
        recenter_source_bounds_on_content(&source, &page_dict, page_id, bounds);
    let resources = inherited_page_dict(&source, &page_dict, b"Resources").unwrap_or_default();
    let content_bytes = source
        .get_page_content(page_id)
        .map_err(|error| format!("Failed to read sticker source page content: {error}"))?;
    let content_bytes = remove_selected_cut_line_paths_from_content(
        content_bytes,
        page_number,
        selected_cut_line_ids,
    )?;

    let mut form_dictionary = Dictionary::new();
    form_dictionary.set("Type", Object::Name(b"XObject".to_vec()));
    form_dictionary.set("Subtype", Object::Name(b"Form".to_vec()));
    form_dictionary.set("FormType", 1_i64);
    form_dictionary.set(
        "BBox",
        Object::Array(vec![
            real(0.0),
            real(0.0),
            real(bounds.width),
            real(bounds.height),
        ]),
    );
    form_dictionary.set(
        "Matrix",
        Object::Array(vec![
            real(1.0),
            real(0.0),
            real(0.0),
            real(1.0),
            real(-bounds.left),
            real(-bounds.bottom),
        ]),
    );
    form_dictionary.set("Resources", resources);

    if let Ok(group) = page_dict.get(b"Group") {
        form_dictionary.set("Group", group.clone());
    }

    let form_id = document.add_object(Stream::new(form_dictionary, content_bytes));

    let source_form = PdfSourceFormRef {
        form_id,
        height: bounds.height,
        width: bounds.width,
    };

    if mirror_trim_bounds.is_some() {
        let mirror_form = build_mirror_bleed_pdf_source_form(
            document,
            source_form.form_id,
            source_form.width,
            source_form.height,
            placement.bleed_mm,
            placement_content_width_mm(placement),
            placement_content_height_mm(placement),
        )?;
        return Ok((mirror_form, source_box_demoted));
    }

    Ok((source_form, source_box_demoted))
}

/// When the resolved source `bounds` is mis-positioned relative to the page's
/// drawn artwork (the Canva wrong-page-box symptom), slide the same-size window
/// so it is centered on the artwork instead, clamped to the page. Keeping the
/// size unchanged means downstream placement scaling is unaffected; only the
/// anchor moves. Returns the (possibly adjusted) bounds and whether an
/// adjustment was made.
fn recenter_source_bounds_on_content(
    document: &Document,
    page_dict: &Dictionary,
    page_id: ObjectId,
    bounds: ResolvedPageBounds,
) -> (ResolvedPageBounds, bool) {
    if !box_misaligned_with_content(document, page_id, &bounds) {
        return (bounds, false);
    }
    let Some(content) = page_content_bounds(document, page_id) else {
        return (bounds, false);
    };

    let container = resolve_inherited_page_bounds(document, page_dict, PdfPageBox::MediaBox)
        .or_else(|| resolve_inherited_page_bounds(document, page_dict, PdfPageBox::CropBox));

    let mut left = content.center_x() - bounds.width / 2.0;
    let mut bottom = content.center_y() - bounds.height / 2.0;

    if let Some(container) = container {
        let max_left = (container.right() - bounds.width).max(container.left);
        let max_bottom = (container.top() - bounds.height).max(container.bottom);
        left = left.clamp(container.left, max_left);
        bottom = bottom.clamp(container.bottom, max_bottom);
    }

    (
        ResolvedPageBounds {
            left,
            bottom,
            width: bounds.width,
            height: bounds.height,
        },
        true,
    )
}

fn resolve_pdf_source_form_bounds(
    document: &Document,
    page_dict: &Dictionary,
    placement: &StickerPlacement,
) -> Option<ResolvedPageBounds> {
    let media_bounds = resolve_inherited_page_bounds(document, page_dict, PdfPageBox::MediaBox);
    let crop_bounds =
        resolve_inherited_page_bounds(document, page_dict, PdfPageBox::CropBox).or(media_bounds);
    let trim_bounds = resolve_inherited_page_bounds(document, page_dict, PdfPageBox::TrimBox);
    let bleed_bounds = resolve_inherited_page_bounds(document, page_dict, PdfPageBox::BleedBox);
    let art_bounds = resolve_inherited_page_bounds(document, page_dict, PdfPageBox::ArtBox);
    let print_bounds = resolve_placement_print_bounds(placement);
    let final_print_width_mm = print_bounds.max_x_mm - print_bounds.min_x_mm;
    let final_print_height_mm = print_bounds.max_y_mm - print_bounds.min_y_mm;
    let desired_print_width_pt = mm_to_points(if placement.rotation_degrees == 90 {
        final_print_height_mm
    } else {
        final_print_width_mm
    });
    let desired_print_height_pt = mm_to_points(if placement.rotation_degrees == 90 {
        final_print_width_mm
    } else {
        final_print_height_mm
    });
    let desired_trim_width_pt = mm_to_points(placement_content_width_mm(placement));
    let desired_trim_height_pt = mm_to_points(placement_content_height_mm(placement));

    if let Some(bounds) = bleed_bounds.filter(|bounds| {
        bounds_match_size(*bounds, desired_print_width_pt, desired_print_height_pt)
    }) {
        return Some(bounds);
    }

    if let Some(bounds) = crop_bounds.filter(|bounds| {
        bounds_match_size(*bounds, desired_print_width_pt, desired_print_height_pt)
    }) {
        return Some(bounds);
    }

    if let Some(bounds) = media_bounds.filter(|bounds| {
        bounds_match_size(*bounds, desired_print_width_pt, desired_print_height_pt)
    }) {
        return Some(bounds);
    }

    if let Some(bounds) = trim_bounds
        .filter(|bounds| bounds_match_size(*bounds, desired_trim_width_pt, desired_trim_height_pt))
    {
        let expanded_bounds = expand_bounds_by_mm(bounds, placement.bleed_mm.max(0.0));
        return Some(clamp_bounds_to_available_page(
            expanded_bounds,
            crop_bounds.or(media_bounds),
        ));
    }

    // Fall back to the trustworthy outer page boxes (Crop/Media) before the
    // inner Trim/Art boxes, which exporters such as Canva frequently mis-set.
    // Any residual mis-positioning of the chosen box is corrected afterwards by
    // recenter_source_bounds_on_content.
    crop_bounds.or(media_bounds).or(trim_bounds).or(art_bounds)
}

fn resolve_pdf_source_mirror_trim_bounds(
    document: &Document,
    page_dict: &Dictionary,
    placement: &StickerPlacement,
) -> Option<ResolvedPageBounds> {
    let desired_trim_width_pt = mm_to_points(placement_content_width_mm(placement));
    let desired_trim_height_pt = mm_to_points(placement_content_height_mm(placement));
    let trim_bounds = resolve_inherited_page_bounds(document, page_dict, PdfPageBox::TrimBox);
    let art_bounds = resolve_inherited_page_bounds(document, page_dict, PdfPageBox::ArtBox);
    let crop_bounds = resolve_inherited_page_bounds(document, page_dict, PdfPageBox::CropBox);
    let media_bounds = resolve_inherited_page_bounds(document, page_dict, PdfPageBox::MediaBox);

    [
        trim_bounds,
        art_bounds,
        crop_bounds,
        media_bounds,
        resolve_inherited_page_bounds(document, page_dict, PdfPageBox::BleedBox),
    ]
    .into_iter()
    .flatten()
    .find(|bounds| bounds_match_size(*bounds, desired_trim_width_pt, desired_trim_height_pt))
}

fn resolve_inherited_page_bounds(
    document: &Document,
    page_dict: &Dictionary,
    page_box: PdfPageBox,
) -> Option<ResolvedPageBounds> {
    let values = inherited_page_array(document, page_dict, page_box.key())?;
    parse_resolved_page_bounds(&values)
}

fn parse_resolved_page_bounds(values: &[Object]) -> Option<ResolvedPageBounds> {
    if values.len() < 4 {
        return None;
    }

    let x0 = as_f64(&values[0])?;
    let y0 = as_f64(&values[1])?;
    let x1 = as_f64(&values[2])?;
    let y1 = as_f64(&values[3])?;
    let left = x0.min(x1);
    let right = x0.max(x1);
    let bottom = y0.min(y1);
    let top = y0.max(y1);
    let width = right - left;
    let height = top - bottom;

    (width > 0.0 && height > 0.0).then_some(ResolvedPageBounds {
        height,
        left,
        bottom,
        width,
    })
}

fn bounds_match_size(bounds: ResolvedPageBounds, width_pt: f64, height_pt: f64) -> bool {
    (bounds.width - width_pt).abs() <= PDF_BOX_MATCH_TOLERANCE_PT
        && (bounds.height - height_pt).abs() <= PDF_BOX_MATCH_TOLERANCE_PT
}

fn expand_bounds_by_mm(bounds: ResolvedPageBounds, bleed_mm: f64) -> ResolvedPageBounds {
    let bleed_pt = mm_to_points(bleed_mm);

    ResolvedPageBounds {
        bottom: bounds.bottom - bleed_pt,
        height: bounds.height + bleed_pt * 2.0,
        left: bounds.left - bleed_pt,
        width: bounds.width + bleed_pt * 2.0,
    }
}

fn clamp_bounds_to_available_page(
    bounds: ResolvedPageBounds,
    available_bounds: Option<ResolvedPageBounds>,
) -> ResolvedPageBounds {
    let Some(available) = available_bounds else {
        return bounds;
    };

    let left = bounds.left.max(available.left);
    let bottom = bounds.bottom.max(available.bottom);
    let right = (bounds.left + bounds.width).min(available.left + available.width);
    let top = (bounds.bottom + bounds.height).min(available.bottom + available.height);

    if right <= left || top <= bottom {
        return bounds;
    }

    ResolvedPageBounds {
        bottom,
        height: top - bottom,
        left,
        width: right - left,
    }
}

fn build_mirror_bleed_pdf_source_form(
    document: &mut Document,
    original_form_id: ObjectId,
    source_width: f64,
    source_height: f64,
    bleed_mm: f64,
    trim_width_mm: f64,
    trim_height_mm: f64,
) -> Result<PdfSourceFormRef, String> {
    let bleed = mm_to_points(bleed_mm.max(0.0));
    let trim_width = mm_to_points(trim_width_mm);
    let trim_height = mm_to_points(trim_height_mm);
    let scale_x = trim_width / source_width.max(f64::EPSILON);
    let scale_y = trim_height / source_height.max(f64::EPSILON);
    let scaled_width = source_width * scale_x;
    let scaled_height = source_height * scale_y;
    let target_width = trim_width + 2.0 * bleed;
    let target_height = trim_height + 2.0 * bleed;
    let overlap = MIRROR_BLEED_SEAM_OVERLAP_PT;
    let origin_x = bleed + (trim_width - scaled_width) / 2.0;
    let origin_y = bleed + (trim_height - scaled_height) / 2.0;

    let transforms = [
        [
            -scale_x,
            0.0,
            0.0,
            scale_y,
            2.0 * bleed - origin_x + overlap,
            origin_y,
        ],
        [
            -scale_x,
            0.0,
            0.0,
            scale_y,
            2.0 * (bleed + trim_width) - origin_x - overlap,
            origin_y,
        ],
        [
            scale_x,
            0.0,
            0.0,
            -scale_y,
            origin_x,
            2.0 * bleed - origin_y + overlap,
        ],
        [
            scale_x,
            0.0,
            0.0,
            -scale_y,
            origin_x,
            2.0 * (bleed + trim_height) - origin_y - overlap,
        ],
        [
            -scale_x,
            0.0,
            0.0,
            -scale_y,
            2.0 * bleed - origin_x + overlap,
            2.0 * bleed - origin_y + overlap,
        ],
        [
            -scale_x,
            0.0,
            0.0,
            -scale_y,
            2.0 * (bleed + trim_width) - origin_x - overlap,
            2.0 * bleed - origin_y + overlap,
        ],
        [
            -scale_x,
            0.0,
            0.0,
            -scale_y,
            2.0 * bleed - origin_x + overlap,
            2.0 * (bleed + trim_height) - origin_y - overlap,
        ],
        [
            -scale_x,
            0.0,
            0.0,
            -scale_y,
            2.0 * (bleed + trim_width) - origin_x - overlap,
            2.0 * (bleed + trim_height) - origin_y - overlap,
        ],
        [scale_x, 0.0, 0.0, scale_y, origin_x, origin_y],
    ];

    let mut operations = Vec::with_capacity(transforms.len() * 4);
    for [a, b, c, d, e, f] in transforms {
        operations.push(Operation::new("q", vec![]));
        operations.push(Operation::new(
            "cm",
            vec![real(a), real(b), real(c), real(d), real(e), real(f)],
        ));
        operations.push(Operation::new("Do", vec![Object::Name(b"Src".to_vec())]));
        operations.push(Operation::new("Q", vec![]));
    }

    let mut xobjects = Dictionary::new();
    xobjects.set("Src", original_form_id);
    let mut resources = Dictionary::new();
    resources.set("XObject", xobjects);

    let mut form_dictionary = Dictionary::new();
    form_dictionary.set("Type", Object::Name(b"XObject".to_vec()));
    form_dictionary.set("Subtype", Object::Name(b"Form".to_vec()));
    form_dictionary.set("FormType", 1_i64);
    form_dictionary.set(
        "BBox",
        Object::Array(vec![
            real(0.0),
            real(0.0),
            real(target_width),
            real(target_height),
        ]),
    );
    form_dictionary.set("Resources", resources);

    let content = Content { operations };
    let form_id = document.add_object(Stream::new(
        form_dictionary,
        content
            .encode()
            .map_err(|error| format!("Failed to encode mirrored sticker bleed form: {error}"))?,
    ));

    Ok(PdfSourceFormRef {
        form_id,
        height: target_height,
        width: target_width,
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct StickerArtifactEnvelope {
    files: Vec<StickerArtifactFile>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    warnings: Vec<StickerArtifactWarning>,
}

#[derive(Debug)]
struct GeneratedStickerSheet<'a> {
    cut_pdf_bytes: Vec<u8>,
    print_pdf_bytes: Vec<u8>,
    repeat_count: usize,
    sheet: &'a StickerSheet,
}

#[derive(Debug, Clone)]
struct PreparedPrintRaster {
    bits_per_component: u8,
    color_space: RasterColorSpace,
    data: Vec<u8>,
    draw_height_mm: f64,
    draw_width_mm: f64,
    draw_x_mm: f64,
    draw_y_mm: f64,
    height_px: u32,
    width_px: u32,
    warning: Option<StickerArtifactWarning>,
}

#[derive(Debug, Clone)]
struct PdfSourceFormRef {
    form_id: ObjectId,
    height: f64,
    width: f64,
}

pub fn create_artifacts_json(request_json: &str) -> Result<String, String> {
    let request = parse_request_json(request_json)?;
    let plan = resolve_plan(&request);
    let artifacts = create_artifacts(&plan, &request.assets)?;

    serde_json::to_string(&artifacts)
        .map_err(|error| format!("Failed to serialize sticker imposition artifacts: {error}"))
}

fn create_artifacts(
    plan: &StickerPlan,
    assets: &[StickerArtworkAsset],
) -> Result<StickerArtifactEnvelope, String> {
    let asset_map = assets
        .iter()
        .map(|asset| (asset.item_id.as_str(), asset.data_url.as_str()))
        .collect::<HashMap<_, _>>();
    let mut generated_sheets: Vec<GeneratedStickerSheet> = Vec::new();
    let mut warnings: Vec<StickerArtifactWarning> = Vec::new();

    for sheet in &plan.sheets {
        let (pdf_bytes, sheet_warnings) = create_print_pdf(sheet, &asset_map)?;
        for warning in sheet_warnings {
            push_unique_warning(&mut warnings, warning);
        }
        let cut_pdf_bytes = create_cut_pdf(sheet, &asset_map)?;

        if let Some(existing_sheet) = generated_sheets.iter_mut().find(|candidate| {
            candidate.print_pdf_bytes == pdf_bytes && candidate.cut_pdf_bytes == cut_pdf_bytes
        }) {
            existing_sheet.repeat_count += 1;
            continue;
        }

        generated_sheets.push(GeneratedStickerSheet {
            cut_pdf_bytes,
            print_pdf_bytes: pdf_bytes,
            repeat_count: 1,
            sheet,
        });
    }

    let mut files = Vec::new();

    for (index, sheet) in generated_sheets.iter().enumerate() {
        let sheet_number = index + 1;
        let suffix = sheet_filename_repeat_suffix(sheet.repeat_count);

        files.push(StickerArtifactFile {
            content: base64::engine::general_purpose::STANDARD.encode(&sheet.print_pdf_bytes),
            filename: format!("print/sheet-{sheet_number}{suffix}.pdf"),
            is_binary: true,
        });
        files.push(StickerArtifactFile {
            content: base64::engine::general_purpose::STANDARD.encode(&sheet.cut_pdf_bytes),
            filename: format!("cut/sheet-{sheet_number}{suffix}.pdf"),
            is_binary: true,
        });
    }

    files.push(StickerArtifactFile {
        content: serde_json::to_string_pretty(&create_manifest(plan, &generated_sheets))
            .map_err(|error| format!("Failed to serialize sticker manifest: {error}"))?,
        filename: "manifest.json".to_string(),
        is_binary: false,
    });

    Ok(StickerArtifactEnvelope { files, warnings })
}

fn sheet_filename_repeat_suffix(repeat_count: usize) -> String {
    if repeat_count > 1 {
        format!("-x{repeat_count}")
    } else {
        String::new()
    }
}

fn create_print_pdf(
    sheet: &StickerSheet,
    asset_map: &HashMap<&str, &str>,
) -> Result<(Vec<u8>, Vec<StickerArtifactWarning>), String> {
    let has_edge_content = !sheet.opos_marks.is_empty() || !sheet.manual_cut_marks.is_empty();
    let (doc_width_mm, doc_height_mm, x_offset_mm, y_offset_mm) = if has_edge_content {
        resolve_document_box(sheet)
    } else {
        (
            sheet.export_width_mm,
            sheet.export_height_mm,
            sheet.export_x_mm,
            sheet.export_y_mm,
        )
    };

    let doc_width_pt = mm_to_points(doc_width_mm);
    let doc_height_pt = mm_to_points(doc_height_mm);
    let mut document = Document::with_version("1.5");
    let pages_root_id = document.new_object_id();
    let mut xobjects = Dictionary::new();
    let mut ops: Vec<Operation> = Vec::new();
    let mut pdf_form_cache: HashMap<String, PdfSourceFormRef> = HashMap::new();
    let mut warnings: Vec<StickerArtifactWarning> = Vec::new();

    // White background
    ops.push(Operation::new("q", vec![]));
    ops.push(Operation::new("g", vec![real(1.0)]));
    ops.push(Operation::new(
        "re",
        vec![
            real(0.0),
            real(0.0),
            real(doc_width_pt),
            real(doc_height_pt),
        ],
    ));
    ops.push(Operation::new("f", vec![]));
    ops.push(Operation::new("Q", vec![]));

    // Artwork placements
    for (idx, placement) in sheet.placements.iter().enumerate() {
        let data_url = asset_map
            .get(placement.item_id.as_str())
            .ok_or_else(|| format!("Missing rendered artwork for {}.", placement.filename))?;

        let print_bounds = resolve_placement_print_bounds(placement);
        let draw_x_mm = print_bounds.min_x_mm;
        let draw_y_mm = print_bounds.min_y_mm;
        let draw_width_mm = print_bounds.max_x_mm - print_bounds.min_x_mm;
        let draw_height_mm = print_bounds.max_y_mm - print_bounds.min_y_mm;
        let x_mm = draw_x_mm - x_offset_mm;
        let y_mm = draw_y_mm - y_offset_mm;
        let w_pt = mm_to_points(draw_width_mm);
        let h_pt = mm_to_points(draw_height_mm);
        let x_pt = mm_to_points(x_mm);
        let y_pt = doc_height_pt - mm_to_points(y_mm) - h_pt;

        if is_pdf_data_url(data_url) {
            let cache_key = placement.item_id.clone();
            let source_form = if let Some(cached_form) = pdf_form_cache.get(&cache_key) {
                cached_form.clone()
            } else {
                let pdf_bytes = decode_data_url_bytes(data_url)?;
                let (form, source_box_demoted) = create_pdf_source_form_for_asset(
                    &mut document,
                    &pdf_bytes,
                    placement,
                    placement.page_number,
                    &placement.selected_pdf_cut_line_ids,
                )?;
                if source_box_demoted {
                    push_unique_warning(
                        &mut warnings,
                        sticker_artifact_warning(
                            SOURCE_PDF_BOX_MISMATCH_WARNING_CODE,
                            &placement.filename,
                        ),
                    );
                }
                if placement_requests_content_aware_bleed(placement) {
                    push_unique_warning(
                        &mut warnings,
                        sticker_artifact_warning(
                            CONTENT_AWARE_BLEED_FALLBACK_WARNING_CODE,
                            &placement.filename,
                        ),
                    );
                }
                pdf_form_cache.insert(cache_key, form.clone());
                form
            };

            let form_name = format!("Fm{idx}");
            xobjects.set(form_name.as_bytes(), source_form.form_id);
            let source_scale_x = if placement.rotation_degrees == 90 {
                h_pt / source_form.width.max(f64::EPSILON)
            } else {
                w_pt / source_form.width.max(f64::EPSILON)
            };
            let source_scale_y = if placement.rotation_degrees == 90 {
                w_pt / source_form.height.max(f64::EPSILON)
            } else {
                h_pt / source_form.height.max(f64::EPSILON)
            };

            ops.push(Operation::new("q", vec![]));
            ops.push(Operation::new(
                "cm",
                placement_transform_operands(
                    placement,
                    source_scale_x,
                    source_scale_y,
                    x_pt,
                    y_pt,
                    h_pt,
                ),
            ));
            ops.push(Operation::new(
                "Do",
                vec![Object::Name(form_name.into_bytes())],
            ));
            ops.push(Operation::new("Q", vec![]));
            continue;
        }

        let raster_bytes = decode_data_url_bytes(data_url)?;
        let content_type = raster_data_url_content_type(data_url)?;
        let raster = decode_raster_image_as_raw(&raster_bytes, &content_type, None)?;
        let prepared_raster = prepare_print_raster(raster, placement)?;
        if let Some(warning) = prepared_raster.warning.clone() {
            push_unique_warning(&mut warnings, warning);
        }

        let mut img_dict = Dictionary::new();
        img_dict.set("Type", Object::Name(b"XObject".to_vec()));
        img_dict.set("Subtype", Object::Name(b"Image".to_vec()));
        img_dict.set("Width", Object::Integer(prepared_raster.width_px as i64));
        img_dict.set("Height", Object::Integer(prepared_raster.height_px as i64));
        img_dict.set(
            "BitsPerComponent",
            Object::Integer(prepared_raster.bits_per_component as i64),
        );
        img_dict.set(
            "ColorSpace",
            Object::Name(match prepared_raster.color_space {
                RasterColorSpace::DeviceGray => b"DeviceGray".to_vec(),
                RasterColorSpace::DeviceRgb => b"DeviceRGB".to_vec(),
            }),
        );

        let img_stream = Stream::new(img_dict, prepared_raster.data);

        let img_id = document.add_object(img_stream);
        let img_name = format!("Im{idx}");
        xobjects.set(img_name.as_bytes(), img_id);

        let x_mm = prepared_raster.draw_x_mm - x_offset_mm;
        let y_mm = prepared_raster.draw_y_mm - y_offset_mm;
        let w_pt = mm_to_points(prepared_raster.draw_width_mm);
        let h_pt = mm_to_points(prepared_raster.draw_height_mm);
        let x_pt = mm_to_points(x_mm);
        let y_pt = doc_height_pt - mm_to_points(y_mm) - h_pt;
        let image_scale_x = if placement.rotation_degrees == 90 {
            h_pt
        } else {
            w_pt
        };
        let image_scale_y = if placement.rotation_degrees == 90 {
            w_pt
        } else {
            h_pt
        };

        ops.push(Operation::new("q", vec![]));
        ops.push(Operation::new(
            "cm",
            placement_transform_operands(placement, image_scale_x, image_scale_y, x_pt, y_pt, h_pt),
        ));
        ops.push(Operation::new(
            "Do",
            vec![Object::Name(img_name.into_bytes())],
        ));
        ops.push(Operation::new("Q", vec![]));
    }

    // OPOS registration marks
    for mark in &sheet.opos_marks {
        let mark_x_mm = mark.x_mm - x_offset_mm;
        let mark_y_mm = mark.y_mm - y_offset_mm;
        let mark_width_mm = mark.width_mm;
        let mark_height_mm = mark.height_mm;

        let mx_pt = mm_to_points(mark_x_mm);
        let mw_pt = mm_to_points(mark_width_mm);
        let mh_pt = mm_to_points(mark_height_mm);
        let my_pt = doc_height_pt - mm_to_points(mark_y_mm) - mh_pt;

        ops.push(Operation::new("q", vec![]));
        ops.push(Operation::new("g", vec![real(0.0)]));
        ops.push(Operation::new(
            "re",
            vec![real(mx_pt), real(my_pt), real(mw_pt), real(mh_pt)],
        ));
        ops.push(Operation::new("f", vec![]));
        ops.push(Operation::new("Q", vec![]));
    }

    // Manual cut marks
    for mark in &sheet.manual_cut_marks {
        let x1_pt = mm_to_points(mark.x1_mm - x_offset_mm);
        let y1_pt = doc_height_pt - mm_to_points(mark.y1_mm - y_offset_mm);
        let x2_pt = mm_to_points(mark.x2_mm - x_offset_mm);
        let y2_pt = doc_height_pt - mm_to_points(mark.y2_mm - y_offset_mm);

        ops.push(Operation::new("q", vec![]));
        ops.push(Operation::new("G", vec![real(0.0)]));
        ops.push(Operation::new("w", vec![real(CUT_LINE_WIDTH_PT)]));
        ops.push(Operation::new("m", vec![real(x1_pt), real(y1_pt)]));
        ops.push(Operation::new("l", vec![real(x2_pt), real(y2_pt)]));
        ops.push(Operation::new("S", vec![]));
        ops.push(Operation::new("Q", vec![]));
    }

    let mut resources = Dictionary::new();
    resources.set("XObject", xobjects);

    let content = Content { operations: ops };
    let content_bytes = content
        .encode()
        .map_err(|e| format!("Failed to encode sticker PDF content: {e}"))?;
    let content_id = document.add_object(Stream::new(Dictionary::new(), content_bytes));

    let page_id = document.add_object(dictionary! {
        "Type" => Object::Name(b"Page".to_vec()),
        "Parent" => pages_root_id,
        "MediaBox" => Object::Array(vec![
            real(0.0), real(0.0), real(doc_width_pt), real(doc_height_pt),
        ]),
        "Contents" => content_id,
        "Resources" => resources,
    });

    document.objects.insert(
        pages_root_id,
        Object::Dictionary(dictionary! {
            "Type" => Object::Name(b"Pages".to_vec()),
            "Kids" => Object::Array(vec![Object::Reference(page_id)]),
            "Count" => Object::Integer(1),
        }),
    );

    let catalog_id = document.add_object(dictionary! {
        "Type" => Object::Name(b"Catalog".to_vec()),
        "Pages" => pages_root_id,
    });
    document.trailer.set("Root", catalog_id);
    document.compress();

    let mut bytes = Vec::new();
    document
        .save_to(&mut bytes)
        .map_err(|e| format!("Failed to serialize sticker print PDF: {e}"))?;
    Ok((bytes, warnings))
}

fn placement_transform_operands(
    placement: &StickerPlacement,
    scale_x: f64,
    scale_y: f64,
    x_pt: f64,
    y_pt: f64,
    height_pt: f64,
) -> Vec<Object> {
    if placement.rotation_degrees == 90 {
        return vec![
            real(0.0),
            real(-scale_x),
            real(scale_y),
            real(0.0),
            real(x_pt),
            real(y_pt + height_pt),
        ];
    }

    vec![
        real(scale_x),
        real(0.0),
        real(0.0),
        real(scale_y),
        real(x_pt),
        real(y_pt),
    ]
}

fn prepare_print_raster(
    raster: DecodedRasterImage,
    placement: &StickerPlacement,
) -> Result<PreparedPrintRaster, String> {
    let print_bounds = resolve_placement_print_bounds(placement);
    let draw_x_mm = print_bounds.min_x_mm;
    let draw_y_mm = print_bounds.min_y_mm;
    let draw_width_mm = print_bounds.max_x_mm - print_bounds.min_x_mm;
    let draw_height_mm = print_bounds.max_y_mm - print_bounds.min_y_mm;
    let left_bleed_mm = (placement.x_mm - draw_x_mm).max(0.0);
    let top_bleed_mm = (placement.y_mm - draw_y_mm).max(0.0);
    let right_bleed_mm = (print_bounds.max_x_mm - (placement.x_mm + placement.width_mm)).max(0.0);
    let bottom_bleed_mm = (print_bounds.max_y_mm - (placement.y_mm + placement.height_mm)).max(0.0);
    let content_width_mm = placement_content_width_mm(placement);
    let content_height_mm = placement_content_height_mm(placement);

    let existing_horizontal_bleed_mm = source_content_width_mm(placement)
        .map(|source_width_mm| ((source_width_mm - content_width_mm) / 2.0).max(0.0))
        .unwrap_or(0.0);
    let existing_vertical_bleed_mm = source_content_height_mm(placement)
        .map(|source_height_mm| ((source_height_mm - content_height_mm) / 2.0).max(0.0))
        .unwrap_or(0.0);
    let missing_left_bleed_mm = (left_bleed_mm - existing_horizontal_bleed_mm).max(0.0);
    let missing_right_bleed_mm = (right_bleed_mm - existing_horizontal_bleed_mm).max(0.0);
    let missing_top_bleed_mm = (top_bleed_mm - existing_vertical_bleed_mm).max(0.0);
    let missing_bottom_bleed_mm = (bottom_bleed_mm - existing_vertical_bleed_mm).max(0.0);

    let left_bleed_px =
        millimeters_to_pixels(missing_left_bleed_mm, content_width_mm, raster.width_px);
    let right_bleed_px =
        millimeters_to_pixels(missing_right_bleed_mm, content_width_mm, raster.width_px);
    let top_bleed_px =
        millimeters_to_pixels(missing_top_bleed_mm, content_height_mm, raster.height_px);
    let bottom_bleed_px =
        millimeters_to_pixels(missing_bottom_bleed_mm, content_height_mm, raster.height_px);
    let width_px = raster.width_px + left_bleed_px + right_bleed_px;
    let height_px = raster.height_px + top_bleed_px + bottom_bleed_px;
    let insets = BleedInsetsPx {
        left: left_bleed_px,
        right: right_bleed_px,
        top: top_bleed_px,
        bottom: bottom_bleed_px,
    };
    let mut warning = None;
    let data = match raster.encoding {
        RasterImageEncoding::Raw(data) => {
            if placement_requests_content_aware_bleed(placement) {
                content_aware_pad_raster_data(
                    &data,
                    raster.width_px,
                    raster.height_px,
                    raster.color_space,
                    insets,
                )
                .unwrap_or_else(|_| {
                    warning = Some(sticker_artifact_warning(
                        CONTENT_AWARE_BLEED_FALLBACK_WARNING_CODE,
                        &placement.filename,
                    ));
                    mirror_pad_raster_data(
                        &data,
                        raster.width_px,
                        raster.height_px,
                        raster.color_space,
                        insets,
                    )
                })
            } else {
                mirror_pad_raster_data(
                    &data,
                    raster.width_px,
                    raster.height_px,
                    raster.color_space,
                    insets,
                )
            }
        }
        RasterImageEncoding::Jpeg(_) => {
            return Err(
                "Sticker print bleed currently requires raw raster artwork data.".to_string(),
            );
        }
    };

    Ok(PreparedPrintRaster {
        bits_per_component: raster.bits_per_component,
        color_space: raster.color_space,
        data,
        draw_height_mm,
        draw_width_mm,
        draw_x_mm,
        draw_y_mm,
        height_px,
        width_px,
        warning,
    })
}

fn placement_requests_content_aware_bleed(placement: &StickerPlacement) -> bool {
    placement.bleed_mm > 0.0
        && matches!(
            placement.bleed_fill_mode,
            StickerBleedFillMode::ContentAwareFast
        )
}

fn sticker_artifact_warning(code: &str, filename: &str) -> StickerArtifactWarning {
    StickerArtifactWarning {
        code: code.to_string(),
        values: StickerArtifactWarningValues {
            filename: filename.to_string(),
        },
    }
}

fn push_unique_warning(
    warnings: &mut Vec<StickerArtifactWarning>,
    warning: StickerArtifactWarning,
) {
    if warnings.iter().any(|candidate| {
        candidate.code == warning.code && candidate.values.filename == warning.values.filename
    }) {
        return;
    }

    warnings.push(warning);
}

fn placement_content_width_mm(placement: &StickerPlacement) -> f64 {
    if placement.rotation_degrees == 90 {
        placement.height_mm
    } else {
        placement.width_mm
    }
}

fn placement_content_height_mm(placement: &StickerPlacement) -> f64 {
    if placement.rotation_degrees == 90 {
        placement.width_mm
    } else {
        placement.height_mm
    }
}

fn source_content_width_mm(placement: &StickerPlacement) -> Option<f64> {
    if placement.rotation_degrees == 90 {
        placement.source_height_mm
    } else {
        placement.source_width_mm
    }
}

fn source_content_height_mm(placement: &StickerPlacement) -> Option<f64> {
    if placement.rotation_degrees == 90 {
        placement.source_width_mm
    } else {
        placement.source_height_mm
    }
}

fn millimeters_to_pixels(value_mm: f64, content_mm: f64, content_px: u32) -> u32 {
    if value_mm <= 0.0 || content_mm <= 0.0 || content_px == 0 {
        return 0;
    }

    (((value_mm / content_mm) * content_px as f64).round()).max(0.0) as u32
}

fn create_cut_pdf(
    sheet: &StickerSheet,
    asset_map: &HashMap<&str, &str>,
) -> Result<Vec<u8>, String> {
    let has_edge_content = !sheet.opos_marks.is_empty() || !sheet.manual_cut_marks.is_empty();
    let (doc_width_mm, doc_height_mm, x_offset_mm, y_offset_mm) = if has_edge_content {
        resolve_document_box(sheet)
    } else {
        (
            sheet.export_width_mm,
            sheet.export_height_mm,
            sheet.export_x_mm,
            sheet.export_y_mm,
        )
    };

    let doc_width_pt = mm_to_points(doc_width_mm);
    let doc_height_pt = mm_to_points(doc_height_mm);
    let mut document = Document::with_version("1.5");
    let pages_root_id = document.new_object_id();
    let mut ops = vec![
        Operation::new("G", vec![real(0.0)]),
        Operation::new("g", vec![real(0.0)]),
        Operation::new("w", vec![real(CUT_LINE_WIDTH_PT)]),
        Operation::new("j", vec![Object::Integer(1)]),
        Operation::new("J", vec![Object::Integer(1)]),
    ];

    for placement in &sheet.placements {
        let x_mm = placement.x_mm - x_offset_mm;
        let y_mm = placement.y_mm - y_offset_mm;
        let offset_mm = placement.cut_offset_mm;

        if !placement.selected_pdf_cut_line_ids.is_empty() {
            let data_url = asset_map.get(placement.item_id.as_str()).ok_or_else(|| {
                format!(
                    "Missing PDF source for selected cut lines in {}.",
                    placement.filename
                )
            })?;
            let source_transform = resolve_pdf_cut_line_source_transform(data_url, placement)?;
            let selected_paths = selected_cut_line_paths_for_placement_with_transform(
                data_url,
                placement,
                source_transform,
            )?;

            if selected_paths.is_empty() {
                return Err(format!(
                    "Selected PDF cut lines were not found in {}.",
                    placement.filename
                ));
            }

            for selected_path in selected_paths {
                append_pdf_cut_line_ops(
                    &mut ops,
                    placement,
                    &selected_path,
                    x_offset_mm,
                    y_offset_mm,
                    doc_height_pt,
                );
            }
            continue;
        }

        if placement.cut_shape == StickerCutShape::Circle {
            let radius_mm = placement.width_mm.max(placement.height_mm) / 2.0 + offset_mm;
            let center_x_mm = x_mm + placement.width_mm / 2.0;
            let center_y_mm = y_mm + placement.height_mm / 2.0;

            append_circle_cut_ops(&mut ops, center_x_mm, center_y_mm, radius_mm, doc_height_pt);
            continue;
        }

        let bounds = resolve_placement_cut_bounds(placement);
        let cut_x_mm = bounds.min_x_mm - x_offset_mm;
        let cut_y_mm = bounds.min_y_mm - y_offset_mm;
        let cut_width_mm = bounds.max_x_mm - bounds.min_x_mm;
        let cut_height_mm = bounds.max_y_mm - bounds.min_y_mm;
        if placement.cut_shape == StickerCutShape::DieCut {
            append_rounded_rect_cut_ops(
                &mut ops,
                cut_x_mm,
                cut_y_mm,
                cut_width_mm,
                cut_height_mm,
                doc_height_pt,
                cut_width_mm.min(cut_height_mm) * 0.16,
            );
        } else {
            append_rect_cut_ops(
                &mut ops,
                cut_x_mm,
                cut_y_mm,
                cut_width_mm,
                cut_height_mm,
                doc_height_pt,
            );
        }
    }

    for part in &sheet.part_boundaries {
        append_rect_cut_ops(
            &mut ops,
            part.x_mm - x_offset_mm,
            part.y_mm - y_offset_mm,
            part.width_mm,
            part.height_mm,
            doc_height_pt,
        );
    }

    for mark in &sheet.opos_marks {
        append_filled_rect_cut_ops(
            &mut ops,
            mark.x_mm - x_offset_mm,
            mark.y_mm - y_offset_mm,
            mark.width_mm,
            mark.height_mm,
            doc_height_pt,
        );
    }

    for mark in &sheet.manual_cut_marks {
        append_manual_cut_mark_ops(&mut ops, mark, x_offset_mm, y_offset_mm, doc_height_pt);
    }

    let content = Content { operations: ops };
    let content_bytes = content
        .encode()
        .map_err(|error| format!("Failed to encode sticker cut PDF content: {error}"))?;
    let content_id = document.add_object(Stream::new(Dictionary::new(), content_bytes));

    let page_id = document.add_object(dictionary! {
        "Type" => Object::Name(b"Page".to_vec()),
        "Parent" => pages_root_id,
        "MediaBox" => Object::Array(vec![
            real(0.0), real(0.0), real(doc_width_pt), real(doc_height_pt),
        ]),
        "Contents" => content_id,
        "Resources" => dictionary! {},
    });

    document.objects.insert(
        pages_root_id,
        Object::Dictionary(dictionary! {
            "Type" => Object::Name(b"Pages".to_vec()),
            "Kids" => Object::Array(vec![Object::Reference(page_id)]),
            "Count" => Object::Integer(1),
        }),
    );

    let catalog_id = document.add_object(dictionary! {
        "Type" => Object::Name(b"Catalog".to_vec()),
        "Pages" => pages_root_id,
    });
    document.trailer.set("Root", catalog_id);
    document.compress();

    let mut bytes = Vec::new();
    document
        .save_to(&mut bytes)
        .map_err(|error| format!("Failed to serialize sticker cut PDF: {error}"))?;
    Ok(bytes)
}

fn resolve_pdf_cut_line_source_transform(
    data_url: &str,
    placement: &StickerPlacement,
) -> Result<PdfCutLineSourceTransform, String> {
    let pdf_bytes = decode_data_url_bytes(data_url)?;
    let document = Document::load_mem(&pdf_bytes)
        .map_err(|error| format!("Failed to parse cut-line source PDF: {error}"))?;
    let page_index = placement.page_number.saturating_sub(1);
    let page_ids = page_ids(&document);
    let Some(page_id) = page_ids.get(page_index).copied() else {
        return Err(format!(
            "Cut-line source page {} is out of range.",
            placement.page_number
        ));
    };
    let page_object = document
        .get_object(page_id)
        .map_err(|error| format!("Failed to read cut-line source page: {error}"))?;
    let page_dict = get_dict_from_object(&document, page_object)
        .ok_or_else(|| "Cut-line source page is not a dictionary".to_string())?;
    let mirror_trim_bounds = if (placement.mirror_bleed_enabled
        || placement_requests_content_aware_bleed(placement))
        && placement.bleed_mm > 0.0
    {
        resolve_pdf_source_mirror_trim_bounds(&document, &page_dict, placement)
    } else {
        None
    };
    let bounds = mirror_trim_bounds
        .or_else(|| resolve_pdf_source_form_bounds(&document, &page_dict, placement))
        .or_else(|| {
            resolve_page_bounds(
                &document,
                page_id,
                &[
                    PdfPageBox::CropBox,
                    PdfPageBox::MediaBox,
                    PdfPageBox::BleedBox,
                    PdfPageBox::TrimBox,
                    PdfPageBox::ArtBox,
                ],
            )
            .ok()
            .map(|(_, bounds)| bounds)
        })
        .ok_or_else(|| {
            "Cut-line source PDF page is missing a usable MediaBox/CropBox/BleedBox/TrimBox."
                .to_string()
        })?;
    let (bounds, _) = recenter_source_bounds_on_content(&document, &page_dict, page_id, bounds);

    if mirror_trim_bounds.is_none() {
        return Ok(PdfCutLineSourceTransform::from_bounds(bounds));
    }

    let bleed_pt = mm_to_points(placement.bleed_mm.max(0.0));
    let trim_width_pt = mm_to_points(placement_content_width_mm(placement));
    let trim_height_pt = mm_to_points(placement_content_height_mm(placement));
    let path_scale_x = trim_width_pt / bounds.width.max(f64::EPSILON);
    let path_scale_y = trim_height_pt / bounds.height.max(f64::EPSILON);
    let scaled_width_pt = bounds.width * path_scale_x;
    let scaled_height_pt = bounds.height * path_scale_y;

    Ok(PdfCutLineSourceTransform {
        origin_x_pt: bounds.left,
        origin_y_pt: bounds.bottom,
        path_offset_x_pt: bleed_pt + (trim_width_pt - scaled_width_pt) / 2.0,
        path_offset_y_pt: bleed_pt + (trim_height_pt - scaled_height_pt) / 2.0,
        path_scale_x,
        path_scale_y,
        source_height_pt: bounds.height,
        source_width_pt: bounds.width,
        target_height_pt: trim_height_pt + 2.0 * bleed_pt,
        target_width_pt: trim_width_pt + 2.0 * bleed_pt,
    })
}

fn append_pdf_cut_line_ops(
    ops: &mut Vec<Operation>,
    placement: &StickerPlacement,
    path: &PdfCutLinePath,
    x_offset_mm: f64,
    y_offset_mm: f64,
    page_height_pt: f64,
) {
    let _ = (&path.id, path.page_number);
    ops.push(Operation::new("q", vec![]));
    for command in &path.commands {
        match command {
            PdfPathCommand::MoveTo(point) => {
                let transformed = transform_pdf_cut_point(
                    placement,
                    *point,
                    path.source_width_pt,
                    path.source_height_pt,
                    x_offset_mm,
                    y_offset_mm,
                    page_height_pt,
                );
                ops.push(Operation::new(
                    "m",
                    vec![real(transformed.x), real(transformed.y)],
                ));
            }
            PdfPathCommand::LineTo(point) => {
                let transformed = transform_pdf_cut_point(
                    placement,
                    *point,
                    path.source_width_pt,
                    path.source_height_pt,
                    x_offset_mm,
                    y_offset_mm,
                    page_height_pt,
                );
                ops.push(Operation::new(
                    "l",
                    vec![real(transformed.x), real(transformed.y)],
                ));
            }
            PdfPathCommand::CurveTo(point_1, point_2, point_3) => {
                let p1 = transform_pdf_cut_point(
                    placement,
                    *point_1,
                    path.source_width_pt,
                    path.source_height_pt,
                    x_offset_mm,
                    y_offset_mm,
                    page_height_pt,
                );
                let p2 = transform_pdf_cut_point(
                    placement,
                    *point_2,
                    path.source_width_pt,
                    path.source_height_pt,
                    x_offset_mm,
                    y_offset_mm,
                    page_height_pt,
                );
                let p3 = transform_pdf_cut_point(
                    placement,
                    *point_3,
                    path.source_width_pt,
                    path.source_height_pt,
                    x_offset_mm,
                    y_offset_mm,
                    page_height_pt,
                );
                ops.push(Operation::new(
                    "c",
                    vec![
                        real(p1.x),
                        real(p1.y),
                        real(p2.x),
                        real(p2.y),
                        real(p3.x),
                        real(p3.y),
                    ],
                ));
            }
            PdfPathCommand::ClosePath => ops.push(Operation::new("h", vec![])),
        }
    }
    ops.push(Operation::new("S", vec![]));
    ops.push(Operation::new("Q", vec![]));
}

fn append_manual_cut_mark_ops(
    ops: &mut Vec<Operation>,
    mark: &ManualCutMark,
    x_offset_mm: f64,
    y_offset_mm: f64,
    page_height_pt: f64,
) {
    let x1_pt = mm_to_points(mark.x1_mm - x_offset_mm);
    let y1_pt = page_height_pt - mm_to_points(mark.y1_mm - y_offset_mm);
    let x2_pt = mm_to_points(mark.x2_mm - x_offset_mm);
    let y2_pt = page_height_pt - mm_to_points(mark.y2_mm - y_offset_mm);

    ops.push(Operation::new("q", vec![]));
    ops.push(Operation::new("m", vec![real(x1_pt), real(y1_pt)]));
    ops.push(Operation::new("l", vec![real(x2_pt), real(y2_pt)]));
    ops.push(Operation::new("S", vec![]));
    ops.push(Operation::new("Q", vec![]));
}

fn transform_pdf_cut_point(
    placement: &StickerPlacement,
    point: PdfPoint,
    source_width_pt: f64,
    source_height_pt: f64,
    x_offset_mm: f64,
    y_offset_mm: f64,
    page_height_pt: f64,
) -> PdfPoint {
    let print_bounds = resolve_placement_print_bounds(placement);
    let draw_x_mm = print_bounds.min_x_mm - x_offset_mm;
    let draw_y_mm = print_bounds.min_y_mm - y_offset_mm;
    let draw_width_pt = mm_to_points(print_bounds.max_x_mm - print_bounds.min_x_mm);
    let draw_height_pt = mm_to_points(print_bounds.max_y_mm - print_bounds.min_y_mm);
    let x_pt = mm_to_points(draw_x_mm);
    let y_pt = page_height_pt - mm_to_points(draw_y_mm) - draw_height_pt;
    let source_width_pt = source_width_pt.max(f64::EPSILON);
    let source_height_pt = source_height_pt.max(f64::EPSILON);

    if placement.rotation_degrees == 90 {
        let scale_x = draw_height_pt / source_width_pt;
        let scale_y = draw_width_pt / source_height_pt;

        return PdfPoint {
            x: x_pt + point.y * scale_y,
            y: y_pt + draw_height_pt - point.x * scale_x,
        };
    }

    PdfPoint {
        x: x_pt + point.x * (draw_width_pt / source_width_pt),
        y: y_pt + point.y * (draw_height_pt / source_height_pt),
    }
}

fn append_rect_cut_ops(
    ops: &mut Vec<Operation>,
    x_mm: f64,
    y_mm: f64,
    width_mm: f64,
    height_mm: f64,
    page_height_pt: f64,
) {
    let x_pt = mm_to_points(x_mm);
    let y_pt = page_height_pt - mm_to_points(y_mm + height_mm);
    let width_pt = mm_to_points(width_mm);
    let height_pt = mm_to_points(height_mm);

    ops.push(Operation::new("q", vec![]));
    ops.push(Operation::new(
        "re",
        vec![real(x_pt), real(y_pt), real(width_pt), real(height_pt)],
    ));
    ops.push(Operation::new("S", vec![]));
    ops.push(Operation::new("Q", vec![]));
}

fn append_rounded_rect_cut_ops(
    ops: &mut Vec<Operation>,
    x_mm: f64,
    y_mm: f64,
    width_mm: f64,
    height_mm: f64,
    page_height_pt: f64,
    radius_mm: f64,
) {
    let radius_pt = mm_to_points(radius_mm.max(0.0).min(width_mm / 2.0).min(height_mm / 2.0));

    if radius_pt <= 0.01 {
        append_rect_cut_ops(ops, x_mm, y_mm, width_mm, height_mm, page_height_pt);
        return;
    }

    let x_pt = mm_to_points(x_mm);
    let y_pt = page_height_pt - mm_to_points(y_mm + height_mm);
    let width_pt = mm_to_points(width_mm);
    let height_pt = mm_to_points(height_mm);
    let kappa = radius_pt * 0.552_284_749_8;
    let right = x_pt + width_pt;
    let top = y_pt + height_pt;

    ops.push(Operation::new("q", vec![]));
    ops.push(Operation::new(
        "m",
        vec![real(x_pt + radius_pt), real(y_pt)],
    ));
    ops.push(Operation::new(
        "l",
        vec![real(right - radius_pt), real(y_pt)],
    ));
    ops.push(Operation::new(
        "c",
        vec![
            real(right - radius_pt + kappa),
            real(y_pt),
            real(right),
            real(y_pt + radius_pt - kappa),
            real(right),
            real(y_pt + radius_pt),
        ],
    ));
    ops.push(Operation::new(
        "l",
        vec![real(right), real(top - radius_pt)],
    ));
    ops.push(Operation::new(
        "c",
        vec![
            real(right),
            real(top - radius_pt + kappa),
            real(right - radius_pt + kappa),
            real(top),
            real(right - radius_pt),
            real(top),
        ],
    ));
    ops.push(Operation::new("l", vec![real(x_pt + radius_pt), real(top)]));
    ops.push(Operation::new(
        "c",
        vec![
            real(x_pt + radius_pt - kappa),
            real(top),
            real(x_pt),
            real(top - radius_pt + kappa),
            real(x_pt),
            real(top - radius_pt),
        ],
    ));
    ops.push(Operation::new(
        "l",
        vec![real(x_pt), real(y_pt + radius_pt)],
    ));
    ops.push(Operation::new(
        "c",
        vec![
            real(x_pt),
            real(y_pt + radius_pt - kappa),
            real(x_pt + radius_pt - kappa),
            real(y_pt),
            real(x_pt + radius_pt),
            real(y_pt),
        ],
    ));
    ops.push(Operation::new("h", vec![]));
    ops.push(Operation::new("S", vec![]));
    ops.push(Operation::new("Q", vec![]));
}

fn append_circle_cut_ops(
    ops: &mut Vec<Operation>,
    center_x_mm: f64,
    center_y_mm: f64,
    radius_mm: f64,
    page_height_pt: f64,
) {
    let radius_pt = mm_to_points(radius_mm.max(0.0));
    let center_x_pt = mm_to_points(center_x_mm);
    let center_y_pt = page_height_pt - mm_to_points(center_y_mm);
    let kappa = radius_pt * 0.552_284_749_8;
    let left = center_x_pt - radius_pt;
    let right = center_x_pt + radius_pt;
    let top = center_y_pt + radius_pt;
    let bottom = center_y_pt - radius_pt;

    ops.push(Operation::new("q", vec![]));
    ops.push(Operation::new("m", vec![real(center_x_pt), real(bottom)]));
    ops.push(Operation::new(
        "c",
        vec![
            real(center_x_pt + kappa),
            real(bottom),
            real(right),
            real(center_y_pt - kappa),
            real(right),
            real(center_y_pt),
        ],
    ));
    ops.push(Operation::new(
        "c",
        vec![
            real(right),
            real(center_y_pt + kappa),
            real(center_x_pt + kappa),
            real(top),
            real(center_x_pt),
            real(top),
        ],
    ));
    ops.push(Operation::new(
        "c",
        vec![
            real(center_x_pt - kappa),
            real(top),
            real(left),
            real(center_y_pt + kappa),
            real(left),
            real(center_y_pt),
        ],
    ));
    ops.push(Operation::new(
        "c",
        vec![
            real(left),
            real(center_y_pt - kappa),
            real(center_x_pt - kappa),
            real(bottom),
            real(center_x_pt),
            real(bottom),
        ],
    ));
    ops.push(Operation::new("h", vec![]));
    ops.push(Operation::new("S", vec![]));
    ops.push(Operation::new("Q", vec![]));
}

fn append_filled_rect_cut_ops(
    ops: &mut Vec<Operation>,
    x_mm: f64,
    y_mm: f64,
    width_mm: f64,
    height_mm: f64,
    page_height_pt: f64,
) {
    let x_pt = mm_to_points(x_mm);
    let y_pt = page_height_pt - mm_to_points(y_mm + height_mm);
    let width_pt = mm_to_points(width_mm);
    let height_pt = mm_to_points(height_mm);

    ops.push(Operation::new("q", vec![]));
    ops.push(Operation::new(
        "re",
        vec![real(x_pt), real(y_pt), real(width_pt), real(height_pt)],
    ));
    ops.push(Operation::new("f", vec![]));
    ops.push(Operation::new("Q", vec![]));
}

fn create_manifest(plan: &StickerPlan, sheets: &[GeneratedStickerSheet]) -> serde_json::Value {
    json!({
        "itemCount": plan.item_count,
        "mediaWidthMm": plan.media_width_mm,
        "packingMode": &plan.packing_mode,
        "sheetCount": sheets.len(),
        "sheets": sheets.iter().enumerate().map(|(index, generated_sheet)| {
            let sheet = generated_sheet.sheet;
            let sheet_number = index + 1;
            let suffix = sheet_filename_repeat_suffix(generated_sheet.repeat_count);
            json!({
                "cutFile": format!("cut/sheet-{sheet_number}{suffix}.pdf"),
                "exportHeightMm": sheet.export_height_mm,
                "exportWidthMm": sheet.export_width_mm,
                "exportXMm": sheet.export_x_mm,
                "exportYMm": sheet.export_y_mm,
                "index": sheet_number,
                "manualCutMarks": sheet.manual_cut_marks.iter().map(|mark| {
                    json!({
                        "x1Mm": mark.x1_mm,
                        "x2Mm": mark.x2_mm,
                        "y1Mm": mark.y1_mm,
                        "y2Mm": mark.y2_mm,
                    })
                }).collect::<Vec<_>>(),
                "mediaWidthMm": sheet.media_width_mm,
                "oposMarks": sheet.opos_marks.iter().map(|mark| {
                    json!({
                        "clearanceMm": mark.clearance_mm,
                        "heightMm": mark.height_mm,
                        "kind": &mark.kind,
                        "widthMm": mark.width_mm,
                        "xMm": mark.x_mm,
                        "yMm": mark.y_mm,
                    })
                }).collect::<Vec<_>>(),
                "partCount": sheet.part_boundaries.len(),
                "partBoundaries": sheet.part_boundaries.iter().map(|part| {
                    json!({
                        "heightMm": part.height_mm,
                        "id": part.id,
                        "widthMm": part.width_mm,
                        "xMm": part.x_mm,
                        "yMm": part.y_mm,
                    })
                }).collect::<Vec<_>>(),
                "placementCount": sheet.placements.len(),
                "placements": sheet.placements.iter().map(|placement| {
                    json!({
                        "bleedMm": placement.bleed_mm,
                        "cutOffsetMm": placement.cut_offset_mm,
                        "cutShape": &placement.cut_shape,
                        "filename": placement.filename,
                        "heightMm": placement.height_mm,
                        "instanceIndex": placement.instance_index,
                        "itemId": placement.item_id,
                        "mirrorBleedEnabled": placement.mirror_bleed_enabled,
                        "pageNumber": placement.page_number,
                        "partId": placement.part_id,
                        "rotationDegrees": placement.rotation_degrees,
                        "sourceHeightMm": placement.source_height_mm,
                        "sourceFileIndex": placement.source_file_index,
                        "sourceWidthMm": placement.source_width_mm,
                        "widthMm": placement.width_mm,
                        "xMm": placement.x_mm,
                        "yMm": placement.y_mm,
                    })
                }).collect::<Vec<_>>(),
                "previewLengthMm": sheet.preview_length_mm,
                "printFile": format!("print/sheet-{sheet_number}{suffix}.pdf"),
                "repeatCount": generated_sheet.repeat_count,
                "utilizationPercent": sheet.utilization_percent,
            })
        }).collect::<Vec<_>>(),
        "totalSheetCount": plan.sheet_count,
        "totalAreaMm2": plan.total_area_mm2,
        "usedAreaMm2": plan.used_area_mm2,
    })
}

fn mm_to_points(value: f64) -> f64 {
    value * MM_TO_POINTS
}

fn resolve_document_box(sheet: &StickerSheet) -> (f64, f64, f64, f64) {
    let mut min_x_mm = sheet.export_x_mm;
    let mut min_y_mm = sheet.export_y_mm;
    let mut max_x_mm = sheet.export_x_mm + sheet.export_width_mm;
    let mut max_y_mm = sheet.export_y_mm + sheet.export_height_mm;

    for mark in &sheet.opos_marks {
        min_x_mm = min_x_mm.min(mark.x_mm - mark.clearance_mm);
        min_y_mm = min_y_mm.min(mark.y_mm - mark.clearance_mm);
        max_x_mm = max_x_mm.max(mark.x_mm + mark.width_mm + mark.clearance_mm);
        max_y_mm = max_y_mm.max(mark.y_mm + mark.height_mm + mark.clearance_mm);
    }

    for mark in &sheet.manual_cut_marks {
        min_x_mm = min_x_mm.min(mark.x1_mm.min(mark.x2_mm));
        min_y_mm = min_y_mm.min(mark.y1_mm.min(mark.y2_mm));
        max_x_mm = max_x_mm.max(mark.x1_mm.max(mark.x2_mm));
        max_y_mm = max_y_mm.max(mark.y1_mm.max(mark.y2_mm));
    }

    (max_x_mm - min_x_mm, max_y_mm - min_y_mm, min_x_mm, min_y_mm)
}

#[cfg(test)]
mod tests {
    use super::*;
    use lopdf::content::{Content, Operation};

    fn box_array(bounds: [f64; 4]) -> Vec<Object> {
        bounds.into_iter().map(real).collect()
    }

    fn build_content_source_document(
        page_boxes: &[(&str, [f64; 4])],
        image_rect: [f64; 4],
    ) -> (Document, ObjectId) {
        let mut document = Document::with_version("1.5");
        let pages_id = document.new_object_id();

        let image_id = document.add_object(Stream::new(
            dictionary! {
                "Type" => Object::Name(b"XObject".to_vec()),
                "Subtype" => Object::Name(b"Image".to_vec()),
                "Width" => 1_i64,
                "Height" => 1_i64,
                "BitsPerComponent" => 8_i64,
                "ColorSpace" => Object::Name(b"DeviceRGB".to_vec()),
            },
            vec![0_u8, 0, 0],
        ));
        let xobjects = dictionary! { "Im0" => Object::Reference(image_id) };
        let resources_id = document.add_object(dictionary! { "XObject" => xobjects });

        let [x0, y0, x1, y1] = image_rect;
        let content = Content {
            operations: vec![
                Operation::new("q", vec![]),
                Operation::new(
                    "cm",
                    vec![
                        real(x1 - x0),
                        real(0.0),
                        real(0.0),
                        real(y1 - y0),
                        real(x0),
                        real(y0),
                    ],
                ),
                Operation::new("Do", vec![Object::Name(b"Im0".to_vec())]),
                Operation::new("Q", vec![]),
            ],
        };
        let content_id = document.add_object(Stream::new(
            dictionary! {},
            content.encode().expect("content should encode"),
        ));

        let mut page_dictionary = dictionary! {
            "Type" => Object::Name(b"Page".to_vec()),
            "Parent" => Object::Reference(pages_id),
            "Resources" => Object::Reference(resources_id),
            "Contents" => Object::Reference(content_id),
            "MediaBox" => box_array([0.0, 0.0, 300.0, 400.0]),
        };
        for (box_name, bounds) in page_boxes {
            page_dictionary.set(*box_name, box_array(*bounds));
        }
        let page_id = document.add_object(page_dictionary);

        document.objects.insert(
            pages_id,
            Object::Dictionary(dictionary! {
                "Type" => Object::Name(b"Pages".to_vec()),
                "Kids" => vec![Object::Reference(page_id)],
                "Count" => 1_i64,
            }),
        );

        let catalog_id = document.add_object(dictionary! {
            "Type" => Object::Name(b"Catalog".to_vec()),
            "Pages" => Object::Reference(pages_id),
        });
        document.trailer.set("Root", Object::Reference(catalog_id));

        (document, page_id)
    }

    fn page_dict(document: &Document, page_id: ObjectId) -> Dictionary {
        get_dict_from_object(document, document.get_object(page_id).expect("page exists"))
            .expect("page is a dictionary")
    }

    #[test]
    fn recenter_slides_same_size_window_onto_shifted_artwork() {
        // 200x300 window placed at lower-left, artwork shifted up-and-right and
        // spilling past the window on the top/right.
        let (document, page_id) = build_content_source_document(
            &[("TrimBox", [10.0, 10.0, 210.0, 310.0])],
            [60.0, 60.0, 260.0, 360.0],
        );
        let dict = page_dict(&document, page_id);
        let bounds = ResolvedPageBounds {
            left: 10.0,
            bottom: 10.0,
            width: 200.0,
            height: 300.0,
        };

        let (adjusted, demoted) =
            recenter_source_bounds_on_content(&document, &dict, page_id, bounds);

        assert!(demoted);
        // Size is preserved; the window center now matches the artwork center
        // (160, 210).
        assert!((adjusted.width - 200.0).abs() < 0.0001);
        assert!((adjusted.height - 300.0).abs() < 0.0001);
        assert!((adjusted.center_x() - 160.0).abs() < 0.0001);
        assert!((adjusted.center_y() - 210.0).abs() < 0.0001);
    }

    #[test]
    fn recenter_leaves_well_formed_bounds_untouched() {
        let (document, page_id) = build_content_source_document(
            &[("TrimBox", [50.0, 50.0, 250.0, 350.0])],
            [60.0, 60.0, 240.0, 340.0],
        );
        let dict = page_dict(&document, page_id);
        let bounds = ResolvedPageBounds {
            left: 50.0,
            bottom: 50.0,
            width: 200.0,
            height: 300.0,
        };

        let (adjusted, demoted) =
            recenter_source_bounds_on_content(&document, &dict, page_id, bounds);

        assert!(!demoted);
        assert!((adjusted.left - 50.0).abs() < 0.0001);
        assert!((adjusted.bottom - 50.0).abs() < 0.0001);
    }
}
