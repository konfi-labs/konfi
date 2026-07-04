use crate::common::{round_to, truncate_to};
use crate::preflight::issue::{Issue, make_issue};
use crate::preflight::matrix::Matrix;
use crate::preflight::pdf_utils::{
    as_f64, as_i64, as_name_string, deref_object, dict_get, dict_get_name_key,
    get_dict_from_object, inherited_page_dict, is_rgb_colorspace,
    lookup_xobject_stream_from_resources, page_ids,
};
use lopdf::content::Content;
use lopdf::{Dictionary, Document, Object, ObjectId};
use serde_json::json;
use std::collections::HashSet;

fn round_ppi(value: f64) -> f64 {
    round_to(value, 3)
}

fn round_coordinate(value: f64) -> f64 {
    round_to(value, 3)
}

fn truncate_ppi_coordinate(value: f64) -> f64 {
    truncate_to(value, 5)
}

fn ruby_ppi_string(value: f64) -> String {
    let rounded = round_ppi(value);
    let abs_value = rounded.abs();
    let sign = if rounded < 0.0 { "-" } else { "" };
    let plain = if abs_value.fract() == 0.0 {
        format!("{abs_value:.0}")
    } else {
        let mut text = format!("{abs_value:.3}");
        while text.contains('.') && text.ends_with('0') {
            text.pop();
        }
        if text.ends_with('.') {
            text.pop();
        }
        text
    };

    let mut parts = plain.split('.');
    let int_part = parts.next().unwrap_or("0");
    let frac_part = parts.next().unwrap_or("");
    let exponent = int_part.len();
    let mantissa_digits = format!("{int_part}{frac_part}");
    format!("{sign}0.{mantissa_digits}e{exponent}")
}

fn font_is_embedded(document: &Document, font_dict: &Dictionary) -> bool {
    if let Some(subtype) = dict_get(font_dict, b"Subtype").and_then(as_name_string) {
        if subtype == "Type3" {
            return true;
        }
        if subtype == "Type0" {
            if let Some(descendants_object) = dict_get(font_dict, b"DescendantFonts") {
                if let Some(Object::Array(descendants)) = deref_object(document, descendants_object)
                {
                    return descendants.iter().all(|descendant| {
                        get_dict_from_object(document, descendant)
                            .map(|dict| font_is_embedded(document, &dict))
                            .unwrap_or(false)
                    });
                }
            }
        }
    }

    if let Some(descriptor_object) = dict_get(font_dict, b"FontDescriptor") {
        if let Some(descriptor) = get_dict_from_object(document, descriptor_object) {
            return descriptor.has(b"FontFile")
                || descriptor.has(b"FontFile2")
                || descriptor.has(b"FontFile3");
        }
    }

    false
}

fn detect_embedded_font_issues(document: &Document, page_dict: &Dictionary) -> Vec<Issue> {
    let mut issues = Vec::new();
    let Some(resources) = inherited_page_dict(document, page_dict, b"Resources") else {
        return issues;
    };
    let Some(fonts) =
        dict_get(&resources, b"Font").and_then(|obj| get_dict_from_object(document, obj))
    else {
        return issues;
    };

    for (_, font_object) in &fonts {
        let Some(font_dict) = get_dict_from_object(document, font_object) else {
            continue;
        };
        if font_is_embedded(document, &font_dict) {
            continue;
        }
        let base_font = dict_get(&font_dict, b"BaseFont")
            .and_then(as_name_string)
            .unwrap_or_else(|| "Unknown".to_string());
        issues.push(make_issue(
            "Font not embedded",
            "Preflight::Rules::OnlyEmbeddedFonts",
            json!({"base_font": base_font}),
        ));
    }

    issues
}

fn count_filespec_dicts(document: &Document) -> usize {
    document
        .objects
        .values()
        .filter_map(|object| get_dict_from_object(document, object))
        .filter(|dict| {
            dict_get(dict, b"Type")
                .and_then(as_name_string)
                .map(|name| name == "Filespec" || name == "F")
                .unwrap_or(false)
        })
        .count()
}

fn detect_filespec_issues(document: &Document) -> Vec<Issue> {
    let filespecs_count = count_filespec_dicts(document);
    if filespecs_count == 0 {
        return Vec::new();
    }
    vec![make_issue(
        "File uses at least 1 Filespec to refer to an external file",
        "Preflight::Rules::NoFilespecs",
        json!({"filespecs_count": filespecs_count}),
    )]
}

fn rgb_issue_from_operands(page_number: u32, operands: &[Object]) -> Issue {
    let red = operands.first().and_then(as_f64);
    let green = operands.get(1).and_then(as_f64);
    let blue = operands.get(2).and_then(as_f64);
    let mut attributes = serde_json::Map::new();
    attributes.insert("page".to_string(), json!(page_number));
    if let Some(value) = red {
        attributes.insert("red".to_string(), json!(value));
    }
    if let Some(value) = green {
        attributes.insert("green".to_string(), json!(value));
    }
    if let Some(value) = blue {
        attributes.insert("blue".to_string(), json!(value));
    }
    make_issue(
        "RGB color detected",
        "Preflight::Rules::NoRgb",
        serde_json::Value::Object(attributes),
    )
}

fn matrix_from_operands(operands: &[Object]) -> Option<Matrix> {
    Some(Matrix {
        a: operands.first().and_then(as_f64)?,
        b: operands.get(1).and_then(as_f64)?,
        c: operands.get(2).and_then(as_f64)?,
        d: operands.get(3).and_then(as_f64)?,
        e: operands.get(4).and_then(as_f64)?,
        f: operands.get(5).and_then(as_f64)?,
    })
}

fn ppi_issue(
    page_number: u32,
    ctm: Matrix,
    sample_width: i64,
    sample_height: i64,
) -> Option<Issue> {
    let device_width = ctm.image_width();
    let device_height = ctm.image_height();
    if device_width <= 0.0 || device_height <= 0.0 {
        return None;
    }

    let horizontal_ppi = (sample_width as f64) * 72.0 / device_width;
    let vertical_ppi = (sample_height as f64) * 72.0 / device_height;
    let rounded_horizontal_ppi = round_ppi(horizontal_ppi);
    let rounded_vertical_ppi = round_ppi(vertical_ppi);
    if rounded_horizontal_ppi >= 300.0 && rounded_vertical_ppi >= 300.0 {
        return None;
    }

    let top_left = ctm.transform(0.0, 1.0);
    let bottom_left = ctm.transform(0.0, 0.0);
    let bottom_right = ctm.transform(1.0, 0.0);
    let top_right = ctm.transform(1.0, 1.0);

    Some(make_issue(
        "Image with low PPI/DPI",
        "Preflight::Rules::MinPpi",
        json!({
            "page": page_number,
            "horizontal_ppi": ruby_ppi_string(horizontal_ppi),
            "vertical_ppi": ruby_ppi_string(vertical_ppi),
            "top_left": [truncate_ppi_coordinate(top_left.0), truncate_ppi_coordinate(top_left.1)],
            "bottom_left": [truncate_ppi_coordinate(bottom_left.0), truncate_ppi_coordinate(bottom_left.1)],
            "bottom_right": [truncate_ppi_coordinate(bottom_right.0), truncate_ppi_coordinate(bottom_right.1)],
            "top_right": [truncate_ppi_coordinate(top_right.0), truncate_ppi_coordinate(top_right.1)],
        }),
    ))
}

fn bbox_from_object(object: &Object) -> Option<[f64; 4]> {
    let Object::Array(items) = object else {
        return None;
    };
    Some([
        items.first().and_then(as_f64)?,
        items.get(1).and_then(as_f64)?,
        items.get(2).and_then(as_f64)?,
        items.get(3).and_then(as_f64)?,
    ])
}

fn transparency_issue(page_number: u32, ctm: Matrix, bbox: [f64; 4]) -> Issue {
    let [bl_x, bl_y, tr_x, tr_y] = bbox;
    let top_left = ctm.transform(bl_x, tr_y);
    let bottom_left = ctm.transform(bl_x, bl_y);
    let bottom_right = ctm.transform(tr_x, bl_y);
    let top_right = ctm.transform(tr_x, tr_y);

    make_issue(
        "Transparent xobject found",
        "Preflight::Rules::NoTransparency",
        json!({
            "page": page_number,
            "top_left": [round_coordinate(top_left.0), round_coordinate(top_left.1)],
            "bottom_left": [round_coordinate(bottom_left.0), round_coordinate(bottom_left.1)],
            "bottom_right": [round_coordinate(bottom_right.0), round_coordinate(bottom_right.1)],
            "top_right": [round_coordinate(top_right.0), round_coordinate(top_right.1)],
        }),
    )
}

fn process_content_operations(
    document: &Document,
    page_number: u32,
    content: &Content,
    resources: &Dictionary,
    start_ctm: Matrix,
    detect_source_rgb: bool,
    detect_image_rgb: bool,
    detect_ppi: bool,
    detect_transparency: bool,
    seen_color_labels: &mut HashSet<String>,
    issues: &mut Vec<Issue>,
) {
    let mut ctm = start_ctm;
    let mut state_stack: Vec<Matrix> = Vec::new();

    for operation in &content.operations {
        match operation.operator.as_str() {
            "q" => state_stack.push(ctm),
            "Q" => {
                if let Some(previous) = state_stack.pop() {
                    ctm = previous;
                }
            }
            "cm" => {
                if let Some(transform) = matrix_from_operands(&operation.operands) {
                    ctm = ctm.multiply(transform);
                }
            }
            "RG" | "rg" => {
                if detect_source_rgb {
                    issues.push(rgb_issue_from_operands(page_number, &operation.operands));
                }
            }
            "CS" => {
                if detect_source_rgb {
                    if let Some(label) = operation.operands.first().and_then(as_name_string) {
                        if let Some(color_spaces) = dict_get(resources, b"ColorSpace")
                            .and_then(|obj| get_dict_from_object(document, obj))
                        {
                            if let Some(color_space) = dict_get_name_key(&color_spaces, &label)
                                .and_then(|obj| deref_object(document, obj))
                            {
                                if is_rgb_colorspace(document, &color_space)
                                    && seen_color_labels.insert(format!("stroke:{label}"))
                                {
                                    issues.push(make_issue(
                                        "RGB color detected",
                                        "Preflight::Rules::NoRgb",
                                        json!({"page": page_number}),
                                    ));
                                }
                            }
                        }
                    }
                }
            }
            "cs" => {
                if detect_source_rgb {
                    if let Some(label) = operation.operands.first().and_then(as_name_string) {
                        if seen_color_labels.insert(format!("nonstroke:{label}")) {
                            if let Some(color_spaces) = dict_get(resources, b"ColorSpace")
                                .and_then(|obj| get_dict_from_object(document, obj))
                            {
                                if let Some(color_space) = dict_get_name_key(&color_spaces, &label)
                                    .and_then(|obj| deref_object(document, obj))
                                {
                                    if is_rgb_colorspace(document, &color_space) {
                                        issues.push(make_issue(
                                            "RGB color detected",
                                            "Preflight::Rules::NoRgb",
                                            json!({"page": page_number}),
                                        ));
                                    }
                                }
                            }
                        }
                    }
                }
            }
            "Do" => {
                if let Some(label) = operation.operands.first().and_then(as_name_string) {
                    if let Some(stream) =
                        lookup_xobject_stream_from_resources(document, resources, &label)
                    {
                        let subtype = dict_get(&stream.dict, b"Subtype").and_then(as_name_string);
                        match subtype.as_deref() {
                            Some("Image") => {
                                if detect_image_rgb {
                                    if let Some(color_space) = dict_get(&stream.dict, b"ColorSpace")
                                    {
                                        if is_rgb_colorspace(document, color_space) {
                                            issues.push(make_issue(
                                                "RGB image detected",
                                                "Preflight::Rules::NoRgb",
                                                json!({"page": page_number}),
                                            ));
                                        }
                                    }
                                }
                                if detect_ppi {
                                    if let (Some(width), Some(height)) = (
                                        dict_get(&stream.dict, b"Width").and_then(as_i64),
                                        dict_get(&stream.dict, b"Height").and_then(as_i64),
                                    ) {
                                        if let Some(issue) =
                                            ppi_issue(page_number, ctm, width, height)
                                        {
                                            issues.push(issue);
                                        }
                                    }
                                }
                            }
                            Some("Form") => {
                                let form_resources = dict_get(&stream.dict, b"Resources")
                                    .and_then(|obj| get_dict_from_object(document, obj))
                                    .unwrap_or_else(|| resources.clone());
                                let form_matrix = dict_get(&stream.dict, b"Matrix")
                                    .and_then(|obj| deref_object(document, obj))
                                    .and_then(|obj| match obj {
                                        Object::Array(items) => matrix_from_operands(&items),
                                        _ => None,
                                    })
                                    .unwrap_or_else(Matrix::identity);
                                let effective_ctm = ctm.multiply(form_matrix);

                                let group_is_transparent = dict_get(&stream.dict, b"Group")
                                    .and_then(|obj| get_dict_from_object(document, obj))
                                    .and_then(|group| {
                                        dict_get(&group, b"S").and_then(as_name_string)
                                    })
                                    .map(|value| value == "Transparency")
                                    .unwrap_or(false);

                                if detect_transparency && group_is_transparent {
                                    if let Some(bbox) =
                                        dict_get(&stream.dict, b"BBox").and_then(bbox_from_object)
                                    {
                                        issues.push(transparency_issue(
                                            page_number,
                                            effective_ctm,
                                            bbox,
                                        ));
                                    }
                                }

                                let form_content_data = stream
                                    .decompressed_content()
                                    .unwrap_or_else(|_| stream.content.clone());
                                if let Ok(form_content) = Content::decode(&form_content_data) {
                                    process_content_operations(
                                        document,
                                        page_number,
                                        &form_content,
                                        &form_resources,
                                        effective_ctm,
                                        detect_source_rgb,
                                        detect_image_rgb,
                                        detect_ppi,
                                        detect_transparency,
                                        seen_color_labels,
                                        issues,
                                    );
                                }
                            }
                            _ => {}
                        }
                    }
                }
            }
            _ => {}
        }
    }
}

fn detect_rgb_and_ppi_issues(
    document: &Document,
    page_number: u32,
    page_id: ObjectId,
    page_dict: &Dictionary,
) -> Vec<Issue> {
    detect_page_issues_with_mode(
        document,
        page_number,
        page_id,
        page_dict,
        true,
        true,
        true,
        true,
    )
}

fn detect_page_issues_with_mode(
    document: &Document,
    page_number: u32,
    page_id: ObjectId,
    page_dict: &Dictionary,
    detect_source_rgb: bool,
    detect_image_rgb: bool,
    detect_ppi: bool,
    detect_transparency: bool,
) -> Vec<Issue> {
    let mut issues = Vec::new();
    let mut seen_color_labels = HashSet::new();
    let resources =
        inherited_page_dict(document, page_dict, b"Resources").unwrap_or_else(Dictionary::new);

    let content_data = match document.get_page_content(page_id) {
        Ok(data) => data,
        Err(_) => return issues,
    };
    let content = match Content::decode(&content_data) {
        Ok(content) => content,
        Err(_) => return issues,
    };

    process_content_operations(
        document,
        page_number,
        &content,
        &resources,
        Matrix::identity(),
        detect_source_rgb,
        detect_image_rgb,
        detect_ppi,
        detect_transparency,
        &mut seen_color_labels,
        &mut issues,
    );

    issues
}

pub fn collect_structure_issues(document: &Document) -> Vec<Issue> {
    let mut issues = detect_filespec_issues(document);
    let pages = page_ids(document);

    for page_id in pages {
        let Ok(page_object) = document.get_object(page_id) else {
            continue;
        };
        let Some(page_dict) = get_dict_from_object(document, page_object) else {
            continue;
        };

        issues.extend(detect_embedded_font_issues(document, &page_dict));
    }

    issues
}

pub fn collect_page_issues(document: &Document) -> Vec<Issue> {
    let mut issues = Vec::new();
    let pages = page_ids(document);

    for (index, page_id) in pages.into_iter().enumerate() {
        let page_number = (index + 1) as u32;
        let Ok(page_object) = document.get_object(page_id) else {
            continue;
        };
        let Some(page_dict) = get_dict_from_object(document, page_object) else {
            continue;
        };

        issues.extend(detect_rgb_and_ppi_issues(
            document,
            page_number,
            page_id,
            &page_dict,
        ));
    }

    issues
}

pub fn collect_issues(document: &Document) -> Vec<Issue> {
    let mut issues = collect_structure_issues(document);
    issues.extend(collect_page_issues(document));
    issues
}
