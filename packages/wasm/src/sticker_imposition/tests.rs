use crate::sticker_imposition::cut_lines::inspect_pdf_cut_line_candidates;
use crate::sticker_imposition::export::create_artifacts_json;
use crate::sticker_imposition::layout::{resolve_placement_cut_bounds, resolve_plan};
use crate::sticker_imposition::models::{
    OposMarkKind, StickerArtworkAsset, StickerBleedFillMode, StickerCutShape, StickerItem,
    StickerPackingMode, StickerRequest, StickerSettings,
};
use base64::Engine as _;
use image::codecs::jpeg::JpegEncoder;
use image::codecs::webp::WebPEncoder;
use image::{ExtendedColorType, ImageBuffer, ImageEncoder, Rgb};
use lopdf::content::{Content, Operation};
use lopdf::{Dictionary, Document, Object, Stream, dictionary};
use serde_json::Value;

fn build_item(id: &str) -> StickerItem {
    StickerItem {
        bleed_mm: 0.0,
        bleed_fill_mode: StickerBleedFillMode::Mirror,
        cut_offset_mm: 0.0,
        cut_shape: StickerCutShape::Rectangle,
        filename: format!("{id}.pdf"),
        height_mm: 30.0,
        id: id.to_string(),
        mirror_bleed_enabled: false,
        page_number: 1,
        quantity: 1,
        source_height_mm: None,
        source_file_index: 0,
        source_width_mm: None,
        width_mm: 50.0,
        selected_pdf_cut_line_ids: Vec::new(),
    }
}

fn build_settings() -> StickerSettings {
    StickerSettings {
        media_width_mm: 120.0,
        min_spacing_mm: 4.0,
        preferred_sheet_length_mm: 1000.0,
        ..StickerSettings::default()
    }
}

fn build_request(items: Vec<StickerItem>, settings: StickerSettings) -> StickerRequest {
    StickerRequest {
        assets: Vec::new(),
        items,
        settings,
    }
}

fn minimal_png_data_url() -> String {
    let img = ImageBuffer::<Rgb<u8>, _>::from_pixel(1, 1, Rgb([255u8, 255u8, 255u8]));
    let mut bytes = Vec::new();
    img.write_to(
        &mut std::io::Cursor::new(&mut bytes),
        image::ImageFormat::Png,
    )
    .expect("PNG encode failed in test");
    format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(&bytes)
    )
}

fn minimal_jpeg_data_url() -> String {
    let pixels = [255_u8, 255_u8, 255_u8];
    let mut bytes = Vec::new();
    JpegEncoder::new(&mut bytes)
        .encode(&pixels, 1, 1, ExtendedColorType::Rgb8)
        .expect("JPEG encode failed in test");

    format!(
        "data:image/jpeg;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(&bytes)
    )
}

fn minimal_webp_data_url() -> String {
    let pixels = [255_u8, 255_u8, 255_u8];
    let mut bytes = Vec::new();
    WebPEncoder::new_lossless(&mut bytes)
        .write_image(&pixels, 1, 1, ExtendedColorType::Rgb8)
        .expect("WebP encode failed in test");

    format!(
        "data:image/webp;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(&bytes)
    )
}

fn simple_pdf_cutline_bytes() -> Vec<u8> {
    let mut document = Document::with_version("1.5");
    let pages_root_id = document.new_object_id();
    let content = Content {
        operations: vec![
            Operation::new("w", vec![Object::Real(0.25)]),
            Operation::new(
                "re",
                vec![
                    Object::Integer(10),
                    Object::Integer(10),
                    Object::Integer(100),
                    Object::Integer(50),
                ],
            ),
            Operation::new("S", vec![]),
        ],
    };
    let content_bytes = content.encode().expect("failed to encode cut-line PDF");
    let content_id = document.add_object(Stream::new(dictionary! {}, content_bytes));
    let page_id = document.add_object(dictionary! {
        "Type" => Object::Name(b"Page".to_vec()),
        "Parent" => pages_root_id,
        "MediaBox" => Object::Array(vec![
            Object::Integer(0),
            Object::Integer(0),
            Object::Integer(120),
            Object::Integer(80),
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

    let mut bytes = Vec::new();
    document
        .save_to(&mut bytes)
        .expect("failed to save cut-line PDF");
    bytes
}

fn simple_pdf_cutline_data_url() -> String {
    format!(
        "data:application/pdf;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(simple_pdf_cutline_bytes())
    )
}

fn pdf_with_offset_trim_box_data_url() -> String {
    let mut document = Document::with_version("1.5");
    let pages_root_id = document.new_object_id();
    let content = Content {
        operations: vec![
            Operation::new("g", vec![Object::Real(0.5)]),
            Operation::new(
                "re",
                vec![
                    Object::Real(mm_to_points(0.0) as f32),
                    Object::Real(mm_to_points(0.0) as f32),
                    Object::Real(mm_to_points(80.0) as f32),
                    Object::Real(mm_to_points(120.0) as f32),
                ],
            ),
            Operation::new("f", vec![]),
        ],
    };
    let content_bytes = content.encode().expect("failed to encode offset trim PDF");
    let content_id = document.add_object(Stream::new(dictionary! {}, content_bytes));
    let page_id = document.add_object(dictionary! {
        "Type" => Object::Name(b"Page".to_vec()),
        "Parent" => pages_root_id,
        "MediaBox" => Object::Array(vec![
            Object::Real(mm_to_points(-2.0) as f32),
            Object::Real(mm_to_points(-2.0) as f32),
            Object::Real(mm_to_points(82.0) as f32),
            Object::Real(mm_to_points(122.0) as f32),
        ]),
        "TrimBox" => Object::Array(vec![
            Object::Real(mm_to_points(0.0) as f32),
            Object::Real(mm_to_points(0.0) as f32),
            Object::Real(mm_to_points(80.0) as f32),
            Object::Real(mm_to_points(120.0) as f32),
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

    let mut bytes = Vec::new();
    document
        .save_to(&mut bytes)
        .expect("failed to save offset trim PDF");

    format!(
        "data:application/pdf;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    )
}

fn pdf_with_trim_cutline_inside_bleed_data_url() -> String {
    let mut document = Document::with_version("1.5");
    let pages_root_id = document.new_object_id();
    let content = Content {
        operations: vec![
            Operation::new("w", vec![Object::Real(0.25)]),
            Operation::new(
                "re",
                vec![
                    Object::Real(mm_to_points(0.0) as f32),
                    Object::Real(mm_to_points(0.0) as f32),
                    Object::Real(mm_to_points(60.0) as f32),
                    Object::Real(mm_to_points(40.0) as f32),
                ],
            ),
            Operation::new("S", vec![]),
        ],
    };
    let content_bytes = content
        .encode()
        .expect("failed to encode trim cut-line PDF");
    let content_id = document.add_object(Stream::new(dictionary! {}, content_bytes));
    let bleed_box = Object::Array(vec![
        Object::Real(mm_to_points(-2.0) as f32),
        Object::Real(mm_to_points(-2.0) as f32),
        Object::Real(mm_to_points(62.0) as f32),
        Object::Real(mm_to_points(42.0) as f32),
    ]);
    let page_id = document.add_object(dictionary! {
        "Type" => Object::Name(b"Page".to_vec()),
        "Parent" => pages_root_id,
        "MediaBox" => bleed_box.clone(),
        "BleedBox" => bleed_box,
        "TrimBox" => Object::Array(vec![
            Object::Real(mm_to_points(0.0) as f32),
            Object::Real(mm_to_points(0.0) as f32),
            Object::Real(mm_to_points(60.0) as f32),
            Object::Real(mm_to_points(40.0) as f32),
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

    let mut bytes = Vec::new();
    document
        .save_to(&mut bytes)
        .expect("failed to save trim cut-line PDF");

    format!(
        "data:application/pdf;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    )
}

fn mm_to_points(value: f64) -> f64 {
    value * 72.0 / 25.4
}

fn object_to_f64(value: &Object) -> f64 {
    match value {
        Object::Integer(number) => *number as f64,
        Object::Real(number) => *number as f64,
        other => panic!("expected numeric PDF operand, got {other:?}"),
    }
}

fn first_image_transform(pdf_bytes: &[u8]) -> [f64; 6] {
    let document = Document::load_mem(pdf_bytes).expect("failed to load print PDF");
    let page_id = document
        .get_pages()
        .into_values()
        .next()
        .expect("expected a PDF page");
    let content_bytes = document
        .get_page_content(page_id)
        .expect("failed to read PDF page content");
    let content = Content::decode(&content_bytes).expect("failed to decode PDF operations");

    for (index, operation) in content.operations.iter().enumerate() {
        if operation.operator != "Do" {
            continue;
        }

        let transform = content.operations[..index]
            .iter()
            .rev()
            .find(|candidate| candidate.operator == "cm")
            .expect("expected transform before image draw");
        let values = transform
            .operands
            .iter()
            .map(object_to_f64)
            .collect::<Vec<_>>();

        return [
            values[0], values[1], values[2], values[3], values[4], values[5],
        ];
    }

    panic!("expected image placement in PDF");
}

fn pdf_operations(pdf_bytes: &[u8]) -> Vec<lopdf::content::Operation> {
    let document = Document::load_mem(pdf_bytes).expect("failed to load print PDF");
    let page_id = document
        .get_pages()
        .into_values()
        .next()
        .expect("expected a PDF page");
    let content_bytes = document
        .get_page_content(page_id)
        .expect("failed to read PDF page content");

    Content::decode(&content_bytes)
        .expect("failed to decode PDF operations")
        .operations
}

fn first_form_operations(pdf_bytes: &[u8]) -> Vec<lopdf::content::Operation> {
    let document = Document::load_mem(pdf_bytes).expect("failed to load print PDF");

    for object in document.objects.values() {
        let Object::Stream(stream) = object else {
            continue;
        };
        let Ok(Object::Name(subtype)) = stream.dict.get(b"Subtype") else {
            continue;
        };

        if subtype.as_slice() != b"Form" {
            continue;
        }

        let content = stream
            .decompressed_content()
            .unwrap_or_else(|_| stream.content.clone());

        return Content::decode(&content)
            .expect("failed to decode form operations")
            .operations;
    }

    panic!("expected a PDF form XObject");
}

fn first_form_dictionary(pdf_bytes: &[u8]) -> Dictionary {
    let document = Document::load_mem(pdf_bytes).expect("failed to load print PDF");

    for object in document.objects.values() {
        let Object::Stream(stream) = object else {
            continue;
        };
        let Ok(Object::Name(subtype)) = stream.dict.get(b"Subtype") else {
            continue;
        };

        if subtype.as_slice() != b"Form" {
            continue;
        }

        return stream.dict.clone();
    }

    panic!("expected a PDF form XObject");
}

fn form_streams(pdf_bytes: &[u8]) -> Vec<(Dictionary, Vec<lopdf::content::Operation>)> {
    let document = Document::load_mem(pdf_bytes).expect("failed to load print PDF");

    document
        .objects
        .values()
        .filter_map(|object| {
            let Object::Stream(stream) = object else {
                return None;
            };
            let Ok(Object::Name(subtype)) = stream.dict.get(b"Subtype") else {
                return None;
            };

            if subtype.as_slice() != b"Form" {
                return None;
            }

            let content = stream
                .decompressed_content()
                .unwrap_or_else(|_| stream.content.clone());

            Some((
                stream.dict.clone(),
                Content::decode(&content)
                    .expect("failed to decode form operations")
                    .operations,
            ))
        })
        .collect()
}

fn dictionary_array_values(dict: &Dictionary, key: &[u8]) -> Vec<f64> {
    dict.get(key)
        .expect("expected dictionary value")
        .as_array()
        .expect("expected array value")
        .iter()
        .map(object_to_f64)
        .collect()
}

#[test]
fn detects_stroked_pdf_paths_as_cut_line_candidates() {
    let candidates = inspect_pdf_cut_line_candidates(&simple_pdf_cutline_bytes()).unwrap();

    assert_eq!(candidates.len(), 1);
    assert_eq!(candidates[0].id, "p1-o2");
    assert_eq!(candidates[0].page_number, 1);
    assert!(candidates[0].suggested);
    assert!((candidates[0].bounds.width_mm - 35.278).abs() < 0.001);
    assert!((candidates[0].bounds.height_mm - 17.639).abs() < 0.001);
}

#[test]
fn exports_selected_pdf_cut_lines_to_cut_file() {
    let mut item = build_item("selected-cut");
    item.id = "0:1".to_string();
    item.height_mm = 40.0;
    item.width_mm = 60.0;
    item.selected_pdf_cut_line_ids = vec!["p1-o2".to_string()];
    let mut request = build_request(vec![item], build_settings());
    request.assets.push(StickerArtworkAsset {
        data_url: simple_pdf_cutline_data_url(),
        item_id: "0:1".to_string(),
    });

    let artifacts_json = create_artifacts_json(&serde_json::to_string(&request).unwrap()).unwrap();
    let artifacts = serde_json::from_str::<Value>(&artifacts_json).unwrap();
    let print_file = artifacts["files"]
        .as_array()
        .unwrap()
        .iter()
        .find(|file| file["filename"] == "print/sheet-1.pdf")
        .unwrap();
    let cut_file = artifacts["files"]
        .as_array()
        .unwrap()
        .iter()
        .find(|file| file["filename"] == "cut/sheet-1.pdf")
        .unwrap();
    let cut_pdf_bytes = base64::engine::general_purpose::STANDARD
        .decode(cut_file["content"].as_str().unwrap())
        .unwrap();
    let cut_ops = pdf_operations(&cut_pdf_bytes);

    assert_eq!(cut_file["isBinary"], true);
    assert!(cut_pdf_bytes.starts_with(b"%PDF"));
    assert!(cut_ops.iter().any(|operation| operation.operator == "m"));
    assert!(cut_ops.iter().any(|operation| operation.operator == "l"));
    assert!(cut_ops.iter().any(|operation| operation.operator == "S"));

    let pdf_bytes = base64::engine::general_purpose::STANDARD
        .decode(print_file["content"].as_str().unwrap())
        .unwrap();
    let form_ops = first_form_operations(&pdf_bytes);
    assert!(!form_ops.iter().any(|operation| operation.operator == "S"));
}

#[test]
fn keeps_selected_pdf_cut_lines_aligned_to_trim_when_bleed_expands_artwork() {
    let mut item = build_item("selected-cut-with-bleed");
    item.bleed_mm = 2.0;
    item.height_mm = 40.0;
    item.id = "0:1".to_string();
    item.selected_pdf_cut_line_ids = vec!["p1-o2".to_string()];
    item.width_mm = 60.0;
    let mut request = build_request(vec![item], build_settings());
    request.assets.push(StickerArtworkAsset {
        data_url: pdf_with_trim_cutline_inside_bleed_data_url(),
        item_id: "0:1".to_string(),
    });

    let artifacts_json = create_artifacts_json(&serde_json::to_string(&request).unwrap()).unwrap();
    let artifacts = serde_json::from_str::<Value>(&artifacts_json).unwrap();
    let cut_file = artifacts["files"]
        .as_array()
        .unwrap()
        .iter()
        .find(|file| file["filename"] == "cut/sheet-1.pdf")
        .unwrap();
    let cut_pdf_bytes = base64::engine::general_purpose::STANDARD
        .decode(cut_file["content"].as_str().unwrap())
        .unwrap();
    let cut_ops = pdf_operations(&cut_pdf_bytes);
    let move_to = cut_ops
        .iter()
        .find(|operation| operation.operator == "m")
        .expect("expected selected cut path move");
    let first_line_to = cut_ops
        .iter()
        .find(|operation| operation.operator == "l")
        .expect("expected selected cut path line");

    assert!((object_to_f64(&move_to.operands[0]) - mm_to_points(2.0)).abs() < 0.01);
    assert!((object_to_f64(&move_to.operands[1]) - mm_to_points(2.0)).abs() < 0.01);
    assert!((object_to_f64(&first_line_to.operands[0]) - mm_to_points(62.0)).abs() < 0.01);
    assert!((object_to_f64(&first_line_to.operands[1]) - mm_to_points(2.0)).abs() < 0.01);
}

#[test]
fn centers_pdf_artwork_when_trim_box_has_external_bleed() {
    let mut item = build_item("offset-trim");
    item.bleed_mm = 2.0;
    item.height_mm = 120.0;
    item.id = "0:1".to_string();
    item.width_mm = 80.0;
    let mut request = build_request(vec![item], build_settings());
    request.assets.push(StickerArtworkAsset {
        data_url: pdf_with_offset_trim_box_data_url(),
        item_id: "0:1".to_string(),
    });
    let artifacts_json = create_artifacts_json(&serde_json::to_string(&request).unwrap()).unwrap();
    let artifacts = serde_json::from_str::<Value>(&artifacts_json).unwrap();
    let print_file = artifacts["files"]
        .as_array()
        .unwrap()
        .iter()
        .find(|file| file["filename"] == "print/sheet-1.pdf")
        .unwrap();
    let pdf_bytes = base64::engine::general_purpose::STANDARD
        .decode(print_file["content"].as_str().unwrap())
        .unwrap();
    let form_dict = first_form_dictionary(&pdf_bytes);
    let bbox = dictionary_array_values(&form_dict, b"BBox");
    let matrix = dictionary_array_values(&form_dict, b"Matrix");

    assert!((bbox[2] - mm_to_points(84.0)).abs() < 0.01);
    assert!((bbox[3] - mm_to_points(124.0)).abs() < 0.01);
    assert!((matrix[4] - mm_to_points(2.0)).abs() < 0.01);
    assert!((matrix[5] - mm_to_points(2.0)).abs() < 0.01);
}

#[test]
fn creates_mirrored_bleed_for_pdf_sticker_item() {
    let mut item = build_item("mirrored-trim");
    item.bleed_mm = 2.0;
    item.height_mm = 120.0;
    item.id = "0:1".to_string();
    item.mirror_bleed_enabled = true;
    item.width_mm = 80.0;
    let mut request = build_request(vec![item], build_settings());
    request.assets.push(StickerArtworkAsset {
        data_url: pdf_with_offset_trim_box_data_url(),
        item_id: "0:1".to_string(),
    });
    let artifacts_json = create_artifacts_json(&serde_json::to_string(&request).unwrap()).unwrap();
    let artifacts = serde_json::from_str::<Value>(&artifacts_json).unwrap();
    let print_file = artifacts["files"]
        .as_array()
        .unwrap()
        .iter()
        .find(|file| file["filename"] == "print/sheet-1.pdf")
        .unwrap();
    let pdf_bytes = base64::engine::general_purpose::STANDARD
        .decode(print_file["content"].as_str().unwrap())
        .unwrap();
    let forms = form_streams(&pdf_bytes);
    let (form_dict, form_ops) = forms
        .iter()
        .find(|(dict, operations)| {
            let bbox = dictionary_array_values(dict, b"BBox");
            let do_count = operations
                .iter()
                .filter(|operation| operation.operator == "Do")
                .count();

            (bbox[2] - mm_to_points(84.0)).abs() < 0.01
                && (bbox[3] - mm_to_points(124.0)).abs() < 0.01
                && do_count == 9
        })
        .expect("expected mirrored bleed wrapper form");
    let bbox = dictionary_array_values(form_dict, b"BBox");
    let center_transform = form_ops
        .iter()
        .rev()
        .find(|operation| operation.operator == "cm")
        .expect("expected center transform");
    let values = center_transform
        .operands
        .iter()
        .map(object_to_f64)
        .collect::<Vec<_>>();

    assert!((bbox[2] - mm_to_points(84.0)).abs() < 0.01);
    assert!((bbox[3] - mm_to_points(124.0)).abs() < 0.01);
    assert!((values[4] - mm_to_points(2.0)).abs() < 0.01);
    assert!((values[5] - mm_to_points(2.0)).abs() < 0.01);
}

#[test]
fn computes_opos_marks_when_enabled() {
    let mut settings = build_settings();
    settings.fill_rows = false;
    settings.opos_marks_enabled = true;
    settings.opos_mark_size_mm = 3.0;
    settings.opos_mark_spacing_mm = 400.0;
    settings.opos_mark_margin_mm = 10.0;
    settings.preferred_sheet_length_mm = 1000.0;
    let item = build_item("sticker");
    let request = build_request(vec![item], settings);
    let plan = resolve_plan(&request);

    let marks = &plan.sheets[0].opos_marks;
    let square_marks = marks
        .iter()
        .filter(|mark| matches!(mark.kind, OposMarkKind::Square))
        .collect::<Vec<_>>();
    let bars = marks
        .iter()
        .filter(|mark| matches!(mark.kind, OposMarkKind::Bar))
        .collect::<Vec<_>>();

    assert_eq!(square_marks.len(), 4);
    assert_eq!(bars.len(), 1);
    assert!((square_marks[0].x_mm - -13.0).abs() < f64::EPSILON);
    assert!((square_marks[0].y_mm - 40.0).abs() < f64::EPSILON);
    assert!((square_marks[1].x_mm - -13.0).abs() < f64::EPSILON);
    assert!((square_marks[1].y_mm - -13.0).abs() < f64::EPSILON);
    assert!((square_marks[2].x_mm - 60.0).abs() < f64::EPSILON);
    assert!((square_marks[2].y_mm - 40.0).abs() < f64::EPSILON);
    assert!((square_marks[3].x_mm - 60.0).abs() < f64::EPSILON);
    assert!((square_marks[3].y_mm - -13.0).abs() < f64::EPSILON);
    assert!((bars[0].x_mm - 0.0).abs() < f64::EPSILON);
    assert!((bars[0].y_mm - 40.0).abs() < f64::EPSILON);
    assert!((bars[0].width_mm - 50.0).abs() < f64::EPSILON);
    assert!((bars[0].height_mm - 3.0).abs() < f64::EPSILON);
}

#[test]
fn distributes_opos_markers_along_left_and_right_edges() {
    let mut item = build_item("tall-sticker");
    item.height_mm = 900.0;
    item.width_mm = 50.0;
    let mut settings = build_settings();
    settings.fill_rows = false;
    settings.opos_marks_enabled = true;
    settings.opos_mark_size_mm = 3.0;
    settings.opos_mark_spacing_mm = 400.0;
    settings.opos_mark_margin_mm = 10.0;
    let request = build_request(vec![item], settings);
    let plan = resolve_plan(&request);

    let square_marks = plan.sheets[0]
        .opos_marks
        .iter()
        .filter(|mark| matches!(mark.kind, OposMarkKind::Square))
        .collect::<Vec<_>>();
    let left_marks = square_marks
        .iter()
        .filter(|mark| (mark.x_mm - -13.0).abs() < f64::EPSILON)
        .collect::<Vec<_>>();
    let right_marks = square_marks
        .iter()
        .filter(|mark| (mark.x_mm - 60.0).abs() < f64::EPSILON)
        .collect::<Vec<_>>();

    assert_eq!(left_marks.len(), right_marks.len());
    assert!(left_marks.len() > 2);
    assert!(square_marks.iter().all(|mark| {
        (mark.x_mm - -13.0).abs() < f64::EPSILON || (mark.x_mm - 60.0).abs() < f64::EPSILON
    }));
}

#[test]
fn no_opos_marks_when_disabled() {
    let item = build_item("sticker");
    let request = build_request(vec![item], build_settings());
    let plan = resolve_plan(&request);

    assert!(plan.sheets[0].opos_marks.is_empty());
}

#[test]
fn computes_manual_cut_marks_on_all_sheet_edges() {
    let item = build_item("sticker");
    let mut settings = build_settings();
    settings.fill_rows = false;
    settings.manual_cut_mark_length_mm = 5.0;
    settings.manual_cut_marks_enabled = true;
    let request = build_request(vec![item], settings);
    let plan = resolve_plan(&request);
    let sheet = &plan.sheets[0];

    assert_eq!(sheet.manual_cut_marks.len(), 8);
    assert!(sheet.manual_cut_marks.iter().any(|mark| {
        (mark.x1_mm - 0.0).abs() < f64::EPSILON
            && (mark.x2_mm - 0.0).abs() < f64::EPSILON
            && (mark.y1_mm - -5.0).abs() < f64::EPSILON
            && (mark.y2_mm - 0.0).abs() < f64::EPSILON
    }));
    assert!(sheet.manual_cut_marks.iter().any(|mark| {
        (mark.x1_mm - -5.0).abs() < f64::EPSILON
            && (mark.x2_mm - 0.0).abs() < f64::EPSILON
            && (mark.y1_mm - 30.0).abs() < f64::EPSILON
            && (mark.y2_mm - 30.0).abs() < f64::EPSILON
    }));
    assert!(sheet.preview_length_mm >= 1000.0);
}

#[test]
fn exports_opos_guides_to_print_and_cut_pdfs() {
    let mut item = build_item("label");
    item.id = "0:1".to_string();
    item.height_mm = 40.0;
    item.width_mm = 60.0;
    let mut settings = build_settings();
    settings.opos_marks_enabled = true;
    settings.opos_mark_margin_mm = 10.0;
    settings.opos_mark_size_mm = 3.0;
    settings.media_width_mm = 120.0;
    let mut request = build_request(vec![item], settings);
    request.assets.push(StickerArtworkAsset {
        data_url: minimal_png_data_url(),
        item_id: "0:1".to_string(),
    });
    let artifacts_json = create_artifacts_json(&serde_json::to_string(&request).unwrap()).unwrap();
    let artifacts = serde_json::from_str::<Value>(&artifacts_json).unwrap();
    let files = artifacts["files"].as_array().unwrap();
    let print_file = files
        .iter()
        .find(|f| f["filename"] == "print/sheet-1.pdf")
        .unwrap();
    let cut_file = files
        .iter()
        .find(|f| f["filename"] == "cut/sheet-1.pdf")
        .unwrap();

    // PDF should be binary-encoded and start with %PDF
    assert_eq!(print_file["isBinary"], true);
    let pdf_bytes = base64::engine::general_purpose::STANDARD
        .decode(print_file["content"].as_str().unwrap())
        .unwrap();
    assert!(pdf_bytes.starts_with(b"%PDF"));
    let pdf_ops = pdf_operations(&pdf_bytes);

    let white_fill_rect_count = pdf_ops
        .windows(5)
        .filter(|window| {
            window[0].operator == "q"
                && window[1].operator == "g"
                && window[1]
                    .operands
                    .first()
                    .is_some_and(|operand| (object_to_f64(operand) - 1.0).abs() < 0.0001)
                && window[2].operator == "re"
                && window[3].operator == "f"
                && window[4].operator == "Q"
        })
        .count();
    assert_eq!(white_fill_rect_count, 1);

    let cut_pdf_bytes = base64::engine::general_purpose::STANDARD
        .decode(cut_file["content"].as_str().unwrap())
        .unwrap();
    assert_eq!(cut_file["isBinary"], true);
    assert!(cut_pdf_bytes.starts_with(b"%PDF"));
    let cut_ops = pdf_operations(&cut_pdf_bytes);
    let filled_mark_count = cut_ops
        .windows(2)
        .filter(|window| window[0].operator == "re" && window[1].operator == "f")
        .count();
    assert_eq!(filled_mark_count, 5);
    assert!(cut_ops.iter().any(|operation| operation.operator == "S"));
    assert!(
        !files
            .iter()
            .any(|file| file["filename"] == "cut/sheet-1.eps")
    );
    assert!(
        !files
            .iter()
            .any(|file| file["filename"] == "cut/sheet-1.ai")
    );
}

#[test]
fn exports_manual_cut_marks_to_print_cut_pdfs_and_manifest() {
    let mut item = build_item("label");
    item.id = "0:1".to_string();
    item.height_mm = 40.0;
    item.width_mm = 60.0;
    let mut settings = build_settings();
    settings.fill_rows = false;
    settings.manual_cut_mark_length_mm = 6.0;
    settings.manual_cut_marks_enabled = true;
    settings.media_width_mm = 120.0;
    let mut request = build_request(vec![item], settings);
    request.assets.push(StickerArtworkAsset {
        data_url: minimal_png_data_url(),
        item_id: "0:1".to_string(),
    });
    let artifacts_json = create_artifacts_json(&serde_json::to_string(&request).unwrap()).unwrap();
    let artifacts = serde_json::from_str::<Value>(&artifacts_json).unwrap();
    let files = artifacts["files"].as_array().unwrap();
    let print_file = files
        .iter()
        .find(|file| file["filename"] == "print/sheet-1.pdf")
        .unwrap();
    let cut_file = files
        .iter()
        .find(|file| file["filename"] == "cut/sheet-1.pdf")
        .unwrap();
    let manifest_file = files
        .iter()
        .find(|file| file["filename"] == "manifest.json")
        .unwrap();

    let pdf_bytes = base64::engine::general_purpose::STANDARD
        .decode(print_file["content"].as_str().unwrap())
        .unwrap();
    let pdf_ops = pdf_operations(&pdf_bytes);
    assert!(pdf_ops.iter().any(|operation| operation.operator == "S"));

    let cut_pdf_bytes = base64::engine::general_purpose::STANDARD
        .decode(cut_file["content"].as_str().unwrap())
        .unwrap();
    let cut_ops = pdf_operations(&cut_pdf_bytes);
    assert_eq!(cut_file["isBinary"], true);
    assert!(cut_pdf_bytes.starts_with(b"%PDF"));
    assert!(cut_ops.iter().any(|operation| operation.operator == "S"));

    let manifest =
        serde_json::from_str::<Value>(manifest_file["content"].as_str().unwrap()).unwrap();
    assert_eq!(
        manifest["sheets"][0]["manualCutMarks"]
            .as_array()
            .unwrap()
            .len(),
        8
    );
}

#[test]
fn exports_jpeg_and_webp_sticker_artwork_data_urls() {
    for data_url in [minimal_jpeg_data_url(), minimal_webp_data_url()] {
        let mut item = build_item("raster");
        item.id = "0:1".to_string();
        let mut request = build_request(vec![item], build_settings());
        request.assets.push(StickerArtworkAsset {
            data_url,
            item_id: "0:1".to_string(),
        });

        let artifacts_json = create_artifacts_json(&serde_json::to_string(&request).unwrap())
            .expect("JPEG/WebP sticker artwork should export");
        let artifacts = serde_json::from_str::<Value>(&artifacts_json).unwrap();
        let print_file = artifacts["files"]
            .as_array()
            .unwrap()
            .iter()
            .find(|file| file["filename"] == "print/sheet-1.pdf")
            .unwrap();
        let pdf_bytes = base64::engine::general_purpose::STANDARD
            .decode(print_file["content"].as_str().unwrap())
            .unwrap();

        assert!(pdf_bytes.starts_with(b"%PDF"));
    }
}

#[test]
fn print_pdf_expands_artwork_to_cover_sticker_bleed() {
    let mut item = build_item("bleed");
    item.bleed_mm = 2.0;
    item.height_mm = 40.0;
    item.id = "0:1".to_string();
    item.width_mm = 60.0;
    let mut request = build_request(vec![item], build_settings());
    request.assets.push(StickerArtworkAsset {
        data_url: minimal_png_data_url(),
        item_id: "0:1".to_string(),
    });
    let artifacts_json = create_artifacts_json(&serde_json::to_string(&request).unwrap()).unwrap();
    let artifacts = serde_json::from_str::<Value>(&artifacts_json).unwrap();
    let files = artifacts["files"].as_array().unwrap();
    let print_file = files
        .iter()
        .find(|f| f["filename"] == "print/sheet-1.pdf")
        .unwrap();
    let pdf_bytes = base64::engine::general_purpose::STANDARD
        .decode(print_file["content"].as_str().unwrap())
        .unwrap();
    let [a, _, _, d, e, f] = first_image_transform(&pdf_bytes);

    assert!((a - mm_to_points(64.0)).abs() < 0.01);
    assert!((d - mm_to_points(44.0)).abs() < 0.01);
    assert!(e.abs() < 0.01);
    assert!(f.abs() < 0.01);
}

#[test]
fn cut_offset_adjusts_cut_line_without_changing_print_bleed() {
    let mut item = build_item("cut-offset");
    item.bleed_mm = 2.0;
    item.cut_offset_mm = -1.0;
    item.height_mm = 40.0;
    item.id = "0:1".to_string();
    item.width_mm = 60.0;
    let mut request = build_request(vec![item], build_settings());
    request.assets.push(StickerArtworkAsset {
        data_url: minimal_png_data_url(),
        item_id: "0:1".to_string(),
    });
    let artifacts_json = create_artifacts_json(&serde_json::to_string(&request).unwrap()).unwrap();
    let artifacts = serde_json::from_str::<Value>(&artifacts_json).unwrap();
    let files = artifacts["files"].as_array().unwrap();
    let print_file = files
        .iter()
        .find(|f| f["filename"] == "print/sheet-1.pdf")
        .unwrap();
    let pdf_bytes = base64::engine::general_purpose::STANDARD
        .decode(print_file["content"].as_str().unwrap())
        .unwrap();
    let [a, _, _, d, _, _] = first_image_transform(&pdf_bytes);
    let plan = resolve_plan(&request);
    let cut_bounds = resolve_placement_cut_bounds(&plan.sheets[0].placements[0]);

    assert!((a - mm_to_points(64.0)).abs() < 0.01);
    assert!((d - mm_to_points(44.0)).abs() < 0.01);
    assert!((cut_bounds.max_x_mm - cut_bounds.min_x_mm - 58.0).abs() < 0.001);
    assert!((cut_bounds.max_y_mm - cut_bounds.min_y_mm - 38.0).abs() < 0.001);
}

#[test]
fn keeps_requested_spacing_in_single_cut_rows() {
    let mut item = build_item("sticker");
    item.quantity = 2;
    let mut settings = build_settings();
    settings.min_spacing_mm = 1.0;
    settings.packing_mode = StickerPackingMode::SingleCutRows;
    let request = build_request(vec![item], settings);
    let plan = resolve_plan(&request);
    let placements = &plan.sheets[0].placements;

    assert_eq!(placements.len(), 2);
    assert!((placements[1].x_mm - placements[0].x_mm - placements[0].width_mm - 1.0).abs() < 0.001);
}

#[test]
fn allows_zero_spacing_in_single_cut_rows() {
    let mut item = build_item("sticker");
    item.quantity = 2;
    let mut settings = build_settings();
    settings.min_spacing_mm = 0.0;
    settings.packing_mode = StickerPackingMode::SingleCutRows;
    let request = build_request(vec![item], settings);
    let plan = resolve_plan(&request);
    let placements = &plan.sheets[0].placements;

    assert_eq!(placements.len(), 2);
    assert!((placements[1].x_mm - placements[0].x_mm - placements[0].width_mm).abs() < 0.001);
}

#[test]
fn packs_circle_stickers_in_staggered_rows() {
    let mut item = build_item("circle-sticker");
    item.cut_shape = StickerCutShape::Circle;
    item.height_mm = 10.0;
    item.quantity = 10;
    item.width_mm = 10.0;
    let mut settings = build_settings();
    settings.fill_rows = false;
    settings.media_width_mm = 55.0;
    settings.min_spacing_mm = 0.0;
    settings.packing_mode = StickerPackingMode::SingleCutRows;
    let request = build_request(vec![item], settings);
    let plan = resolve_plan(&request);
    let placements = &plan.sheets[0].placements;

    assert_eq!(placements.len(), 10);
    assert_eq!(placements[5].x_mm, 5.0);
    assert!((placements[5].y_mm - (10.0 * 3.0_f64.sqrt() / 2.0)).abs() < 0.001);
    assert!(plan.sheets[0].export_height_mm < 20.0);
}

#[test]
fn circle_staggered_rows_reserve_bleed_radius() {
    let mut item = build_item("bleed-circle");
    item.bleed_mm = 2.0;
    item.cut_shape = StickerCutShape::Circle;
    item.height_mm = 10.0;
    item.quantity = 3;
    item.width_mm = 10.0;
    let mut settings = build_settings();
    settings.fill_rows = false;
    settings.media_width_mm = 100.0;
    settings.min_spacing_mm = 0.0;
    settings.packing_mode = StickerPackingMode::SingleCutRows;
    let request = build_request(vec![item], settings);
    let plan = resolve_plan(&request);
    let placements = &plan.sheets[0].placements;

    assert_eq!(placements.len(), 3);
    assert_eq!(placements[0].x_mm, 2.0);
    assert_eq!(placements[1].x_mm, 16.0);
    assert_eq!(plan.sheets[0].export_width_mm, 42.0);
}

#[test]
fn circle_staggered_rows_reserve_positive_cut_offset_radius() {
    let mut item = build_item("cut-offset-circle");
    item.cut_offset_mm = 1.5;
    item.cut_shape = StickerCutShape::Circle;
    item.height_mm = 10.0;
    item.quantity = 2;
    item.width_mm = 10.0;
    let mut settings = build_settings();
    settings.fill_rows = false;
    settings.media_width_mm = 100.0;
    settings.min_spacing_mm = 0.0;
    settings.packing_mode = StickerPackingMode::SingleCutRows;
    let request = build_request(vec![item], settings);
    let plan = resolve_plan(&request);
    let placements = &plan.sheets[0].placements;

    assert_eq!(placements[0].x_mm, 1.5);
    assert_eq!(placements[1].x_mm, 14.5);
    assert_eq!(plan.sheets[0].export_width_mm, 26.0);
}

#[test]
fn circle_staggered_rows_negative_cut_offset_does_not_shrink_bleed_radius() {
    let mut item = build_item("negative-offset-circle");
    item.bleed_mm = 2.0;
    item.cut_offset_mm = -1.0;
    item.cut_shape = StickerCutShape::Circle;
    item.height_mm = 10.0;
    item.quantity = 2;
    item.width_mm = 10.0;
    let mut settings = build_settings();
    settings.fill_rows = false;
    settings.media_width_mm = 100.0;
    settings.min_spacing_mm = 0.0;
    settings.packing_mode = StickerPackingMode::SingleCutRows;
    let request = build_request(vec![item], settings);
    let plan = resolve_plan(&request);
    let placements = &plan.sheets[0].placements;

    assert_eq!(placements[0].x_mm, 2.0);
    assert_eq!(placements[1].x_mm, 16.0);
    assert_eq!(plan.sheets[0].export_width_mm, 28.0);
}

#[test]
fn reserves_bleed_area_when_packing_single_cut_rows() {
    let mut item = build_item("bleed-spacing");
    item.bleed_mm = 2.0;
    item.quantity = 2;
    let mut settings = build_settings();
    settings.fill_rows = false;
    settings.media_width_mm = 200.0;
    settings.min_spacing_mm = 4.0;
    settings.packing_mode = StickerPackingMode::SingleCutRows;
    let request = build_request(vec![item], settings);
    let plan = resolve_plan(&request);
    let placements = &plan.sheets[0].placements;

    assert_eq!(placements.len(), 2);
    assert!((placements[0].x_mm - 2.0).abs() < 0.001);
    assert!((placements[1].x_mm - 60.0).abs() < 0.001);
    assert_eq!(plan.sheets[0].export_width_mm, 112.0);
}

#[test]
fn crops_export_dimensions_to_occupied_objects() {
    let mut item = build_item("small");
    item.height_mm = 40.0;
    item.width_mm = 80.0;
    let mut settings = build_settings();
    settings.fill_rows = false;
    settings.media_width_mm = 1000.0;
    let request = build_request(vec![item], settings);
    let plan = resolve_plan(&request);

    assert_eq!(plan.sheets[0].media_width_mm, 1000.0);
    assert_eq!(plan.sheets[0].export_width_mm, 80.0);
    assert_eq!(plan.sheets[0].export_height_mm, 40.0);
}

#[test]
fn ready_sheets_ignore_cut_offset_for_export_bounds() {
    let mut item = build_item("ready-sheet");
    item.cut_offset_mm = 12.0;
    item.cut_shape = StickerCutShape::ReadySheet;
    item.height_mm = 70.0;
    item.width_mm = 90.0;
    let request = build_request(vec![item], build_settings());
    let plan = resolve_plan(&request);

    assert_eq!(plan.sheets[0].export_width_mm, 90.0);
    assert_eq!(plan.sheets[0].export_height_mm, 70.0);
}

#[test]
fn prefers_one_meter_sheets_before_opening_long_sheet() {
    let mut item = build_item("tall");
    item.height_mm = 300.0;
    item.quantity = 4;
    item.width_mm = 80.0;
    let mut settings = build_settings();
    settings.allow_long_sheets = true;
    settings.media_width_mm = 100.0;
    settings.preferred_sheet_length_mm = 1000.0;
    let request = build_request(vec![item], settings);
    let plan = resolve_plan(&request);

    assert_eq!(plan.sheet_count, 2);
    assert!(plan.sheets[0].export_height_mm <= 1000.0);
}

#[test]
fn allows_longer_sheets_when_single_sticker_requires_them() {
    let mut item = build_item("long");
    item.height_mm = 1400.0;
    item.width_mm = 80.0;
    let mut settings = build_settings();
    settings.allow_long_sheets = true;
    settings.media_width_mm = 100.0;
    settings.preferred_sheet_length_mm = 1000.0;
    let request = build_request(vec![item], settings);
    let plan = resolve_plan(&request);

    assert_eq!(plan.sheet_count, 1);
    assert_eq!(plan.sheets[0].export_height_mm, 1400.0);
}

#[test]
fn creates_a4_to_a3_scale_grouped_parts_for_varied_sticker_sets() {
    let items = (0..8)
        .map(|index| {
            let mut item = build_item(&format!("item-{}", index + 1));
            item.height_mm = 50.0;
            item.source_file_index = index;
            item.width_mm = 50.0;
            item
        })
        .collect::<Vec<_>>();
    let mut settings = build_settings();
    settings.group_max_distinct_items = 8;
    settings.media_width_mm = 1000.0;
    settings.packing_mode = StickerPackingMode::GroupedParts;
    let request = build_request(items, settings);
    let plan = resolve_plan(&request);
    let part = &plan.sheets[0].part_boundaries[0];

    assert!(part.width_mm <= 420.0);
    assert!(part.height_mm <= 420.0);
}

#[test]
fn groups_repeated_single_sticker_into_a_real_part() {
    let mut item = build_item("single-repeat");
    item.height_mm = 50.0;
    item.quantity = 12;
    item.width_mm = 50.0;
    let mut settings = build_settings();
    settings.group_max_distinct_items = 8;
    settings.media_width_mm = 1000.0;
    settings.min_spacing_mm = 0.0;
    settings.packing_mode = StickerPackingMode::GroupedParts;
    let request = build_request(vec![item], settings);
    let plan = resolve_plan(&request);
    let first_part = &plan.sheets[0].part_boundaries[0];
    let grouped_placements = plan.sheets[0]
        .placements
        .iter()
        .filter(|placement| placement.part_id.as_deref() == Some(&first_part.id))
        .count();

    assert_eq!(grouped_placements, 12);
    assert_eq!(first_part.width_mm, 200.0);
    assert_eq!(first_part.height_mm, 150.0);
}

#[test]
fn chooses_more_compact_bundles_for_large_repeated_sticker_runs() {
    let mut item = build_item("compact-bundles");
    item.height_mm = 40.0;
    item.quantity = 300;
    item.width_mm = 40.0;
    let mut settings = build_settings();
    settings.group_max_distinct_items = 8;
    settings.media_width_mm = 1050.0;
    settings.min_spacing_mm = 0.0;
    settings.packing_mode = StickerPackingMode::GroupedParts;
    let request = build_request(vec![item], settings);
    let plan = resolve_plan(&request);

    assert_eq!(plan.sheet_count, 1);
    assert_eq!(plan.sheets[0].part_boundaries.len(), 9);
    assert_eq!(plan.sheets[0].export_width_mm, 856.0);
    assert_eq!(plan.sheets[0].export_height_mm, 616.0);
}

#[test]
fn chooses_a_larger_standard_bundle_when_it_fits_more_items() {
    let mut item = build_item("bundle-sizing");
    item.height_mm = 50.0;
    item.quantity = 30;
    item.width_mm = 50.0;
    let mut settings = build_settings();
    settings.group_max_distinct_items = 8;
    settings.media_width_mm = 1000.0;
    settings.min_spacing_mm = 0.0;
    settings.packing_mode = StickerPackingMode::GroupedParts;
    let request = build_request(vec![item], settings);
    let plan = resolve_plan(&request);
    let first_part = &plan.sheets[0].part_boundaries[0];
    let grouped_placements = plan.sheets[0]
        .placements
        .iter()
        .filter(|placement| placement.part_id.as_deref() == Some(&first_part.id))
        .count();

    assert_eq!(plan.sheets[0].part_boundaries.len(), 1);
    assert_eq!(grouped_placements, 30);
    assert_eq!(first_part.width_mm, 250.0);
    assert_eq!(first_part.height_mm, 300.0);
}

#[test]
fn backfills_grouped_bundle_row_gaps_with_later_stickers() {
    let items = [
        ("top-left", 100.0, 100.0, 1),
        ("lower-row", 120.0, 90.0, 1),
        ("row-fill-a", 40.0, 80.0, 1),
        ("row-fill-b", 40.0, 80.0, 1),
    ]
    .into_iter()
    .map(|(id, width_mm, height_mm, quantity)| {
        let mut item = build_item(id);
        item.width_mm = width_mm;
        item.height_mm = height_mm;
        item.quantity = quantity;
        item
    })
    .collect::<Vec<_>>();
    let mut settings = build_settings();
    settings.group_max_distinct_items = 4;
    settings.media_width_mm = 210.0;
    settings.min_spacing_mm = 0.0;
    settings.packing_mode = StickerPackingMode::GroupedParts;
    let request = build_request(items, settings);
    let plan = resolve_plan(&request);
    let first_part = &plan.sheets[0].part_boundaries[0];
    let placements = plan.sheets[0]
        .placements
        .iter()
        .filter(|placement| placement.part_id.as_deref() == Some(&first_part.id))
        .collect::<Vec<_>>();
    let row_fill_b = placements
        .iter()
        .find(|placement| placement.item_id == "row-fill-b")
        .expect("expected row-fill-b in grouped part");

    assert_eq!(placements.len(), 4);
    assert_eq!(first_part.height_mm, 190.0);
    assert_eq!(row_fill_b.x_mm, 120.0);
    assert_eq!(row_fill_b.y_mm, 100.0);
}

#[test]
fn allows_zero_spacing_and_configurable_margin_in_grouped_parts() {
    let mut item = build_item("zero-gap");
    item.quantity = 2;
    let mut settings = build_settings();
    settings.media_width_mm = 1000.0;
    settings.min_spacing_mm = 0.0;
    settings.part_margin_mm = 6.0;
    settings.packing_mode = StickerPackingMode::GroupedParts;
    let request = build_request(vec![item], settings);
    let plan = resolve_plan(&request);
    let part = &plan.sheets[0].part_boundaries[0];
    let placements = plan.sheets[0]
        .placements
        .iter()
        .filter(|placement| placement.part_id.as_deref() == Some(&part.id))
        .collect::<Vec<_>>();

    assert_eq!(placements.len(), 2);
    assert!((placements[0].x_mm - (part.x_mm + 6.0)).abs() < f64::EPSILON);
    assert!((placements[0].y_mm - (part.y_mm + 6.0)).abs() < f64::EPSILON);
    assert!(
        (placements[1].x_mm - placements[0].x_mm - placements[0].width_mm).abs() < f64::EPSILON
    );
}

#[test]
fn backfills_shorter_boxes_into_earlier_shelves_before_extending_length() {
    let items = [
        ("wide-short", 60.0, 100.0),
        ("wide-tall", 70.0, 90.0),
        ("backfill", 50.0, 80.0),
    ]
    .into_iter()
    .map(|(id, width_mm, height_mm)| {
        let mut item = build_item(id);
        item.width_mm = width_mm;
        item.height_mm = height_mm;
        item
    })
    .collect::<Vec<_>>();
    let mut settings = build_settings();
    settings.fill_rows = false;
    settings.media_width_mm = 120.0;
    settings.packing_mode = StickerPackingMode::SingleCutRows;
    let request = build_request(items, settings);
    let plan = resolve_plan(&request);

    assert_eq!(plan.sheet_count, 1);
    assert!(plan.sheets[0].export_height_mm <= 194.0);
}

#[test]
fn backfills_previous_sheet_gaps_before_extending_newer_sheets() {
    let items = [
        ("first-sheet-gap", 60.0, 800.0, 1),
        ("second-sheet-full", 100.0, 790.0, 1),
        ("gap-fill", 35.0, 200.0, 3),
    ]
    .into_iter()
    .map(|(id, width_mm, height_mm, quantity)| {
        let mut item = build_item(id);
        item.height_mm = height_mm;
        item.quantity = quantity;
        item.width_mm = width_mm;
        item
    })
    .collect::<Vec<_>>();
    let mut settings = build_settings();
    settings.fill_rows = false;
    settings.media_width_mm = 100.0;
    settings.min_spacing_mm = 0.0;
    settings.packing_mode = StickerPackingMode::SingleCutRows;
    settings.preferred_sheet_length_mm = 1000.0;
    let request = build_request(items, settings);
    let plan = resolve_plan(&request);
    let gap_fills_on_first_sheet = plan.sheets[0]
        .placements
        .iter()
        .filter(|placement| placement.item_id == "gap-fill")
        .count();

    assert_eq!(plan.sheet_count, 2);
    assert_eq!(gap_fills_on_first_sheet, 1);
}

#[test]
fn separates_print_and_cut_pdf_files() {
    let mut item = build_item("label");
    item.cut_offset_mm = 1.0;
    item.cut_shape = StickerCutShape::DieCut;
    item.height_mm = 40.0;
    item.id = "0:1".to_string();
    item.width_mm = 60.0;
    let mut request = build_request(vec![item], build_settings());
    request.assets.push(StickerArtworkAsset {
        data_url: minimal_png_data_url(),
        item_id: "0:1".to_string(),
    });
    let artifacts_json = create_artifacts_json(&serde_json::to_string(&request).unwrap()).unwrap();
    let artifacts = serde_json::from_str::<Value>(&artifacts_json).unwrap();
    let files = artifacts["files"].as_array().unwrap();
    let print_file = files
        .iter()
        .find(|file| file["filename"] == "print/sheet-1.pdf")
        .unwrap();
    let cut_file = files
        .iter()
        .find(|file| file["filename"] == "cut/sheet-1.pdf")
        .unwrap();
    let manifest_file = files
        .iter()
        .find(|file| file["filename"] == "manifest.json")
        .unwrap();
    let manifest =
        serde_json::from_str::<Value>(manifest_file["content"].as_str().unwrap()).unwrap();

    // Print file should be binary-encoded PDF
    assert_eq!(print_file["isBinary"], true);
    let pdf_bytes = base64::engine::general_purpose::STANDARD
        .decode(print_file["content"].as_str().unwrap())
        .unwrap();
    assert!(pdf_bytes.starts_with(b"%PDF"));

    // Cut file should be a binary-encoded PDF with vector cut paths.
    assert_eq!(cut_file["isBinary"], true);
    let cut_pdf_bytes = base64::engine::general_purpose::STANDARD
        .decode(cut_file["content"].as_str().unwrap())
        .unwrap();
    assert!(cut_pdf_bytes.starts_with(b"%PDF"));
    let cut_ops = pdf_operations(&cut_pdf_bytes);
    assert!(cut_ops.iter().any(|operation| operation.operator == "c"));
    assert!(cut_ops.iter().any(|operation| operation.operator == "S"));
    assert!(
        !files
            .iter()
            .any(|file| file["filename"] == "cut/sheet-1.eps")
    );
    assert!(
        !files
            .iter()
            .any(|file| file["filename"] == "cut/sheet-1.ai")
    );

    // Manifest should reference correct filenames
    assert_eq!(manifest["sheets"][0]["printFile"], "print/sheet-1.pdf");
    assert_eq!(manifest["sheets"][0]["cutFile"], "cut/sheet-1.pdf");
    assert!(manifest["sheets"][0]["cutAiFile"].is_null());
    assert_eq!(manifest["sheets"][0]["placements"][0]["itemId"], "0:1");
    assert_eq!(
        manifest["sheets"][0]["placements"][0]["cutShape"],
        "die_cut"
    );
}

#[test]
fn collapses_identical_export_sheets_into_repeated_files() {
    let mut item = build_item("repeated-label");
    item.height_mm = 50.0;
    item.id = "0:1".to_string();
    item.quantity = 4;
    item.width_mm = 50.0;
    let mut settings = build_settings();
    settings.allow_long_sheets = false;
    settings.media_width_mm = 50.0;
    settings.min_spacing_mm = 0.0;
    settings.preferred_sheet_length_mm = 100.0;
    let mut request = build_request(vec![item], settings);
    request.assets.push(StickerArtworkAsset {
        data_url: minimal_png_data_url(),
        item_id: "0:1".to_string(),
    });

    let plan = resolve_plan(&request);
    assert_eq!(plan.sheet_count, 2);

    let artifacts_json = create_artifacts_json(&serde_json::to_string(&request).unwrap()).unwrap();
    let artifacts = serde_json::from_str::<Value>(&artifacts_json).unwrap();
    let files = artifacts["files"].as_array().unwrap();
    let manifest_file = files
        .iter()
        .find(|file| file["filename"] == "manifest.json")
        .unwrap();
    let manifest =
        serde_json::from_str::<Value>(manifest_file["content"].as_str().unwrap()).unwrap();

    assert!(
        files
            .iter()
            .any(|file| { file["filename"] == "print/sheet-1-x2.pdf" && file["isBinary"] == true })
    );
    assert!(
        files
            .iter()
            .any(|file| { file["filename"] == "cut/sheet-1-x2.pdf" && file["isBinary"] == true })
    );
    assert!(
        !files
            .iter()
            .any(|file| file["filename"] == "print/sheet-2.pdf")
    );
    assert_eq!(manifest["sheetCount"], 1);
    assert_eq!(manifest["totalSheetCount"], 2);
    assert_eq!(manifest["sheets"][0]["repeatCount"], 2);
    assert_eq!(manifest["sheets"][0]["printFile"], "print/sheet-1-x2.pdf");
    assert_eq!(manifest["sheets"][0]["cutFile"], "cut/sheet-1-x2.pdf");
}

#[test]
fn fills_last_row_in_single_cut_rows_mode() {
    // 3 items, media 110mm, spacing 4mm: rotating 50x30mm items creates
    // one complete row of 3 instead of padding a two-item row to 4.
    let mut item = build_item("sticker");
    item.width_mm = 50.0;
    item.height_mm = 30.0;
    item.quantity = 3;
    let mut settings = build_settings();
    settings.media_width_mm = 110.0;
    settings.min_spacing_mm = 4.0;
    settings.fill_rows = true;
    settings.packing_mode = StickerPackingMode::SingleCutRows;

    let request = build_request(vec![item], settings);
    let result = resolve_plan(&request);
    let total_placements: usize = result.sheets.iter().map(|s| s.placements.len()).sum();
    assert_eq!(total_placements, 3);
    assert!(
        result.sheets[0]
            .placements
            .iter()
            .all(|placement| placement.rotation_degrees == 90)
    );
}

#[test]
fn rotates_single_cut_items_only_when_it_reduces_run_height() {
    let mut wide = build_item("wide");
    wide.width_mm = 90.0;
    wide.height_mm = 30.0;
    wide.quantity = 3;
    let mut tall = build_item("tall");
    tall.width_mm = 30.0;
    tall.height_mm = 90.0;
    tall.quantity = 3;
    let mut settings = build_settings();
    settings.fill_rows = false;
    settings.media_width_mm = 110.0;
    settings.packing_mode = StickerPackingMode::SingleCutRows;

    let wide_plan = resolve_plan(&build_request(vec![wide], settings.clone()));
    let tall_plan = resolve_plan(&build_request(vec![tall], settings));

    assert!(
        wide_plan.sheets[0]
            .placements
            .iter()
            .all(|placement| placement.rotation_degrees == 90)
    );
    assert!(
        tall_plan.sheets[0]
            .placements
            .iter()
            .all(|placement| placement.rotation_degrees == 0)
    );
    assert_eq!(wide_plan.sheets[0].export_height_mm, 90.0);
    assert_eq!(tall_plan.sheets[0].export_height_mm, 90.0);
}

#[test]
fn rotates_grouped_part_items_to_backfill_shelf_gaps() {
    let items = [("anchor", 170.0, 100.0), ("rotated-fill", 80.0, 40.0)]
        .into_iter()
        .map(|(id, width_mm, height_mm)| {
            let mut item = build_item(id);
            item.width_mm = width_mm;
            item.height_mm = height_mm;
            item
        })
        .collect::<Vec<_>>();
    let mut settings = build_settings();
    settings.group_max_distinct_items = 2;
    settings.media_width_mm = 210.0;
    settings.min_spacing_mm = 0.0;
    settings.packing_mode = StickerPackingMode::GroupedParts;
    let plan = resolve_plan(&build_request(items, settings));
    let rotated_fill = plan.sheets[0]
        .placements
        .iter()
        .find(|placement| placement.item_id == "rotated-fill")
        .expect("expected rotated-fill placement");

    assert_eq!(rotated_fill.rotation_degrees, 90);
    assert_eq!(rotated_fill.x_mm, 170.0);
    assert_eq!(rotated_fill.y_mm, 0.0);
    assert_eq!(rotated_fill.width_mm, 40.0);
    assert_eq!(rotated_fill.height_mm, 80.0);
}
