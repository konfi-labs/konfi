use lopdf::{Document, Object, ObjectId, Stream, dictionary};
use serde_json::{Value, json};
use wasm::{
    get_pdf_page_count, impose_pdf_file, inspect_pdf_preflight, resolve_imposition_preview,
};

use base64::Engine as _;
use image::{ImageBuffer, Rgba};

fn real(value: f64) -> Object {
    Object::Real(value as f32)
}

fn mm_to_points(value: f64) -> f64 {
    value * 72.0 / 25.4
}

fn build_single_page_pdf(width_points: f64, height_points: f64, with_filespec: bool) -> Vec<u8> {
    let mut document = Document::with_version("1.5");
    let pages_id = document.new_object_id();
    let resources_id = document.add_object(dictionary! {});
    let content_id = document.add_object(Stream::new(dictionary! {}, Vec::new()));
    let page_id = document.add_object(dictionary! {
        "Type" => Object::Name(b"Page".to_vec()),
        "Parent" => Object::Reference(pages_id),
        "Resources" => Object::Reference(resources_id),
        "Contents" => Object::Reference(content_id),
        "MediaBox" => vec![real(0.0), real(0.0), real(width_points), real(height_points)],
    });

    document.objects.insert(
        pages_id,
        Object::Dictionary(dictionary! {
            "Type" => Object::Name(b"Pages".to_vec()),
            "Kids" => vec![Object::Reference(page_id)],
            "Count" => 1_i64,
        }),
    );

    if with_filespec {
        document.add_object(dictionary! {
            "Type" => Object::Name(b"Filespec".to_vec()),
            "F" => Object::string_literal("external.txt"),
        });
    }

    let catalog_id = document.add_object(dictionary! {
        "Type" => Object::Name(b"Catalog".to_vec()),
        "Pages" => Object::Reference(pages_id),
    });
    document.trailer.set("Root", Object::Reference(catalog_id));

    let mut bytes = Vec::new();
    document
        .save_to(&mut bytes)
        .expect("synthetic PDF should serialize");
    bytes
}

fn build_multi_page_pdf(page_count: usize) -> Vec<u8> {
    let mut document = Document::with_version("1.5");
    let pages_id = document.new_object_id();
    let resources_id = document.add_object(dictionary! {});
    let content_id = document.add_object(Stream::new(dictionary! {}, Vec::new()));
    let page_ids = (0..page_count)
        .map(|_| {
            document.add_object(dictionary! {
                "Type" => Object::Name(b"Page".to_vec()),
                "Parent" => Object::Reference(pages_id),
                "Resources" => Object::Reference(resources_id),
                "Contents" => Object::Reference(content_id),
                "MediaBox" => vec![
                    real(0.0),
                    real(0.0),
                    real(mm_to_points(210.0)),
                    real(mm_to_points(297.0)),
                ],
            })
        })
        .collect::<Vec<_>>();

    document.objects.insert(
        pages_id,
        Object::Dictionary(dictionary! {
            "Type" => Object::Name(b"Pages".to_vec()),
            "Kids" => page_ids
                .iter()
                .copied()
                .map(Object::Reference)
                .collect::<Vec<_>>(),
            "Count" => page_count as i64,
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
        .expect("synthetic PDF should serialize");
    bytes
}

fn media_box(document: &Document, page_id: ObjectId) -> Vec<Object> {
    document
        .get_object(page_id)
        .expect("page should exist")
        .as_dict()
        .expect("page should be a dictionary")
        .get(b"MediaBox")
        .expect("page should have a media box")
        .as_array()
        .expect("media box should be an array")
        .to_vec()
}

fn json_number(value: &Value) -> f64 {
    value.as_f64().expect("value should be a number")
}

fn rgba_png_bytes(pixels: &[[u8; 4]], width: u32, height: u32) -> Vec<u8> {
    let image = ImageBuffer::<Rgba<u8>, _>::from_raw(
        width,
        height,
        pixels
            .iter()
            .flat_map(|pixel| pixel.iter().copied())
            .collect::<Vec<_>>(),
    )
    .expect("test RGBA image dimensions should match pixel data");
    let mut bytes = Vec::new();
    image
        .write_to(
            &mut std::io::Cursor::new(&mut bytes),
            image::ImageFormat::Png,
        )
        .expect("PNG encode failed in test");
    bytes
}

fn cmyk_jpeg_bytes(pixel: [u8; 4]) -> Vec<u8> {
    assert_eq!(pixel, [0, 0, 0, 0]);
    base64::engine::general_purpose::STANDARD
        .decode(
            "/9j/7gAOQWRvYmUAZAAAAAAA/9sAQwAIBgYHBgUIBwcHCQkICgwUDQwLCwwZEhMPFB0aHx4d\
             GhwcICQuJyAiLCMcHCg3KSwwMTQ0NB8nOT04MjwuMzQy/8AAFAgAAQABBEMRAE0RAFkRAEsRAP/E\
             AB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAE\
             EQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZH\
             SElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1\
             tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/aAA4EQwBNAFkASwAA\
             PwD3+vf69/r3+v/Z",
        )
        .expect("CMYK JPEG fixture should decode from base64")
}

fn first_image_stream(document: &Document) -> (&lopdf::Dictionary, Vec<u8>) {
    for object in document.objects.values() {
        let Object::Stream(stream) = object else {
            continue;
        };
        let Ok(Object::Name(subtype)) = stream.dict.get(b"Subtype") else {
            continue;
        };
        if subtype.as_slice() != b"Image" {
            continue;
        }

        let bytes = stream
            .decompressed_content()
            .unwrap_or_else(|_| stream.content.clone());
        return (&stream.dict, bytes);
    }

    panic!("expected imposed PDF to contain an image stream");
}

#[test]
fn pdf_page_count_uses_catalog_page_count() {
    let pdf_bytes = build_multi_page_pdf(7);

    let page_count = get_pdf_page_count(&pdf_bytes).expect("page count should be detected");

    assert_eq!(page_count, "7");
}

#[test]
fn pdf_preflight_reports_embedded_filespec_issues() {
    let pdf_bytes = build_single_page_pdf(mm_to_points(90.0), mm_to_points(120.0), true);

    let issues_json = inspect_pdf_preflight(&pdf_bytes).expect("preflight should succeed");
    let issues: Value =
        serde_json::from_str(&issues_json).expect("preflight response should be JSON");
    let rules = issues
        .as_array()
        .expect("issues should be an array")
        .iter()
        .filter_map(|issue| issue.get("rule").and_then(Value::as_str))
        .collect::<Vec<_>>();

    assert!(rules.contains(&"Preflight::Rules::NoFilespecs"));
}

#[test]
fn preview_resolves_geometry_and_display_metadata() {
    let request = json!({
        "data": {
            "customSheetSizeWidth": 210,
            "customSheetSizeHeight": 297,
            "customItemSizeWidth": 90,
            "customItemSizeHeight": 120,
            "automaticSheetOrientation": false,
            "automaticItemOrientation": false,
            "automaticNumberOfHorizontalItems": false,
            "automaticNumberOfVerticalItems": false,
            "numItemsHorizontal": 2,
            "numItemsVertical": 2,
            "automaticSpacingHorizontal": false,
            "automaticSpacingVertical": false,
            "spacingHorizontal": "10",
            "spacingVertical": "5",
            "bleed": 3,
            "bleedType": "NO_BLEED",
            "cropMarks": true,
            "layout": "STEP_AND_REPEAT"
        }
    });

    let preview_json = resolve_imposition_preview(&request.to_string())
        .expect("preview resolution should succeed");
    let preview: Value =
        serde_json::from_str(&preview_json).expect("preview response should be JSON");

    assert_eq!(preview["previewMode"], "geometry");
    assert_eq!(preview["rendering"], "headless-json");
    assert_eq!(preview["resolvedWorkflow"]["cropMarks"], true);
    assert_eq!(preview["layout"]["slotCount"], 4);
    assert_eq!(json_number(&preview["layout"]["offsetXMm"]), 10.0);
    assert_eq!(json_number(&preview["layout"]["offsetYMm"]), 26.0);
    assert_eq!(json_number(&preview["slots"][0]["xMm"]), 10.0);
    assert_eq!(json_number(&preview["slots"][0]["yMm"]), 26.0);
    assert_eq!(
        preview["displayPreview"]["front"]["slots"][0]["pageLabel"],
        "1"
    );
    assert_eq!(preview["displayPreview"]["back"]["available"], false);
}

#[test]
fn preview_uses_shuffle_arrangement_labels_in_column_major_slot_order() {
    let request = json!({
        "data": {
            "customSheetSizeWidth": 210,
            "customSheetSizeHeight": 297,
            "customItemSizeWidth": 90,
            "customItemSizeHeight": 120,
            "automaticSheetOrientation": false,
            "automaticItemOrientation": false,
            "automaticNumberOfHorizontalItems": false,
            "automaticNumberOfVerticalItems": false,
            "numItemsHorizontal": 2,
            "numItemsVertical": 2,
            "automaticSpacingHorizontal": false,
            "automaticSpacingVertical": false,
            "spacingHorizontal": "0",
            "spacingVertical": "0",
            "bleed": 0,
            "bleedType": "NO_BLEED",
            "cropMarks": false,
            "layout": "SHUFFLE"
        }
    });

    let preview_json = resolve_imposition_preview(&request.to_string())
        .expect("preview resolution should succeed");
    let preview: Value =
        serde_json::from_str(&preview_json).expect("preview response should be JSON");

    assert_eq!(
        preview["displayPreview"]["front"]["slots"][0]["pageLabel"],
        "1"
    );
    assert_eq!(
        preview["displayPreview"]["front"]["slots"][1]["pageLabel"],
        "4"
    );
    assert_eq!(
        preview["displayPreview"]["front"]["slots"][2]["pageLabel"],
        "2"
    );
    assert_eq!(
        preview["displayPreview"]["front"]["slots"][3]["pageLabel"],
        "3"
    );
}

#[test]
fn preview_mirrors_long_edge_back_side_positions_and_transform() {
    let request = json!({
        "data": {
            "customSheetSizeWidth": 210,
            "customSheetSizeHeight": 297,
            "customItemSizeWidth": 90,
            "customItemSizeHeight": 120,
            "automaticSheetOrientation": false,
            "automaticItemOrientation": false,
            "automaticNumberOfHorizontalItems": false,
            "automaticNumberOfVerticalItems": false,
            "numItemsHorizontal": 2,
            "numItemsVertical": 1,
            "automaticSpacingHorizontal": false,
            "automaticSpacingVertical": false,
            "spacingHorizontal": "0",
            "spacingVertical": "",
            "bleed": 0,
            "bleedType": "NO_BLEED",
            "cropMarks": false,
            "layout": "N_UP",
            "duplexMode": "DUPLEX_LONG_EDGE",
            "frontBackAlignment": true,
            "mirrorBack": true,
            "backPageRotation": "ROTATION_90"
        }
    });

    let preview_json = resolve_imposition_preview(&request.to_string())
        .expect("preview resolution should succeed");
    let preview: Value =
        serde_json::from_str(&preview_json).expect("preview response should be JSON");

    assert_eq!(preview["displayPreview"]["back"]["available"], true);
    assert_eq!(
        preview["displayPreview"]["back"]["transform"],
        "rotate(90deg) scaleX(-1)"
    );
    assert_eq!(
        json_number(&preview["displayPreview"]["front"]["slots"][0]["xMm"]),
        15.0
    );
    assert_eq!(
        json_number(&preview["displayPreview"]["back"]["slots"][0]["xMm"]),
        105.0
    );
    assert_eq!(
        preview["displayPreview"]["back"]["slots"][0]["pageLabel"],
        "3"
    );
}

#[test]
fn pdf_imposition_produces_a_sheet_sized_pdf() {
    let source_pdf = build_single_page_pdf(mm_to_points(90.0), mm_to_points(120.0), false);
    let request = json!({
        "customSheetSizeWidth": 210,
        "customSheetSizeHeight": 297,
        "customItemSizeWidth": 90,
        "customItemSizeHeight": 120,
        "automaticSheetOrientation": false,
        "automaticItemOrientation": false,
        "automaticNumberOfHorizontalItems": false,
        "automaticNumberOfVerticalItems": false,
        "numItemsHorizontal": 2,
        "numItemsVertical": 2,
        "automaticSpacingHorizontal": false,
        "automaticSpacingVertical": false,
        "spacingHorizontal": "10",
        "spacingVertical": "5",
        "bleed": 0,
        "bleedType": "NO_BLEED",
        "cropMarks": false,
        "layout": "STEP_AND_REPEAT"
    });

    let imposed_bytes = impose_pdf_file(&request.to_string(), &source_pdf, "application/pdf")
        .expect("imposition should succeed");
    let imposed_document = Document::load_mem(&imposed_bytes).expect("imposed PDF should parse");
    let pages = imposed_document.get_pages();

    assert_eq!(pages.len(), 1);

    let first_page_id = *pages
        .values()
        .next()
        .expect("imposed PDF should contain a page");
    let media_box = media_box(&imposed_document, first_page_id);
    let width = media_box[2]
        .as_float()
        .expect("media box width should be numeric") as f64;
    let height = media_box[3]
        .as_float()
        .expect("media box height should be numeric") as f64;

    assert!((width - mm_to_points(210.0)).abs() < 0.05);
    assert!((height - mm_to_points(297.0)).abs() < 0.05);
}

#[test]
fn image_imposition_composites_transparent_png_pixels_over_white() {
    let source_png = rgba_png_bytes(&[[0, 0, 0, 0], [255, 0, 0, 255]], 2, 1);
    let request = json!({
        "customSheetSizeWidth": 20,
        "customSheetSizeHeight": 20,
        "customItemSizeWidth": 2,
        "customItemSizeHeight": 1,
        "automaticSheetOrientation": false,
        "automaticItemOrientation": false,
        "automaticNumberOfHorizontalItems": false,
        "automaticNumberOfVerticalItems": false,
        "numItemsHorizontal": 1,
        "numItemsVertical": 1,
        "automaticSpacingHorizontal": false,
        "automaticSpacingVertical": false,
        "spacingHorizontal": "0",
        "spacingVertical": "0",
        "bleed": 0,
        "bleedType": "NO_BLEED",
        "cropMarks": false,
        "layout": "STEP_AND_REPEAT"
    });

    let imposed_bytes = impose_pdf_file(&request.to_string(), &source_png, "image/png")
        .expect("PNG imposition should succeed");
    let imposed_document = Document::load_mem(&imposed_bytes).expect("imposed PDF should parse");
    let (image_dict, image_bytes) = first_image_stream(&imposed_document);

    assert_eq!(
        image_dict
            .get(b"ColorSpace")
            .expect("image should declare a color space")
            .as_name()
            .expect("color space should be a name"),
        b"DeviceRGB"
    );
    assert_eq!(image_bytes, vec![255, 255, 255, 255, 0, 0]);
}

#[test]
fn image_imposition_normalizes_cmyk_jpeg_to_rgb_pixels() {
    let source_jpeg = cmyk_jpeg_bytes([0, 0, 0, 0]);
    let request = json!({
        "customSheetSizeWidth": 20,
        "customSheetSizeHeight": 20,
        "customItemSizeWidth": 1,
        "customItemSizeHeight": 1,
        "automaticSheetOrientation": false,
        "automaticItemOrientation": false,
        "automaticNumberOfHorizontalItems": false,
        "automaticNumberOfVerticalItems": false,
        "numItemsHorizontal": 1,
        "numItemsVertical": 1,
        "automaticSpacingHorizontal": false,
        "automaticSpacingVertical": false,
        "spacingHorizontal": "0",
        "spacingVertical": "0",
        "bleed": 0,
        "bleedType": "NO_BLEED",
        "cropMarks": false,
        "layout": "STEP_AND_REPEAT"
    });

    let imposed_bytes = impose_pdf_file(&request.to_string(), &source_jpeg, "image/jpeg")
        .expect("JPEG imposition should succeed");
    let imposed_document = Document::load_mem(&imposed_bytes).expect("imposed PDF should parse");
    let (image_dict, image_bytes) = first_image_stream(&imposed_document);

    assert_eq!(
        image_dict
            .get(b"ColorSpace")
            .expect("image should declare a color space")
            .as_name()
            .expect("color space should be a name"),
        b"DeviceRGB"
    );
    assert!(image_dict.get(b"Filter").is_err());
    assert_eq!(image_bytes, vec![255, 255, 255]);
}
