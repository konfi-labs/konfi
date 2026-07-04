use crate::preflight::pdf_utils::{
    PdfPageBox, ResolvedPageBounds, as_f64, page_ids, resolve_page_bounds,
};
use crate::sticker_imposition::models::StickerPlacement;
use base64::Engine as _;
use lopdf::content::{Content, Operation};
use lopdf::{Document, Object};
use serde::Serialize;

const MM_PER_POINT: f64 = 25.4 / 72.0;
const MAX_CANDIDATES_PER_PAGE: usize = 250;

#[derive(Debug, Clone, Copy, Default)]
struct Matrix {
    a: f64,
    b: f64,
    c: f64,
    d: f64,
    e: f64,
    f: f64,
}

impl Matrix {
    fn identity() -> Self {
        Self {
            a: 1.0,
            b: 0.0,
            c: 0.0,
            d: 1.0,
            e: 0.0,
            f: 0.0,
        }
    }

    fn multiply(self, other: Self) -> Self {
        Self {
            a: self.a * other.a + self.b * other.c,
            b: self.a * other.b + self.b * other.d,
            c: self.c * other.a + self.d * other.c,
            d: self.c * other.b + self.d * other.d,
            e: self.e * other.a + self.f * other.c + other.e,
            f: self.e * other.b + self.f * other.d + other.f,
        }
    }

    fn apply(self, point: PdfPoint) -> PdfPoint {
        PdfPoint {
            x: point.x * self.a + point.y * self.c + self.e,
            y: point.x * self.b + point.y * self.d + self.f,
        }
    }
}

#[derive(Debug, Clone, Copy)]
struct GraphicsState {
    ctm: Matrix,
    line_width: f64,
}

impl Default for GraphicsState {
    fn default() -> Self {
        Self {
            ctm: Matrix::identity(),
            line_width: 1.0,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfBoundsMm {
    pub height_mm: f64,
    pub width_mm: f64,
    pub x_mm: f64,
    pub y_mm: f64,
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct PdfPoint {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone)]
pub(crate) enum PdfPathCommand {
    MoveTo(PdfPoint),
    LineTo(PdfPoint),
    CurveTo(PdfPoint, PdfPoint, PdfPoint),
    ClosePath,
}

#[derive(Debug, Clone)]
pub(crate) struct PdfCutLinePath {
    pub commands: Vec<PdfPathCommand>,
    pub id: String,
    pub page_number: usize,
    pub source_height_pt: f64,
    pub source_width_pt: f64,
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct PdfCutLineSourceTransform {
    pub origin_x_pt: f64,
    pub origin_y_pt: f64,
    pub path_offset_x_pt: f64,
    pub path_offset_y_pt: f64,
    pub path_scale_x: f64,
    pub path_scale_y: f64,
    pub source_height_pt: f64,
    pub source_width_pt: f64,
    pub target_height_pt: f64,
    pub target_width_pt: f64,
}

impl PdfCutLineSourceTransform {
    pub(crate) fn from_bounds(bounds: ResolvedPageBounds) -> Self {
        Self {
            origin_x_pt: bounds.left,
            origin_y_pt: bounds.bottom,
            path_offset_x_pt: 0.0,
            path_offset_y_pt: 0.0,
            path_scale_x: 1.0,
            path_scale_y: 1.0,
            source_height_pt: bounds.height,
            source_width_pt: bounds.width,
            target_height_pt: bounds.height,
            target_width_pt: bounds.width,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfCutLineCandidate {
    pub bounds: PdfBoundsMm,
    pub id: String,
    pub page_number: usize,
    pub page_height_mm: f64,
    pub page_width_mm: f64,
    pub preview_path: String,
    pub operation_index: usize,
    pub suggested: bool,
    pub stroke_width_mm: Option<f64>,
}

#[derive(Debug, Clone)]
struct CollectedPath {
    bounds: PdfPathBounds,
    commands: Vec<PdfPathCommand>,
    id: String,
    operation_index: usize,
    page_number: usize,
    source_height_pt: f64,
    source_width_pt: f64,
    stroke_width_pt: Option<f64>,
}

#[derive(Debug, Clone, Copy)]
struct PdfPathBounds {
    max_x: f64,
    max_y: f64,
    min_x: f64,
    min_y: f64,
}

impl PdfPathBounds {
    fn from_point(point: PdfPoint) -> Self {
        Self {
            max_x: point.x,
            max_y: point.y,
            min_x: point.x,
            min_y: point.y,
        }
    }

    fn include(&mut self, point: PdfPoint) {
        self.max_x = self.max_x.max(point.x);
        self.max_y = self.max_y.max(point.y);
        self.min_x = self.min_x.min(point.x);
        self.min_y = self.min_y.min(point.y);
    }
}

pub fn inspect_pdf_cut_line_candidates_json(bytes: &[u8]) -> Result<String, String> {
    let candidates = inspect_pdf_cut_line_candidates(bytes)?;
    serde_json::to_string(&candidates)
        .map_err(|error| format!("Failed to serialize PDF cut-line candidates: {error}"))
}

pub(crate) fn inspect_pdf_cut_line_candidates(
    bytes: &[u8],
) -> Result<Vec<PdfCutLineCandidate>, String> {
    let document =
        Document::load_mem(bytes).map_err(|error| format!("Failed to parse PDF: {error}"))?;
    let mut candidates = Vec::new();

    for (page_index, page_id) in page_ids(&document).into_iter().enumerate() {
        let page_number = page_index + 1;
        let (_, page_bounds) = resolve_page_bounds(
            &document,
            page_id,
            &[
                PdfPageBox::TrimBox,
                PdfPageBox::BleedBox,
                PdfPageBox::CropBox,
                PdfPageBox::MediaBox,
                PdfPageBox::ArtBox,
            ],
        )?;
        let content_bytes = document
            .get_page_content(page_id)
            .map_err(|error| format!("Failed to read PDF page {page_number} content: {error}"))?;
        let content = Content::decode(&content_bytes)
            .map_err(|error| format!("Failed to decode PDF page {page_number}: {error}"))?;
        let paths = collect_page_paths(
            &content.operations,
            page_number,
            page_bounds.left,
            page_bounds.bottom,
            page_bounds.width,
            page_bounds.height,
        );

        candidates.extend(paths.into_iter().take(MAX_CANDIDATES_PER_PAGE).map(|path| {
            let width_pt = path.bounds.max_x - path.bounds.min_x;
            let height_pt = path.bounds.max_y - path.bounds.min_y;
            PdfCutLineCandidate {
                bounds: PdfBoundsMm {
                    height_mm: round_mm(height_pt * MM_PER_POINT),
                    width_mm: round_mm(width_pt * MM_PER_POINT),
                    x_mm: round_mm(path.bounds.min_x * MM_PER_POINT),
                    y_mm: round_mm((path.source_height_pt - path.bounds.max_y) * MM_PER_POINT),
                },
                id: path.id,
                operation_index: path.operation_index,
                page_height_mm: round_mm(path.source_height_pt * MM_PER_POINT),
                page_width_mm: round_mm(path.source_width_pt * MM_PER_POINT),
                page_number: path.page_number,
                preview_path: path_to_svg_data(&path.commands, path.source_height_pt),
                suggested: is_likely_cut_line(width_pt, height_pt, path.stroke_width_pt),
                stroke_width_mm: path
                    .stroke_width_pt
                    .map(|value| round_mm(value * MM_PER_POINT)),
            }
        }));
    }

    Ok(candidates)
}

pub(crate) fn selected_cut_line_paths_for_placement_with_transform(
    data_url: &str,
    placement: &StickerPlacement,
    transform: PdfCutLineSourceTransform,
) -> Result<Vec<PdfCutLinePath>, String> {
    if placement.selected_pdf_cut_line_ids.is_empty() {
        return Ok(Vec::new());
    }

    let bytes = decode_data_url_bytes(data_url)?;
    let document = Document::load_mem(&bytes)
        .map_err(|error| format!("Failed to parse cut-line source PDF: {error}"))?;
    let page_index = placement.page_number.saturating_sub(1);
    let page_ids = page_ids(&document);
    let Some(page_id) = page_ids.get(page_index).copied() else {
        return Err(format!(
            "Cut-line source page {} is out of range.",
            placement.page_number
        ));
    };
    let content_bytes = document
        .get_page_content(page_id)
        .map_err(|error| format!("Failed to read cut-line page content: {error}"))?;
    let content = Content::decode(&content_bytes)
        .map_err(|error| format!("Failed to decode cut-line page content: {error}"))?;
    let selected = placement
        .selected_pdf_cut_line_ids
        .iter()
        .map(String::as_str)
        .collect::<std::collections::HashSet<_>>();

    Ok(collect_page_paths(
        &content.operations,
        placement.page_number,
        transform.origin_x_pt,
        transform.origin_y_pt,
        transform.source_width_pt,
        transform.source_height_pt,
    )
    .into_iter()
    .filter(|path| selected.contains(path.id.as_str()))
    .map(|path| PdfCutLinePath {
        commands: transform_path_commands(&path.commands, transform),
        id: path.id,
        page_number: path.page_number,
        source_height_pt: transform.target_height_pt,
        source_width_pt: transform.target_width_pt,
    })
    .collect())
}

fn transform_path_commands(
    commands: &[PdfPathCommand],
    transform: PdfCutLineSourceTransform,
) -> Vec<PdfPathCommand> {
    commands
        .iter()
        .map(|command| match command {
            PdfPathCommand::MoveTo(point) => {
                PdfPathCommand::MoveTo(transform_cut_line_point(*point, transform))
            }
            PdfPathCommand::LineTo(point) => {
                PdfPathCommand::LineTo(transform_cut_line_point(*point, transform))
            }
            PdfPathCommand::CurveTo(point_1, point_2, point_3) => PdfPathCommand::CurveTo(
                transform_cut_line_point(*point_1, transform),
                transform_cut_line_point(*point_2, transform),
                transform_cut_line_point(*point_3, transform),
            ),
            PdfPathCommand::ClosePath => PdfPathCommand::ClosePath,
        })
        .collect()
}

fn transform_cut_line_point(point: PdfPoint, transform: PdfCutLineSourceTransform) -> PdfPoint {
    PdfPoint {
        x: point.x * transform.path_scale_x + transform.path_offset_x_pt,
        y: point.y * transform.path_scale_y + transform.path_offset_y_pt,
    }
}

pub(crate) fn remove_selected_cut_line_paths_from_content(
    content_bytes: Vec<u8>,
    page_number: usize,
    selected_ids: &[String],
) -> Result<Vec<u8>, String> {
    if selected_ids.is_empty() {
        return Ok(content_bytes);
    }

    let selected = selected_ids
        .iter()
        .map(String::as_str)
        .collect::<std::collections::HashSet<_>>();
    let content = Content::decode(&content_bytes)
        .map_err(|error| format!("Failed to decode source PDF content: {error}"))?;
    let mut output_operations = Vec::new();
    let mut pending_path_operations = Vec::new();

    for (operation_index, operation) in content.operations.into_iter().enumerate() {
        if is_path_construction_operator(&operation.operator) {
            pending_path_operations.push(operation);
            continue;
        }

        if is_path_paint_operator(&operation.operator) {
            let path_id = format!("p{page_number}-o{operation_index}");
            if selected.contains(path_id.as_str()) {
                pending_path_operations.clear();
                continue;
            }

            output_operations.append(&mut pending_path_operations);
            output_operations.push(operation);
            continue;
        }

        output_operations.append(&mut pending_path_operations);
        output_operations.push(operation);
    }

    output_operations.append(&mut pending_path_operations);

    Content {
        operations: output_operations,
    }
    .encode()
    .map_err(|error| format!("Failed to encode filtered PDF content: {error}"))
}

fn collect_page_paths(
    operations: &[Operation],
    page_number: usize,
    origin_x_pt: f64,
    origin_y_pt: f64,
    source_width_pt: f64,
    source_height_pt: f64,
) -> Vec<CollectedPath> {
    let mut graphics_state = GraphicsState::default();
    let mut graphics_stack = Vec::new();
    let mut paths = Vec::new();
    let mut current_path = Vec::new();
    let mut current_point: Option<PdfPoint> = None;
    let mut bounds: Option<PdfPathBounds> = None;

    for (operation_index, operation) in operations.iter().enumerate() {
        match operation.operator.as_str() {
            "q" => graphics_stack.push(graphics_state),
            "Q" => {
                if let Some(previous) = graphics_stack.pop() {
                    graphics_state = previous;
                }
            }
            "cm" => {
                if let Some(matrix) = matrix_from_operands(&operation.operands) {
                    graphics_state.ctm = graphics_state.ctm.multiply(matrix);
                }
            }
            "w" => {
                if let Some(value) = operation.operands.first().and_then(as_f64) {
                    graphics_state.line_width = value.max(0.0);
                }
            }
            "m" => {
                if let Some(point) = point_from_operands(
                    &operation.operands,
                    graphics_state.ctm,
                    origin_x_pt,
                    origin_y_pt,
                ) {
                    include_point(&mut bounds, point);
                    current_path.push(PdfPathCommand::MoveTo(point));
                    current_point = Some(point);
                }
            }
            "l" => {
                if let Some(point) = point_from_operands(
                    &operation.operands,
                    graphics_state.ctm,
                    origin_x_pt,
                    origin_y_pt,
                ) {
                    include_point(&mut bounds, point);
                    current_path.push(PdfPathCommand::LineTo(point));
                    current_point = Some(point);
                }
            }
            "c" => {
                if let Some((p1, p2, p3)) = curve_from_operands(
                    &operation.operands,
                    graphics_state.ctm,
                    origin_x_pt,
                    origin_y_pt,
                ) {
                    include_point(&mut bounds, p1);
                    include_point(&mut bounds, p2);
                    include_point(&mut bounds, p3);
                    current_path.push(PdfPathCommand::CurveTo(p1, p2, p3));
                    current_point = Some(p3);
                }
            }
            "v" => {
                if let Some(start) = current_point {
                    if let Some((p2, p3)) = two_point_curve_from_operands(
                        &operation.operands,
                        graphics_state.ctm,
                        origin_x_pt,
                        origin_y_pt,
                    ) {
                        include_point(&mut bounds, p2);
                        include_point(&mut bounds, p3);
                        current_path.push(PdfPathCommand::CurveTo(start, p2, p3));
                        current_point = Some(p3);
                    }
                }
            }
            "y" => {
                if let Some((p1, p3)) = two_point_curve_from_operands(
                    &operation.operands,
                    graphics_state.ctm,
                    origin_x_pt,
                    origin_y_pt,
                ) {
                    include_point(&mut bounds, p1);
                    include_point(&mut bounds, p3);
                    current_path.push(PdfPathCommand::CurveTo(p1, p3, p3));
                    current_point = Some(p3);
                }
            }
            "h" => current_path.push(PdfPathCommand::ClosePath),
            "re" => {
                append_rect_path(
                    &operation.operands,
                    graphics_state.ctm,
                    origin_x_pt,
                    origin_y_pt,
                    &mut current_path,
                    &mut current_point,
                    &mut bounds,
                );
            }
            "S" | "s" | "B" | "B*" | "b" | "b*" => {
                if operation.operator == "s"
                    || operation.operator == "b"
                    || operation.operator == "b*"
                {
                    current_path.push(PdfPathCommand::ClosePath);
                }
                if let Some(path_bounds) = bounds {
                    if is_usable_bounds(path_bounds) && !current_path.is_empty() {
                        paths.push(CollectedPath {
                            bounds: path_bounds,
                            commands: current_path.clone(),
                            id: format!("p{page_number}-o{operation_index}"),
                            operation_index,
                            page_number,
                            source_height_pt,
                            source_width_pt,
                            stroke_width_pt: Some(graphics_state.line_width),
                        });
                    }
                }
                current_path.clear();
                current_point = None;
                bounds = None;
            }
            "n" | "f" | "F" | "f*" => {
                current_path.clear();
                current_point = None;
                bounds = None;
            }
            _ => {}
        }
    }

    paths
}

fn is_path_construction_operator(operator: &str) -> bool {
    matches!(operator, "m" | "l" | "c" | "v" | "y" | "h" | "re")
}

fn is_path_paint_operator(operator: &str) -> bool {
    matches!(
        operator,
        "S" | "s" | "B" | "B*" | "b" | "b*" | "n" | "f" | "F" | "f*"
    )
}

fn point_from_operands(
    operands: &[Object],
    ctm: Matrix,
    origin_x_pt: f64,
    origin_y_pt: f64,
) -> Option<PdfPoint> {
    Some(normalize_point(
        ctm.apply(PdfPoint {
            x: as_f64(operands.first()?)?,
            y: as_f64(operands.get(1)?)?,
        }),
        origin_x_pt,
        origin_y_pt,
    ))
}

fn curve_from_operands(
    operands: &[Object],
    ctm: Matrix,
    origin_x_pt: f64,
    origin_y_pt: f64,
) -> Option<(PdfPoint, PdfPoint, PdfPoint)> {
    Some((
        normalize_point(
            ctm.apply(PdfPoint {
                x: as_f64(operands.first()?)?,
                y: as_f64(operands.get(1)?)?,
            }),
            origin_x_pt,
            origin_y_pt,
        ),
        normalize_point(
            ctm.apply(PdfPoint {
                x: as_f64(operands.get(2)?)?,
                y: as_f64(operands.get(3)?)?,
            }),
            origin_x_pt,
            origin_y_pt,
        ),
        normalize_point(
            ctm.apply(PdfPoint {
                x: as_f64(operands.get(4)?)?,
                y: as_f64(operands.get(5)?)?,
            }),
            origin_x_pt,
            origin_y_pt,
        ),
    ))
}

fn two_point_curve_from_operands(
    operands: &[Object],
    ctm: Matrix,
    origin_x_pt: f64,
    origin_y_pt: f64,
) -> Option<(PdfPoint, PdfPoint)> {
    Some((
        normalize_point(
            ctm.apply(PdfPoint {
                x: as_f64(operands.first()?)?,
                y: as_f64(operands.get(1)?)?,
            }),
            origin_x_pt,
            origin_y_pt,
        ),
        normalize_point(
            ctm.apply(PdfPoint {
                x: as_f64(operands.get(2)?)?,
                y: as_f64(operands.get(3)?)?,
            }),
            origin_x_pt,
            origin_y_pt,
        ),
    ))
}

fn append_rect_path(
    operands: &[Object],
    ctm: Matrix,
    origin_x_pt: f64,
    origin_y_pt: f64,
    current_path: &mut Vec<PdfPathCommand>,
    current_point: &mut Option<PdfPoint>,
    bounds: &mut Option<PdfPathBounds>,
) {
    let Some(x) = operands.first().and_then(as_f64) else {
        return;
    };
    let Some(y) = operands.get(1).and_then(as_f64) else {
        return;
    };
    let Some(width) = operands.get(2).and_then(as_f64) else {
        return;
    };
    let Some(height) = operands.get(3).and_then(as_f64) else {
        return;
    };
    let points = [
        normalize_point(ctm.apply(PdfPoint { x, y }), origin_x_pt, origin_y_pt),
        normalize_point(
            ctm.apply(PdfPoint { x: x + width, y }),
            origin_x_pt,
            origin_y_pt,
        ),
        normalize_point(
            ctm.apply(PdfPoint {
                x: x + width,
                y: y + height,
            }),
            origin_x_pt,
            origin_y_pt,
        ),
        normalize_point(
            ctm.apply(PdfPoint { x, y: y + height }),
            origin_x_pt,
            origin_y_pt,
        ),
    ];

    current_path.push(PdfPathCommand::MoveTo(points[0]));
    current_path.push(PdfPathCommand::LineTo(points[1]));
    current_path.push(PdfPathCommand::LineTo(points[2]));
    current_path.push(PdfPathCommand::LineTo(points[3]));
    current_path.push(PdfPathCommand::ClosePath);
    *current_point = Some(points[0]);

    for point in points {
        include_point(bounds, point);
    }
}

fn include_point(bounds: &mut Option<PdfPathBounds>, point: PdfPoint) {
    if let Some(existing_bounds) = bounds {
        existing_bounds.include(point);
    } else {
        *bounds = Some(PdfPathBounds::from_point(point));
    }
}

fn normalize_point(point: PdfPoint, origin_x_pt: f64, origin_y_pt: f64) -> PdfPoint {
    PdfPoint {
        x: point.x - origin_x_pt,
        y: point.y - origin_y_pt,
    }
}

fn path_to_svg_data(commands: &[PdfPathCommand], source_height_pt: f64) -> String {
    commands
        .iter()
        .map(|command| match command {
            PdfPathCommand::MoveTo(point) => {
                format!(
                    "M {} {}",
                    format_svg_number(point.x * MM_PER_POINT),
                    format_svg_number((source_height_pt - point.y) * MM_PER_POINT)
                )
            }
            PdfPathCommand::LineTo(point) => {
                format!(
                    "L {} {}",
                    format_svg_number(point.x * MM_PER_POINT),
                    format_svg_number((source_height_pt - point.y) * MM_PER_POINT)
                )
            }
            PdfPathCommand::CurveTo(point_1, point_2, point_3) => {
                format!(
                    "C {} {} {} {} {} {}",
                    format_svg_number(point_1.x * MM_PER_POINT),
                    format_svg_number((source_height_pt - point_1.y) * MM_PER_POINT),
                    format_svg_number(point_2.x * MM_PER_POINT),
                    format_svg_number((source_height_pt - point_2.y) * MM_PER_POINT),
                    format_svg_number(point_3.x * MM_PER_POINT),
                    format_svg_number((source_height_pt - point_3.y) * MM_PER_POINT),
                )
            }
            PdfPathCommand::ClosePath => "Z".to_string(),
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn format_svg_number(value: f64) -> String {
    let rounded = (value * 1000.0).round() / 1000.0;

    if rounded.abs() < 0.0005 {
        return "0".to_string();
    }

    if (rounded.fract()).abs() < 0.0005 {
        return format!("{}", rounded.trunc() as i64);
    }

    let mut formatted = format!("{rounded:.3}");

    while formatted.ends_with('0') {
        formatted.pop();
    }

    if formatted.ends_with('.') {
        formatted.pop();
    }

    formatted
}

fn matrix_from_operands(operands: &[Object]) -> Option<Matrix> {
    Some(Matrix {
        a: as_f64(operands.first()?)?,
        b: as_f64(operands.get(1)?)?,
        c: as_f64(operands.get(2)?)?,
        d: as_f64(operands.get(3)?)?,
        e: as_f64(operands.get(4)?)?,
        f: as_f64(operands.get(5)?)?,
    })
}

fn is_usable_bounds(bounds: PdfPathBounds) -> bool {
    let width = bounds.max_x - bounds.min_x;
    let height = bounds.max_y - bounds.min_y;
    width > 0.5 && height > 0.5
}

fn is_likely_cut_line(width_pt: f64, height_pt: f64, stroke_width_pt: Option<f64>) -> bool {
    let area_mm2 = width_pt * MM_PER_POINT * height_pt * MM_PER_POINT;
    let has_thin_stroke = stroke_width_pt.is_none_or(|width| width <= 1.5);

    has_thin_stroke && area_mm2 >= 25.0
}

fn decode_data_url_bytes(data_url: &str) -> Result<Vec<u8>, String> {
    let comma = data_url
        .find(',')
        .ok_or_else(|| "Invalid data URL: missing comma".to_string())?;
    base64::engine::general_purpose::STANDARD
        .decode(&data_url[comma + 1..])
        .map_err(|e| format!("Failed to decode PDF cut-line data URL base64: {e}"))
}

fn round_mm(value: f64) -> f64 {
    (value * 1000.0).round() / 1000.0
}
