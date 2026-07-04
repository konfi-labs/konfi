use crate::preflight::pdf_utils::{
    PdfPageBox, get_dict_from_object, inherited_page_dict, page_ids, resolve_page_bounds,
};
use lopdf::content::{Content, Operation};
use lopdf::{Dictionary, Document, Object, ObjectId, Stream, dictionary};
use serde::Deserialize;

fn validate_rgba_input(bytes: &[u8], width: u32, height: u32) -> Result<usize, String> {
    let pixel_count = (width as usize)
        .checked_mul(height as usize)
        .ok_or_else(|| "Spot color source dimensions are too large.".to_owned())?;
    let expected_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "Spot color source buffer is too large.".to_owned())?;

    if bytes.len() != expected_len {
        return Err(format!(
            "Spot color source buffer length mismatch: expected {expected_len} bytes, got {}.",
            bytes.len()
        ));
    }

    Ok(pixel_count)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SpotPdfExportRequest {
    height: u32,
    layers: Vec<SpotPdfExportLayer>,
    #[serde(default)]
    mask_mode: SpotMaskExportMode,
    page_height_pt: f64,
    page_width_pt: f64,
    title: String,
    width: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SpotPdfExportLayer {
    color: String,
    mask: Vec<u8>,
    mode: String,
    #[serde(default)]
    source_vector_mask: bool,
    spot_name: String,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
enum SpotMaskExportMode {
    #[default]
    Binary,
    Tint,
}

#[derive(Clone, Copy, Debug, Default)]
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

#[derive(Clone, Copy, Debug)]
struct GraphicsState {
    ctm: Matrix,
}

impl Default for GraphicsState {
    fn default() -> Self {
        Self {
            ctm: Matrix::identity(),
        }
    }
}

#[derive(Clone, Copy, Debug)]
struct PdfPoint {
    x: f64,
    y: f64,
}

#[derive(Clone, Copy, Debug)]
enum SpotVectorFillRule {
    EvenOdd,
    NonZero,
}

#[derive(Clone, Debug)]
enum SpotVectorPathCommand {
    MoveTo(PdfPoint),
    LineTo(PdfPoint),
    CurveTo(PdfPoint, PdfPoint, PdfPoint),
    ClosePath,
}

#[derive(Clone, Debug)]
struct SpotVectorPath {
    commands: Vec<SpotVectorPathCommand>,
    fill_rule: SpotVectorFillRule,
}

fn real(value: f64) -> Object {
    Object::Real(value as f32)
}

fn parse_hex_color(color: &str) -> [f64; 3] {
    let normalized = color.trim_start_matches('#');
    let expanded;
    let hex = if normalized.len() == 3 {
        expanded = normalized
            .chars()
            .flat_map(|character| [character, character])
            .collect::<String>();
        expanded.as_str()
    } else {
        normalized
    };
    let value = u32::from_str_radix(hex, 16).unwrap_or(0xffffff);

    [
        f64::from((value >> 16) & 255) / 255.0,
        f64::from((value >> 8) & 255) / 255.0,
        f64::from(value & 255) / 255.0,
    ]
}

fn create_one_bit_mask_bytes(mask: &[u8], width: u32, height: u32) -> Result<Vec<u8>, String> {
    let expected_len = validate_mask_input(mask, width, height)?;
    if expected_len == 0 {
        return Ok(Vec::new());
    }

    let row_stride = (width as usize).div_ceil(8);
    let mut output = vec![0_u8; row_stride * height as usize];

    for y in 0..height as usize {
        let input_row_offset = y * width as usize;
        let output_row_offset = y * row_stride;

        for x in 0..width as usize {
            if mask[input_row_offset + x] < 128 {
                continue;
            }

            output[output_row_offset + x / 8] |= 0x80 >> (x % 8);
        }
    }

    Ok(output)
}

fn create_tint_mask_bytes(mask: &[u8], width: u32, height: u32) -> Result<Vec<u8>, String> {
    validate_mask_input(mask, width, height)?;
    Ok(mask.to_vec())
}

fn escape_pdf_name(value: &str) -> Vec<u8> {
    value
        .bytes()
        .flat_map(|byte| {
            if byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-' {
                vec![byte]
            } else {
                format!("#{byte:02x}").into_bytes()
            }
        })
        .collect()
}

fn clone_source_page_as_form(
    document: &mut Document,
    source: &Document,
    page_id: ObjectId,
) -> Result<(ObjectId, f64, f64), String> {
    let (_, bounds) = resolve_page_bounds(
        source,
        page_id,
        &[PdfPageBox::CropBox, PdfPageBox::MediaBox],
    )?;
    let page_object = source
        .get_object(page_id)
        .map_err(|error| format!("Failed to read source page: {error}"))?;
    let page_dict = get_dict_from_object(source, page_object)
        .ok_or_else(|| "Source page is not a dictionary".to_string())?;
    let resources = inherited_page_dict(source, &page_dict, b"Resources").unwrap_or_default();
    let content_bytes = source
        .get_page_content(page_id)
        .map_err(|error| format!("Failed to read source page content: {error}"))?;

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

    Ok((
        document.add_object(Stream::new(form_dictionary, content_bytes)),
        bounds.width,
        bounds.height,
    ))
}

fn copy_source_output_intents(source: &Document) -> Option<Object> {
    let root = source.trailer.get(b"Root").ok()?;
    let catalog = source.get_dictionary(root.as_reference().ok()?).ok()?;
    catalog.get(b"OutputIntents").ok().cloned()
}

fn collect_source_vector_mask_paths(
    source: &Document,
    page_id: ObjectId,
) -> Result<Vec<SpotVectorPath>, String> {
    let (_, bounds) = resolve_page_bounds(
        source,
        page_id,
        &[PdfPageBox::CropBox, PdfPageBox::MediaBox],
    )?;
    let content_bytes = source
        .get_page_content(page_id)
        .map_err(|error| format!("Failed to read source PDF vector content: {error}"))?;
    let content = Content::decode(&content_bytes)
        .map_err(|error| format!("Failed to decode source PDF vector content: {error}"))?;

    Ok(collect_filled_vector_paths(
        &content.operations,
        bounds.left,
        bounds.bottom,
    ))
}

fn collect_filled_vector_paths(
    operations: &[Operation],
    origin_x_pt: f64,
    origin_y_pt: f64,
) -> Vec<SpotVectorPath> {
    let mut graphics_state = GraphicsState::default();
    let mut graphics_stack = Vec::new();
    let mut paths = Vec::new();
    let mut current_path = Vec::new();
    let mut current_point: Option<PdfPoint> = None;
    let mut bounds: Option<(PdfPoint, PdfPoint)> = None;

    for operation in operations {
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
            "m" => {
                if let Some(point) = point_from_operands(
                    &operation.operands,
                    graphics_state.ctm,
                    origin_x_pt,
                    origin_y_pt,
                ) {
                    include_vector_point(&mut bounds, point);
                    current_path.push(SpotVectorPathCommand::MoveTo(point));
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
                    include_vector_point(&mut bounds, point);
                    current_path.push(SpotVectorPathCommand::LineTo(point));
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
                    include_vector_point(&mut bounds, p1);
                    include_vector_point(&mut bounds, p2);
                    include_vector_point(&mut bounds, p3);
                    current_path.push(SpotVectorPathCommand::CurveTo(p1, p2, p3));
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
                        include_vector_point(&mut bounds, p2);
                        include_vector_point(&mut bounds, p3);
                        current_path.push(SpotVectorPathCommand::CurveTo(start, p2, p3));
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
                    include_vector_point(&mut bounds, p1);
                    include_vector_point(&mut bounds, p3);
                    current_path.push(SpotVectorPathCommand::CurveTo(p1, p3, p3));
                    current_point = Some(p3);
                }
            }
            "h" => current_path.push(SpotVectorPathCommand::ClosePath),
            "re" => append_rect_vector_path(
                &operation.operands,
                graphics_state.ctm,
                origin_x_pt,
                origin_y_pt,
                &mut current_path,
                &mut current_point,
                &mut bounds,
            ),
            "f" | "F" | "B" | "b" => {
                if operation.operator == "b" {
                    current_path.push(SpotVectorPathCommand::ClosePath);
                }
                push_current_vector_path(
                    &mut paths,
                    &current_path,
                    bounds,
                    SpotVectorFillRule::NonZero,
                );
                current_path.clear();
                current_point = None;
                bounds = None;
            }
            "f*" | "B*" | "b*" => {
                if operation.operator == "b*" {
                    current_path.push(SpotVectorPathCommand::ClosePath);
                }
                push_current_vector_path(
                    &mut paths,
                    &current_path,
                    bounds,
                    SpotVectorFillRule::EvenOdd,
                );
                current_path.clear();
                current_point = None;
                bounds = None;
            }
            "n" | "S" | "s" => {
                current_path.clear();
                current_point = None;
                bounds = None;
            }
            _ => {}
        }
    }

    paths
}

fn push_current_vector_path(
    paths: &mut Vec<SpotVectorPath>,
    current_path: &[SpotVectorPathCommand],
    bounds: Option<(PdfPoint, PdfPoint)>,
    fill_rule: SpotVectorFillRule,
) {
    if current_path.is_empty() {
        return;
    }

    let Some((min, max)) = bounds else {
        return;
    };

    if max.x - min.x <= 0.5 || max.y - min.y <= 0.5 {
        return;
    }

    paths.push(SpotVectorPath {
        commands: current_path.to_vec(),
        fill_rule,
    });
}

fn include_vector_point(bounds: &mut Option<(PdfPoint, PdfPoint)>, point: PdfPoint) {
    if let Some((min, max)) = bounds {
        min.x = min.x.min(point.x);
        min.y = min.y.min(point.y);
        max.x = max.x.max(point.x);
        max.y = max.y.max(point.y);
    } else {
        *bounds = Some((point, point));
    }
}

fn normalize_point(point: PdfPoint, origin_x_pt: f64, origin_y_pt: f64) -> PdfPoint {
    PdfPoint {
        x: point.x - origin_x_pt,
        y: point.y - origin_y_pt,
    }
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

fn append_rect_vector_path(
    operands: &[Object],
    ctm: Matrix,
    origin_x_pt: f64,
    origin_y_pt: f64,
    current_path: &mut Vec<SpotVectorPathCommand>,
    current_point: &mut Option<PdfPoint>,
    bounds: &mut Option<(PdfPoint, PdfPoint)>,
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

    current_path.push(SpotVectorPathCommand::MoveTo(points[0]));
    current_path.push(SpotVectorPathCommand::LineTo(points[1]));
    current_path.push(SpotVectorPathCommand::LineTo(points[2]));
    current_path.push(SpotVectorPathCommand::LineTo(points[3]));
    current_path.push(SpotVectorPathCommand::ClosePath);
    *current_point = Some(points[0]);

    for point in points {
        include_vector_point(bounds, point);
    }
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

fn as_f64(object: &Object) -> Option<f64> {
    match object {
        Object::Integer(value) => Some(*value as f64),
        Object::Real(value) => Some((*value).into()),
        _ => None,
    }
}

fn append_vector_mask_operations(
    operations: &mut Vec<Operation>,
    paths: &[SpotVectorPath],
    spot_color_space_name: &str,
) {
    operations.push(Operation::new(
        "cs",
        vec![Object::Name(spot_color_space_name.as_bytes().to_vec())],
    ));
    operations.push(Operation::new("scn", vec![real(1.0)]));

    for path in paths {
        for command in &path.commands {
            match command {
                SpotVectorPathCommand::MoveTo(point) => {
                    operations.push(Operation::new("m", vec![real(point.x), real(point.y)]));
                }
                SpotVectorPathCommand::LineTo(point) => {
                    operations.push(Operation::new("l", vec![real(point.x), real(point.y)]));
                }
                SpotVectorPathCommand::CurveTo(point_1, point_2, point_3) => {
                    operations.push(Operation::new(
                        "c",
                        vec![
                            real(point_1.x),
                            real(point_1.y),
                            real(point_2.x),
                            real(point_2.y),
                            real(point_3.x),
                            real(point_3.y),
                        ],
                    ));
                }
                SpotVectorPathCommand::ClosePath => {
                    operations.push(Operation::new("h", vec![]));
                }
            }
        }

        operations.push(Operation::new(
            match path.fill_rule {
                SpotVectorFillRule::EvenOdd => "f*",
                SpotVectorFillRule::NonZero => "f",
            },
            vec![],
        ));
    }
}

pub fn export_spot_pdf_for_pdf_source(
    source_pdf: &[u8],
    request_json: &str,
) -> Result<Vec<u8>, String> {
    let request: SpotPdfExportRequest = serde_json::from_str(request_json)
        .map_err(|error| format!("Invalid spot PDF export request: {error}"))?;
    let mut source = Document::load_mem(source_pdf)
        .map_err(|error| format!("Failed to parse source PDF: {error}"))?;
    let source_page_ids = page_ids(&source);
    if source_page_ids.is_empty() {
        return Err("Source PDF contains no pages.".to_owned());
    }

    let mut document = Document::with_version("1.5");
    source.renumber_objects_with(document.max_id + 1);
    let output_intents = copy_source_output_intents(&source);
    let page_id = page_ids(&source)[0];
    let source_max_id = source.max_id;
    for (object_id, object) in &source.objects {
        document.objects.insert(*object_id, object.clone());
    }
    document.max_id = document.max_id.max(source_max_id);

    let (source_form_id, source_width, source_height) =
        clone_source_page_as_form(&mut document, &source, page_id)?;
    let source_vector_mask_paths =
        collect_source_vector_mask_paths(&source, page_id).unwrap_or_default();
    let page_width = request.page_width_pt.max(source_width);
    let page_height = request.page_height_pt.max(source_height);
    let catalog_id = document.new_object_id();
    let pages_id = document.new_object_id();
    let page_id = document.new_object_id();

    let mut xobjects = Dictionary::new();
    xobjects.set("Src", Object::Reference(source_form_id));
    let mut color_spaces = Dictionary::new();
    let mut ext_gstates = Dictionary::new();
    ext_gstates.set(
        "SpotOverprint",
        dictionary! {
            "Type" => Object::Name(b"ExtGState".to_vec()),
            "OP" => true,
            "op" => true,
            "OPM" => 1_i64,
        },
    );

    let mut operations = Vec::new();

    for (index, layer) in request.layers.iter().enumerate() {
        validate_mask_input(&layer.mask, request.width, request.height)?;
        let [red, green, blue] = parse_hex_color(&layer.color);
        let spot_color_space_name = format!("SpotCS{}", index + 1);
        let spot_mask_name = format!("SpotMask{}", index + 1);
        let use_vector_mask = layer.source_vector_mask && !source_vector_mask_paths.is_empty();

        if !use_vector_mask {
            let (mask_dictionary, mask_bytes) = match request.mask_mode {
                SpotMaskExportMode::Binary => {
                    let mask_bytes =
                        create_one_bit_mask_bytes(&layer.mask, request.width, request.height)?;
                    (
                        dictionary! {
                            "Type" => Object::Name(b"XObject".to_vec()),
                            "Subtype" => Object::Name(b"Image".to_vec()),
                            "ImageMask" => true,
                            "Width" => request.width as i64,
                            "Height" => request.height as i64,
                            "BitsPerComponent" => 1_i64,
                            "Decode" => Object::Array(vec![1_i64.into(), 0_i64.into()]),
                            "Length" => mask_bytes.len() as i64,
                        },
                        mask_bytes,
                    )
                }
                SpotMaskExportMode::Tint => {
                    let mask_bytes =
                        create_tint_mask_bytes(&layer.mask, request.width, request.height)?;
                    (
                        dictionary! {
                            "Type" => Object::Name(b"XObject".to_vec()),
                            "Subtype" => Object::Name(b"Image".to_vec()),
                            "ColorSpace" => Object::Name(spot_color_space_name.clone().into_bytes()),
                            "Width" => request.width as i64,
                            "Height" => request.height as i64,
                            "BitsPerComponent" => 8_i64,
                            "Decode" => Object::Array(vec![0_i64.into(), 1_i64.into()]),
                            "Length" => mask_bytes.len() as i64,
                        },
                        mask_bytes,
                    )
                }
            };
            let mask_id = document.add_object(Stream::new(mask_dictionary, mask_bytes));
            xobjects.set(spot_mask_name.as_bytes(), Object::Reference(mask_id));
        }
        color_spaces.set(
            spot_color_space_name.as_bytes(),
            Object::Array(vec![
                Object::Name(b"Separation".to_vec()),
                Object::Name(escape_pdf_name(&layer.spot_name)),
                Object::Name(b"DeviceRGB".to_vec()),
                dictionary! {
                    "FunctionType" => 2_i64,
                    "Domain" => Object::Array(vec![0_i64.into(), 1_i64.into()]),
                    "Range" => Object::Array(vec![
                        0_i64.into(),
                        1_i64.into(),
                        0_i64.into(),
                        1_i64.into(),
                        0_i64.into(),
                        1_i64.into(),
                    ]),
                    "C0" => Object::Array(vec![1_i64.into(), 1_i64.into(), 1_i64.into()]),
                    "C1" => Object::Array(vec![real(red), real(green), real(blue)]),
                    "N" => 1_i64,
                }
                .into(),
            ]),
        );

        operations.push(Operation::new("q", vec![]));
        if layer.mode == "overprint" {
            operations.push(Operation::new(
                "gs",
                vec![Object::Name(b"SpotOverprint".to_vec())],
            ));
        }
        if use_vector_mask {
            append_vector_mask_operations(
                &mut operations,
                &source_vector_mask_paths,
                &spot_color_space_name,
            );
        } else {
            operations.push(Operation::new(
                "cm",
                vec![
                    real(page_width),
                    real(0.0),
                    real(0.0),
                    real(page_height),
                    real(0.0),
                    real(0.0),
                ],
            ));
            if request.mask_mode == SpotMaskExportMode::Binary {
                operations.push(Operation::new(
                    "cs",
                    vec![Object::Name(spot_color_space_name.into_bytes())],
                ));
                operations.push(Operation::new("scn", vec![real(1.0)]));
            }
            operations.push(Operation::new(
                "Do",
                vec![Object::Name(spot_mask_name.into_bytes())],
            ));
        }
        operations.push(Operation::new("Q", vec![]));
    }
    operations.push(Operation::new("q", vec![]));
    operations.push(Operation::new("Do", vec![Object::Name(b"Src".to_vec())]));
    operations.push(Operation::new("Q", vec![]));

    let mut resources = Dictionary::new();
    resources.set("XObject", xobjects);
    resources.set("ColorSpace", color_spaces);
    resources.set("ExtGState", ext_gstates);
    let content = Content { operations };
    let content_bytes = content
        .encode()
        .map_err(|error| format!("Failed to encode spot PDF content: {error}"))?;
    let content_id = document.add_object(Stream::new(Dictionary::new(), content_bytes));

    document.objects.insert(
        page_id,
        dictionary! {
            "Type" => Object::Name(b"Page".to_vec()),
            "Parent" => Object::Reference(pages_id),
            "MediaBox" => Object::Array(vec![
                real(0.0),
                real(0.0),
                real(page_width),
                real(page_height),
            ]),
            "Resources" => resources,
            "Contents" => Object::Reference(content_id),
        }
        .into(),
    );
    document.objects.insert(
        pages_id,
        dictionary! {
            "Type" => Object::Name(b"Pages".to_vec()),
            "Kids" => Object::Array(vec![Object::Reference(page_id)]),
            "Count" => 1_i64,
        }
        .into(),
    );
    let mut catalog = dictionary! {
        "Type" => Object::Name(b"Catalog".to_vec()),
        "Pages" => Object::Reference(pages_id),
    };
    if let Some(output_intents) = output_intents {
        catalog.set("OutputIntents", output_intents);
    }
    document.objects.insert(catalog_id, catalog.into());
    document.trailer.set("Root", Object::Reference(catalog_id));
    document.trailer.set(
        "Info",
        dictionary! {
            "Title" => Object::string_literal(request.title),
            "Producer" => Object::string_literal("Konfi Spot Color Export"),
        },
    );
    document.compress();

    let mut bytes = Vec::new();
    document
        .save_to(&mut bytes)
        .map_err(|error| format!("Failed to serialize spot PDF: {error}"))?;
    Ok(bytes)
}

fn validate_mask_input(mask: &[u8], width: u32, height: u32) -> Result<usize, String> {
    let pixel_count = (width as usize)
        .checked_mul(height as usize)
        .ok_or_else(|| "Spot color mask dimensions are too large.".to_owned())?;

    if mask.len() != pixel_count {
        return Err(format!(
            "Spot color mask length mismatch: expected {pixel_count} bytes, got {}.",
            mask.len()
        ));
    }

    Ok(pixel_count)
}

fn rgba_luma(red: u8, green: u8, blue: u8) -> u8 {
    let value = (u32::from(red) * 299 + u32::from(green) * 587 + u32::from(blue) * 114) / 1000;
    value as u8
}

pub fn generate_white_underbase_mask_rgba(
    bytes: &[u8],
    width: u32,
    height: u32,
    alpha_threshold: u8,
    luma_threshold: u8,
) -> Result<Vec<u8>, String> {
    let pixel_count = validate_rgba_input(bytes, width, height)?;
    let mut mask = Vec::with_capacity(pixel_count);

    for pixel in bytes.chunks_exact(4) {
        let alpha = pixel[3];
        let luma = rgba_luma(pixel[0], pixel[1], pixel[2]);
        let should_include = alpha >= alpha_threshold && luma >= luma_threshold;
        mask.push(if should_include { alpha } else { 0 });
    }

    Ok(mask)
}

pub fn generate_halftone_mask_rgba(
    bytes: &[u8],
    width: u32,
    height: u32,
    alpha_threshold: u8,
    cell_size_px: u32,
    dot_percent: u8,
    full_graphic: bool,
) -> Result<Vec<u8>, String> {
    let pixel_count = validate_rgba_input(bytes, width, height)?;
    let cell_size = cell_size_px.clamp(2, 96);
    let dot_fraction = f64::from(dot_percent.clamp(1, 100)) / 100.0;
    let radius = (f64::from(cell_size) * dot_fraction.sqrt()) / 2.0;
    let radius_sq = radius * radius;
    let mut mask = vec![0; pixel_count];

    for y in 0..height {
        let cell_y = y % cell_size;
        let center_y = f64::from(cell_size) / 2.0 - 0.5;
        let dy = f64::from(cell_y) - center_y;

        for x in 0..width {
            let pixel_index = y as usize * width as usize + x as usize;
            let rgba_index = pixel_index * 4;
            let alpha = bytes[rgba_index + 3];

            if alpha < alpha_threshold {
                continue;
            }

            if !full_graphic && alpha == u8::MAX {
                continue;
            }

            let cell_x = x % cell_size;
            let center_x = f64::from(cell_size) / 2.0 - 0.5;
            let dx = f64::from(cell_x) - center_x;

            if dx * dx + dy * dy <= radius_sq {
                mask[pixel_index] = alpha;
            }
        }
    }

    Ok(mask)
}

pub fn apply_spot_brush(
    mask: &[u8],
    artwork_mask: &[u8],
    width: u32,
    height: u32,
    center_x: i32,
    center_y: i32,
    radius_px: u32,
    value: u8,
) -> Result<Vec<u8>, String> {
    let pixel_count = validate_mask_input(mask, width, height)?;

    if artwork_mask.len() != pixel_count {
        return Err(format!(
            "Artwork constraint mask length mismatch: expected {pixel_count} bytes, got {}.",
            artwork_mask.len()
        ));
    }

    if radius_px == 0 {
        return Ok(mask.to_vec());
    }

    let mut next_mask = mask.to_vec();
    let radius =
        i32::try_from(radius_px).map_err(|_| "Spot color brush radius is too large.".to_owned())?;
    let radius_sq = radius * radius;
    let min_x = (center_x - radius).max(0);
    let max_x = (center_x + radius).min(width.saturating_sub(1) as i32);
    let min_y = (center_y - radius).max(0);
    let max_y = (center_y + radius).min(height.saturating_sub(1) as i32);

    for y in min_y..=max_y {
        for x in min_x..=max_x {
            let dx = x - center_x;
            let dy = y - center_y;

            if dx * dx + dy * dy > radius_sq {
                continue;
            }

            let index = y as usize * width as usize + x as usize;
            if artwork_mask[index] == 0 {
                continue;
            }

            next_mask[index] = value;
        }
    }

    Ok(next_mask)
}

#[cfg(test)]
mod tests {
    use super::{
        apply_spot_brush, create_one_bit_mask_bytes, create_tint_mask_bytes,
        export_spot_pdf_for_pdf_source, generate_halftone_mask_rgba,
        generate_white_underbase_mask_rgba,
    };
    use lopdf::content::{Content, Operation};
    use lopdf::{Document, Object, Stream, dictionary};

    fn build_source_pdf() -> Vec<u8> {
        let mut document = Document::with_version("1.4");
        let catalog_id = document.new_object_id();
        let pages_id = document.new_object_id();
        let page_id = document.new_object_id();
        let content = Content {
            operations: vec![Operation::new("q", vec![]), Operation::new("Q", vec![])],
        };
        let content_bytes = content.encode().unwrap();
        let content_id = document.add_object(Stream::new(dictionary! {}, content_bytes));

        document.objects.insert(
            page_id,
            dictionary! {
                "Type" => Object::Name(b"Page".to_vec()),
                "Parent" => Object::Reference(pages_id),
                "MediaBox" => Object::Array(vec![0_i64.into(), 0_i64.into(), 72_i64.into(), 72_i64.into()]),
                "Resources" => dictionary! {},
                "Contents" => Object::Reference(content_id),
            }
            .into(),
        );
        document.objects.insert(
            pages_id,
            dictionary! {
                "Type" => Object::Name(b"Pages".to_vec()),
                "Kids" => Object::Array(vec![Object::Reference(page_id)]),
                "Count" => 1_i64,
            }
            .into(),
        );
        document.objects.insert(
            catalog_id,
            dictionary! {
                "Type" => Object::Name(b"Catalog".to_vec()),
                "Pages" => Object::Reference(pages_id),
            }
            .into(),
        );
        document.trailer.set("Root", Object::Reference(catalog_id));

        let mut bytes = Vec::new();
        document.save_to(&mut bytes).unwrap();
        bytes
    }

    fn build_vector_source_pdf() -> Vec<u8> {
        let mut document = Document::with_version("1.4");
        let catalog_id = document.new_object_id();
        let pages_id = document.new_object_id();
        let page_id = document.new_object_id();
        let content = Content {
            operations: vec![
                Operation::new(
                    "re",
                    vec![
                        Object::Integer(10),
                        Object::Integer(10),
                        Object::Integer(30),
                        Object::Integer(30),
                    ],
                ),
                Operation::new("f", vec![]),
            ],
        };
        let content_bytes = content.encode().unwrap();
        let content_id = document.add_object(Stream::new(dictionary! {}, content_bytes));

        document.objects.insert(
            page_id,
            dictionary! {
                "Type" => Object::Name(b"Page".to_vec()),
                "Parent" => Object::Reference(pages_id),
                "MediaBox" => Object::Array(vec![0_i64.into(), 0_i64.into(), 72_i64.into(), 72_i64.into()]),
                "Resources" => dictionary! {},
                "Contents" => Object::Reference(content_id),
            }
            .into(),
        );
        document.objects.insert(
            pages_id,
            dictionary! {
                "Type" => Object::Name(b"Pages".to_vec()),
                "Kids" => Object::Array(vec![Object::Reference(page_id)]),
                "Count" => 1_i64,
            }
            .into(),
        );
        document.objects.insert(
            catalog_id,
            dictionary! {
                "Type" => Object::Name(b"Catalog".to_vec()),
                "Pages" => Object::Reference(pages_id),
            }
            .into(),
        );
        document.trailer.set("Root", Object::Reference(catalog_id));

        let mut bytes = Vec::new();
        document.save_to(&mut bytes).unwrap();
        bytes
    }

    fn pdf_page_operations(pdf_bytes: &[u8]) -> Vec<Operation> {
        let document = Document::load_mem(pdf_bytes).unwrap();
        let page_id = *document.get_pages().values().next().unwrap();
        let content_bytes = document.get_page_content(page_id).unwrap();
        Content::decode(&content_bytes).unwrap().operations
    }

    fn pdf_do_names(pdf_bytes: &[u8]) -> Vec<Vec<u8>> {
        pdf_page_operations(pdf_bytes)
            .into_iter()
            .filter_map(|operation| {
                if operation.operator != "Do" {
                    return None;
                }

                operation
                    .operands
                    .into_iter()
                    .find_map(|operand| match operand {
                        Object::Name(name) => Some(name),
                        _ => None,
                    })
            })
            .collect()
    }

    #[test]
    fn generates_underbase_mask_from_alpha_and_luma_thresholds() {
        let rgba = vec![
            255, 255, 255, 255, // included
            10, 10, 10, 255, // excluded by luma
            255, 255, 255, 4, // excluded by alpha
            180, 180, 180, 255, // included
        ];

        let mask = generate_white_underbase_mask_rgba(&rgba, 2, 2, 8, 128).unwrap();

        assert_eq!(mask, vec![255, 0, 0, 255]);
    }

    #[test]
    fn generated_underbase_mask_preserves_source_alpha() {
        let rgba = vec![255, 255, 255, 64, 255, 255, 255, 128];

        let mask = generate_white_underbase_mask_rgba(&rgba, 2, 1, 8, 0).unwrap();

        assert_eq!(mask, vec![64, 128]);
    }

    #[test]
    fn constrains_brush_edits_to_artwork_mask() {
        let mask = vec![0; 9];
        let artwork_mask = vec![0, 255, 0, 255, 255, 255, 0, 255, 0];

        let painted = apply_spot_brush(&mask, &artwork_mask, 3, 3, 1, 1, 2, 255).unwrap();

        assert_eq!(painted, artwork_mask);
    }

    #[test]
    fn generates_halftone_only_in_partially_transparent_regions() {
        let mut rgba = vec![0; 4 * 4 * 4];
        for pixel in 0..4 {
            rgba[pixel * 4 + 3] = 255;
        }
        for pixel in 8..16 {
            rgba[pixel * 4 + 3] = 128;
        }

        let mask = generate_halftone_mask_rgba(&rgba, 4, 4, 8, 2, 100, false).unwrap();

        assert_eq!(&mask[0..8], &[0, 0, 0, 0, 0, 0, 0, 0]);
        assert_eq!(&mask[8..16], &[128, 128, 128, 128, 128, 128, 128, 128]);
    }

    #[test]
    fn generates_halftone_for_full_graphic_including_opaque_regions() {
        let mut rgba = vec![0; 4 * 4 * 4];
        for pixel in 0..4 {
            rgba[pixel * 4 + 3] = 255;
        }
        for pixel in 8..16 {
            rgba[pixel * 4 + 3] = 128;
        }

        let mask = generate_halftone_mask_rgba(&rgba, 4, 4, 8, 2, 100, true).unwrap();

        // Opaque regions are also halftoned with full_graphic = true
        assert_eq!(&mask[0..4], &[255, 255, 255, 255]);
        assert_eq!(&mask[8..16], &[128, 128, 128, 128, 128, 128, 128, 128]);
    }

    #[test]
    fn halftone_alpha_threshold_excludes_nearly_transparent_pixels() {
        let mut rgba = vec![0; 3 * 4];
        rgba[3] = 7;
        rgba[7] = 8;
        rgba[11] = 128;

        let mask = generate_halftone_mask_rgba(&rgba, 3, 1, 8, 2, 100, false).unwrap();

        assert_eq!(mask, vec![0, 8, 128]);
    }

    #[test]
    fn halftone_mask_preserves_source_alpha_values() {
        let mut rgba = vec![0; 3 * 4];
        rgba[3] = 32;
        rgba[7] = 128;
        rgba[11] = 254;

        let mask = generate_halftone_mask_rgba(&rgba, 3, 1, 1, 2, 100, false).unwrap();

        assert_eq!(mask, vec![32, 128, 254]);
    }

    #[test]
    fn binary_export_mask_flattens_partial_tints() {
        let mask = vec![0, 1, 128, 255, 0, 0, 64, 0];

        let bytes = create_one_bit_mask_bytes(&mask, 4, 2).unwrap();

        assert_eq!(bytes, vec![0b0011_0000, 0b0000_0000]);
    }

    #[test]
    fn tint_export_mask_preserves_partial_values() {
        let mask = vec![0, 1, 128, 255, 0, 0, 64, 0];

        let bytes = create_tint_mask_bytes(&mask, 4, 2).unwrap();

        assert_eq!(bytes, mask);
    }

    #[test]
    fn pdf_source_export_draws_spot_mask_before_source_design() {
        let request = serde_json::json!({
            "height": 1,
            "layers": [{
                "color": "#ffffff",
                "mask": [255],
                "mode": "overprint",
                "spotName": "Spot_1",
            }],
            "maskMode": "binary",
            "pageHeightPt": 72,
            "pageWidthPt": 72,
            "title": "source.pdf",
            "width": 1,
        });

        let bytes =
            export_spot_pdf_for_pdf_source(&build_source_pdf(), &request.to_string()).unwrap();
        let do_names = pdf_do_names(&bytes);

        assert_eq!(do_names, vec![b"SpotMask1".to_vec(), b"Src".to_vec()]);
    }

    #[test]
    fn pdf_source_export_can_draw_source_vector_paths_as_spot_mask() {
        let request = serde_json::json!({
            "height": 1,
            "layers": [{
                "color": "#ffffff",
                "mask": [255],
                "mode": "overprint",
                "sourceVectorMask": true,
                "spotName": "Spot_1",
            }],
            "maskMode": "binary",
            "pageHeightPt": 72,
            "pageWidthPt": 72,
            "title": "source.pdf",
            "width": 1,
        });

        let bytes =
            export_spot_pdf_for_pdf_source(&build_vector_source_pdf(), &request.to_string())
                .unwrap();
        let operations = pdf_page_operations(&bytes);
        let do_names = pdf_do_names(&bytes);

        assert!(operations.iter().any(|operation| operation.operator == "f"));
        assert!(
            operations
                .iter()
                .any(|operation| operation.operator == "cs")
        );
        assert_eq!(do_names, vec![b"Src".to_vec()]);
    }
}
