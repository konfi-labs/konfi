use crate::common::points_to_mm;
use crate::imposition::layout::{
    back_page_transform, build_preview_sheet_arrangements, calculate_offsets, calculate_positions,
    dimension_points_json, has_back_side,
};
use crate::imposition::models::{BleedType, LayoutType, parse_request_json};
use crate::imposition::workflow::ImpositionWorkflow;
use serde_json::{Value, json};

pub fn resolve_preview_json(request_json: &str) -> Result<String, String> {
    let input = parse_request_json(request_json)?;
    let workflow = ImpositionWorkflow::from_input(&input)?;
    let positions = calculate_positions(&workflow);
    let (total_width, total_height, x_offset, y_offset) = calculate_offsets(&workflow);

    let base_slots = positions
        .iter()
        .map(|position| {
            build_slot_json(
                &workflow,
                position.index,
                position.col,
                position.row,
                position.x + x_offset,
                position.y + y_offset,
            )
        })
        .collect::<Vec<_>>();

    let (front_arrangement, back_arrangement) = build_preview_sheet_arrangements(&workflow);
    let front_slots = base_slots
        .iter()
        .enumerate()
        .map(|(index, slot)| with_page_assignment(slot.clone(), front_arrangement[index]))
        .collect::<Vec<_>>();

    let back_available = has_back_side(&workflow);
    let back_slots = if let Some(back_arrangement) = back_arrangement {
        positions
            .iter()
            .enumerate()
            .map(|(index, position)| {
                let (x_points, y_points) = resolve_back_side_slot_position(
                    &workflow,
                    position.x + x_offset,
                    position.y + y_offset,
                );
                let slot = build_slot_json(
                    &workflow,
                    position.index,
                    position.col,
                    position.row,
                    x_points,
                    y_points,
                );
                with_page_assignment(slot, back_arrangement[index])
            })
            .collect::<Vec<_>>()
    } else {
        Vec::new()
    };

    let response = json!({
        "previewMode": "geometry",
        "rendering": "headless-json",
        "sourceFileAttached": false,
        "matchesFinalRender": false,
        "requiresSourceFileForRender": true,
        "resolvedWorkflow": {
            "sheetSizeMm": {
                "width": points_to_mm(workflow.sheet_width),
                "height": points_to_mm(workflow.sheet_height),
            },
            "itemSizeMm": {
                "width": points_to_mm(workflow.item_width),
                "height": points_to_mm(workflow.item_height),
            },
            "numItemsHorizontal": workflow.num_items_horizontal,
            "numItemsVertical": workflow.num_items_vertical,
            "automaticSheetOrientation": workflow.automatic_sheet_orientation,
            "automaticItemOrientation": workflow.automatic_item_orientation,
            "automaticNumberOfHorizontalItems": workflow.automatic_number_of_horizontal_items,
            "automaticNumberOfVerticalItems": workflow.automatic_number_of_vertical_items,
            "automaticSpacingHorizontal": workflow.automatic_spacing_horizontal,
            "automaticSpacingVertical": workflow.automatic_spacing_vertical,
            "cropMarks": workflow.crop_marks,
            "bleedType": bleed_type_name(&workflow.bleed_type),
            "layoutType": layout_type_name(&workflow.layout_type),
            "spacingHorizontalMm": workflow.spacing_horizontal,
            "spacingVerticalMm": workflow.spacing_vertical,
            "bleedMm": points_to_mm(workflow.bleed),
            "pagesPerSignature": workflow.pages_per_signature,
            "bindingEdge": workflow.binding_edge,
            "duplexMode": workflow.duplex_mode,
            "backPageRotation": workflow.back_page_rotation,
            "frontBackAlignment": workflow.front_back_alignment,
            "mirrorBack": workflow.mirror_back,
        },
        "sheet": dimension_points_json(workflow.sheet_width, workflow.sheet_height),
        "item": dimension_points_json(workflow.item_width, workflow.item_height),
        "layout": {
            "type": layout_type_name(&workflow.layout_type),
            "numItemsHorizontal": workflow.num_items_horizontal,
            "numItemsVertical": workflow.num_items_vertical,
            "slotCount": base_slots.len(),
            "totalWidthPoints": round_points(total_width),
            "totalHeightPoints": round_points(total_height),
            "totalWidthMm": points_to_mm(total_width),
            "totalHeightMm": points_to_mm(total_height),
            "offsetXPoints": round_points(x_offset),
            "offsetYPoints": round_points(y_offset),
            "offsetXMm": points_to_mm(x_offset),
            "offsetYMm": points_to_mm(y_offset),
        },
        "pendingSourceDimensions": {
            "fileDimensionsRequired": true,
            "scalingStrategy": "pending_source_dimensions",
            "bleedApplication": "pending_source_dimensions",
        },
        "displayPreview": {
            "mode": "headless",
            "front": {
                "side": "front",
                "slots": front_slots,
            },
            "back": {
                "available": back_available,
                "side": "back",
                "transform": if back_available {
                    back_page_transform(workflow.back_page_rotation.as_deref(), workflow.mirror_back)
                } else {
                    String::new()
                },
                "mirrorBack": workflow.mirror_back,
                "frontBackAlignment": workflow.front_back_alignment,
                "slots": back_slots,
            }
        },
        "slots": base_slots,
    });

    serde_json::to_string(&response)
        .map_err(|error| format!("Failed to serialize imposition preview: {error}"))
}

fn build_slot_json(
    workflow: &ImpositionWorkflow,
    index: usize,
    col: usize,
    row: usize,
    x_points: f64,
    y_points: f64,
) -> Value {
    json!({
        "index": index,
        "row": row,
        "col": col,
        "xPoints": round_points(x_points),
        "yPoints": round_points(y_points),
        "xMm": points_to_mm(x_points),
        "yMm": points_to_mm(y_points),
        "widthPoints": round_points(workflow.item_width),
        "heightPoints": round_points(workflow.item_height),
        "widthMm": points_to_mm(workflow.item_width),
        "heightMm": points_to_mm(workflow.item_height),
        "pageIndex": index,
        "pageLabel": Value::Null,
    })
}

fn resolve_back_side_slot_position(
    workflow: &ImpositionWorkflow,
    x_points: f64,
    y_points: f64,
) -> (f64, f64) {
    if !workflow.front_back_alignment || matches!(workflow.layout_type, LayoutType::Booklet) {
        return (x_points, y_points);
    }

    match workflow.duplex_mode.as_deref() {
        Some("DUPLEX_LONG_EDGE") => (
            workflow.sheet_width - x_points - workflow.item_width,
            y_points,
        ),
        Some("DUPLEX_SHORT_EDGE") => (
            x_points,
            workflow.sheet_height - y_points - workflow.item_height,
        ),
        _ => (x_points, y_points),
    }
}

fn with_page_assignment(mut slot: Value, page_index: Option<usize>) -> Value {
    if let Some(object) = slot.as_object_mut() {
        object.insert(
            "pageIndex".to_string(),
            page_index
                .map(|page_index| Value::from(page_index as u64))
                .unwrap_or(Value::Null),
        );
        object.insert(
            "pageLabel".to_string(),
            Value::String(
                page_index
                    .map(|page_index| (page_index + 1).to_string())
                    .unwrap_or_default(),
            ),
        );
    }
    slot
}

fn bleed_type_name(value: &BleedType) -> &'static str {
    match value {
        BleedType::NoBleed => "NO_BLEED",
        BleedType::BleedIncluded => "BLEED_INCLUDED",
        BleedType::OnePointFiveMmScale => "ONE_POINT_FIVE_MM_SCALE",
        BleedType::TwoMmMirror => "TWO_MM_MIRROR",
        BleedType::DifferentialDiffusion => "DIFFERENTIAL_DIFFUSION",
        BleedType::ContentAwareFast => "CONTENT_AWARE_FAST",
    }
}

fn layout_type_name(value: &LayoutType) -> &'static str {
    match value {
        LayoutType::StepAndRepeat => "STEP_AND_REPEAT",
        LayoutType::Booklet => "BOOKLET",
        LayoutType::NUp => "N_UP",
        LayoutType::CutStack => "CUT_STACK",
        LayoutType::Shuffle => "SHUFFLE",
        LayoutType::DutchCut => "DUTCH_CUT",
    }
}

fn round_points(value: f64) -> f64 {
    (value * 1000.0).round() / 1000.0
}
