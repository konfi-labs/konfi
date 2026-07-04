use crate::sticker_imposition::models::{
    DEFAULT_MANUAL_CUT_MARK_LENGTH_MM, DEFAULT_MEDIA_WIDTH_MM, DEFAULT_MIN_SPACING_MM,
    DEFAULT_OPOS_MARK_CLEARANCE_MM, DEFAULT_OPOS_MARK_SIZE_MM, DEFAULT_OPOS_MARK_SPACING_MM,
    DEFAULT_PART_GAP_MM, DEFAULT_PART_MARGIN_MM, DEFAULT_PREFERRED_SHEET_LENGTH_MM,
    DEFAULT_PREVIEW_MARGIN_MM, DEFAULT_SHEET_GAP_MM, ManualCutMark, OposMarkKind, OposMarkPosition,
    StickerCutShape, StickerItem, StickerPackingMode, StickerPartBoundary, StickerPlacement,
    StickerPlan, StickerRequest, StickerSettings, StickerSheet, parse_request_json,
};
use std::cmp::Ordering;
use std::collections::HashMap;

const A4_WIDTH_MM: f64 = 210.0;
const A3_SHORT_EDGE_MM: f64 = 297.0;
const A3_LONG_EDGE_MM: f64 = 420.0;
const MIN_DIMENSION_MM: f64 = 1.0;
const OPOS_BAR_X_GAP_MM: f64 = 10.0;
const LAYOUT_EPSILON_MM: f64 = 0.001;

const STANDARD_PART_SIZES_MM: [(f64, f64); 4] = [
    (A4_WIDTH_MM, A3_SHORT_EDGE_MM),
    (A3_SHORT_EDGE_MM, A4_WIDTH_MM),
    (A3_SHORT_EDGE_MM, A3_LONG_EDGE_MM),
    (A3_LONG_EDGE_MM, A3_SHORT_EDGE_MM),
];

#[derive(Debug, Clone)]
struct PackedBox {
    height_mm: f64,
    item: StickerItem,
    part_id: Option<String>,
    relative_x_mm: f64,
    relative_y_mm: f64,
    rotation_degrees: u16,
    width_mm: f64,
}

#[derive(Debug, Clone)]
struct PackableBox {
    height_mm: f64,
    id: String,
    placements: Vec<PackedBox>,
    source_order: usize,
    width_mm: f64,
}

#[derive(Debug, Clone)]
struct OrientedStickerItem {
    height_mm: f64,
    item: StickerItem,
    placement_offset_x_mm: f64,
    placement_offset_y_mm: f64,
    rotation_degrees: u16,
    footprint_height_mm: f64,
    footprint_width_mm: f64,
    width_mm: f64,
}

#[derive(Debug, Clone)]
struct PlacedBox {
    box_data: PackableBox,
    x_mm: f64,
    y_mm: f64,
}

#[derive(Debug, Clone)]
struct ShelfCursor {
    height_mm: f64,
    used_width_mm: f64,
    y_mm: f64,
}

#[derive(Debug, Clone)]
struct SheetCursor {
    boxes: Vec<PlacedBox>,
    shelves: Vec<ShelfCursor>,
}

#[derive(Debug, Clone)]
pub(crate) struct Bounds {
    pub max_x_mm: f64,
    pub max_y_mm: f64,
    pub min_x_mm: f64,
    pub min_y_mm: f64,
}

#[derive(Debug, Clone, Copy)]
struct ItemFootprint {
    height_mm: f64,
    placement_offset_x_mm: f64,
    placement_offset_y_mm: f64,
    width_mm: f64,
}

pub fn resolve_preview_json(request_json: &str) -> Result<String, String> {
    let request = parse_request_json(request_json)?;
    let plan = resolve_plan(&request);

    serde_json::to_string(&plan)
        .map_err(|error| format!("Failed to serialize sticker imposition preview: {error}"))
}

pub(crate) fn resolve_plan(request: &StickerRequest) -> StickerPlan {
    let settings = normalize_sticker_settings(&request.settings);
    let normalized_items = normalize_sticker_items(&request.items);
    let boxes = if settings.packing_mode == StickerPackingMode::GroupedParts {
        build_grouped_part_boxes(&normalized_items, &settings)
    } else {
        build_single_cut_boxes(&normalized_items, &settings)
    };
    let packed_sheets = pack_boxes_on_sheets(&boxes, &settings);
    let sheets = packed_sheets
        .iter()
        .enumerate()
        .map(|(index, sheet)| build_imposed_sheet(sheet, index, &settings))
        .collect::<Vec<_>>();
    let used_area_mm2 = sheets
        .iter()
        .flat_map(|sheet| sheet.placements.iter())
        .map(|placement| placement.width_mm * placement.height_mm)
        .sum::<f64>();
    let total_area_mm2 = sheets
        .iter()
        .map(|sheet| sheet.media_width_mm * sheet.preview_length_mm)
        .sum::<f64>();
    let item_count = sheets
        .iter()
        .map(|sheet| sheet.placements.len())
        .sum::<usize>();

    StickerPlan {
        item_count,
        media_width_mm: settings.media_width_mm,
        packing_mode: settings.packing_mode,
        sheet_count: sheets.len(),
        sheets,
        total_area_mm2,
        used_area_mm2,
    }
}

fn normalize_sticker_settings(settings: &StickerSettings) -> StickerSettings {
    StickerSettings {
        allow_long_sheets: settings.allow_long_sheets,
        fill_rows: settings.fill_rows,
        group_max_distinct_items: settings.group_max_distinct_items.max(1),
        manual_cut_mark_length_mm: positive_or_default(
            settings.manual_cut_mark_length_mm,
            DEFAULT_MANUAL_CUT_MARK_LENGTH_MM,
        )
        .max(1.0),
        manual_cut_marks_enabled: settings.manual_cut_marks_enabled,
        media_width_mm: positive_or_default(settings.media_width_mm, DEFAULT_MEDIA_WIDTH_MM),
        min_spacing_mm: finite_or_default(settings.min_spacing_mm, DEFAULT_MIN_SPACING_MM).max(0.0),
        opos_mark_clearance_mm: finite_or_default(
            settings.opos_mark_clearance_mm,
            DEFAULT_OPOS_MARK_CLEARANCE_MM,
        )
        .max(0.0),
        opos_mark_margin_mm: settings.opos_mark_margin_mm.max(0.0),
        opos_mark_size_mm: positive_or_default(
            settings.opos_mark_size_mm,
            DEFAULT_OPOS_MARK_SIZE_MM,
        )
        .max(1.0),
        opos_mark_spacing_mm: positive_or_default(
            settings.opos_mark_spacing_mm,
            DEFAULT_OPOS_MARK_SPACING_MM,
        )
        .max(10.0),
        opos_marks_enabled: settings.opos_marks_enabled,
        packing_mode: settings.packing_mode.clone(),
        part_gap_mm: finite_or_default(settings.part_gap_mm, DEFAULT_PART_GAP_MM).max(0.0),
        part_margin_mm: finite_or_default(settings.part_margin_mm, DEFAULT_PART_MARGIN_MM).max(0.0),
        preferred_sheet_length_mm: positive_or_default(
            settings.preferred_sheet_length_mm,
            DEFAULT_PREFERRED_SHEET_LENGTH_MM,
        ),
        preview_margin_mm: finite_or_default(settings.preview_margin_mm, DEFAULT_PREVIEW_MARGIN_MM)
            .max(0.0),
        sheet_gap_mm: finite_or_default(settings.sheet_gap_mm, DEFAULT_SHEET_GAP_MM).max(0.0),
    }
}

fn normalize_sticker_items(items: &[StickerItem]) -> Vec<StickerItem> {
    items
        .iter()
        .filter(|item| {
            item.width_mm.is_finite()
                && item.height_mm.is_finite()
                && item.width_mm >= MIN_DIMENSION_MM
                && item.height_mm >= MIN_DIMENSION_MM
                && item.quantity > 0
        })
        .map(|item| StickerItem {
            bleed_mm: finite_or_default(item.bleed_mm, 0.0).max(0.0),
            bleed_fill_mode: item.bleed_fill_mode,
            cut_offset_mm: finite_or_default(item.cut_offset_mm, 0.0),
            cut_shape: item.cut_shape.clone(),
            filename: item.filename.clone(),
            height_mm: item.height_mm.max(MIN_DIMENSION_MM),
            id: item.id.clone(),
            mirror_bleed_enabled: item.mirror_bleed_enabled,
            page_number: item.page_number,
            quantity: item.quantity.max(1),
            source_height_mm: item
                .source_height_mm
                .filter(|value| value.is_finite() && *value >= MIN_DIMENSION_MM),
            source_file_index: item.source_file_index,
            source_width_mm: item
                .source_width_mm
                .filter(|value| value.is_finite() && *value >= MIN_DIMENSION_MM),
            width_mm: item.width_mm.max(MIN_DIMENSION_MM),
            selected_pdf_cut_line_ids: item.selected_pdf_cut_line_ids.clone(),
        })
        .collect()
}

fn build_single_cut_boxes(items: &[StickerItem], settings: &StickerSettings) -> Vec<PackableBox> {
    let spacing_mm = settings.min_spacing_mm.max(0.0);
    let mut boxes = Vec::new();

    for (item_index, item) in items.iter().enumerate() {
        if let Some(mut circle_boxes) =
            build_staggered_circle_boxes(item, settings, spacing_mm, item_index)
        {
            boxes.append(&mut circle_boxes);
            continue;
        }

        let oriented_item = choose_single_cut_orientation(item, settings, spacing_mm);
        let fill_quantity = if settings.fill_rows && oriented_item.footprint_width_mm > 0.0 {
            let step = oriented_item.footprint_width_mm + spacing_mm;
            let items_per_row =
                (((settings.media_width_mm + spacing_mm) / step).floor() as usize).max(1);
            let remainder = item.quantity % items_per_row;
            if remainder == 0 {
                item.quantity
            } else {
                item.quantity + (items_per_row - remainder)
            }
        } else {
            item.quantity
        };

        for instance_index in 0..fill_quantity {
            boxes.push(PackableBox {
                height_mm: oriented_item.footprint_height_mm,
                id: format!("{}-{instance_index}", item.id),
                placements: vec![PackedBox {
                    height_mm: oriented_item.height_mm,
                    item: item.clone(),
                    part_id: None,
                    relative_x_mm: oriented_item.placement_offset_x_mm,
                    relative_y_mm: oriented_item.placement_offset_y_mm,
                    rotation_degrees: oriented_item.rotation_degrees,
                    width_mm: oriented_item.width_mm,
                }],
                source_order: item_index * 100_000 + instance_index,
                width_mm: oriented_item.footprint_width_mm,
            });
        }
    }

    boxes.sort_by(compare_packable_boxes);
    boxes
}

fn build_staggered_circle_boxes(
    item: &StickerItem,
    settings: &StickerSettings,
    spacing_mm: f64,
    item_index: usize,
) -> Option<Vec<PackableBox>> {
    if item.cut_shape != StickerCutShape::Circle {
        return None;
    }

    let oriented_item = build_oriented_sticker_item(item, item.width_mm, item.height_mm, 0);
    let diameter_mm = oriented_item
        .footprint_width_mm
        .max(oriented_item.footprint_height_mm);
    let row_pitch_mm = diameter_mm + spacing_mm;

    if diameter_mm <= 0.0 || diameter_mm > settings.media_width_mm || row_pitch_mm <= 0.0 {
        return None;
    }

    let primary_row_capacity =
        staggered_circle_row_capacity(0.0, diameter_mm, row_pitch_mm, settings.media_width_mm);
    let staggered_row_offset_mm = row_pitch_mm / 2.0;
    let staggered_row_capacity = staggered_circle_row_capacity(
        staggered_row_offset_mm,
        diameter_mm,
        row_pitch_mm,
        settings.media_width_mm,
    );

    if primary_row_capacity == 0 || staggered_row_capacity == 0 {
        return None;
    }

    let row_step_mm = (row_pitch_mm.powi(2) - staggered_row_offset_mm.powi(2))
        .sqrt()
        .max(MIN_DIMENSION_MM);
    let max_block_height_mm = settings.preferred_sheet_length_mm.max(diameter_mm);
    let max_rows_per_block =
        (((max_block_height_mm - diameter_mm) / row_step_mm).floor() as usize + 1).max(1);
    let mut boxes = Vec::new();
    let mut remaining_quantity = if settings.fill_rows {
        filled_staggered_circle_quantity(
            item.quantity,
            primary_row_capacity,
            staggered_row_capacity,
        )
    } else {
        item.quantity
    };
    let mut block_index = 0;

    while remaining_quantity > 0 {
        let mut placements = Vec::new();
        let mut max_x_mm: f64 = 0.0;
        let mut max_y_mm: f64 = 0.0;

        for row_index in 0..max_rows_per_block {
            if remaining_quantity == 0 {
                break;
            }

            let is_staggered_row = row_index % 2 == 1;
            let row_offset_mm = if is_staggered_row {
                staggered_row_offset_mm
            } else {
                0.0
            };
            let row_capacity = if is_staggered_row {
                staggered_row_capacity
            } else {
                primary_row_capacity
            };
            let row_count = row_capacity.min(remaining_quantity);
            let y_mm = row_index as f64 * row_step_mm;

            for column_index in 0..row_count {
                let x_mm = row_offset_mm + column_index as f64 * row_pitch_mm;

                placements.push(PackedBox {
                    height_mm: oriented_item.height_mm,
                    item: item.clone(),
                    part_id: None,
                    relative_x_mm: x_mm + oriented_item.placement_offset_x_mm,
                    relative_y_mm: y_mm + oriented_item.placement_offset_y_mm,
                    rotation_degrees: 0,
                    width_mm: oriented_item.width_mm,
                });
                max_x_mm = max_x_mm.max(x_mm + diameter_mm);
                max_y_mm = max_y_mm.max(y_mm + diameter_mm);
            }

            remaining_quantity -= row_count;
        }

        if placements.is_empty() {
            break;
        }

        boxes.push(PackableBox {
            height_mm: max_y_mm,
            id: format!("{}-circle-block-{block_index}", item.id),
            placements,
            source_order: item_index * 100_000 + block_index,
            width_mm: max_x_mm,
        });
        block_index += 1;
    }

    Some(boxes)
}

fn staggered_circle_row_capacity(
    row_offset_mm: f64,
    diameter_mm: f64,
    row_pitch_mm: f64,
    media_width_mm: f64,
) -> usize {
    if row_offset_mm + diameter_mm > media_width_mm + LAYOUT_EPSILON_MM {
        return 0;
    }

    (((media_width_mm - row_offset_mm - diameter_mm) / row_pitch_mm).floor() as usize) + 1
}

fn filled_staggered_circle_quantity(
    quantity: usize,
    primary_row_capacity: usize,
    staggered_row_capacity: usize,
) -> usize {
    if quantity == 0 {
        return 0;
    }

    let mut remaining = quantity;
    let mut row_index = 0;

    loop {
        let row_capacity = if row_index % 2 == 0 {
            primary_row_capacity
        } else {
            staggered_row_capacity
        };

        if remaining <= row_capacity {
            return quantity + (row_capacity - remaining);
        }

        remaining -= row_capacity;
        row_index += 1;
    }
}

fn choose_single_cut_orientation(
    item: &StickerItem,
    settings: &StickerSettings,
    spacing_mm: f64,
) -> OrientedStickerItem {
    sticker_item_orientations(item)
        .into_iter()
        .filter(|orientation| orientation.footprint_width_mm <= settings.media_width_mm)
        .max_by(|left, right| {
            let left_height =
                projected_single_cut_run_height(left, item.quantity, settings, spacing_mm);
            let right_height =
                projected_single_cut_run_height(right, item.quantity, settings, spacing_mm);

            right_height
                .partial_cmp(&left_height)
                .unwrap_or(Ordering::Equal)
                .then_with(|| {
                    right
                        .height_mm
                        .partial_cmp(&left.height_mm)
                        .unwrap_or(Ordering::Equal)
                })
                .then_with(|| {
                    right
                        .width_mm
                        .partial_cmp(&left.width_mm)
                        .unwrap_or(Ordering::Equal)
                })
        })
        .unwrap_or_else(|| OrientedStickerItem {
            height_mm: item.height_mm,
            item: item.clone(),
            placement_offset_x_mm: 0.0,
            placement_offset_y_mm: 0.0,
            rotation_degrees: 0,
            footprint_height_mm: item.height_mm,
            footprint_width_mm: item.width_mm,
            width_mm: item.width_mm,
        })
}

fn projected_single_cut_run_height(
    item: &OrientedStickerItem,
    quantity: usize,
    settings: &StickerSettings,
    spacing_mm: f64,
) -> f64 {
    let per_row = items_per_row(item.footprint_width_mm, settings.media_width_mm, spacing_mm);
    let row_count = quantity.div_ceil(per_row).max(1);
    item.footprint_height_mm * row_count as f64 + spacing_mm * row_count.saturating_sub(1) as f64
}

fn items_per_row(width_mm: f64, media_width_mm: f64, spacing_mm: f64) -> usize {
    if width_mm <= 0.0 {
        return 1;
    }

    (((media_width_mm + spacing_mm) / (width_mm + spacing_mm)).floor() as usize).max(1)
}

fn sticker_item_orientations(item: &StickerItem) -> Vec<OrientedStickerItem> {
    let mut orientations = vec![build_oriented_sticker_item(
        item,
        item.width_mm,
        item.height_mm,
        0,
    )];

    if item.cut_shape != StickerCutShape::Circle
        && (item.width_mm - item.height_mm).abs() > f64::EPSILON
    {
        orientations.push(build_oriented_sticker_item(
            item,
            item.height_mm,
            item.width_mm,
            90,
        ));
    }

    orientations
}

fn build_oriented_sticker_item(
    item: &StickerItem,
    width_mm: f64,
    height_mm: f64,
    rotation_degrees: u16,
) -> OrientedStickerItem {
    let footprint = resolve_item_footprint(item, width_mm, height_mm);

    OrientedStickerItem {
        height_mm,
        item: item.clone(),
        placement_offset_x_mm: footprint.placement_offset_x_mm,
        placement_offset_y_mm: footprint.placement_offset_y_mm,
        rotation_degrees,
        footprint_height_mm: footprint.height_mm,
        footprint_width_mm: footprint.width_mm,
        width_mm,
    }
}

fn build_grouped_part_boxes(items: &[StickerItem], settings: &StickerSettings) -> Vec<PackableBox> {
    let mut remaining = items
        .iter()
        .map(|item| (item.id.clone(), item.quantity))
        .collect::<HashMap<_, _>>();
    let mut boxes = Vec::new();
    let mut part_index = 0;

    while has_remaining_items(&remaining) {
        let selected_items = items
            .iter()
            .filter(|item| remaining.get(&item.id).copied().unwrap_or(0) > 0)
            .take(settings.group_max_distinct_items)
            .cloned()
            .collect::<Vec<_>>();

        if selected_items.is_empty() {
            break;
        }

        let candidate_boxes =
            build_grouped_part_box_candidate(&selected_items, &remaining, settings, part_index);

        if candidate_boxes.is_empty() {
            break;
        }

        for part in &candidate_boxes {
            for placement in &part.placements {
                if let Some(quantity) = remaining.get_mut(&placement.item.id) {
                    *quantity = quantity.saturating_sub(1);
                }
            }
        }

        part_index += candidate_boxes.len();
        boxes.extend(candidate_boxes);
    }

    boxes.sort_by(compare_packable_boxes);
    boxes
}

fn has_remaining_items(remaining: &HashMap<String, usize>) -> bool {
    remaining.values().any(|quantity| *quantity > 0)
}

fn build_grouped_part_box_candidate(
    selected_items: &[StickerItem],
    remaining: &HashMap<String, usize>,
    settings: &StickerSettings,
    part_index: usize,
) -> Vec<PackableBox> {
    let mut best_boxes = Vec::new();
    let mut best_metrics = None;

    for (target_width_mm, target_height_mm) in STANDARD_PART_SIZES_MM
        .into_iter()
        .filter(|(target_width_mm, _)| *target_width_mm <= settings.media_width_mm)
    {
        let candidate_boxes = simulate_grouped_part_boxes_for_target_size(
            selected_items,
            remaining,
            settings,
            part_index,
            target_width_mm,
            target_height_mm,
        );

        if candidate_boxes.is_empty() {
            continue;
        }

        let candidate_metrics = measure_grouped_part_simulation(&candidate_boxes, settings);
        let candidate_part = candidate_boxes[0].clone();

        let replace_best = best_metrics.as_ref().is_none_or(|current_best| {
            is_preferred_grouped_simulation(
                &candidate_metrics,
                current_best,
                &candidate_part,
                best_boxes.first(),
            )
        });

        if replace_best {
            best_boxes = candidate_boxes;
            best_metrics = Some(candidate_metrics);
        }
    }

    if !best_boxes.is_empty() {
        return best_boxes;
    }

    let fallback_part_id = format!("part-{}", part_index + 1);
    selected_items
        .iter()
        .find(|item| remaining.get(&item.id).copied().unwrap_or(0) > 0)
        .and_then(|item| {
            build_part_box(
                &fallback_part_id,
                &[item.clone()],
                settings,
                part_index,
                true,
            )
        })
        .map(|part| vec![part])
        .unwrap_or_default()
}

fn simulate_grouped_part_boxes_for_target_size(
    selected_items: &[StickerItem],
    remaining: &HashMap<String, usize>,
    settings: &StickerSettings,
    starting_part_index: usize,
    target_width_mm: f64,
    target_height_mm: f64,
) -> Vec<PackableBox> {
    let mut candidate_remaining = selected_items
        .iter()
        .map(|item| {
            (
                item.id.clone(),
                remaining.get(&item.id).copied().unwrap_or(0),
            )
        })
        .collect::<HashMap<_, _>>();
    let mut boxes = Vec::new();
    let mut part_index = starting_part_index;

    while has_remaining_items(&candidate_remaining) {
        let part_id = format!("part-{}", part_index + 1);
        let Some(part) = build_grouped_part_box_for_target_size(
            &part_id,
            selected_items,
            &candidate_remaining,
            settings,
            part_index,
            target_width_mm,
            target_height_mm,
        ) else {
            break;
        };

        let placement_count = part.placements.len();
        for placement in &part.placements {
            if let Some(quantity) = candidate_remaining.get_mut(&placement.item.id) {
                *quantity = quantity.saturating_sub(1);
            }
        }

        boxes.push(part);
        part_index += 1;

        if placement_count == 0 {
            break;
        }
    }

    boxes
}

#[derive(Clone, Copy)]
struct GroupedSimulationMetrics {
    bounding_area_mm2: f64,
    part_count: usize,
    sheet_count: usize,
    total_used_height_mm: f64,
}

fn measure_grouped_part_simulation(
    boxes: &[PackableBox],
    settings: &StickerSettings,
) -> GroupedSimulationMetrics {
    let sheets = pack_boxes_on_sheets(boxes, settings);
    let total_used_height_mm = sheets.iter().map(sheet_used_height).sum::<f64>();
    let bounding_area_mm2 = sheets
        .iter()
        .map(|sheet| sheet_used_width(sheet) * sheet_used_height(sheet))
        .sum::<f64>();

    GroupedSimulationMetrics {
        bounding_area_mm2,
        part_count: boxes.len(),
        sheet_count: sheets.len(),
        total_used_height_mm,
    }
}

fn is_preferred_grouped_simulation(
    candidate: &GroupedSimulationMetrics,
    current_best: &GroupedSimulationMetrics,
    candidate_part: &PackableBox,
    current_best_part: Option<&PackableBox>,
) -> bool {
    if candidate.sheet_count != current_best.sheet_count {
        return candidate.sheet_count < current_best.sheet_count;
    }

    if (candidate.bounding_area_mm2 - current_best.bounding_area_mm2).abs() > f64::EPSILON {
        return candidate.bounding_area_mm2 < current_best.bounding_area_mm2;
    }

    if (candidate.total_used_height_mm - current_best.total_used_height_mm).abs() > f64::EPSILON {
        return candidate.total_used_height_mm < current_best.total_used_height_mm;
    }

    if candidate.part_count != current_best.part_count {
        return candidate.part_count < current_best.part_count;
    }

    current_best_part
        .is_some_and(|current_part| is_preferred_grouped_part_box(candidate_part, current_part))
}

fn build_grouped_part_box_for_target_size(
    part_id: &str,
    selected_items: &[StickerItem],
    remaining: &HashMap<String, usize>,
    settings: &StickerSettings,
    part_index: usize,
    target_width_mm: f64,
    target_height_mm: f64,
) -> Option<PackableBox> {
    let mut candidate_remaining = selected_items
        .iter()
        .map(|item| {
            (
                item.id.clone(),
                remaining.get(&item.id).copied().unwrap_or(0),
            )
        })
        .collect::<HashMap<_, _>>();
    let mut part_items = Vec::new();
    let mut packed_part = None;

    loop {
        let mut best_next_item = None;
        let mut best_next_part = None;

        for item in selected_items {
            let remaining_quantity = candidate_remaining.get(&item.id).copied().unwrap_or(0);

            if remaining_quantity == 0 {
                continue;
            }

            let mut candidate_items = part_items.clone();
            candidate_items.push(item.clone());
            let Some(candidate_part) = build_part_box_for_target_size(
                part_id,
                &candidate_items,
                settings,
                part_index,
                target_width_mm,
                target_height_mm,
            ) else {
                continue;
            };

            let replace_best = best_next_part.as_ref().is_none_or(|current_best| {
                is_preferred_grouped_part_box(&candidate_part, current_best)
            });

            if replace_best {
                best_next_item = Some(item.clone());
                best_next_part = Some(candidate_part);
            }
        }

        let Some(next_item) = best_next_item else {
            break;
        };

        part_items.push(next_item.clone());
        packed_part = best_next_part;

        if let Some(remaining_quantity) = candidate_remaining.get_mut(&next_item.id) {
            *remaining_quantity = remaining_quantity.saturating_sub(1);
        }
    }

    packed_part
}

fn is_preferred_grouped_part_box(candidate_part: &PackableBox, current_best: &PackableBox) -> bool {
    let candidate_count = candidate_part.placements.len();
    let current_count = current_best.placements.len();
    if candidate_count != current_count {
        return candidate_count > current_count;
    }

    let candidate_ratio = grouped_part_fill_ratio(candidate_part);
    let current_ratio = grouped_part_fill_ratio(current_best);
    if (candidate_ratio - current_ratio).abs() > f64::EPSILON {
        return candidate_ratio > current_ratio;
    }

    let candidate_area = candidate_part.width_mm * candidate_part.height_mm;
    let current_area = current_best.width_mm * current_best.height_mm;
    if (candidate_area - current_area).abs() > f64::EPSILON {
        return candidate_area < current_area;
    }

    false
}

fn grouped_part_fill_ratio(part: &PackableBox) -> f64 {
    let occupied_area = part
        .placements
        .iter()
        .map(|placement| placement.width_mm * placement.height_mm)
        .sum::<f64>();
    let boundary_area = (part.width_mm * part.height_mm).max(MIN_DIMENSION_MM);
    occupied_area / boundary_area
}

fn build_part_box(
    part_id: &str,
    items: &[StickerItem],
    settings: &StickerSettings,
    part_index: usize,
    allow_custom_fallback: bool,
) -> Option<PackableBox> {
    for (target_width_mm, target_height_mm) in STANDARD_PART_SIZES_MM
        .into_iter()
        .filter(|(target_width_mm, _)| *target_width_mm <= settings.media_width_mm)
    {
        if let Some(part) = build_part_box_for_target_size(
            part_id,
            items,
            settings,
            part_index,
            target_width_mm,
            target_height_mm,
        ) {
            return Some(part);
        }
    }

    if !allow_custom_fallback {
        return None;
    }

    let spacing_mm = settings.min_spacing_mm.max(0.0);
    let part_margin_mm = settings.part_margin_mm.max(0.0);
    let available_width_mm = (settings.media_width_mm - part_margin_mm * 2.0).max(MIN_DIMENSION_MM);
    let packed_part =
        pack_items_into_part(part_id, items, available_width_mm, spacing_mm, part_index);

    Some(offset_part_box(
        packed_part.clone(),
        (packed_part.width_mm + part_margin_mm * 2.0).min(settings.media_width_mm),
        packed_part.height_mm + part_margin_mm * 2.0,
        part_margin_mm,
        part_margin_mm,
    ))
}

fn build_part_box_for_target_size(
    part_id: &str,
    items: &[StickerItem],
    settings: &StickerSettings,
    part_index: usize,
    target_width_mm: f64,
    target_height_mm: f64,
) -> Option<PackableBox> {
    let spacing_mm = settings.min_spacing_mm.max(0.0);
    let part_margin_mm = settings.part_margin_mm.max(0.0);
    let available_width_mm = (target_width_mm - part_margin_mm * 2.0).max(MIN_DIMENSION_MM);
    let available_height_mm = (target_height_mm - part_margin_mm * 2.0).max(MIN_DIMENSION_MM);
    let packed_part =
        pack_items_into_part(part_id, items, available_width_mm, spacing_mm, part_index);

    if packed_part.width_mm > available_width_mm || packed_part.height_mm > available_height_mm {
        return None;
    }

    let tight_width = (packed_part.width_mm + part_margin_mm * 2.0).min(settings.media_width_mm);
    let tight_height = packed_part.height_mm + part_margin_mm * 2.0;
    Some(offset_part_box(
        packed_part,
        tight_width,
        tight_height,
        part_margin_mm,
        part_margin_mm,
    ))
}

fn pack_items_into_part(
    part_id: &str,
    items: &[StickerItem],
    target_width_mm: f64,
    spacing_mm: f64,
    part_index: usize,
) -> PackableBox {
    let mut sorted_items = items.to_vec();
    sorted_items.sort_by(compare_sticker_items_by_size);
    let mut shelves: Vec<ShelfCursor> = Vec::new();
    let mut max_x_mm: f64 = 0.0;
    let mut placements = Vec::new();

    for (item_index, item) in sorted_items.iter().enumerate() {
        let placement_options =
            collect_part_item_placement_options(&shelves, item, target_width_mm, spacing_mm);
        let chosen_option = placement_options
            .into_iter()
            .min_by(|left, right| {
                let left_height = simulate_remaining_part_height(
                    &sorted_items[item_index + 1..],
                    shelves.clone(),
                    left,
                    target_width_mm,
                    spacing_mm,
                );
                let right_height = simulate_remaining_part_height(
                    &sorted_items[item_index + 1..],
                    shelves.clone(),
                    right,
                    target_width_mm,
                    spacing_mm,
                );

                left_height
                    .partial_cmp(&right_height)
                    .unwrap_or(Ordering::Equal)
                    .then_with(|| {
                        left.y_mm
                            .partial_cmp(&right.y_mm)
                            .unwrap_or(Ordering::Equal)
                    })
                    .then_with(|| {
                        left.remaining_width_mm
                            .partial_cmp(&right.remaining_width_mm)
                            .unwrap_or(Ordering::Equal)
                    })
            })
            .unwrap_or_else(|| {
                let oriented_item =
                    build_oriented_sticker_item(item, item.width_mm, item.height_mm, 0);

                PartShelfPlacementOption {
                    height_mm: oriented_item.footprint_height_mm,
                    item: item.clone(),
                    placement_height_mm: oriented_item.height_mm,
                    placement_offset_x_mm: oriented_item.placement_offset_x_mm,
                    placement_offset_y_mm: oriented_item.placement_offset_y_mm,
                    placement_width_mm: oriented_item.width_mm,
                    remaining_width_mm: target_width_mm - oriented_item.footprint_width_mm,
                    rotation_degrees: 0,
                    shelf_index: None,
                    width_mm: oriented_item.footprint_width_mm,
                    x_mm: 0.0,
                    y_mm: 0.0,
                }
            });
        apply_part_item_placement(&mut shelves, chosen_option.clone());

        placements.push(PackedBox {
            height_mm: chosen_option.placement_height_mm,
            item: chosen_option.item.clone(),
            part_id: Some(part_id.to_string()),
            relative_x_mm: chosen_option.x_mm + chosen_option.placement_offset_x_mm,
            relative_y_mm: chosen_option.y_mm + chosen_option.placement_offset_y_mm,
            rotation_degrees: chosen_option.rotation_degrees,
            width_mm: chosen_option.placement_width_mm,
        });

        max_x_mm = max_x_mm.max(chosen_option.x_mm + chosen_option.width_mm);
    }

    PackableBox {
        height_mm: shelves
            .last()
            .map(|shelf| shelf.y_mm + shelf.height_mm)
            .unwrap_or(0.0),
        id: part_id.to_string(),
        placements,
        source_order: part_index,
        width_mm: max_x_mm,
    }
}

#[derive(Clone)]
struct PartShelfPlacementOption {
    height_mm: f64,
    item: StickerItem,
    placement_height_mm: f64,
    placement_offset_x_mm: f64,
    placement_offset_y_mm: f64,
    placement_width_mm: f64,
    remaining_width_mm: f64,
    rotation_degrees: u16,
    shelf_index: Option<usize>,
    width_mm: f64,
    x_mm: f64,
    y_mm: f64,
}

fn collect_part_item_placement_options(
    shelves: &[ShelfCursor],
    item: &StickerItem,
    target_width_mm: f64,
    spacing_mm: f64,
) -> Vec<PartShelfPlacementOption> {
    let mut options = Vec::new();

    for oriented_item in sticker_item_orientations(item) {
        for (shelf_index, shelf) in shelves.iter().enumerate() {
            if oriented_item.footprint_height_mm > shelf.height_mm {
                continue;
            }

            let x_mm = if shelf.used_width_mm > 0.0 {
                shelf.used_width_mm + spacing_mm
            } else {
                0.0
            };
            let remaining_width_mm = target_width_mm - (x_mm + oriented_item.footprint_width_mm);

            if remaining_width_mm < 0.0 {
                continue;
            }

            options.push(PartShelfPlacementOption {
                height_mm: oriented_item.footprint_height_mm,
                item: oriented_item.item.clone(),
                placement_height_mm: oriented_item.height_mm,
                placement_offset_x_mm: oriented_item.placement_offset_x_mm,
                placement_offset_y_mm: oriented_item.placement_offset_y_mm,
                placement_width_mm: oriented_item.width_mm,
                remaining_width_mm,
                rotation_degrees: oriented_item.rotation_degrees,
                shelf_index: Some(shelf_index),
                width_mm: oriented_item.footprint_width_mm,
                x_mm,
                y_mm: shelf.y_mm,
            });
        }

        let new_shelf_remaining_width_mm = target_width_mm - oriented_item.footprint_width_mm;
        if new_shelf_remaining_width_mm >= 0.0 {
            let y_mm = shelves
                .last()
                .map(|shelf| shelf.y_mm + shelf.height_mm + spacing_mm)
                .unwrap_or(0.0);
            options.push(PartShelfPlacementOption {
                height_mm: oriented_item.footprint_height_mm,
                item: oriented_item.item.clone(),
                placement_height_mm: oriented_item.height_mm,
                placement_offset_x_mm: oriented_item.placement_offset_x_mm,
                placement_offset_y_mm: oriented_item.placement_offset_y_mm,
                placement_width_mm: oriented_item.width_mm,
                remaining_width_mm: new_shelf_remaining_width_mm,
                rotation_degrees: oriented_item.rotation_degrees,
                shelf_index: None,
                width_mm: oriented_item.footprint_width_mm,
                x_mm: 0.0,
                y_mm,
            });
        }
    }

    options
}

fn apply_part_item_placement(shelves: &mut Vec<ShelfCursor>, placement: PartShelfPlacementOption) {
    if let Some(shelf_index) = placement.shelf_index {
        shelves[shelf_index].used_width_mm = placement.x_mm + placement.width_mm;
        return;
    }

    shelves.push(ShelfCursor {
        height_mm: placement.height_mm,
        used_width_mm: placement.width_mm,
        y_mm: placement.y_mm,
    });
}

fn simulate_remaining_part_height(
    remaining_items: &[StickerItem],
    mut shelves: Vec<ShelfCursor>,
    placement: &PartShelfPlacementOption,
    target_width_mm: f64,
    spacing_mm: f64,
) -> f64 {
    apply_part_item_placement(&mut shelves, placement.clone());

    for item in remaining_items {
        let placement_option =
            collect_part_item_placement_options(&shelves, item, target_width_mm, spacing_mm)
                .into_iter()
                .min_by(|left, right| {
                    left.remaining_width_mm
                        .partial_cmp(&right.remaining_width_mm)
                        .unwrap_or(Ordering::Equal)
                        .then_with(|| {
                            left.y_mm
                                .partial_cmp(&right.y_mm)
                                .unwrap_or(Ordering::Equal)
                        })
                });

        let Some(placement_option) = placement_option else {
            return f64::INFINITY;
        };

        apply_part_item_placement(&mut shelves, placement_option);
    }

    shelves
        .last()
        .map(|shelf| shelf.y_mm + shelf.height_mm)
        .unwrap_or(0.0)
}

fn offset_part_box(
    mut packed_part: PackableBox,
    boundary_width_mm: f64,
    boundary_height_mm: f64,
    offset_x_mm: f64,
    offset_y_mm: f64,
) -> PackableBox {
    for placement in &mut packed_part.placements {
        placement.relative_x_mm += offset_x_mm;
        placement.relative_y_mm += offset_y_mm;
    }

    packed_part.width_mm = boundary_width_mm.max(packed_part.width_mm + offset_x_mm);
    packed_part.height_mm = boundary_height_mm.max(packed_part.height_mm + offset_y_mm);
    packed_part
}

fn pack_boxes_on_sheets(boxes: &[PackableBox], settings: &StickerSettings) -> Vec<SheetCursor> {
    let mut sheets = vec![create_sheet_cursor()];
    let gap_mm = if settings.packing_mode == StickerPackingMode::GroupedParts {
        settings.part_gap_mm
    } else {
        settings.min_spacing_mm.max(0.0)
    };
    let max_sheet_length_mm = if settings.allow_long_sheets {
        1500.0_f64.max(settings.preferred_sheet_length_mm)
    } else {
        settings.preferred_sheet_length_mm
    };

    for box_data in boxes {
        if try_place_box_on_best_existing_shelf(
            &mut sheets,
            box_data,
            gap_mm,
            settings.media_width_mm,
        ) {
            continue;
        }

        if let Some(sheet_index) =
            find_sheet_for_new_shelf(&sheets, box_data, gap_mm, settings, max_sheet_length_mm)
        {
            place_box_on_new_shelf(&mut sheets[sheet_index], box_data, gap_mm);
            continue;
        }

        sheets.push(create_sheet_cursor());
        let sheet_index = sheets.len() - 1;
        place_box_on_new_shelf(&mut sheets[sheet_index], box_data, gap_mm);
    }

    sheets
        .into_iter()
        .filter(|sheet| !sheet.boxes.is_empty())
        .collect()
}

fn should_start_new_preferred_sheet(
    sheet: &SheetCursor,
    projected_height_mm: f64,
    settings: &StickerSettings,
) -> bool {
    if sheet.boxes.is_empty() {
        return false;
    }

    if projected_height_mm <= settings.preferred_sheet_length_mm {
        return false;
    }

    if !settings.allow_long_sheets {
        return true;
    }

    let current_used_height_mm = sheet_used_height(sheet);

    current_used_height_mm >= settings.preferred_sheet_length_mm * 0.72
        && projected_height_mm > settings.preferred_sheet_length_mm
}

fn build_imposed_sheet(
    sheet: &SheetCursor,
    index: usize,
    settings: &StickerSettings,
) -> StickerSheet {
    let placements =
        sheet
            .boxes
            .iter()
            .flat_map(|box_data| {
                box_data.box_data.placements.iter().enumerate().map(
                    |(placement_index, placement)| StickerPlacement {
                        bleed_mm: placement.item.bleed_mm,
                        bleed_fill_mode: placement.item.bleed_fill_mode,
                        cut_offset_mm: placement.item.cut_offset_mm,
                        cut_shape: placement.item.cut_shape.clone(),
                        filename: placement.item.filename.clone(),
                        height_mm: placement.height_mm,
                        instance_index: placement_index,
                        item_id: placement.item.id.clone(),
                        mirror_bleed_enabled: placement.item.mirror_bleed_enabled,
                        page_number: placement.item.page_number,
                        part_id: placement.part_id.clone(),
                        rotation_degrees: placement.rotation_degrees,
                        selected_pdf_cut_line_ids: placement.item.selected_pdf_cut_line_ids.clone(),
                        sheet_index: index,
                        source_height_mm: placement.item.source_height_mm,
                        source_file_index: placement.item.source_file_index,
                        source_width_mm: placement.item.source_width_mm,
                        width_mm: placement.width_mm,
                        x_mm: box_data.x_mm + placement.relative_x_mm,
                        y_mm: box_data.y_mm + placement.relative_y_mm,
                    },
                )
            })
            .collect::<Vec<_>>();
    let part_boundaries = sheet
        .boxes
        .iter()
        .filter(|box_data| {
            box_data
                .box_data
                .placements
                .iter()
                .any(|placement| placement.part_id.as_deref() == Some(&box_data.box_data.id))
        })
        .map(|box_data| StickerPartBoundary {
            height_mm: box_data.box_data.height_mm,
            id: box_data.box_data.id.clone(),
            sheet_index: index,
            width_mm: box_data.box_data.width_mm,
            x_mm: box_data.x_mm,
            y_mm: box_data.y_mm,
        })
        .collect::<Vec<_>>();
    let export_bounds = resolve_export_bounds(&placements, &part_boundaries);
    let export_width_mm = (export_bounds.max_x_mm - export_bounds.min_x_mm).max(MIN_DIMENSION_MM);
    let export_height_mm = (export_bounds.max_y_mm - export_bounds.min_y_mm).max(MIN_DIMENSION_MM);
    let manual_cut_marks = compute_manual_cut_marks(&placements, &export_bounds, settings);
    let opos_marks = compute_opos_marks(&export_bounds, settings);
    let content_bounds = resolve_content_bounds(&export_bounds, &opos_marks, &manual_cut_marks);
    let preview_length_mm = ((content_bounds.max_y_mm - content_bounds.min_y_mm)
        + settings.preview_margin_mm)
        .max(settings.preferred_sheet_length_mm);
    let used_area_mm2 = placements
        .iter()
        .map(|placement| placement.width_mm * placement.height_mm)
        .sum::<f64>();
    let sheet_area_mm2 = settings.media_width_mm * preview_length_mm;
    let utilization_percent = if sheet_area_mm2 > 0.0 {
        ((used_area_mm2 / sheet_area_mm2) * 1000.0).round() / 10.0
    } else {
        0.0
    };

    StickerSheet {
        export_height_mm,
        export_width_mm,
        export_x_mm: export_bounds.min_x_mm,
        export_y_mm: export_bounds.min_y_mm,
        index,
        manual_cut_marks,
        media_width_mm: settings.media_width_mm,
        opos_marks,
        part_boundaries,
        placements,
        preview_length_mm,
        utilization_percent,
    }
}

fn compute_manual_cut_marks(
    placements: &[StickerPlacement],
    export_bounds: &Bounds,
    settings: &StickerSettings,
) -> Vec<ManualCutMark> {
    if !settings.manual_cut_marks_enabled {
        return Vec::new();
    }

    let length = settings.manual_cut_mark_length_mm.max(1.0);
    let mut marks = Vec::new();
    let mut keys = Vec::new();

    for placement in placements {
        let bounds = resolve_placement_cut_bounds(placement);

        for x_mm in [bounds.min_x_mm, bounds.max_x_mm] {
            push_unique_manual_cut_mark(
                &mut marks,
                &mut keys,
                ManualCutMark {
                    x1_mm: x_mm,
                    x2_mm: x_mm,
                    y1_mm: export_bounds.min_y_mm - length,
                    y2_mm: export_bounds.min_y_mm,
                },
            );
            push_unique_manual_cut_mark(
                &mut marks,
                &mut keys,
                ManualCutMark {
                    x1_mm: x_mm,
                    x2_mm: x_mm,
                    y1_mm: export_bounds.max_y_mm,
                    y2_mm: export_bounds.max_y_mm + length,
                },
            );
        }

        for y_mm in [bounds.min_y_mm, bounds.max_y_mm] {
            push_unique_manual_cut_mark(
                &mut marks,
                &mut keys,
                ManualCutMark {
                    x1_mm: export_bounds.min_x_mm - length,
                    x2_mm: export_bounds.min_x_mm,
                    y1_mm: y_mm,
                    y2_mm: y_mm,
                },
            );
            push_unique_manual_cut_mark(
                &mut marks,
                &mut keys,
                ManualCutMark {
                    x1_mm: export_bounds.max_x_mm,
                    x2_mm: export_bounds.max_x_mm + length,
                    y1_mm: y_mm,
                    y2_mm: y_mm,
                },
            );
        }
    }

    marks
}

fn push_unique_manual_cut_mark(
    marks: &mut Vec<ManualCutMark>,
    keys: &mut Vec<String>,
    mark: ManualCutMark,
) {
    let key = format!(
        "{:.3}:{:.3}:{:.3}:{:.3}",
        mark.x1_mm, mark.y1_mm, mark.x2_mm, mark.y2_mm
    );

    if keys.iter().any(|candidate| candidate == &key) {
        return;
    }

    keys.push(key);
    marks.push(mark);
}

fn compute_opos_marks(export_bounds: &Bounds, settings: &StickerSettings) -> Vec<OposMarkPosition> {
    if !settings.opos_marks_enabled {
        return Vec::new();
    }

    let size = settings.opos_mark_size_mm;
    let margin = settings.opos_mark_margin_mm;
    let spacing = settings.opos_mark_spacing_mm;
    let clearance = settings.opos_mark_clearance_mm.max(size * 3.0);
    let left_x = export_bounds.min_x_mm - margin - size;
    let right_x = export_bounds.max_x_mm + margin;
    let top_y = export_bounds.min_y_mm - margin - size;
    let bottom_y = export_bounds.max_y_mm + margin;
    let top_center_y = top_y + size / 2.0;
    let bottom_center_y = bottom_y + size / 2.0;
    let total_vertical_span = (bottom_center_y - top_center_y).max(0.0);
    let segment_count = ((total_vertical_span / spacing).ceil() as usize).max(1);
    let vertical_step = total_vertical_span / segment_count as f64;
    let mut marks = Vec::new();

    for x in [left_x, right_x] {
        for index in 0..=segment_count {
            let center_y = bottom_center_y - vertical_step * index as f64;
            let y = center_y - size / 2.0;

            marks.push(OposMarkPosition {
                clearance_mm: clearance,
                height_mm: size,
                kind: OposMarkKind::Square,
                width_mm: size,
                x_mm: x,
                y_mm: y,
            });
        }
    }

    let bar_start_x = left_x + size + OPOS_BAR_X_GAP_MM;
    let bar_end_x = right_x - OPOS_BAR_X_GAP_MM;
    let bar_width = (bar_end_x - bar_start_x).max(MIN_DIMENSION_MM);
    let bar_y = bottom_y;

    marks.push(OposMarkPosition {
        clearance_mm: clearance,
        height_mm: size,
        kind: OposMarkKind::Bar,
        width_mm: bar_width,
        x_mm: bar_start_x,
        y_mm: bar_y,
    });

    marks
}

fn resolve_content_bounds(
    export_bounds: &Bounds,
    opos_marks: &[OposMarkPosition],
    manual_cut_marks: &[ManualCutMark],
) -> Bounds {
    let mut bounds = Bounds {
        max_x_mm: export_bounds.max_x_mm,
        max_y_mm: export_bounds.max_y_mm,
        min_x_mm: export_bounds.min_x_mm,
        min_y_mm: export_bounds.min_y_mm,
    };
    let mut initialized = true;

    for mark in opos_marks {
        include_bounds(
            &mut bounds,
            &mut initialized,
            Bounds {
                max_x_mm: mark.x_mm + mark.width_mm + mark.clearance_mm,
                max_y_mm: mark.y_mm + mark.height_mm + mark.clearance_mm,
                min_x_mm: mark.x_mm - mark.clearance_mm,
                min_y_mm: mark.y_mm - mark.clearance_mm,
            },
        );
    }

    for mark in manual_cut_marks {
        include_bounds(
            &mut bounds,
            &mut initialized,
            Bounds {
                max_x_mm: mark.x1_mm.max(mark.x2_mm),
                max_y_mm: mark.y1_mm.max(mark.y2_mm),
                min_x_mm: mark.x1_mm.min(mark.x2_mm),
                min_y_mm: mark.y1_mm.min(mark.y2_mm),
            },
        );
    }

    bounds
}

fn resolve_export_bounds(
    placements: &[StickerPlacement],
    part_boundaries: &[StickerPartBoundary],
) -> Bounds {
    let mut bounds = Bounds {
        max_x_mm: MIN_DIMENSION_MM,
        max_y_mm: MIN_DIMENSION_MM,
        min_x_mm: 0.0,
        min_y_mm: 0.0,
    };
    let mut initialized = false;

    for placement in placements {
        include_bounds(
            &mut bounds,
            &mut initialized,
            resolve_placement_cut_bounds(placement),
        );
        include_bounds(
            &mut bounds,
            &mut initialized,
            resolve_placement_print_bounds(placement),
        );
    }

    for part in part_boundaries {
        include_bounds(
            &mut bounds,
            &mut initialized,
            Bounds {
                max_x_mm: part.x_mm + part.width_mm,
                max_y_mm: part.y_mm + part.height_mm,
                min_x_mm: part.x_mm,
                min_y_mm: part.y_mm,
            },
        );
    }

    bounds
}

pub(crate) fn resolve_placement_cut_bounds(placement: &StickerPlacement) -> Bounds {
    let offset = if placement.cut_shape == StickerCutShape::ReadySheet {
        0.0
    } else {
        placement.cut_offset_mm
    };

    if placement.cut_shape == StickerCutShape::Circle {
        let radius = (placement.width_mm.max(placement.height_mm) / 2.0 + offset)
            .max(MIN_DIMENSION_MM / 2.0);
        let center_x_mm = placement.x_mm + placement.width_mm / 2.0;
        let center_y_mm = placement.y_mm + placement.height_mm / 2.0;

        return Bounds {
            max_x_mm: center_x_mm + radius,
            max_y_mm: center_y_mm + radius,
            min_x_mm: center_x_mm - radius,
            min_y_mm: center_y_mm - radius,
        };
    }

    if offset < 0.0 {
        let inset = (-offset)
            .min((placement.width_mm - MIN_DIMENSION_MM).max(0.0) / 2.0)
            .min((placement.height_mm - MIN_DIMENSION_MM).max(0.0) / 2.0);

        return Bounds {
            max_x_mm: placement.x_mm + placement.width_mm - inset,
            max_y_mm: placement.y_mm + placement.height_mm - inset,
            min_x_mm: placement.x_mm + inset,
            min_y_mm: placement.y_mm + inset,
        };
    }

    Bounds {
        max_x_mm: placement.x_mm + placement.width_mm + offset,
        max_y_mm: placement.y_mm + placement.height_mm + offset,
        min_x_mm: placement.x_mm - offset,
        min_y_mm: placement.y_mm - offset,
    }
}

pub(crate) fn resolve_placement_print_bounds(placement: &StickerPlacement) -> Bounds {
    let bleed = effective_bleed_mm(placement.cut_shape.clone(), placement.bleed_mm);

    if placement.cut_shape == StickerCutShape::Circle {
        let radius = placement.width_mm.max(placement.height_mm) / 2.0 + bleed;
        let center_x_mm = placement.x_mm + placement.width_mm / 2.0;
        let center_y_mm = placement.y_mm + placement.height_mm / 2.0;

        return Bounds {
            max_x_mm: center_x_mm + radius,
            max_y_mm: center_y_mm + radius,
            min_x_mm: center_x_mm - radius,
            min_y_mm: center_y_mm - radius,
        };
    }

    Bounds {
        max_x_mm: placement.x_mm + placement.width_mm + bleed,
        max_y_mm: placement.y_mm + placement.height_mm + bleed,
        min_x_mm: placement.x_mm - bleed,
        min_y_mm: placement.y_mm - bleed,
    }
}

fn resolve_item_footprint(item: &StickerItem, width_mm: f64, height_mm: f64) -> ItemFootprint {
    let cut_bounds = resolve_item_cut_bounds(item, width_mm, height_mm);
    let print_bounds = resolve_item_print_bounds(item, width_mm, height_mm);
    let min_x_mm = cut_bounds.min_x_mm.min(print_bounds.min_x_mm);
    let min_y_mm = cut_bounds.min_y_mm.min(print_bounds.min_y_mm);
    let max_x_mm = cut_bounds.max_x_mm.max(print_bounds.max_x_mm);
    let max_y_mm = cut_bounds.max_y_mm.max(print_bounds.max_y_mm);

    ItemFootprint {
        height_mm: (max_y_mm - min_y_mm).max(MIN_DIMENSION_MM),
        placement_offset_x_mm: -min_x_mm,
        placement_offset_y_mm: -min_y_mm,
        width_mm: (max_x_mm - min_x_mm).max(MIN_DIMENSION_MM),
    }
}

fn resolve_item_cut_bounds(item: &StickerItem, width_mm: f64, height_mm: f64) -> Bounds {
    let placement = StickerPlacement {
        bleed_mm: item.bleed_mm,
        bleed_fill_mode: item.bleed_fill_mode,
        cut_offset_mm: item.cut_offset_mm,
        cut_shape: item.cut_shape.clone(),
        filename: item.filename.clone(),
        height_mm,
        instance_index: 0,
        item_id: item.id.clone(),
        mirror_bleed_enabled: item.mirror_bleed_enabled,
        page_number: item.page_number,
        part_id: None,
        rotation_degrees: 0,
        selected_pdf_cut_line_ids: item.selected_pdf_cut_line_ids.clone(),
        sheet_index: 0,
        source_file_index: item.source_file_index,
        source_height_mm: item.source_height_mm,
        source_width_mm: item.source_width_mm,
        width_mm,
        x_mm: 0.0,
        y_mm: 0.0,
    };

    resolve_placement_cut_bounds(&placement)
}

fn resolve_item_print_bounds(item: &StickerItem, width_mm: f64, height_mm: f64) -> Bounds {
    let placement = StickerPlacement {
        bleed_mm: item.bleed_mm,
        bleed_fill_mode: item.bleed_fill_mode,
        cut_offset_mm: item.cut_offset_mm,
        cut_shape: item.cut_shape.clone(),
        filename: item.filename.clone(),
        height_mm,
        instance_index: 0,
        item_id: item.id.clone(),
        mirror_bleed_enabled: item.mirror_bleed_enabled,
        page_number: item.page_number,
        part_id: None,
        rotation_degrees: 0,
        selected_pdf_cut_line_ids: item.selected_pdf_cut_line_ids.clone(),
        sheet_index: 0,
        source_file_index: item.source_file_index,
        source_height_mm: item.source_height_mm,
        source_width_mm: item.source_width_mm,
        width_mm,
        x_mm: 0.0,
        y_mm: 0.0,
    };

    resolve_placement_print_bounds(&placement)
}

fn effective_bleed_mm(cut_shape: StickerCutShape, bleed_mm: f64) -> f64 {
    if cut_shape == StickerCutShape::ReadySheet {
        0.0
    } else {
        bleed_mm.max(0.0)
    }
}

fn include_bounds(bounds: &mut Bounds, initialized: &mut bool, candidate: Bounds) {
    if !*initialized {
        *bounds = candidate;
        *initialized = true;
        return;
    }

    bounds.max_x_mm = bounds.max_x_mm.max(candidate.max_x_mm);
    bounds.max_y_mm = bounds.max_y_mm.max(candidate.max_y_mm);
    bounds.min_x_mm = bounds.min_x_mm.min(candidate.min_x_mm);
    bounds.min_y_mm = bounds.min_y_mm.min(candidate.min_y_mm);
}

fn create_sheet_cursor() -> SheetCursor {
    SheetCursor {
        boxes: Vec::new(),
        shelves: Vec::new(),
    }
}

fn try_place_box_on_best_existing_shelf(
    sheets: &mut [SheetCursor],
    box_data: &PackableBox,
    gap_mm: f64,
    media_width_mm: f64,
) -> bool {
    let mut best_candidate: Option<(usize, usize, f64, f64)> = None;

    for (sheet_index, sheet) in sheets.iter().enumerate() {
        for (shelf_index, shelf) in sheet.shelves.iter().enumerate() {
            if box_data.height_mm > shelf.height_mm {
                continue;
            }

            let x_mm = if shelf.used_width_mm > 0.0 {
                shelf.used_width_mm + gap_mm
            } else {
                0.0
            };
            let remaining_width_mm = media_width_mm - (x_mm + box_data.width_mm);

            if remaining_width_mm < 0.0 {
                continue;
            }

            match best_candidate {
                Some((best_sheet_index, _, _, best_remaining_width_mm))
                    if remaining_width_mm > best_remaining_width_mm
                        || ((remaining_width_mm - best_remaining_width_mm).abs()
                            <= f64::EPSILON
                            && sheet_index >= best_sheet_index) => {}
                _ => best_candidate = Some((sheet_index, shelf_index, x_mm, remaining_width_mm)),
            }
        }
    }

    if let Some((sheet_index, shelf_index, x_mm, _)) = best_candidate {
        let sheet = &mut sheets[sheet_index];
        let y_mm = sheet.shelves[shelf_index].y_mm;
        sheet.shelves[shelf_index].used_width_mm = x_mm + box_data.width_mm;
        sheet.boxes.push(PlacedBox {
            box_data: box_data.clone(),
            x_mm,
            y_mm,
        });

        return true;
    }

    false
}

fn find_sheet_for_new_shelf(
    sheets: &[SheetCursor],
    box_data: &PackableBox,
    gap_mm: f64,
    settings: &StickerSettings,
    max_sheet_length_mm: f64,
) -> Option<usize> {
    let mut best_candidate: Option<(usize, f64)> = None;

    for (sheet_index, sheet) in sheets.iter().enumerate() {
        let projected_height_mm =
            projected_sheet_height_with_new_shelf(sheet, box_data.height_mm, gap_mm);

        if projected_height_mm > max_sheet_length_mm
            || should_start_new_preferred_sheet(sheet, projected_height_mm, settings)
        {
            continue;
        }

        match best_candidate {
            Some((best_sheet_index, best_height_mm))
                if projected_height_mm > best_height_mm
                    || ((projected_height_mm - best_height_mm).abs() <= f64::EPSILON
                        && sheet_index >= best_sheet_index) => {}
            _ => best_candidate = Some((sheet_index, projected_height_mm)),
        }
    }

    best_candidate.map(|(sheet_index, _)| sheet_index)
}

fn place_box_on_new_shelf(sheet: &mut SheetCursor, box_data: &PackableBox, gap_mm: f64) {
    let y_mm = if sheet.shelves.is_empty() {
        0.0
    } else {
        sheet_used_height(sheet) + gap_mm
    };

    sheet.shelves.push(ShelfCursor {
        height_mm: box_data.height_mm,
        used_width_mm: box_data.width_mm,
        y_mm,
    });
    sheet.boxes.push(PlacedBox {
        box_data: box_data.clone(),
        x_mm: 0.0,
        y_mm,
    });
}

fn projected_sheet_height_with_new_shelf(sheet: &SheetCursor, height_mm: f64, gap_mm: f64) -> f64 {
    if sheet.shelves.is_empty() {
        height_mm
    } else {
        sheet_used_height(sheet) + gap_mm + height_mm
    }
}

fn sheet_used_height(sheet: &SheetCursor) -> f64 {
    sheet
        .shelves
        .last()
        .map(|shelf| shelf.y_mm + shelf.height_mm)
        .unwrap_or(0.0)
}

fn sheet_used_width(sheet: &SheetCursor) -> f64 {
    sheet
        .boxes
        .iter()
        .map(|placed_box| placed_box.x_mm + placed_box.box_data.width_mm)
        .fold(0.0, f64::max)
}

fn compare_packable_boxes(left: &PackableBox, right: &PackableBox) -> Ordering {
    compare_f64_desc(left.height_mm, right.height_mm)
        .then_with(|| compare_f64_desc(left.width_mm, right.width_mm))
        .then_with(|| left.source_order.cmp(&right.source_order))
}

fn compare_sticker_items_by_size(left: &StickerItem, right: &StickerItem) -> Ordering {
    compare_f64_desc(left.height_mm, right.height_mm)
        .then_with(|| compare_f64_desc(left.width_mm, right.width_mm))
}

fn compare_f64_desc(left: f64, right: f64) -> Ordering {
    right.partial_cmp(&left).unwrap_or(Ordering::Equal)
}

fn finite_or_default(value: f64, fallback: f64) -> f64 {
    if value.is_finite() { value } else { fallback }
}

fn positive_or_default(value: f64, fallback: f64) -> f64 {
    if value.is_finite() && value > 0.0 {
        value
    } else {
        fallback
    }
}
