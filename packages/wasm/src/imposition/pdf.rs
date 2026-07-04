use crate::content_aware_bleed::{
    BleedInsetsPx, content_aware_pad_raster_data, mirror_pad_raster_data,
};
use crate::imposition::layout::{
    CropBox, build_sheet_arrangements, calculate_crop_box_for_trim_box, calculate_offsets,
    calculate_positions, calculate_safe_bleeds, centered_trim_box, has_back_side,
};
use crate::imposition::models::{BleedType, LayoutType, SourceSizing, parse_request_json};
use crate::imposition::workflow::ImpositionWorkflow;
use crate::preflight::image::DecodedRasterImage;
use crate::preflight::pdf_utils::{
    BOX_VALIDITY_TOLERANCE_PT, PdfPageBox, ResolvedPageBounds, as_i64, box_misaligned_with_content,
    deref_object, dict_get, get_dict_from_object, inherited_page_dict, is_box_geometrically_valid,
    page_count, page_ids, resolve_page_bounds,
};
use crate::preflight::{
    RasterColorSpace, RasterImageEncoding, decode_raster_image, decode_raster_image_as_raw,
};
use lopdf::content::{Content, Operation};
use lopdf::{Dictionary, Document, Object, ObjectId, Stream, dictionary};
use std::collections::BTreeMap;

const MIRROR_BLEED_SEAM_OVERLAP_PT: f64 = 0.25;

#[derive(Debug, Clone)]
struct SourceFormRef {
    form_id: ObjectId,
    width: f64,
    height: f64,
    trim_box: Option<CropBox>,
}

#[derive(Debug, Clone)]
struct SourcePageGeometry {
    bounds: ResolvedPageBounds,
    canvas_bounds: ResolvedPageBounds,
    matrix: [f64; 6],
    trim_box: Option<CropBox>,
}

#[derive(Debug, Clone)]
struct TrimArea {
    col: usize,
    row: usize,
    x0: f64,
    y0: f64,
    x1: f64,
    y1: f64,
}

pub fn impose_file_to_pdf_bytes(
    request_json: &str,
    bytes: &[u8],
    content_type: &str,
) -> Result<Vec<u8>, String> {
    let input = parse_request_json(request_json)?;
    let mut workflow = ImpositionWorkflow::from_input(&input)?;

    let mut document = Document::with_version("1.5");
    let pages_root_id = document.new_object_id();

    let source_forms = build_source_forms(&mut document, &mut workflow, bytes, content_type)?;
    if source_forms.is_empty() {
        return Err("Source file contains no pages".to_string());
    }

    let positions = calculate_positions(&workflow);
    let arrangements = build_sheet_arrangements(&workflow, source_forms.len());
    let (_, _, x_offset, y_offset) = calculate_offsets(&workflow);

    let mut output_page_ids = Vec::new();
    for (arrangement_index, arrangement) in arrangements.into_iter().enumerate() {
        let page_id = build_sheet_page(
            &mut document,
            pages_root_id,
            &workflow,
            &positions,
            &arrangement,
            &source_forms,
            x_offset,
            y_offset,
            has_back_side(&workflow) && arrangement_index % 2 == 1,
        )?;
        output_page_ids.push(page_id);
    }

    finalize_document(&mut document, pages_root_id, &output_page_ids);

    let mut bytes = Vec::new();
    document
        .save_to(&mut bytes)
        .map_err(|error| format!("Failed to serialize imposed PDF: {error}"))?;
    Ok(bytes)
}

/// Extract the page count from a PDF file without processing it.
/// Returns the total number of pages as a string (for WASM binding).
pub fn get_pdf_page_count(bytes: &[u8]) -> Result<String, String> {
    let source =
        Document::load_mem(bytes).map_err(|error| format!("Failed to parse PDF: {error}"))?;
    Ok(page_count(&source).to_string())
}

/// Detects whether any source page would have its declared inner page box
/// demoted because it is mis-positioned relative to the drawn artwork (the Canva
/// wrong-page-box symptom). Used to surface an operator warning; mirrors the
/// geometry decision taken in `resolve_source_page_geometry`. Non-PDF sources
/// always return `false`.
pub fn detect_source_box_mismatch(
    request_json: &str,
    bytes: &[u8],
    content_type: &str,
) -> Result<bool, String> {
    if content_type != "application/pdf" {
        return Ok(false);
    }

    let input = parse_request_json(request_json)?;
    let workflow = ImpositionWorkflow::from_input(&input)?;
    let preferences = page_box_preferences(&workflow);
    let source = Document::load_mem(bytes)
        .map_err(|error| format!("Failed to parse source PDF: {error}"))?;

    for page_id in page_ids(&source) {
        let Ok((_, media_bounds)) = resolve_page_bounds(
            &source,
            page_id,
            &[PdfPageBox::MediaBox, PdfPageBox::CropBox],
        ) else {
            continue;
        };
        let Ok((selected_page_box, selected_bounds)) =
            select_source_page_box(&source, page_id, &preferences, media_bounds)
        else {
            continue;
        };
        if source_box_should_be_demoted(&source, page_id, selected_page_box, &selected_bounds) {
            return Ok(true);
        }
    }

    Ok(false)
}

fn build_source_forms(
    document: &mut Document,
    workflow: &mut ImpositionWorkflow,
    bytes: &[u8],
    content_type: &str,
) -> Result<Vec<SourceFormRef>, String> {
    if content_type == "application/pdf" {
        build_pdf_source_forms(document, workflow, bytes)
    } else {
        build_image_source_forms(document, workflow, bytes, content_type)
    }
}

fn build_pdf_source_forms(
    document: &mut Document,
    workflow: &mut ImpositionWorkflow,
    bytes: &[u8],
) -> Result<Vec<SourceFormRef>, String> {
    let mut source = Document::load_mem(bytes)
        .map_err(|error| format!("Failed to parse source PDF: {error}"))?;
    let original_page_ids = page_ids(&source);
    if original_page_ids.is_empty() {
        return Err("Source PDF contains no pages".to_string());
    }

    let page_box_preferences = page_box_preferences(workflow);
    source.renumber_objects_with(document.max_id + 1);
    let page_ids = page_ids(&source);
    let source_max_id = source.max_id;
    for (object_id, object) in &source.objects {
        document.objects.insert(*object_id, object.clone());
    }
    document.max_id = document.max_id.max(source_max_id);

    let mut source_forms = Vec::new();
    for page_id in page_ids {
        let geometry =
            resolve_source_page_geometry(&source, page_id, workflow, &page_box_preferences)?;
        let mut page_workflow = workflow_for_pdf_source_page(workflow);
        page_workflow.set_source_dimensions(geometry.bounds.width, geometry.bounds.height);
        let original_form = build_original_pdf_page_form(
            document,
            &source,
            page_id,
            &page_workflow,
            &page_box_preferences,
        )?;
        let processed_form = build_processed_form(
            document,
            original_form.form_id,
            original_form.width,
            original_form.height,
            original_form.trim_box.clone(),
            &page_workflow,
        )?;
        source_forms.push(processed_form);
    }

    Ok(source_forms)
}

fn workflow_for_pdf_source_page(workflow: &ImpositionWorkflow) -> ImpositionWorkflow {
    let mut page_workflow = workflow.clone();
    if matches!(page_workflow.bleed_type, BleedType::ContentAwareFast) {
        page_workflow.bleed_type = BleedType::TwoMmMirror;
    }

    page_workflow
}

fn build_image_source_forms(
    document: &mut Document,
    workflow: &mut ImpositionWorkflow,
    bytes: &[u8],
    content_type: &str,
) -> Result<Vec<SourceFormRef>, String> {
    let raster = if matches!(workflow.bleed_type, BleedType::ContentAwareFast) {
        let raster = decode_raster_image_as_raw(bytes, content_type, None)?;
        apply_content_aware_bleed_to_raster(raster, workflow)
    } else {
        decode_raster_image(bytes, content_type, None)?
    };
    workflow.set_source_dimensions(raster.width_points, raster.height_points);

    let mut image_dictionary = Dictionary::new();
    image_dictionary.set("Type", Object::Name(b"XObject".to_vec()));
    image_dictionary.set("Subtype", Object::Name(b"Image".to_vec()));
    image_dictionary.set("Width", raster.width_px as i64);
    image_dictionary.set("Height", raster.height_px as i64);
    image_dictionary.set("BitsPerComponent", raster.bits_per_component as i64);
    image_dictionary.set(
        "ColorSpace",
        Object::Name(match raster.color_space {
            RasterColorSpace::DeviceGray => b"DeviceGray".to_vec(),
            RasterColorSpace::DeviceRgb => b"DeviceRGB".to_vec(),
        }),
    );

    let image_stream = match raster.encoding {
        RasterImageEncoding::Jpeg(data) => {
            image_dictionary.set("Filter", Object::Name(b"DCTDecode".to_vec()));
            Stream::new(image_dictionary, data)
        }
        RasterImageEncoding::Raw(data) => Stream::new(image_dictionary, data),
    };
    let image_id = document.add_object(image_stream);

    let mut xobjects = Dictionary::new();
    xobjects.set("Im0", image_id);
    let mut resources = Dictionary::new();
    resources.set("XObject", xobjects);

    let content = Content {
        operations: vec![
            Operation::new("q", vec![]),
            Operation::new(
                "cm",
                vec![
                    real(raster.width_points),
                    real(0.0),
                    real(0.0),
                    real(raster.height_points),
                    real(0.0),
                    real(0.0),
                ],
            ),
            Operation::new("Do", vec![Object::Name(b"Im0".to_vec())]),
            Operation::new("Q", vec![]),
        ],
    };

    let mut form_dictionary = Dictionary::new();
    form_dictionary.set("Type", Object::Name(b"XObject".to_vec()));
    form_dictionary.set("Subtype", Object::Name(b"Form".to_vec()));
    form_dictionary.set("FormType", 1_i64);
    form_dictionary.set(
        "BBox",
        Object::Array(vec![
            real(0.0),
            real(0.0),
            real(raster.width_points),
            real(raster.height_points),
        ]),
    );
    form_dictionary.set("Resources", resources);

    let base_form_id = document.add_object(Stream::new(
        form_dictionary,
        content
            .encode()
            .map_err(|error| format!("Failed to encode image form content: {error}"))?,
    ));

    let processed_form = build_processed_form(
        document,
        base_form_id,
        raster.width_points,
        raster.height_points,
        None,
        workflow,
    )?;

    Ok(vec![processed_form])
}

fn apply_content_aware_bleed_to_raster(
    raster: DecodedRasterImage,
    workflow: &ImpositionWorkflow,
) -> DecodedRasterImage {
    let RasterImageEncoding::Raw(data) = raster.encoding else {
        return raster;
    };
    let insets = BleedInsetsPx {
        left: points_to_pixels(workflow.bleed, workflow.item_width, raster.width_px),
        right: points_to_pixels(workflow.bleed, workflow.item_width, raster.width_px),
        top: points_to_pixels(workflow.bleed, workflow.item_height, raster.height_px),
        bottom: points_to_pixels(workflow.bleed, workflow.item_height, raster.height_px),
    };
    let width_px = raster.width_px + insets.left + insets.right;
    let height_px = raster.height_px + insets.top + insets.bottom;
    let padded_data = content_aware_pad_raster_data(
        &data,
        raster.width_px,
        raster.height_px,
        raster.color_space,
        insets,
    )
    .unwrap_or_else(|_| {
        mirror_pad_raster_data(
            &data,
            raster.width_px,
            raster.height_px,
            raster.color_space,
            insets,
        )
    });
    let width_points = scale_points_for_padding(raster.width_points, raster.width_px, width_px);
    let height_points = scale_points_for_padding(raster.height_points, raster.height_px, height_px);

    DecodedRasterImage {
        encoding: RasterImageEncoding::Raw(padded_data),
        color_space: raster.color_space,
        bits_per_component: raster.bits_per_component,
        width_px,
        height_px,
        width_points,
        height_points,
    }
}

fn build_original_pdf_page_form(
    document: &mut Document,
    source: &Document,
    page_id: ObjectId,
    workflow: &ImpositionWorkflow,
    page_box_preferences: &[PdfPageBox],
) -> Result<SourceFormRef, String> {
    let geometry = resolve_source_page_geometry(source, page_id, workflow, page_box_preferences)?;
    let page_object = source
        .get_object(page_id)
        .map_err(|error| format!("Failed to read source page: {error}"))?;
    let page_dict = get_dict_from_object(source, page_object)
        .ok_or_else(|| "Source page is not a dictionary".to_string())?;
    let resources = inherited_page_dict(source, &page_dict, b"Resources").unwrap_or_default();
    let content_bytes = source
        .get_page_content(page_id)
        .map_err(|error| format!("Failed to read source page content: {error}"))?;
    let mut content = Content::decode(&content_bytes)
        .map_err(|error| format!("Failed to decode source page content: {error}"))?;
    strip_page_box_clip(
        &mut content.operations,
        &collect_page_clip_boxes(source, page_id),
    );
    let inline_matrix = should_inline_source_page_matrix(geometry.matrix);
    if inline_matrix {
        prepend_content_matrix(&mut content.operations, geometry.matrix);
    }
    let content_bytes = content
        .encode()
        .map_err(|error| format!("Failed to encode source page content: {error}"))?;

    let mut form_dictionary = Dictionary::new();
    form_dictionary.set("Type", Object::Name(b"XObject".to_vec()));
    form_dictionary.set("Subtype", Object::Name(b"Form".to_vec()));
    form_dictionary.set("FormType", 1_i64);
    form_dictionary.set(
        "BBox",
        Object::Array(vec![
            real(0.0),
            real(0.0),
            real(geometry.canvas_bounds.width),
            real(geometry.canvas_bounds.height),
        ]),
    );
    if !inline_matrix {
        form_dictionary.set(
            "Matrix",
            Object::Array(geometry.matrix.into_iter().map(real).collect()),
        );
    }
    form_dictionary.set("Resources", resources);
    if let Ok(group) = page_dict.get(b"Group") {
        form_dictionary.set("Group", group.clone());
    }

    let raw_form_id = document.add_object(Stream::new(form_dictionary, content_bytes));

    wrap_form(
        document,
        raw_form_id,
        geometry.bounds.width,
        geometry.bounds.height,
        vec![
            Operation::new("q", vec![]),
            Operation::new(
                "re",
                vec![
                    real(0.0),
                    real(0.0),
                    real(geometry.bounds.width),
                    real(geometry.bounds.height),
                ],
            ),
            Operation::new("W", vec![]),
            Operation::new("n", vec![]),
            Operation::new("q", vec![]),
            Operation::new(
                "cm",
                vec![
                    real(1.0),
                    real(0.0),
                    real(0.0),
                    real(1.0),
                    real(geometry.canvas_bounds.left - geometry.bounds.left),
                    real(geometry.canvas_bounds.bottom - geometry.bounds.bottom),
                ],
            ),
            Operation::new("Do", vec![Object::Name(b"Src".to_vec())]),
            Operation::new("Q", vec![]),
            Operation::new("Q", vec![]),
        ],
        geometry.trim_box,
    )
}

fn should_inline_source_page_matrix(matrix: [f64; 6]) -> bool {
    let [a, b, c, d, e, f] = matrix;

    (a - 1.0).abs() <= f64::EPSILON
        && b.abs() <= f64::EPSILON
        && c.abs() <= f64::EPSILON
        && (d - 1.0).abs() <= f64::EPSILON
        && (e.abs() > f64::EPSILON || f.abs() > f64::EPSILON)
}

fn prepend_content_matrix(operations: &mut Vec<Operation>, matrix: [f64; 6]) {
    let mut wrapped = Vec::with_capacity(operations.len() + 3);
    wrapped.push(Operation::new("q", vec![]));
    wrapped.push(Operation::new(
        "cm",
        matrix.into_iter().map(real).collect::<Vec<_>>(),
    ));
    wrapped.append(operations);
    wrapped.push(Operation::new("Q", vec![]));
    *operations = wrapped;
}

fn resolve_source_page_geometry(
    source: &Document,
    page_id: ObjectId,
    workflow: &ImpositionWorkflow,
    page_box_preferences: &[PdfPageBox],
) -> Result<SourcePageGeometry, String> {
    let (_, crop_canvas_bounds) = resolve_page_bounds(
        source,
        page_id,
        &[PdfPageBox::CropBox, PdfPageBox::MediaBox],
    )?;
    let (_, media_canvas_bounds) = resolve_page_bounds(
        source,
        page_id,
        &[PdfPageBox::MediaBox, PdfPageBox::CropBox],
    )?;
    let (selected_page_box, selected_bounds) =
        select_source_page_box(source, page_id, page_box_preferences, media_canvas_bounds)?;
    let rotation = resolve_page_rotation(source, page_id)?;

    if source_box_should_be_demoted(source, page_id, selected_page_box, &selected_bounds) {
        return Ok(demoted_source_geometry(
            crop_canvas_bounds,
            media_canvas_bounds,
            rotation,
        ));
    }

    let trim_bounds = resolve_trim_bounds(source, page_id);
    let mut bounds = resolve_effective_source_bounds(
        source,
        page_id,
        workflow,
        selected_page_box,
        selected_bounds,
        crop_canvas_bounds,
    );
    bounds = resolve_outer_edge_source_bounds(
        workflow,
        selected_page_box,
        trim_bounds,
        crop_canvas_bounds,
        media_canvas_bounds,
        bounds,
    );
    let canvas_bounds =
        resolve_render_canvas_bounds(crop_canvas_bounds, media_canvas_bounds, bounds);
    let trim_bounds = resolve_source_trim_bounds(trim_bounds, selected_page_box, selected_bounds);
    let rotated_bounds = rotate_bounds_within_canvas(bounds, canvas_bounds, rotation);
    let rotated_canvas_bounds = rotate_canvas_bounds(canvas_bounds, rotation);
    let rotated_trim_bounds =
        trim_bounds.map(|bounds| rotate_bounds_within_canvas(bounds, canvas_bounds, rotation));
    let trim_box = resolve_source_trim_box(rotated_trim_bounds, &rotated_bounds);

    Ok(SourcePageGeometry {
        bounds: rotated_bounds,
        canvas_bounds: rotated_canvas_bounds,
        matrix: source_page_matrix(canvas_bounds, rotation),
        trim_box,
    })
}

/// Picks the first preferred page box that is structurally valid (finite,
/// positive area, nested within the MediaBox). Structurally broken boxes — a
/// common Canva symptom — are skipped so a saner box is used instead. Falls back
/// to the first box that is present at all when none validate.
fn select_source_page_box(
    source: &Document,
    page_id: ObjectId,
    preferences: &[PdfPageBox],
    media_bounds: ResolvedPageBounds,
) -> Result<(PdfPageBox, ResolvedPageBounds), String> {
    let mut first_present: Option<(PdfPageBox, ResolvedPageBounds)> = None;
    for page_box in preferences {
        let Ok((selected, bounds)) = resolve_page_bounds(source, page_id, &[*page_box]) else {
            continue;
        };
        if first_present.is_none() {
            first_present = Some((selected, bounds));
        }
        if is_box_geometrically_valid(&bounds, Some(&media_bounds), BOX_VALIDITY_TOLERANCE_PT) {
            return Ok((selected, bounds));
        }
    }

    first_present.ok_or_else(|| "Source page is missing page geometry boxes".to_string())
}

/// Whether the selected inner box is mis-positioned relative to the page's drawn
/// artwork and should be distrusted. The MediaBox is the outer page and can
/// never clip artwork, so it is never demoted.
fn source_box_should_be_demoted(
    source: &Document,
    page_id: ObjectId,
    selected_page_box: PdfPageBox,
    selected_bounds: &ResolvedPageBounds,
) -> bool {
    if matches!(selected_page_box, PdfPageBox::MediaBox) {
        return false;
    }
    box_misaligned_with_content(source, page_id, selected_bounds)
}

/// Geometry used when the chosen inner box is distrusted: render the full
/// (validated) CropBox region and emit no trim box so the placement falls back
/// to a centered synthetic trim. This avoids clipping real artwork while keeping
/// the output centered.
fn demoted_source_geometry(
    crop_canvas_bounds: ResolvedPageBounds,
    media_canvas_bounds: ResolvedPageBounds,
    rotation: i64,
) -> SourcePageGeometry {
    let bounds = crop_canvas_bounds;
    let canvas_bounds =
        resolve_render_canvas_bounds(crop_canvas_bounds, media_canvas_bounds, bounds);
    let rotated_bounds = rotate_bounds_within_canvas(bounds, canvas_bounds, rotation);
    let rotated_canvas_bounds = rotate_canvas_bounds(canvas_bounds, rotation);

    SourcePageGeometry {
        bounds: rotated_bounds,
        canvas_bounds: rotated_canvas_bounds,
        matrix: source_page_matrix(canvas_bounds, rotation),
        trim_box: None,
    }
}

fn resolve_page_rotation(source: &Document, page_id: ObjectId) -> Result<i64, String> {
    let page_object = source
        .get_object(page_id)
        .map_err(|error| format!("Failed to read source page: {error}"))?;
    let page_dict = get_dict_from_object(source, page_object)
        .ok_or_else(|| "Source page is not a dictionary".to_string())?;
    let rotation = inherited_page_i64(source, &page_dict, b"Rotate").unwrap_or(0);

    Ok(normalize_page_rotation(rotation))
}

fn inherited_page_i64(document: &Document, page_dict: &Dictionary, key: &[u8]) -> Option<i64> {
    if let Some(value) = dict_get(page_dict, key).and_then(as_i64) {
        return Some(value);
    }

    let mut parent = dict_get(page_dict, b"Parent").and_then(|obj| deref_object(document, obj));
    while let Some(Object::Dictionary(parent_dict)) = parent {
        if let Some(value) = dict_get(&parent_dict, key).and_then(as_i64) {
            return Some(value);
        }
        parent = dict_get(&parent_dict, b"Parent").and_then(|obj| deref_object(document, obj));
    }

    None
}

fn normalize_page_rotation(rotation: i64) -> i64 {
    match rotation.rem_euclid(360) {
        90 => 90,
        180 => 180,
        270 => 270,
        _ => 0,
    }
}

fn rotate_canvas_bounds(canvas_bounds: ResolvedPageBounds, rotation: i64) -> ResolvedPageBounds {
    let (width, height) = if matches!(rotation, 90 | 270) {
        (canvas_bounds.height, canvas_bounds.width)
    } else {
        (canvas_bounds.width, canvas_bounds.height)
    };

    ResolvedPageBounds {
        left: 0.0,
        bottom: 0.0,
        width,
        height,
    }
}

fn rotate_bounds_within_canvas(
    bounds: ResolvedPageBounds,
    canvas_bounds: ResolvedPageBounds,
    rotation: i64,
) -> ResolvedPageBounds {
    let x0 = bounds.left - canvas_bounds.left;
    let y0 = bounds.bottom - canvas_bounds.bottom;
    let x1 = x0 + bounds.width;
    let y1 = y0 + bounds.height;
    let canvas_width = canvas_bounds.width;
    let canvas_height = canvas_bounds.height;

    let (left, bottom, right, top) = match rotation {
        90 => (canvas_height - y1, x0, canvas_height - y0, x1),
        180 => (
            canvas_width - x1,
            canvas_height - y1,
            canvas_width - x0,
            canvas_height - y0,
        ),
        270 => (y0, canvas_width - x1, y1, canvas_width - x0),
        _ => (x0, y0, x1, y1),
    };

    ResolvedPageBounds {
        left,
        bottom,
        width: right - left,
        height: top - bottom,
    }
}

fn source_page_matrix(canvas_bounds: ResolvedPageBounds, rotation: i64) -> [f64; 6] {
    let left = canvas_bounds.left;
    let bottom = canvas_bounds.bottom;
    let width = canvas_bounds.width;
    let height = canvas_bounds.height;

    match rotation {
        90 => [0.0, 1.0, -1.0, 0.0, bottom + height, -left],
        180 => [-1.0, 0.0, 0.0, -1.0, left + width, bottom + height],
        270 => [0.0, -1.0, 1.0, 0.0, -bottom, left + width],
        _ => [1.0, 0.0, 0.0, 1.0, -left, -bottom],
    }
}

fn resolve_outer_edge_source_bounds(
    workflow: &ImpositionWorkflow,
    selected_page_box: PdfPageBox,
    trim_bounds: Option<ResolvedPageBounds>,
    crop_canvas_bounds: ResolvedPageBounds,
    media_canvas_bounds: ResolvedPageBounds,
    resolved_bounds: ResolvedPageBounds,
) -> ResolvedPageBounds {
    if !matches!(workflow.bleed_type, BleedType::BleedIncluded)
        || !matches!(workflow.source_sizing, SourceSizing::PreserveOriginalSize)
    {
        return resolved_bounds;
    }

    if matches!(selected_page_box, PdfPageBox::BleedBox) {
        return resolved_bounds;
    }

    if let Some(trim_bounds) = trim_bounds {
        if bounds_contains(crop_canvas_bounds, trim_bounds)
            && !bounds_equivalent(crop_canvas_bounds, trim_bounds)
        {
            return crop_canvas_bounds;
        }

        if bounds_equivalent(crop_canvas_bounds, trim_bounds)
            && !bounds_equivalent(media_canvas_bounds, crop_canvas_bounds)
        {
            return media_canvas_bounds;
        }

        return resolved_bounds;
    }

    resolved_bounds
}

fn resolve_render_canvas_bounds(
    crop_canvas_bounds: ResolvedPageBounds,
    media_canvas_bounds: ResolvedPageBounds,
    selected_bounds: ResolvedPageBounds,
) -> ResolvedPageBounds {
    if bounds_contains(crop_canvas_bounds, selected_bounds) {
        return crop_canvas_bounds;
    }

    expand_bounds_to_include(media_canvas_bounds, selected_bounds)
}

fn bounds_contains(container: ResolvedPageBounds, inner: ResolvedPageBounds) -> bool {
    let tolerance = 0.01;
    let container_right = container.left + container.width;
    let container_top = container.bottom + container.height;
    let inner_right = inner.left + inner.width;
    let inner_top = inner.bottom + inner.height;

    inner.left >= container.left - tolerance
        && inner.bottom >= container.bottom - tolerance
        && inner_right <= container_right + tolerance
        && inner_top <= container_top + tolerance
}

fn bounds_equivalent(left: ResolvedPageBounds, right: ResolvedPageBounds) -> bool {
    bounds_contains(left, right) && bounds_contains(right, left)
}

fn expand_bounds_to_include(
    bounds: ResolvedPageBounds,
    included: ResolvedPageBounds,
) -> ResolvedPageBounds {
    let left = bounds.left.min(included.left);
    let bottom = bounds.bottom.min(included.bottom);
    let right = (bounds.left + bounds.width).max(included.left + included.width);
    let top = (bounds.bottom + bounds.height).max(included.bottom + included.height);

    ResolvedPageBounds {
        left,
        bottom,
        width: right - left,
        height: top - bottom,
    }
}

fn collect_page_clip_boxes(source: &Document, page_id: ObjectId) -> Vec<[f64; 4]> {
    [
        PdfPageBox::MediaBox,
        PdfPageBox::CropBox,
        PdfPageBox::BleedBox,
        PdfPageBox::TrimBox,
        PdfPageBox::ArtBox,
    ]
    .into_iter()
    .filter_map(|page_box| {
        resolve_page_bounds(source, page_id, &[page_box])
            .ok()
            .map(|(_, bounds)| {
                [
                    bounds.left,
                    bounds.bottom,
                    bounds.left + bounds.width,
                    bounds.bottom + bounds.height,
                ]
            })
    })
    .collect()
}

fn strip_page_box_clip(operations: &mut Vec<Operation>, page_clip_boxes: &[[f64; 4]]) {
    let max_index = operations.len().saturating_sub(2).min(24);
    for index in 0..max_index {
        let Some(re_operation) = operations.get(index) else {
            break;
        };
        let Some(clip_operation) = operations.get(index + 1) else {
            break;
        };
        let Some(end_clip_operation) = operations.get(index + 2) else {
            break;
        };
        if re_operation.operator != "re"
            || !matches!(clip_operation.operator.as_str(), "W" | "W*")
            || end_clip_operation.operator != "n"
        {
            continue;
        }
        if !rectangle_matches_page_box(re_operation, page_clip_boxes) {
            continue;
        }

        operations.drain(index..index + 3);
        break;
    }
}

fn rectangle_matches_page_box(operation: &Operation, page_clip_boxes: &[[f64; 4]]) -> bool {
    if operation.operands.len() != 4 {
        return false;
    }
    let Some(x) = object_to_number(&operation.operands[0]) else {
        return false;
    };
    let Some(y) = object_to_number(&operation.operands[1]) else {
        return false;
    };
    let Some(width) = object_to_number(&operation.operands[2]) else {
        return false;
    };
    let Some(height) = object_to_number(&operation.operands[3]) else {
        return false;
    };

    let normalized = [
        x.min(x + width),
        y.min(y + height),
        x.max(x + width),
        y.max(y + height),
    ];
    page_clip_boxes.iter().any(|clip_box| {
        normalized
            .iter()
            .zip(clip_box.iter())
            .all(|(actual, expected)| (actual - expected).abs() <= 0.01)
    })
}

fn object_to_number(object: &Object) -> Option<f64> {
    match object {
        Object::Integer(value) => Some(*value as f64),
        Object::Real(value) => Some((*value).into()),
        _ => None,
    }
}

fn resolve_effective_source_bounds(
    source: &Document,
    page_id: ObjectId,
    workflow: &ImpositionWorkflow,
    selected_page_box: PdfPageBox,
    selected_bounds: ResolvedPageBounds,
    canvas_bounds: ResolvedPageBounds,
) -> ResolvedPageBounds {
    if !matches!(workflow.bleed_type, BleedType::BleedIncluded) {
        return selected_bounds;
    }

    if matches!(selected_page_box, PdfPageBox::BleedBox) || workflow.bleed <= 0.0 {
        return selected_bounds;
    }

    let Ok((_, trim_bounds)) =
        resolve_page_bounds(source, page_id, &[PdfPageBox::TrimBox, PdfPageBox::ArtBox])
    else {
        return selected_bounds;
    };

    let canvas_right = canvas_bounds.left + canvas_bounds.width;
    let canvas_top = canvas_bounds.bottom + canvas_bounds.height;
    let trim_right = trim_bounds.left + trim_bounds.width;
    let trim_top = trim_bounds.bottom + trim_bounds.height;

    let left = (trim_bounds.left - workflow.bleed).max(canvas_bounds.left);
    let bottom = (trim_bounds.bottom - workflow.bleed).max(canvas_bounds.bottom);
    let right = (trim_right + workflow.bleed).min(canvas_right);
    let top = (trim_top + workflow.bleed).min(canvas_top);
    let width = right - left;
    let height = top - bottom;

    if width <= 0.0 || height <= 0.0 {
        return selected_bounds;
    }

    ResolvedPageBounds {
        left,
        bottom,
        width,
        height,
    }
}

fn resolve_trim_bounds(source: &Document, page_id: ObjectId) -> Option<ResolvedPageBounds> {
    resolve_page_bounds(source, page_id, &[PdfPageBox::TrimBox, PdfPageBox::ArtBox])
        .ok()
        .map(|(_, bounds)| bounds)
}

fn resolve_source_trim_bounds(
    trim_bounds: Option<ResolvedPageBounds>,
    selected_page_box: PdfPageBox,
    fallback_trim_bounds: ResolvedPageBounds,
) -> Option<ResolvedPageBounds> {
    if let Some(trim_bounds) = trim_bounds {
        return Some(trim_bounds);
    }

    if matches!(selected_page_box, PdfPageBox::TrimBox) {
        return Some(fallback_trim_bounds);
    }

    None
}

fn resolve_source_trim_box(
    trim_bounds: Option<ResolvedPageBounds>,
    source_bounds: &ResolvedPageBounds,
) -> Option<CropBox> {
    let trim_bounds = trim_bounds?;
    let x0 = (trim_bounds.left - source_bounds.left).clamp(0.0, source_bounds.width);
    let y0 = (trim_bounds.bottom - source_bounds.bottom).clamp(0.0, source_bounds.height);
    let x1 = (x0 + trim_bounds.width).clamp(x0, source_bounds.width);
    let y1 = (y0 + trim_bounds.height).clamp(y0, source_bounds.height);

    if x1 <= x0 || y1 <= y0 {
        return None;
    }

    Some(CropBox { x0, y0, x1, y1 })
}

fn page_box_preferences(workflow: &ImpositionWorkflow) -> [PdfPageBox; 5] {
    if matches!(workflow.bleed_type, BleedType::BleedIncluded) {
        [
            PdfPageBox::BleedBox,
            PdfPageBox::TrimBox,
            PdfPageBox::CropBox,
            PdfPageBox::MediaBox,
            PdfPageBox::ArtBox,
        ]
    } else {
        [
            PdfPageBox::TrimBox,
            PdfPageBox::BleedBox,
            PdfPageBox::CropBox,
            PdfPageBox::MediaBox,
            PdfPageBox::ArtBox,
        ]
    }
}

fn build_processed_form(
    document: &mut Document,
    original_form_id: ObjectId,
    source_width: f64,
    source_height: f64,
    trim_box: Option<CropBox>,
    workflow: &ImpositionWorkflow,
) -> Result<SourceFormRef, String> {
    let scale = if workflow.needs_scaling {
        workflow.scaling_factor
    } else {
        1.0
    };

    let needs_cover_bleed = matches!(
        workflow.bleed_type,
        BleedType::OnePointFiveMmScale
            | BleedType::DifferentialDiffusion
            | BleedType::ContentAwareFast
    );
    let needs_mirror_bleed = matches!(workflow.bleed_type, BleedType::TwoMmMirror);
    let needs_fit_output_box = workflow.needs_scaling
        && matches!(workflow.source_sizing, SourceSizing::FitOutputBox)
        && matches!(
            workflow.bleed_type,
            BleedType::NoBleed | BleedType::BleedIncluded
        );

    if !needs_cover_bleed
        && !needs_mirror_bleed
        && !needs_fit_output_box
        && (scale - 1.0).abs() <= f64::EPSILON
    {
        return Ok(SourceFormRef {
            form_id: original_form_id,
            width: source_width,
            height: source_height,
            trim_box,
        });
    }

    if needs_mirror_bleed {
        return build_mirror_bleed_form(
            document,
            original_form_id,
            source_width,
            source_height,
            scale,
            workflow.bleed,
            workflow.item_width,
            workflow.item_height,
        );
    }

    if needs_cover_bleed || needs_fit_output_box {
        let (target_width, target_height, target_trim_box) = output_geometry_for_workflow(workflow);
        return build_fitted_form(
            document,
            original_form_id,
            source_width,
            source_height,
            scale,
            target_width,
            target_height,
            Some(target_trim_box),
        );
    }

    build_scaled_form(
        document,
        original_form_id,
        source_width,
        source_height,
        scale,
        trim_box,
    )
}

fn build_scaled_form(
    document: &mut Document,
    original_form_id: ObjectId,
    source_width: f64,
    source_height: f64,
    scale: f64,
    trim_box: Option<CropBox>,
) -> Result<SourceFormRef, String> {
    let target_width = source_width * scale;
    let target_height = source_height * scale;
    let operations = vec![
        Operation::new("q", vec![]),
        Operation::new(
            "cm",
            vec![
                real(scale),
                real(0.0),
                real(0.0),
                real(scale),
                real(0.0),
                real(0.0),
            ],
        ),
        Operation::new("Do", vec![Object::Name(b"Src".to_vec())]),
        Operation::new("Q", vec![]),
    ];

    wrap_form(
        document,
        original_form_id,
        target_width,
        target_height,
        operations,
        trim_box.map(|trim_box| CropBox {
            x0: trim_box.x0 * scale,
            y0: trim_box.y0 * scale,
            x1: trim_box.x1 * scale,
            y1: trim_box.y1 * scale,
        }),
    )
}

fn output_geometry_for_workflow(workflow: &ImpositionWorkflow) -> (f64, f64, CropBox) {
    match workflow.bleed_type {
        BleedType::BleedIncluded
        | BleedType::OnePointFiveMmScale
        | BleedType::DifferentialDiffusion
        | BleedType::ContentAwareFast => (
            workflow.item_width + 2.0 * workflow.bleed,
            workflow.item_height + 2.0 * workflow.bleed,
            CropBox {
                x0: workflow.bleed,
                y0: workflow.bleed,
                x1: workflow.bleed + workflow.item_width,
                y1: workflow.bleed + workflow.item_height,
            },
        ),
        BleedType::NoBleed | BleedType::TwoMmMirror => (
            workflow.item_width,
            workflow.item_height,
            CropBox {
                x0: 0.0,
                y0: 0.0,
                x1: workflow.item_width,
                y1: workflow.item_height,
            },
        ),
    }
}

fn points_to_pixels(value_points: f64, content_points: f64, content_px: u32) -> u32 {
    if value_points <= 0.0 || content_points <= 0.0 || content_px == 0 {
        return 0;
    }

    (((value_points / content_points) * content_px as f64).round()).max(0.0) as u32
}

fn scale_points_for_padding(original_points: f64, original_px: u32, padded_px: u32) -> f64 {
    if original_px == 0 {
        return original_points;
    }

    original_points * padded_px as f64 / original_px as f64
}

fn build_fitted_form(
    document: &mut Document,
    original_form_id: ObjectId,
    source_width: f64,
    source_height: f64,
    scale: f64,
    target_width: f64,
    target_height: f64,
    trim_box: Option<CropBox>,
) -> Result<SourceFormRef, String> {
    let translate_x = (target_width - source_width * scale) / 2.0;
    let translate_y = (target_height - source_height * scale) / 2.0;

    let operations = vec![
        Operation::new("q", vec![]),
        Operation::new(
            "cm",
            vec![
                real(scale),
                real(0.0),
                real(0.0),
                real(scale),
                real(translate_x),
                real(translate_y),
            ],
        ),
        Operation::new("Do", vec![Object::Name(b"Src".to_vec())]),
        Operation::new("Q", vec![]),
    ];

    wrap_form(
        document,
        original_form_id,
        target_width,
        target_height,
        operations,
        trim_box,
    )
}

fn build_mirror_bleed_form(
    document: &mut Document,
    original_form_id: ObjectId,
    source_width: f64,
    source_height: f64,
    scale: f64,
    bleed: f64,
    trim_width: f64,
    trim_height: f64,
) -> Result<SourceFormRef, String> {
    let scaled_width = source_width * scale;
    let scaled_height = source_height * scale;
    let target_width = trim_width + 2.0 * bleed;
    let target_height = trim_height + 2.0 * bleed;
    let overlap = MIRROR_BLEED_SEAM_OVERLAP_PT;
    let origin_x = bleed + (trim_width - scaled_width) / 2.0;
    let origin_y = bleed + (trim_height - scaled_height) / 2.0;

    let transforms = [
        [
            -scale,
            0.0,
            0.0,
            scale,
            2.0 * bleed - origin_x + overlap,
            origin_y,
        ],
        [
            -scale,
            0.0,
            0.0,
            scale,
            2.0 * (bleed + trim_width) - origin_x - overlap,
            origin_y,
        ],
        [
            scale,
            0.0,
            0.0,
            -scale,
            origin_x,
            2.0 * bleed - origin_y + overlap,
        ],
        [
            scale,
            0.0,
            0.0,
            -scale,
            origin_x,
            2.0 * (bleed + trim_height) - origin_y - overlap,
        ],
        [
            -scale,
            0.0,
            0.0,
            -scale,
            2.0 * bleed - origin_x + overlap,
            2.0 * bleed - origin_y + overlap,
        ],
        [
            -scale,
            0.0,
            0.0,
            -scale,
            2.0 * (bleed + trim_width) - origin_x - overlap,
            2.0 * bleed - origin_y + overlap,
        ],
        [
            -scale,
            0.0,
            0.0,
            -scale,
            2.0 * bleed - origin_x + overlap,
            2.0 * (bleed + trim_height) - origin_y - overlap,
        ],
        [
            -scale,
            0.0,
            0.0,
            -scale,
            2.0 * (bleed + trim_width) - origin_x - overlap,
            2.0 * (bleed + trim_height) - origin_y - overlap,
        ],
        [scale, 0.0, 0.0, scale, origin_x, origin_y],
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

    wrap_form(
        document,
        original_form_id,
        target_width,
        target_height,
        operations,
        Some(CropBox {
            x0: bleed,
            y0: bleed,
            x1: bleed + trim_width,
            y1: bleed + trim_height,
        }),
    )
}

fn wrap_form(
    document: &mut Document,
    original_form_id: ObjectId,
    target_width: f64,
    target_height: f64,
    operations: Vec<Operation>,
    trim_box: Option<CropBox>,
) -> Result<SourceFormRef, String> {
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
            .map_err(|error| format!("Failed to encode processed form: {error}"))?,
    ));

    Ok(SourceFormRef {
        form_id,
        width: target_width,
        height: target_height,
        trim_box,
    })
}

#[derive(Debug, Clone, Copy)]
struct LinearTransform {
    a: f64,
    b: f64,
    c: f64,
    d: f64,
}

impl LinearTransform {
    const IDENTITY: Self = Self {
        a: 1.0,
        b: 0.0,
        c: 0.0,
        d: 1.0,
    };

    fn multiply(self, rhs: Self) -> Self {
        Self {
            a: self.a * rhs.a + self.c * rhs.b,
            b: self.b * rhs.a + self.d * rhs.b,
            c: self.a * rhs.c + self.c * rhs.d,
            d: self.b * rhs.c + self.d * rhs.d,
        }
    }

    fn is_identity(self) -> bool {
        (self.a - 1.0).abs() <= f64::EPSILON
            && self.b.abs() <= f64::EPSILON
            && self.c.abs() <= f64::EPSILON
            && (self.d - 1.0).abs() <= f64::EPSILON
    }
}

#[derive(Debug, Clone, Copy)]
struct PlacementTransform {
    a: f64,
    b: f64,
    c: f64,
    d: f64,
    e: f64,
    f: f64,
}

fn rotation_transform(rotation: Option<&str>) -> LinearTransform {
    match rotation {
        Some("ROTATION_90") => LinearTransform {
            a: 0.0,
            b: 1.0,
            c: -1.0,
            d: 0.0,
        },
        Some("ROTATION_180") => LinearTransform {
            a: -1.0,
            b: 0.0,
            c: 0.0,
            d: -1.0,
        },
        Some("ROTATION_270") => LinearTransform {
            a: 0.0,
            b: -1.0,
            c: 1.0,
            d: 0.0,
        },
        _ => LinearTransform::IDENTITY,
    }
}

fn back_side_linear_transform(rotation: Option<&str>, mirror_back: bool) -> LinearTransform {
    let rotation_transform = rotation_transform(rotation);
    if mirror_back {
        rotation_transform.multiply(LinearTransform {
            a: -1.0,
            b: 0.0,
            c: 0.0,
            d: 1.0,
        })
    } else {
        rotation_transform
    }
}

fn resolve_desired_trim_origin(
    workflow: &ImpositionWorkflow,
    position: &crate::imposition::layout::PositionSlot,
    x_offset: f64,
    y_offset: f64,
    is_back_side: bool,
) -> (f64, f64) {
    let default_x = position.x + x_offset;
    let default_y = position.y + y_offset;

    if !is_back_side
        || !workflow.front_back_alignment
        || matches!(workflow.layout_type, LayoutType::Booklet)
    {
        return (default_x, default_y);
    }

    match workflow.duplex_mode.as_deref() {
        Some("DUPLEX_LONG_EDGE") => (
            workflow.sheet_width - default_x - workflow.item_width,
            default_y,
        ),
        Some("DUPLEX_SHORT_EDGE") => (
            default_x,
            workflow.sheet_height - default_y - workflow.item_height,
        ),
        _ => (default_x, default_y),
    }
}

fn build_placement_transform(
    workflow: &ImpositionWorkflow,
    crop_box: &CropBox,
    crop_left: f64,
    crop_bottom: f64,
    is_back_side: bool,
) -> PlacementTransform {
    let linear_transform = if is_back_side {
        back_side_linear_transform(workflow.back_page_rotation.as_deref(), workflow.mirror_back)
    } else {
        LinearTransform::IDENTITY
    };

    if !is_back_side || linear_transform.is_identity() {
        return PlacementTransform {
            a: 1.0,
            b: 0.0,
            c: 0.0,
            d: 1.0,
            e: crop_left - crop_box.x0,
            f: crop_bottom - crop_box.y0,
        };
    }

    let crop_width = crop_box.x1 - crop_box.x0;
    let crop_height = crop_box.y1 - crop_box.y0;
    let source_center_x = (crop_box.x0 + crop_box.x1) / 2.0;
    let source_center_y = (crop_box.y0 + crop_box.y1) / 2.0;
    let target_center_x = crop_left + crop_width / 2.0;
    let target_center_y = crop_bottom + crop_height / 2.0;

    PlacementTransform {
        a: linear_transform.a,
        b: linear_transform.b,
        c: linear_transform.c,
        d: linear_transform.d,
        e: target_center_x
            - (linear_transform.a * source_center_x + linear_transform.c * source_center_y),
        f: target_center_y
            - (linear_transform.b * source_center_x + linear_transform.d * source_center_y),
    }
}

fn resolve_slot_clip_rect(
    workflow: &ImpositionWorkflow,
    position: &crate::imposition::layout::PositionSlot,
    desired_trim_x: f64,
    desired_trim_y: f64,
    crop_left: f64,
    crop_bottom: f64,
    crop_width: f64,
    crop_height: f64,
) -> Option<(f64, f64, f64, f64)> {
    let crop_right = crop_left + crop_width;
    let crop_top = crop_bottom + crop_height;
    let safe_bleeds = calculate_safe_bleeds(workflow, position.col, position.row);
    let preserves_outer_edges = !matches!(workflow.bleed_type, BleedType::NoBleed);

    let allowed_left = if position.col == 0 && preserves_outer_edges {
        crop_left
    } else {
        desired_trim_x - safe_bleeds.left_bleed
    };
    let allowed_right = if position.col == workflow.num_items_horizontal.saturating_sub(1)
        && preserves_outer_edges
    {
        crop_right
    } else {
        desired_trim_x + workflow.item_width + safe_bleeds.right_bleed
    };
    let allowed_bottom = if position.row == 0 && preserves_outer_edges {
        crop_bottom
    } else {
        desired_trim_y - safe_bleeds.bottom_bleed
    };
    let allowed_top =
        if position.row == workflow.num_items_vertical.saturating_sub(1) && preserves_outer_edges {
            crop_top
        } else {
            desired_trim_y + workflow.item_height + safe_bleeds.top_bleed
        };

    let clip_left = crop_left.max(allowed_left);
    let clip_bottom = crop_bottom.max(allowed_bottom);
    let clip_right = crop_right.min(allowed_right);
    let clip_top = crop_top.min(allowed_top);
    let clip_width = clip_right - clip_left;
    let clip_height = clip_top - clip_bottom;

    (clip_width > 0.0 && clip_height > 0.0).then_some((
        clip_left,
        clip_bottom,
        clip_width,
        clip_height,
    ))
}

fn build_sheet_page(
    document: &mut Document,
    pages_root_id: ObjectId,
    workflow: &ImpositionWorkflow,
    positions: &[crate::imposition::layout::PositionSlot],
    arrangement: &[Option<usize>],
    source_forms: &[SourceFormRef],
    x_offset: f64,
    y_offset: f64,
    is_back_side: bool,
) -> Result<ObjectId, String> {
    let mut operations = Vec::new();
    let mut trim_areas = Vec::new();
    let mut xobject_map = BTreeMap::new();

    for (position, source_index) in positions.iter().zip(arrangement.iter()) {
        let Some(source_index) = source_index else {
            continue;
        };
        let Some(source_form) = source_forms.get(*source_index) else {
            continue;
        };

        let resource_name = format!("Fm{source_index}");
        xobject_map.insert(resource_name.clone(), source_form.form_id);

        let default_trim_box = centered_trim_box(
            source_form.width,
            source_form.height,
            workflow.item_width,
            workflow.item_height,
        );
        let trim_box = source_form.trim_box.as_ref().unwrap_or(&default_trim_box);
        let crop_box = calculate_crop_box_for_trim_box(
            workflow,
            source_form.width,
            source_form.height,
            trim_box,
            position.col,
            position.row,
        );
        let crop_width = crop_box.x1 - crop_box.x0;
        let crop_height = crop_box.y1 - crop_box.y0;
        if crop_width <= 0.0 || crop_height <= 0.0 {
            continue;
        }

        let (desired_trim_x, desired_trim_y) =
            resolve_desired_trim_origin(workflow, position, x_offset, y_offset, is_back_side);
        let desired_trim_center_x = desired_trim_x + workflow.item_width / 2.0;
        let desired_trim_center_y = desired_trim_y + workflow.item_height / 2.0;
        let source_trim_center_x = (trim_box.x0 + trim_box.x1) / 2.0;
        let source_trim_center_y = (trim_box.y0 + trim_box.y1) / 2.0;
        let crop_left = desired_trim_center_x - (source_trim_center_x - crop_box.x0);
        let crop_bottom = desired_trim_center_y - (source_trim_center_y - crop_box.y0);
        let Some((clip_left, clip_bottom, clip_width, clip_height)) = resolve_slot_clip_rect(
            workflow,
            position,
            desired_trim_x,
            desired_trim_y,
            crop_left,
            crop_bottom,
            crop_width,
            crop_height,
        ) else {
            continue;
        };
        let placement_transform =
            build_placement_transform(workflow, &crop_box, crop_left, crop_bottom, is_back_side);

        operations.push(Operation::new("q", vec![]));
        operations.push(Operation::new(
            "re",
            vec![
                real(clip_left),
                real(clip_bottom),
                real(clip_width),
                real(clip_height),
            ],
        ));
        operations.push(Operation::new("W", vec![]));
        operations.push(Operation::new("n", vec![]));
        operations.push(Operation::new(
            "cm",
            vec![
                real(placement_transform.a),
                real(placement_transform.b),
                real(placement_transform.c),
                real(placement_transform.d),
                real(placement_transform.e),
                real(placement_transform.f),
            ],
        ));
        operations.push(Operation::new(
            "Do",
            vec![Object::Name(resource_name.as_bytes().to_vec())],
        ));
        operations.push(Operation::new("Q", vec![]));

        trim_areas.push(TrimArea {
            col: position.col,
            row: position.row,
            x0: desired_trim_x,
            y0: desired_trim_y,
            x1: desired_trim_x + workflow.item_width,
            y1: desired_trim_y + workflow.item_height,
        });
    }

    if workflow.crop_marks {
        append_crop_mark_operations(&mut operations, workflow, &trim_areas);
    }

    let content_id = document.add_object(Stream::new(
        Dictionary::new(),
        Content { operations }
            .encode()
            .map_err(|error| format!("Failed to encode sheet content: {error}"))?,
    ));

    let mut xobjects = Dictionary::new();
    for (name, object_id) in xobject_map {
        xobjects.set(name.as_str(), object_id);
    }
    let mut resources = Dictionary::new();
    resources.set("XObject", xobjects);
    let resources_id = document.add_object(resources);

    let page_id = document.add_object(dictionary! {
        "Type" => Object::Name(b"Page".to_vec()),
        "Parent" => pages_root_id,
        "Contents" => content_id,
        "Resources" => resources_id,
        "MediaBox" => vec![real(0.0), real(0.0), real(workflow.sheet_width), real(workflow.sheet_height)],
        "CropBox" => vec![real(0.0), real(0.0), real(workflow.sheet_width), real(workflow.sheet_height)],
    });

    Ok(page_id)
}

fn append_crop_mark_operations(
    operations: &mut Vec<Operation>,
    workflow: &ImpositionWorkflow,
    trim_areas: &[TrimArea],
) {
    operations.push(Operation::new("q", vec![]));
    operations.push(Operation::new("w", vec![real(0.5)]));
    operations.push(Operation::new("RG", vec![real(0.0), real(0.0), real(0.0)]));

    for trim_area in trim_areas {
        if trim_area.col == 0 {
            if trim_area.row == 0 {
                append_line(
                    operations,
                    trim_area.x0,
                    trim_area.y0 - workflow.crop_mark_offset,
                    trim_area.x0,
                    trim_area.y0 - workflow.crop_mark_length,
                );
            }
            if trim_area.row == workflow.num_items_vertical.saturating_sub(1) {
                append_line(
                    operations,
                    trim_area.x0,
                    trim_area.y1 + workflow.crop_mark_offset,
                    trim_area.x0,
                    trim_area.y1 + workflow.crop_mark_length,
                );
            }
            append_line(
                operations,
                trim_area.x0 - workflow.crop_mark_offset,
                trim_area.y0,
                trim_area.x0 - workflow.crop_mark_length,
                trim_area.y0,
            );
            append_line(
                operations,
                trim_area.x0 - workflow.crop_mark_offset,
                trim_area.y1,
                trim_area.x0 - workflow.crop_mark_length,
                trim_area.y1,
            );
        }

        if trim_area.col == workflow.num_items_horizontal.saturating_sub(1) {
            if trim_area.row == 0 {
                append_line(
                    operations,
                    trim_area.x1,
                    trim_area.y0 - workflow.crop_mark_offset,
                    trim_area.x1,
                    trim_area.y0 - workflow.crop_mark_length,
                );
            }
            if trim_area.row == workflow.num_items_vertical.saturating_sub(1) {
                append_line(
                    operations,
                    trim_area.x1,
                    trim_area.y1 + workflow.crop_mark_offset,
                    trim_area.x1,
                    trim_area.y1 + workflow.crop_mark_length,
                );
            }
            append_line(
                operations,
                trim_area.x1 + workflow.crop_mark_offset,
                trim_area.y0,
                trim_area.x1 + workflow.crop_mark_length,
                trim_area.y0,
            );
            append_line(
                operations,
                trim_area.x1 + workflow.crop_mark_offset,
                trim_area.y1,
                trim_area.x1 + workflow.crop_mark_length,
                trim_area.y1,
            );
        }

        if trim_area.row == 0 {
            append_line(
                operations,
                trim_area.x0,
                trim_area.y0 - workflow.crop_mark_offset,
                trim_area.x0,
                trim_area.y0 - workflow.crop_mark_length,
            );
            append_line(
                operations,
                trim_area.x1,
                trim_area.y0 - workflow.crop_mark_offset,
                trim_area.x1,
                trim_area.y0 - workflow.crop_mark_length,
            );
        }

        if trim_area.row == workflow.num_items_vertical.saturating_sub(1) {
            append_line(
                operations,
                trim_area.x0,
                trim_area.y1 + workflow.crop_mark_offset,
                trim_area.x0,
                trim_area.y1 + workflow.crop_mark_length,
            );
            append_line(
                operations,
                trim_area.x1,
                trim_area.y1 + workflow.crop_mark_offset,
                trim_area.x1,
                trim_area.y1 + workflow.crop_mark_length,
            );
        }
    }

    operations.push(Operation::new("Q", vec![]));
}

fn append_line(operations: &mut Vec<Operation>, x0: f64, y0: f64, x1: f64, y1: f64) {
    operations.push(Operation::new("m", vec![real(x0), real(y0)]));
    operations.push(Operation::new("l", vec![real(x1), real(y1)]));
    operations.push(Operation::new("S", vec![]));
}

fn finalize_document(document: &mut Document, pages_root_id: ObjectId, page_ids: &[ObjectId]) {
    let pages = dictionary! {
        "Type" => Object::Name(b"Pages".to_vec()),
        "Kids" => page_ids.iter().copied().map(Object::Reference).collect::<Vec<_>>(),
        "Count" => page_ids.len() as i64,
    };
    document
        .objects
        .insert(pages_root_id, Object::Dictionary(pages));

    let catalog_id = document.add_object(dictionary! {
        "Type" => Object::Name(b"Catalog".to_vec()),
        "Pages" => pages_root_id,
    });
    document.trailer.set("Root", catalog_id);
    document.compress();
}

fn real(value: f64) -> Object {
    Object::Real(value as f32)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::common::mm_to_points;
    use crate::imposition::models::{ImpositionDataInput, LayoutType, SourceSizing};
    use lopdf::dictionary;

    fn assert_matrix_present(matrices: &[[f64; 6]], expected: [f64; 6]) {
        let tolerance = 0.0001;
        assert!(
            matrices.iter().any(|actual| {
                actual
                    .iter()
                    .zip(expected.iter())
                    .all(|(actual_value, expected_value)| {
                        (actual_value - expected_value).abs() <= tolerance
                    })
            }),
            "missing transform matrix: {expected:?}; actual matrices: {matrices:?}"
        );
    }

    fn object_to_f64(value: &Object) -> f64 {
        match value {
            Object::Integer(number) => *number as f64,
            Object::Real(number) => *number as f64,
            _ => panic!("expected numeric operand, got {value:?}"),
        }
    }

    fn build_test_source_form(document: &mut Document, width: f64, height: f64) -> ObjectId {
        document.add_object(Stream::new(
            dictionary! {
                "Type" => Object::Name(b"XObject".to_vec()),
                "Subtype" => Object::Name(b"Form".to_vec()),
                "FormType" => 1_i64,
                "BBox" => vec![real(0.0), real(0.0), real(width), real(height)],
            },
            Vec::new(),
        ))
    }

    fn build_test_workflow_with_dimensions(
        bleed_type: BleedType,
        bleed_mm: f64,
        item_width_mm: f64,
        item_height_mm: f64,
    ) -> ImpositionWorkflow {
        ImpositionWorkflow::from_input(&ImpositionDataInput {
            custom_sheet_size_width: 210.0,
            custom_sheet_size_height: 297.0,
            custom_item_size_width: item_width_mm,
            custom_item_size_height: item_height_mm,
            num_items_horizontal: 1,
            num_items_vertical: 1,
            spacing_horizontal: String::new(),
            spacing_vertical: String::new(),
            bleed: bleed_mm,
            bleed_type,
            source_sizing: SourceSizing::PreserveOriginalSize,
            crop_marks: false,
            layout: LayoutType::StepAndRepeat,
            pages_per_signature: None,
            binding_edge: None,
            duplex_mode: None,
            back_page_rotation: None,
            front_back_alignment: false,
            mirror_back: false,
            automatic_sheet_orientation: false,
            automatic_item_orientation: false,
            automatic_number_of_horizontal_items: false,
            automatic_number_of_vertical_items: false,
            automatic_spacing_horizontal: false,
            automatic_spacing_vertical: false,
        })
        .expect("test workflow should be valid")
    }

    fn build_test_workflow(bleed_type: BleedType) -> ImpositionWorkflow {
        build_test_workflow_with_dimensions(bleed_type, 3.0, 90.0, 120.0)
    }

    fn box_array(bounds: [f64; 4]) -> Vec<Object> {
        bounds.into_iter().map(real).collect()
    }

    fn build_source_document(
        page_boxes: &[(&str, [f64; 4])],
        inherited_boxes: &[(&str, [f64; 4])],
    ) -> (Document, ObjectId) {
        let mut document = Document::with_version("1.5");
        let pages_id = document.new_object_id();
        let resources_id = document.add_object(dictionary! {});
        let content_id = document.add_object(Stream::new(dictionary! {}, Vec::new()));

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

        let mut pages_dictionary = dictionary! {
            "Type" => Object::Name(b"Pages".to_vec()),
            "Kids" => vec![Object::Reference(page_id)],
            "Count" => 1_i64,
        };
        for (box_name, bounds) in inherited_boxes {
            pages_dictionary.set(*box_name, box_array(*bounds));
        }
        document
            .objects
            .insert(pages_id, Object::Dictionary(pages_dictionary));

        let catalog_id = document.add_object(dictionary! {
            "Type" => Object::Name(b"Catalog".to_vec()),
            "Pages" => Object::Reference(pages_id),
        });
        document.trailer.set("Root", Object::Reference(catalog_id));

        (document, page_id)
    }

    fn build_multi_page_pdf(page_sizes: &[(f64, f64)]) -> Vec<u8> {
        let mut document = Document::with_version("1.5");
        let pages_id = document.new_object_id();
        let resources_id = document.add_object(dictionary! {});
        let mut page_references = Vec::with_capacity(page_sizes.len());

        for (width, height) in page_sizes {
            let content_id = document.add_object(Stream::new(dictionary! {}, Vec::new()));
            let page_id = document.add_object(dictionary! {
                "Type" => Object::Name(b"Page".to_vec()),
                "Parent" => Object::Reference(pages_id),
                "Resources" => Object::Reference(resources_id),
                "Contents" => Object::Reference(content_id),
                "MediaBox" => vec![real(0.0), real(0.0), real(*width), real(*height)],
            });
            page_references.push(Object::Reference(page_id));
        }

        document.objects.insert(
            pages_id,
            Object::Dictionary(dictionary! {
                "Type" => Object::Name(b"Pages".to_vec()),
                "Kids" => page_references,
                "Count" => page_sizes.len() as i64,
            }),
        );

        let catalog_id = document.add_object(dictionary! {
            "Type" => Object::Name(b"Catalog".to_vec()),
            "Pages" => Object::Reference(pages_id),
        });
        document.trailer.set("Root", Object::Reference(catalog_id));

        let mut bytes = Vec::new();
        document
            .save_to(&mut bytes)
            .expect("synthetic multi-page PDF should serialize");
        bytes
    }

    fn stream_array_f64(stream: &Stream, key: &[u8]) -> Vec<f64> {
        stream
            .dict
            .get(key)
            .expect("stream dictionary should contain requested key")
            .as_array()
            .expect("requested key should contain an array")
            .iter()
            .map(object_to_f64)
            .collect()
    }

    fn assert_form_geometry(
        document: &Document,
        form_id: ObjectId,
        expected_bbox: [f64; 4],
        expected_matrix: Option<[f64; 6]>,
    ) {
        let form_stream = document
            .get_object(form_id)
            .expect("form should exist")
            .as_stream()
            .expect("form should be a stream");
        let bbox = stream_array_f64(form_stream, b"BBox");

        assert_eq!(bbox.len(), expected_bbox.len());
        for (actual, expected) in bbox.iter().zip(expected_bbox.iter()) {
            assert!((actual - expected).abs() < 0.0001);
        }

        match expected_matrix {
            Some(expected_matrix) => {
                let matrix = stream_array_f64(form_stream, b"Matrix");
                assert_eq!(matrix.len(), expected_matrix.len());
                for (actual, expected) in matrix.iter().zip(expected_matrix.iter()) {
                    assert!((actual - expected).abs() < 0.0001);
                }
            }
            None => {
                assert!(
                    form_stream.dict.get(b"Matrix").is_err(),
                    "form should not define a transformation matrix"
                );
            }
        }
    }

    fn assert_clipped_source_form(
        document: &Document,
        form_id: ObjectId,
        expected_bbox: [f64; 4],
        expected_wrapper_translation: [f64; 2],
        expected_raw_bbox: [f64; 4],
        expected_raw_matrix: [f64; 6],
    ) {
        assert_form_geometry(document, form_id, expected_bbox, None);

        let wrapper_stream = document
            .get_object(form_id)
            .expect("wrapper form should exist")
            .as_stream()
            .expect("wrapper form should be a stream");
        let wrapper_content =
            Content::decode(&wrapper_stream.content).expect("wrapper content should decode");
        let wrapper_operators = wrapper_content
            .operations
            .iter()
            .map(|operation| operation.operator.as_str())
            .collect::<Vec<_>>();
        assert_eq!(
            wrapper_operators,
            vec!["q", "re", "W", "n", "q", "cm", "Do", "Q", "Q"]
        );
        let wrapper_matrix = wrapper_content
            .operations
            .iter()
            .find(|operation| operation.operator == "cm")
            .expect("wrapper should translate the full-page source form");
        assert_eq!(wrapper_matrix.operands.len(), 6);
        assert!(
            (object_to_f64(&wrapper_matrix.operands[4]) - expected_wrapper_translation[0]).abs()
                < 0.0001
        );
        assert!(
            (object_to_f64(&wrapper_matrix.operands[5]) - expected_wrapper_translation[1]).abs()
                < 0.0001
        );

        let resources = wrapper_stream
            .dict
            .get(b"Resources")
            .expect("wrapper should define resources")
            .as_dict()
            .expect("wrapper resources should be a dictionary");
        let xobjects = resources
            .get(b"XObject")
            .expect("wrapper resources should define xobjects")
            .as_dict()
            .expect("wrapper xobjects should be a dictionary");
        let raw_form_id = xobjects
            .get(b"Src")
            .expect("wrapper should reference the raw source form")
            .as_reference()
            .expect("raw source form should be a reference");

        assert_form_geometry(
            document,
            raw_form_id,
            expected_raw_bbox,
            Some(expected_raw_matrix),
        );
    }

    fn assert_clipped_source_form_with_inlined_raw_matrix(
        document: &Document,
        form_id: ObjectId,
        expected_bbox: [f64; 4],
        expected_wrapper_translation: [f64; 2],
        expected_raw_bbox: [f64; 4],
        expected_raw_matrix: [f64; 6],
    ) {
        assert_form_geometry(document, form_id, expected_bbox, None);

        let wrapper_stream = document
            .get_object(form_id)
            .expect("wrapper form should exist")
            .as_stream()
            .expect("wrapper form should be a stream");
        let wrapper_content =
            Content::decode(&wrapper_stream.content).expect("wrapper content should decode");
        let wrapper_matrix = wrapper_content
            .operations
            .iter()
            .find(|operation| operation.operator == "cm")
            .expect("wrapper should translate the full-page source form");
        assert_eq!(wrapper_matrix.operands.len(), 6);
        assert!(
            (object_to_f64(&wrapper_matrix.operands[4]) - expected_wrapper_translation[0]).abs()
                < 0.0001
        );
        assert!(
            (object_to_f64(&wrapper_matrix.operands[5]) - expected_wrapper_translation[1]).abs()
                < 0.0001
        );

        let resources = wrapper_stream
            .dict
            .get(b"Resources")
            .expect("wrapper should define resources")
            .as_dict()
            .expect("wrapper resources should be a dictionary");
        let xobjects = resources
            .get(b"XObject")
            .expect("wrapper resources should define xobjects")
            .as_dict()
            .expect("wrapper xobjects should be a dictionary");
        let raw_form_id = xobjects
            .get(b"Src")
            .expect("wrapper should reference the raw source form")
            .as_reference()
            .expect("raw source form should be a reference");

        assert_form_geometry(document, raw_form_id, expected_raw_bbox, None);

        let raw_stream = document
            .get_object(raw_form_id)
            .expect("raw source form should exist")
            .as_stream()
            .expect("raw source form should be a stream");
        let raw_content = Content::decode(&raw_stream.content).expect("raw content should decode");
        assert_eq!(
            raw_content
                .operations
                .first()
                .map(|operation| operation.operator.as_str()),
            Some("q")
        );
        let raw_matrix = raw_content
            .operations
            .get(1)
            .filter(|operation| operation.operator == "cm")
            .expect("raw source content should inline the page matrix");
        assert_eq!(raw_matrix.operands.len(), expected_raw_matrix.len());
        for (actual, expected) in raw_matrix.operands.iter().zip(expected_raw_matrix.iter()) {
            assert!((object_to_f64(actual) - expected).abs() < 0.0001);
        }
        assert_eq!(
            raw_content
                .operations
                .last()
                .map(|operation| operation.operator.as_str()),
            Some("Q")
        );
    }

    #[test]
    fn mirror_bleed_form_adds_corner_reflections() {
        let mut document = Document::with_version("1.5");
        let source_form_id = build_test_source_form(&mut document, 100.0, 50.0);

        let processed_form = build_mirror_bleed_form(
            &mut document,
            source_form_id,
            100.0,
            50.0,
            1.0,
            2.0,
            100.0,
            50.0,
        )
        .expect("mirror bleed form should be built");

        assert!((processed_form.width - 104.0).abs() < 0.0001);
        assert!((processed_form.height - 54.0).abs() < 0.0001);

        let form_stream = document
            .get_object(processed_form.form_id)
            .expect("processed form should exist")
            .as_stream()
            .expect("processed form should be a stream");
        let content =
            Content::decode(&form_stream.content).expect("processed form content should decode");

        let draw_count = content
            .operations
            .iter()
            .filter(|operation| operation.operator == "Do")
            .count();
        assert_eq!(draw_count, 9);

        let matrices = content
            .operations
            .iter()
            .filter(|operation| operation.operator == "cm")
            .map(|operation| {
                let operands = &operation.operands;
                assert_eq!(operands.len(), 6);
                [
                    object_to_f64(&operands[0]),
                    object_to_f64(&operands[1]),
                    object_to_f64(&operands[2]),
                    object_to_f64(&operands[3]),
                    object_to_f64(&operands[4]),
                    object_to_f64(&operands[5]),
                ]
            })
            .collect::<Vec<_>>();

        assert_matrix_present(
            &matrices,
            [-1.0, 0.0, 0.0, 1.0, 2.0 + MIRROR_BLEED_SEAM_OVERLAP_PT, 2.0],
        );
        assert_matrix_present(
            &matrices,
            [
                -1.0,
                0.0,
                0.0,
                1.0,
                202.0 - MIRROR_BLEED_SEAM_OVERLAP_PT,
                2.0,
            ],
        );
        assert_matrix_present(
            &matrices,
            [1.0, 0.0, 0.0, -1.0, 2.0, 2.0 + MIRROR_BLEED_SEAM_OVERLAP_PT],
        );
        assert_matrix_present(
            &matrices,
            [
                1.0,
                0.0,
                0.0,
                -1.0,
                2.0,
                102.0 - MIRROR_BLEED_SEAM_OVERLAP_PT,
            ],
        );
        assert_matrix_present(
            &matrices,
            [
                -1.0,
                0.0,
                0.0,
                -1.0,
                2.0 + MIRROR_BLEED_SEAM_OVERLAP_PT,
                2.0 + MIRROR_BLEED_SEAM_OVERLAP_PT,
            ],
        );
        assert_matrix_present(
            &matrices,
            [
                -1.0,
                0.0,
                0.0,
                -1.0,
                202.0 - MIRROR_BLEED_SEAM_OVERLAP_PT,
                2.0 + MIRROR_BLEED_SEAM_OVERLAP_PT,
            ],
        );
        assert_matrix_present(
            &matrices,
            [
                -1.0,
                0.0,
                0.0,
                -1.0,
                2.0 + MIRROR_BLEED_SEAM_OVERLAP_PT,
                102.0 - MIRROR_BLEED_SEAM_OVERLAP_PT,
            ],
        );
        assert_matrix_present(
            &matrices,
            [
                -1.0,
                0.0,
                0.0,
                -1.0,
                202.0 - MIRROR_BLEED_SEAM_OVERLAP_PT,
                102.0 - MIRROR_BLEED_SEAM_OVERLAP_PT,
            ],
        );
        assert_matrix_present(&matrices, [1.0, 0.0, 0.0, 1.0, 2.0, 2.0]);
    }

    #[test]
    fn pdf_content_aware_fast_falls_back_to_mirror_without_scaling_trim() {
        let mut workflow =
            build_test_workflow_with_dimensions(BleedType::ContentAwareFast, 2.0, 100.0, 50.0);
        let source_pdf = build_multi_page_pdf(&[(workflow.item_width, workflow.item_height)]);
        let mut document = Document::with_version("1.5");

        let source_forms = build_pdf_source_forms(&mut document, &mut workflow, &source_pdf)
            .expect("PDF source forms should be built");

        assert_eq!(source_forms.len(), 1);
        let source_form = &source_forms[0];
        assert!((source_form.width - (workflow.item_width + 2.0 * workflow.bleed)).abs() < 0.0001);
        assert!(
            (source_form.height - (workflow.item_height + 2.0 * workflow.bleed)).abs() < 0.0001
        );
        let trim_box = source_form
            .trim_box
            .as_ref()
            .expect("mirror fallback should set a trim box");
        assert!((trim_box.x0 - workflow.bleed).abs() < 0.0001);
        assert!((trim_box.y0 - workflow.bleed).abs() < 0.0001);
        assert!((trim_box.x1 - (workflow.bleed + workflow.item_width)).abs() < 0.0001);
        assert!((trim_box.y1 - (workflow.bleed + workflow.item_height)).abs() < 0.0001);

        let form_stream = document
            .get_object(source_form.form_id)
            .expect("processed form should exist")
            .as_stream()
            .expect("processed form should be a stream");
        let content =
            Content::decode(&form_stream.content).expect("processed form content should decode");
        let draw_count = content
            .operations
            .iter()
            .filter(|operation| operation.operator == "Do")
            .count();
        assert_eq!(draw_count, 9);

        let center_transform = content
            .operations
            .iter()
            .rev()
            .find(|operation| operation.operator == "cm")
            .expect("mirror fallback should include a center transform");
        let values = center_transform
            .operands
            .iter()
            .map(object_to_f64)
            .collect::<Vec<_>>();
        assert_matrix_present(
            &[values
                .try_into()
                .expect("center transform should have 6 values")],
            [1.0, 0.0, 0.0, 1.0, workflow.bleed, workflow.bleed],
        );
    }

    #[test]
    fn mirror_bleed_form_centers_cover_scaled_source_when_aspect_ratio_differs() {
        let mut document = Document::with_version("1.5");
        let source_form_id = build_test_source_form(&mut document, 50.0, 50.0);

        let processed_form = build_mirror_bleed_form(
            &mut document,
            source_form_id,
            50.0,
            50.0,
            2.4,
            2.0,
            100.0,
            120.0,
        )
        .expect("mirror bleed form should be built");

        assert!((processed_form.width - 104.0).abs() < 0.0001);
        assert!((processed_form.height - 124.0).abs() < 0.0001);
        let trim_box = processed_form.trim_box.expect("trim box should be set");
        assert!((trim_box.x0 - 2.0).abs() < 0.0001);
        assert!((trim_box.y0 - 2.0).abs() < 0.0001);
        assert!((trim_box.x1 - 102.0).abs() < 0.0001);
        assert!((trim_box.y1 - 122.0).abs() < 0.0001);

        let form_stream = document
            .get_object(processed_form.form_id)
            .expect("processed form should exist")
            .as_stream()
            .expect("processed form should be a stream");
        let content =
            Content::decode(&form_stream.content).expect("processed form content should decode");
        let matrices = content
            .operations
            .iter()
            .filter(|operation| operation.operator == "cm")
            .map(|operation| {
                let operands = &operation.operands;
                assert_eq!(operands.len(), 6);
                [
                    object_to_f64(&operands[0]),
                    object_to_f64(&operands[1]),
                    object_to_f64(&operands[2]),
                    object_to_f64(&operands[3]),
                    object_to_f64(&operands[4]),
                    object_to_f64(&operands[5]),
                ]
            })
            .collect::<Vec<_>>();

        assert_matrix_present(&matrices, [2.4, 0.0, 0.0, 2.4, -8.0, 2.0]);
    }

    #[test]
    fn original_pdf_form_uses_trim_box_for_non_bleed_workflows() {
        let workflow = build_test_workflow(BleedType::NoBleed);
        let page_box_preferences = page_box_preferences(&workflow);
        let (source, page_id) = build_source_document(
            &[
                ("TrimBox", [20.0, 30.0, 220.0, 330.0]),
                ("BleedBox", [10.0, 15.0, 230.0, 345.0]),
            ],
            &[],
        );

        let mut document = Document::with_version("1.5");
        let source_form = build_original_pdf_page_form(
            &mut document,
            &source,
            page_id,
            &workflow,
            &page_box_preferences,
        )
        .expect("trim-box source form should be built");

        assert!((source_form.width - 200.0).abs() < 0.0001);
        assert!((source_form.height - 300.0).abs() < 0.0001);
        let trim_box = source_form
            .trim_box
            .as_ref()
            .expect("trim box should be captured");
        assert!((trim_box.x0 - 0.0).abs() < 0.0001);
        assert!((trim_box.y0 - 0.0).abs() < 0.0001);
        assert!((trim_box.x1 - 200.0).abs() < 0.0001);
        assert!((trim_box.y1 - 300.0).abs() < 0.0001);
        assert_clipped_source_form(
            &document,
            source_form.form_id,
            [0.0, 0.0, 200.0, 300.0],
            [-20.0, -30.0],
            [0.0, 0.0, 300.0, 400.0],
            [1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
        );
    }

    #[test]
    fn original_pdf_form_uses_bleed_box_when_bleed_is_included() {
        let workflow = build_test_workflow(BleedType::BleedIncluded);
        let page_box_preferences = page_box_preferences(&workflow);
        let (source, page_id) = build_source_document(
            &[
                ("TrimBox", [20.0, 30.0, 220.0, 330.0]),
                ("BleedBox", [10.0, 15.0, 230.0, 345.0]),
            ],
            &[],
        );

        let mut document = Document::with_version("1.5");
        let source_form = build_original_pdf_page_form(
            &mut document,
            &source,
            page_id,
            &workflow,
            &page_box_preferences,
        )
        .expect("bleed-box source form should be built");

        assert!((source_form.width - 220.0).abs() < 0.0001);
        assert!((source_form.height - 330.0).abs() < 0.0001);
        let trim_box = source_form
            .trim_box
            .as_ref()
            .expect("trim box should be captured");
        assert!((trim_box.x0 - 10.0).abs() < 0.0001);
        assert!((trim_box.y0 - 15.0).abs() < 0.0001);
        assert!((trim_box.x1 - 210.0).abs() < 0.0001);
        assert!((trim_box.y1 - 315.0).abs() < 0.0001);
        assert_clipped_source_form(
            &document,
            source_form.form_id,
            [0.0, 0.0, 220.0, 330.0],
            [-10.0, -15.0],
            [0.0, 0.0, 300.0, 400.0],
            [1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
        );
    }

    #[test]
    fn original_pdf_form_uses_bleed_box_outside_crop_box() {
        let workflow = build_test_workflow(BleedType::BleedIncluded);
        let page_box_preferences = page_box_preferences(&workflow);
        let (source, page_id) = build_source_document(
            &[
                ("CropBox", [20.0, 30.0, 220.0, 330.0]),
                ("TrimBox", [20.0, 30.0, 220.0, 330.0]),
                ("BleedBox", [10.0, 15.0, 230.0, 345.0]),
            ],
            &[],
        );

        let mut document = Document::with_version("1.5");
        let source_form = build_original_pdf_page_form(
            &mut document,
            &source,
            page_id,
            &workflow,
            &page_box_preferences,
        )
        .expect("bleed-box source form should be built");

        assert!((source_form.width - 220.0).abs() < 0.0001);
        assert!((source_form.height - 330.0).abs() < 0.0001);
        let trim_box = source_form
            .trim_box
            .as_ref()
            .expect("trim box should be captured");
        assert!((trim_box.x0 - 10.0).abs() < 0.0001);
        assert!((trim_box.y0 - 15.0).abs() < 0.0001);
        assert!((trim_box.x1 - 210.0).abs() < 0.0001);
        assert!((trim_box.y1 - 315.0).abs() < 0.0001);
        assert_clipped_source_form(
            &document,
            source_form.form_id,
            [0.0, 0.0, 220.0, 330.0],
            [-10.0, -15.0],
            [0.0, 0.0, 300.0, 400.0],
            [1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
        );
    }

    #[test]
    fn original_pdf_form_infers_requested_bleed_when_bleed_box_is_missing() {
        let workflow =
            build_test_workflow_with_dimensions(BleedType::BleedIncluded, 2.0, 148.0, 210.0);
        let page_box_preferences = page_box_preferences(&workflow);
        let bleed = mm_to_points(2.0);
        let trim_width = mm_to_points(148.0);
        let trim_height = mm_to_points(210.0);
        let (source, page_id) = build_source_document(
            &[
                (
                    "CropBox",
                    [
                        0.0,
                        0.0,
                        trim_width + 2.0 * bleed,
                        trim_height + 2.0 * bleed,
                    ],
                ),
                (
                    "TrimBox",
                    [bleed, bleed, bleed + trim_width, bleed + trim_height],
                ),
            ],
            &[],
        );

        let mut document = Document::with_version("1.5");
        let source_form = build_original_pdf_page_form(
            &mut document,
            &source,
            page_id,
            &workflow,
            &page_box_preferences,
        )
        .expect("requested-bleed source form should be built");

        assert!((source_form.width - (trim_width + 2.0 * bleed)).abs() < 0.0001);
        assert!((source_form.height - (trim_height + 2.0 * bleed)).abs() < 0.0001);
        let trim_box = source_form
            .trim_box
            .as_ref()
            .expect("trim box should be captured");
        assert!((trim_box.x0 - bleed).abs() < 0.0001);
        assert!((trim_box.y0 - bleed).abs() < 0.0001);
        assert!((trim_box.x1 - (bleed + trim_width)).abs() < 0.0001);
        assert!((trim_box.y1 - (bleed + trim_height)).abs() < 0.0001);
        assert_clipped_source_form(
            &document,
            source_form.form_id,
            [
                0.0,
                0.0,
                trim_width + 2.0 * bleed,
                trim_height + 2.0 * bleed,
            ],
            [0.0, 0.0],
            [
                0.0,
                0.0,
                trim_width + 2.0 * bleed,
                trim_height + 2.0 * bleed,
            ],
            [1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
        );
    }

    #[test]
    fn original_pdf_form_infers_requested_bleed_outside_crop_box() {
        let workflow =
            build_test_workflow_with_dimensions(BleedType::BleedIncluded, 2.0, 148.0, 210.0);
        let page_box_preferences = page_box_preferences(&workflow);
        let bleed = mm_to_points(2.0);
        let trim_width = mm_to_points(148.0);
        let trim_height = mm_to_points(210.0);
        let (source, page_id) = build_source_document(
            &[
                (
                    "MediaBox",
                    [
                        0.0,
                        0.0,
                        trim_width + 2.0 * bleed,
                        trim_height + 2.0 * bleed,
                    ],
                ),
                (
                    "CropBox",
                    [bleed, bleed, bleed + trim_width, bleed + trim_height],
                ),
                (
                    "TrimBox",
                    [bleed, bleed, bleed + trim_width, bleed + trim_height],
                ),
            ],
            &[],
        );

        let mut document = Document::with_version("1.5");
        let source_form = build_original_pdf_page_form(
            &mut document,
            &source,
            page_id,
            &workflow,
            &page_box_preferences,
        )
        .expect("requested-bleed source form should be built");

        assert!((source_form.width - (trim_width + 2.0 * bleed)).abs() < 0.0001);
        assert!((source_form.height - (trim_height + 2.0 * bleed)).abs() < 0.0001);
        let trim_box = source_form
            .trim_box
            .as_ref()
            .expect("trim box should be captured");
        assert!((trim_box.x0 - bleed).abs() < 0.0001);
        assert!((trim_box.y0 - bleed).abs() < 0.0001);
        assert!((trim_box.x1 - (bleed + trim_width)).abs() < 0.0001);
        assert!((trim_box.y1 - (bleed + trim_height)).abs() < 0.0001);
        assert_clipped_source_form(
            &document,
            source_form.form_id,
            [
                0.0,
                0.0,
                trim_width + 2.0 * bleed,
                trim_height + 2.0 * bleed,
            ],
            [0.0, 0.0],
            [
                0.0,
                0.0,
                trim_width + 2.0 * bleed,
                trim_height + 2.0 * bleed,
            ],
            [1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
        );
    }

    #[test]
    fn original_pdf_form_keeps_crop_box_source_centered_without_trim_metadata() {
        let workflow = build_test_workflow(BleedType::BleedIncluded);
        let page_box_preferences = page_box_preferences(&workflow);
        let (source, page_id) = build_source_document(
            &[
                ("MediaBox", [0.0, 0.0, 240.0, 360.0]),
                ("CropBox", [20.0, 30.0, 220.0, 330.0]),
            ],
            &[],
        );

        let mut document = Document::with_version("1.5");
        let source_form = build_original_pdf_page_form(
            &mut document,
            &source,
            page_id,
            &workflow,
            &page_box_preferences,
        )
        .expect("crop-box source form should be built");

        assert!((source_form.width - 200.0).abs() < 0.0001);
        assert!((source_form.height - 300.0).abs() < 0.0001);
        assert!(source_form.trim_box.is_none());
        assert_clipped_source_form_with_inlined_raw_matrix(
            &document,
            source_form.form_id,
            [0.0, 0.0, 200.0, 300.0],
            [0.0, 0.0],
            [0.0, 0.0, 200.0, 300.0],
            [1.0, 0.0, 0.0, 1.0, -20.0, -30.0],
        );
    }

    #[test]
    fn original_pdf_form_inlines_shifted_page_origin_translation() {
        let workflow = build_test_workflow(BleedType::NoBleed);
        let page_box_preferences = page_box_preferences(&workflow);
        let page_bottom = 8.250_009;
        let page_width = 419.25;
        let page_top = 306.0;
        let page_height = page_top - page_bottom;
        let shifted_page_box = [0.0, page_bottom, page_width, page_top];
        let (source, page_id) = build_source_document(
            &[
                ("MediaBox", shifted_page_box),
                ("CropBox", shifted_page_box),
                ("TrimBox", shifted_page_box),
                ("BleedBox", shifted_page_box),
            ],
            &[],
        );

        let mut document = Document::with_version("1.5");
        let source_form = build_original_pdf_page_form(
            &mut document,
            &source,
            page_id,
            &workflow,
            &page_box_preferences,
        )
        .expect("shifted-origin source form should be built");

        assert!((source_form.width - page_width).abs() < 0.0001);
        assert!((source_form.height - page_height).abs() < 0.0001);
        let trim_box = source_form
            .trim_box
            .as_ref()
            .expect("trim box should be captured");
        assert!((trim_box.x0 - 0.0).abs() < 0.0001);
        assert!((trim_box.y0 - 0.0).abs() < 0.0001);
        assert!((trim_box.x1 - page_width).abs() < 0.0001);
        assert!((trim_box.y1 - page_height).abs() < 0.0001);
        assert_clipped_source_form_with_inlined_raw_matrix(
            &document,
            source_form.form_id,
            [0.0, 0.0, page_width, page_height],
            [0.0, 0.0],
            [0.0, 0.0, page_width, page_height],
            [1.0, 0.0, 0.0, 1.0, 0.0, -page_bottom],
        );
    }

    #[test]
    fn full_crop_box_without_trim_metadata_centers_source_independent_of_requested_bleed() {
        let actual_side_bleed = mm_to_points(5.0);

        for requested_bleed_mm in [5.0, 10.0] {
            let workflow = build_test_workflow_with_dimensions(
                BleedType::BleedIncluded,
                requested_bleed_mm,
                90.0,
                120.0,
            );
            let page_box_preferences = page_box_preferences(&workflow);
            let source_width = workflow.item_width + 2.0 * actual_side_bleed;
            let source_height = workflow.item_height + 2.0 * actual_side_bleed;
            let (source, page_id) = build_source_document(
                &[
                    ("MediaBox", [0.0, 0.0, source_width, source_height]),
                    ("CropBox", [0.0, 0.0, source_width, source_height]),
                ],
                &[],
            );
            let mut document = Document::with_version("1.5");
            let source_form = build_original_pdf_page_form(
                &mut document,
                &source,
                page_id,
                &workflow,
                &page_box_preferences,
            )
            .expect("full-crop source form should be built");

            assert!((source_form.width - source_width).abs() < 0.0001);
            assert!((source_form.height - source_height).abs() < 0.0001);
            assert!(source_form.trim_box.is_none());

            let pages_root_id = document.new_object_id();
            let positions = calculate_positions(&workflow);
            let sheet_page_id = build_sheet_page(
                &mut document,
                pages_root_id,
                &workflow,
                &positions,
                &[Some(0)],
                &[source_form],
                0.0,
                0.0,
                false,
            )
            .expect("sheet page should be built");
            let page = document
                .get_object(sheet_page_id)
                .expect("sheet page should exist")
                .as_dict()
                .expect("sheet page should be a dictionary");
            let content_id = page
                .get(b"Contents")
                .expect("sheet page should reference content")
                .as_reference()
                .expect("content should be a reference");
            let content_stream = document
                .get_object(content_id)
                .expect("content stream should exist")
                .as_stream()
                .expect("content should be a stream");
            let content =
                Content::decode(&content_stream.content).expect("page content should decode");
            let placement_matrix = content
                .operations
                .iter()
                .find(|operation| operation.operator == "cm")
                .expect("content should include a placement transform");

            assert_eq!(placement_matrix.operands.len(), 6);
            assert!(
                (object_to_f64(&placement_matrix.operands[4]) + actual_side_bleed).abs() < 0.0001
            );
            assert!(
                (object_to_f64(&placement_matrix.operands[5]) + actual_side_bleed).abs() < 0.0001
            );
        }
    }

    #[test]
    fn original_pdf_form_applies_page_rotation() {
        let workflow = build_test_workflow(BleedType::NoBleed);
        let page_box_preferences = page_box_preferences(&workflow);
        let (mut source, page_id) =
            build_source_document(&[("MediaBox", [0.0, 0.0, 100.0, 50.0])], &[]);
        if let Object::Dictionary(page_dictionary) = source
            .objects
            .get_mut(&page_id)
            .expect("source page should exist")
        {
            page_dictionary.set("Rotate", 90_i64);
        }

        let mut document = Document::with_version("1.5");
        let source_form = build_original_pdf_page_form(
            &mut document,
            &source,
            page_id,
            &workflow,
            &page_box_preferences,
        )
        .expect("rotated source form should be built");

        assert!((source_form.width - 50.0).abs() < 0.0001);
        assert!((source_form.height - 100.0).abs() < 0.0001);
        assert!(source_form.trim_box.is_none());
        assert_clipped_source_form(
            &document,
            source_form.form_id,
            [0.0, 0.0, 50.0, 100.0],
            [0.0, 0.0],
            [0.0, 0.0, 50.0, 100.0],
            [0.0, 1.0, -1.0, 0.0, 50.0, 0.0],
        );
    }

    #[test]
    fn original_pdf_form_rotates_inherited_crop_box_trim_for_outer_edge_bleed() {
        let workflow = build_test_workflow(BleedType::BleedIncluded);
        let page_box_preferences = page_box_preferences(&workflow);
        let (mut source, page_id) = build_source_document(
            &[
                ("MediaBox", [0.0, 0.0, 240.0, 360.0]),
                ("CropBox", [20.0, 30.0, 220.0, 330.0]),
                ("TrimBox", [20.0, 30.0, 220.0, 330.0]),
            ],
            &[],
        );
        let parent_id = {
            let page = source
                .get_object(page_id)
                .expect("source page should exist")
                .as_dict()
                .expect("source page should be a dictionary");
            page.get(b"Parent")
                .expect("source page should reference a parent")
                .as_reference()
                .expect("source page parent should be a reference")
        };
        if let Some(Object::Dictionary(parent_dictionary)) = source.objects.get_mut(&parent_id) {
            parent_dictionary.set("Rotate", 90_i64);
        }

        let mut document = Document::with_version("1.5");
        let source_form = build_original_pdf_page_form(
            &mut document,
            &source,
            page_id,
            &workflow,
            &page_box_preferences,
        )
        .expect("rotated crop-box-as-trim source form should be built");

        assert!((source_form.width - 360.0).abs() < 0.0001);
        assert!((source_form.height - 240.0).abs() < 0.0001);
        let trim_box = source_form
            .trim_box
            .as_ref()
            .expect("rotated crop box should be used as trim box");
        assert!((trim_box.x0 - 30.0).abs() < 0.0001);
        assert!((trim_box.y0 - 20.0).abs() < 0.0001);
        assert!((trim_box.x1 - 330.0).abs() < 0.0001);
        assert!((trim_box.y1 - 220.0).abs() < 0.0001);
        assert_clipped_source_form(
            &document,
            source_form.form_id,
            [0.0, 0.0, 360.0, 240.0],
            [0.0, 0.0],
            [0.0, 0.0, 360.0, 240.0],
            [0.0, 1.0, -1.0, 0.0, 360.0, 0.0],
        );
    }

    #[test]
    fn build_pdf_source_forms_recomputes_fit_output_box_scaling_per_page() {
        let mut workflow =
            build_test_workflow_with_dimensions(BleedType::NoBleed, 0.0, 100.0, 50.0);
        workflow.source_sizing = SourceSizing::FitOutputBox;
        let source_pdf = build_multi_page_pdf(&[(100.0, 50.0), (50.0, 25.0)]);
        let mut document = Document::with_version("1.5");

        let source_forms = build_pdf_source_forms(&mut document, &mut workflow, &source_pdf)
            .expect("multi-page source forms should be built");

        assert_eq!(source_forms.len(), 2);
        assert!((source_forms[0].width - workflow.item_width).abs() < 0.0001);
        assert!((source_forms[0].height - workflow.item_height).abs() < 0.0001);
        assert!((source_forms[1].width - workflow.item_width).abs() < 0.0001);
        assert!((source_forms[1].height - workflow.item_height).abs() < 0.0001);
    }

    #[test]
    fn resolve_desired_trim_origin_mirrors_back_side_for_long_edge_duplex() {
        let mut workflow = build_test_workflow(BleedType::NoBleed);
        workflow.num_items_horizontal = 2;
        workflow.num_items_vertical = 1;
        workflow.spacing_horizontal = vec![0.0];
        workflow.duplex_mode = Some("DUPLEX_LONG_EDGE".to_string());
        workflow.front_back_alignment = true;

        let positions = calculate_positions(&workflow);
        let (_, _, x_offset, y_offset) = calculate_offsets(&workflow);
        let first_slot = positions.first().expect("positions should contain a slot");

        let (front_x, front_y) =
            resolve_desired_trim_origin(&workflow, first_slot, x_offset, y_offset, false);
        let (back_x, back_y) =
            resolve_desired_trim_origin(&workflow, first_slot, x_offset, y_offset, true);

        assert!((front_x - x_offset).abs() < 0.0001);
        assert!((front_y - y_offset).abs() < 0.0001);
        assert!((back_x - (x_offset + workflow.item_width)).abs() < 0.0001);
        assert!((back_y - y_offset).abs() < 0.0001);
    }

    #[test]
    fn build_placement_transform_rotates_back_side_content_around_crop_center() {
        let mut workflow = build_test_workflow(BleedType::NoBleed);
        workflow.back_page_rotation = Some("ROTATION_180".to_string());
        let crop_box = CropBox {
            x0: 0.0,
            y0: 0.0,
            x1: 100.0,
            y1: 50.0,
        };

        let transform = build_placement_transform(&workflow, &crop_box, 10.0, 20.0, true);

        assert!((transform.a + 1.0).abs() < 0.0001);
        assert!(transform.b.abs() < 0.0001);
        assert!(transform.c.abs() < 0.0001);
        assert!((transform.d + 1.0).abs() < 0.0001);
        assert!((transform.e - 110.0).abs() < 0.0001);
        assert!((transform.f - 70.0).abs() < 0.0001);
    }

    #[test]
    fn build_placement_transform_mirrors_back_side_content_horizontally() {
        let mut workflow = build_test_workflow(BleedType::NoBleed);
        workflow.mirror_back = true;
        let crop_box = CropBox {
            x0: 0.0,
            y0: 0.0,
            x1: 100.0,
            y1: 50.0,
        };

        let transform = build_placement_transform(&workflow, &crop_box, 10.0, 20.0, true);

        assert!((transform.a + 1.0).abs() < 0.0001);
        assert!(transform.b.abs() < 0.0001);
        assert!(transform.c.abs() < 0.0001);
        assert!((transform.d - 1.0).abs() < 0.0001);
        assert!((transform.e - 110.0).abs() < 0.0001);
        assert!((transform.f - 20.0).abs() < 0.0001);
    }

    #[test]
    fn build_sheet_page_uses_source_trim_box_for_asymmetric_bleed_boxes() {
        let workflow = build_test_workflow(BleedType::BleedIncluded);
        let trim_x0 = workflow.bleed + 4.0;
        let trim_y0 = workflow.bleed + 6.0;
        let source_width = workflow.item_width + 2.0 * workflow.bleed + 8.0;
        let source_height = workflow.item_height + 2.0 * workflow.bleed + 12.0;
        let mut document = Document::with_version("1.5");
        let pages_root_id = document.new_object_id();
        let source_form_id = build_test_source_form(&mut document, source_width, source_height);
        let positions = vec![crate::imposition::layout::PositionSlot {
            index: 0,
            x: 0.0,
            y: 0.0,
            col: 0,
            row: 0,
        }];
        let arrangement = vec![Some(0)];
        let source_forms = vec![SourceFormRef {
            form_id: source_form_id,
            width: source_width,
            height: source_height,
            trim_box: Some(CropBox {
                x0: trim_x0,
                y0: trim_y0,
                x1: trim_x0 + workflow.item_width,
                y1: trim_y0 + workflow.item_height,
            }),
        }];

        let page_id = build_sheet_page(
            &mut document,
            pages_root_id,
            &workflow,
            &positions,
            &arrangement,
            &source_forms,
            0.0,
            0.0,
            false,
        )
        .expect("sheet page should be built");

        let page = document
            .get_object(page_id)
            .expect("page should exist")
            .as_dict()
            .expect("page should be a dictionary");
        let content_id = page
            .get(b"Contents")
            .expect("page should reference content")
            .as_reference()
            .expect("content should be a reference");
        let content_stream = document
            .get_object(content_id)
            .expect("content stream should exist")
            .as_stream()
            .expect("content should be a stream");
        let content = Content::decode(&content_stream.content).expect("page content should decode");
        let placement_matrix = content
            .operations
            .iter()
            .find(|operation| operation.operator == "cm")
            .expect("content should include a placement transform");

        assert_eq!(placement_matrix.operands.len(), 6);
        assert!((object_to_f64(&placement_matrix.operands[4]) + trim_x0).abs() < 0.0001);
        assert!((object_to_f64(&placement_matrix.operands[5]) + trim_y0).abs() < 0.0001);
    }

    #[test]
    fn build_sheet_page_centers_preserved_source_trim_when_item_size_differs() {
        let workflow = build_test_workflow(BleedType::BleedIncluded);
        let extra_width = 10.0;
        let extra_height = 14.0;
        let source_width = workflow.item_width + 2.0 * workflow.bleed + extra_width;
        let source_height = workflow.item_height + 2.0 * workflow.bleed + extra_height;
        let mut document = Document::with_version("1.5");
        let pages_root_id = document.new_object_id();
        let source_form_id = build_test_source_form(&mut document, source_width, source_height);
        let positions = vec![crate::imposition::layout::PositionSlot {
            index: 0,
            x: 0.0,
            y: 0.0,
            col: 0,
            row: 0,
        }];
        let arrangement = vec![Some(0)];
        let source_forms = vec![SourceFormRef {
            form_id: source_form_id,
            width: source_width,
            height: source_height,
            trim_box: Some(CropBox {
                x0: workflow.bleed,
                y0: workflow.bleed,
                x1: workflow.bleed + workflow.item_width + extra_width,
                y1: workflow.bleed + workflow.item_height + extra_height,
            }),
        }];

        let page_id = build_sheet_page(
            &mut document,
            pages_root_id,
            &workflow,
            &positions,
            &arrangement,
            &source_forms,
            0.0,
            0.0,
            false,
        )
        .expect("sheet page should be built");

        let page = document
            .get_object(page_id)
            .expect("page should exist")
            .as_dict()
            .expect("page should be a dictionary");
        let content_id = page
            .get(b"Contents")
            .expect("page should reference content")
            .as_reference()
            .expect("content should be a reference");
        let content_stream = document
            .get_object(content_id)
            .expect("content stream should exist")
            .as_stream()
            .expect("content should be a stream");
        let content = Content::decode(&content_stream.content).expect("page content should decode");
        let placement_matrix = content
            .operations
            .iter()
            .find(|operation| operation.operator == "cm")
            .expect("content should include a placement transform");

        assert_eq!(placement_matrix.operands.len(), 6);
        assert!(
            (object_to_f64(&placement_matrix.operands[4]) + workflow.bleed + extra_width / 2.0)
                .abs()
                < 0.0001
        );
        assert!(
            (object_to_f64(&placement_matrix.operands[5]) + workflow.bleed + extra_height / 2.0)
                .abs()
                < 0.0001
        );
    }

    #[test]
    fn build_sheet_page_clips_centered_preserved_sources_between_touching_items() {
        let mut workflow = build_test_workflow(BleedType::BleedIncluded);
        workflow.num_items_horizontal = 2;
        workflow.spacing_horizontal = vec![0.0];
        let extra_width = 10.0;
        let source_width = workflow.item_width + 2.0 * workflow.bleed + extra_width;
        let source_height = workflow.item_height + 2.0 * workflow.bleed;
        let mut document = Document::with_version("1.5");
        let pages_root_id = document.new_object_id();
        let source_form_id = build_test_source_form(&mut document, source_width, source_height);
        let positions = calculate_positions(&workflow);
        let arrangement = vec![Some(0), Some(0)];
        let source_forms = vec![SourceFormRef {
            form_id: source_form_id,
            width: source_width,
            height: source_height,
            trim_box: Some(CropBox {
                x0: workflow.bleed,
                y0: workflow.bleed,
                x1: workflow.bleed + workflow.item_width + extra_width,
                y1: workflow.bleed + workflow.item_height,
            }),
        }];

        let page_id = build_sheet_page(
            &mut document,
            pages_root_id,
            &workflow,
            &positions,
            &arrangement,
            &source_forms,
            0.0,
            0.0,
            false,
        )
        .expect("sheet page should be built");

        let page = document
            .get_object(page_id)
            .expect("page should exist")
            .as_dict()
            .expect("page should be a dictionary");
        let content_id = page
            .get(b"Contents")
            .expect("page should reference content")
            .as_reference()
            .expect("content should be a reference");
        let content_stream = document
            .get_object(content_id)
            .expect("content stream should exist")
            .as_stream()
            .expect("content should be a stream");
        let content = Content::decode(&content_stream.content).expect("page content should decode");
        let clip_rects = content
            .operations
            .iter()
            .filter(|operation| operation.operator == "re")
            .map(|operation| {
                assert_eq!(operation.operands.len(), 4);
                [
                    object_to_f64(&operation.operands[0]),
                    object_to_f64(&operation.operands[1]),
                    object_to_f64(&operation.operands[2]),
                    object_to_f64(&operation.operands[3]),
                ]
            })
            .collect::<Vec<_>>();

        assert_eq!(clip_rects.len(), 2);
        assert!((clip_rects[0][0] + clip_rects[0][2] - workflow.item_width).abs() < 0.0001);
        assert!((clip_rects[1][0] - workflow.item_width).abs() < 0.0001);
    }

    #[test]
    fn original_pdf_form_uses_inherited_trim_box() {
        let workflow = build_test_workflow(BleedType::NoBleed);
        let page_box_preferences = page_box_preferences(&workflow);
        let (source, page_id) =
            build_source_document(&[], &[("TrimBox", [5.0, 6.0, 105.0, 206.0])]);

        let mut document = Document::with_version("1.5");
        let source_form = build_original_pdf_page_form(
            &mut document,
            &source,
            page_id,
            &workflow,
            &page_box_preferences,
        )
        .expect("inherited trim-box source form should be built");

        assert!((source_form.width - 100.0).abs() < 0.0001);
        assert!((source_form.height - 200.0).abs() < 0.0001);
        assert_clipped_source_form(
            &document,
            source_form.form_id,
            [0.0, 0.0, 100.0, 200.0],
            [-5.0, -6.0],
            [0.0, 0.0, 300.0, 400.0],
            [1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
        );
    }

    #[test]
    fn original_pdf_form_falls_back_to_media_box() {
        let workflow = build_test_workflow(BleedType::NoBleed);
        let page_box_preferences = page_box_preferences(&workflow);
        let (source, page_id) =
            build_source_document(&[("MediaBox", [50.0, 60.0, 250.0, 360.0])], &[]);

        let mut document = Document::with_version("1.5");
        let source_form = build_original_pdf_page_form(
            &mut document,
            &source,
            page_id,
            &workflow,
            &page_box_preferences,
        )
        .expect("media-box fallback source form should be built");

        assert!((source_form.width - 200.0).abs() < 0.0001);
        assert!((source_form.height - 300.0).abs() < 0.0001);
        assert_clipped_source_form_with_inlined_raw_matrix(
            &document,
            source_form.form_id,
            [0.0, 0.0, 200.0, 300.0],
            [0.0, 0.0],
            [0.0, 0.0, 200.0, 300.0],
            [1.0, 0.0, 0.0, 1.0, -50.0, -60.0],
        );
    }

    #[test]
    fn original_pdf_form_normalizes_reversed_box_coordinates() {
        let workflow = build_test_workflow(BleedType::NoBleed);
        let page_box_preferences = page_box_preferences(&workflow);
        let (source, page_id) =
            build_source_document(&[("TrimBox", [220.0, 330.0, 20.0, 30.0])], &[]);

        let mut document = Document::with_version("1.5");
        let source_form = build_original_pdf_page_form(
            &mut document,
            &source,
            page_id,
            &workflow,
            &page_box_preferences,
        )
        .expect("reversed trim-box source form should be normalized");

        assert!((source_form.width - 200.0).abs() < 0.0001);
        assert!((source_form.height - 300.0).abs() < 0.0001);
        assert_clipped_source_form(
            &document,
            source_form.form_id,
            [0.0, 0.0, 200.0, 300.0],
            [-20.0, -30.0],
            [0.0, 0.0, 300.0, 400.0],
            [1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
        );
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

    fn no_bleed_request_json() -> String {
        r#"{
            "customSheetSizeWidth": 210,
            "customSheetSizeHeight": 297,
            "customItemSizeWidth": 90,
            "customItemSizeHeight": 120,
            "numItemsHorizontal": 1,
            "numItemsVertical": 1,
            "spacingHorizontal": "",
            "spacingVertical": "",
            "bleed": 3,
            "bleedType": "NO_BLEED",
            "sourceSizing": "PRESERVE_ORIGINAL_SIZE",
            "cropMarks": false,
            "layout": "STEP_AND_REPEAT"
        }"#
        .to_string()
    }

    #[test]
    fn shifted_trim_box_with_offcenter_content_is_demoted() {
        let workflow = build_test_workflow(BleedType::NoBleed);
        let preferences = page_box_preferences(&workflow);
        // TrimBox correct size (200x300) but shifted toward the lower-left, while
        // the artwork sits up-and-right and spills past the trim on top/right.
        let (source, page_id) = build_content_source_document(
            &[("TrimBox", [10.0, 10.0, 210.0, 310.0])],
            [60.0, 60.0, 260.0, 360.0],
        );

        let geometry = resolve_source_page_geometry(&source, page_id, &workflow, &preferences)
            .expect("geometry should resolve");

        assert!(
            geometry.trim_box.is_none(),
            "demoted geometry should drop the suspicious trim box"
        );
        assert!((geometry.bounds.left - 0.0).abs() < 0.0001);
        assert!((geometry.bounds.bottom - 0.0).abs() < 0.0001);
        assert!((geometry.bounds.width - 300.0).abs() < 0.0001);
        assert!((geometry.bounds.height - 400.0).abs() < 0.0001);
    }

    #[test]
    fn centered_trim_box_with_centered_content_is_not_demoted() {
        let workflow = build_test_workflow(BleedType::NoBleed);
        let preferences = page_box_preferences(&workflow);
        let (source, page_id) = build_content_source_document(
            &[("TrimBox", [50.0, 50.0, 250.0, 350.0])],
            [60.0, 60.0, 240.0, 340.0],
        );

        let geometry = resolve_source_page_geometry(&source, page_id, &workflow, &preferences)
            .expect("geometry should resolve");

        assert!(
            geometry.trim_box.is_some(),
            "well-formed trim box should be preserved"
        );
        assert!((geometry.bounds.width - 200.0).abs() < 0.0001);
        assert!((geometry.bounds.height - 300.0).abs() < 0.0001);
    }

    #[test]
    fn select_source_page_box_skips_box_outside_media() {
        let workflow = build_test_workflow(BleedType::NoBleed);
        let preferences = page_box_preferences(&workflow);
        // TrimBox extends well beyond the MediaBox => structurally invalid.
        let (source, page_id) =
            build_source_document(&[("TrimBox", [0.0, 0.0, 500.0, 600.0])], &[]);
        let (_, media_bounds) = resolve_page_bounds(
            &source,
            page_id,
            &[PdfPageBox::MediaBox, PdfPageBox::CropBox],
        )
        .expect("media bounds should resolve");

        let (selected_box, bounds) =
            select_source_page_box(&source, page_id, &preferences, media_bounds)
                .expect("a valid box should be selected");

        assert!(matches!(selected_box, PdfPageBox::MediaBox));
        assert!((bounds.width - 300.0).abs() < 0.0001);
        assert!((bounds.height - 400.0).abs() < 0.0001);
    }

    #[test]
    fn box_misaligned_with_content_ignores_content_inside_box() {
        // Off-center content that still fits inside the box must not be flagged.
        let (source, page_id) = build_content_source_document(
            &[("TrimBox", [0.0, 0.0, 300.0, 400.0])],
            [200.0, 250.0, 280.0, 380.0],
        );
        let (_, trim_bounds) =
            resolve_page_bounds(&source, page_id, &[PdfPageBox::TrimBox]).expect("trim resolves");

        assert!(!box_misaligned_with_content(&source, page_id, &trim_bounds));
    }

    #[test]
    fn detect_source_box_mismatch_flags_shifted_trim_box() {
        let request_json = no_bleed_request_json();
        let (mut source, _page_id) = build_content_source_document(
            &[("TrimBox", [10.0, 10.0, 210.0, 310.0])],
            [60.0, 60.0, 260.0, 360.0],
        );
        let mut bytes = Vec::new();
        source
            .save_to(&mut bytes)
            .expect("synthetic source should serialize");

        let mismatch = detect_source_box_mismatch(&request_json, &bytes, "application/pdf")
            .expect("detection should succeed");
        assert!(mismatch);
    }

    #[test]
    fn detect_source_box_mismatch_ignores_well_formed_trim_box() {
        let request_json = no_bleed_request_json();
        let (mut source, _page_id) = build_content_source_document(
            &[("TrimBox", [50.0, 50.0, 250.0, 350.0])],
            [60.0, 60.0, 240.0, 340.0],
        );
        let mut bytes = Vec::new();
        source
            .save_to(&mut bytes)
            .expect("synthetic source should serialize");

        let mismatch = detect_source_box_mismatch(&request_json, &bytes, "application/pdf")
            .expect("detection should succeed");
        assert!(!mismatch);
    }

    #[test]
    fn detect_source_box_mismatch_returns_false_for_non_pdf() {
        let request_json = no_bleed_request_json();
        let mismatch = detect_source_box_mismatch(&request_json, b"not-a-pdf", "image/png")
            .expect("detection should succeed");
        assert!(!mismatch);
    }
}
