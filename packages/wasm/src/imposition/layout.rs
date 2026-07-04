use crate::common::{mm_to_points, points_to_mm};
use crate::imposition::models::{BleedType, LayoutType};
use crate::imposition::workflow::ImpositionWorkflow;

#[derive(Debug, Clone)]
pub struct PositionSlot {
    pub index: usize,
    pub x: f64,
    pub y: f64,
    pub col: usize,
    pub row: usize,
}

#[derive(Debug, Clone)]
pub struct SafeBleeds {
    pub left_bleed: f64,
    pub right_bleed: f64,
    pub bottom_bleed: f64,
    pub top_bleed: f64,
}

#[derive(Debug, Clone)]
pub struct CropBox {
    pub x0: f64,
    pub y0: f64,
    pub x1: f64,
    pub y1: f64,
}

pub fn calculate_positions(workflow: &ImpositionWorkflow) -> Vec<PositionSlot> {
    let mut positions = Vec::new();
    let mut x_offset = 0.0;
    let mut index = 0;

    for col in 0..workflow.num_items_horizontal {
        let mut y_offset = 0.0;
        for row in 0..workflow.num_items_vertical {
            positions.push(PositionSlot {
                index,
                x: x_offset,
                y: y_offset,
                col,
                row,
            });
            index += 1;

            y_offset += workflow.item_height;
            if row < workflow.num_items_vertical - 1 {
                y_offset += mm_to_points(workflow.spacing_vertical[row]);
            }
        }

        x_offset += workflow.item_width;
        if col < workflow.num_items_horizontal - 1 {
            x_offset += mm_to_points(workflow.spacing_horizontal[col]);
        }
    }

    positions
}

pub fn calculate_offsets(workflow: &ImpositionWorkflow) -> (f64, f64, f64, f64) {
    let total_width = workflow.item_width * workflow.num_items_horizontal as f64
        + workflow
            .spacing_horizontal
            .iter()
            .map(|value| mm_to_points(*value))
            .sum::<f64>();
    let total_height = workflow.item_height * workflow.num_items_vertical as f64
        + workflow
            .spacing_vertical
            .iter()
            .map(|value| mm_to_points(*value))
            .sum::<f64>();

    let x_offset = (workflow.sheet_width - total_width) / 2.0;
    let y_offset = (workflow.sheet_height - total_height) / 2.0;

    (total_width, total_height, x_offset, y_offset)
}

pub fn calculate_safe_bleeds(workflow: &ImpositionWorkflow, col: usize, row: usize) -> SafeBleeds {
    let full_bleed = if matches!(workflow.bleed_type, BleedType::NoBleed) {
        0.0
    } else {
        workflow.bleed
    };

    let left_bleed = if col == 0 {
        full_bleed
    } else {
        let left_spacing_mm = workflow
            .spacing_horizontal
            .get(col - 1)
            .copied()
            .unwrap_or(0.0);
        mm_to_points(left_spacing_mm) / 2.0
    };
    let right_bleed = if col == workflow.num_items_horizontal.saturating_sub(1) {
        full_bleed
    } else {
        let right_spacing_mm = workflow.spacing_horizontal.get(col).copied().unwrap_or(0.0);
        mm_to_points(right_spacing_mm) / 2.0
    };
    let bottom_bleed = if row == 0 {
        full_bleed
    } else {
        let bottom_spacing_mm = workflow
            .spacing_vertical
            .get(row - 1)
            .copied()
            .unwrap_or(0.0);
        mm_to_points(bottom_spacing_mm) / 2.0
    };
    let top_bleed = if row == workflow.num_items_vertical.saturating_sub(1) {
        full_bleed
    } else {
        let top_spacing_mm = workflow.spacing_vertical.get(row).copied().unwrap_or(0.0);
        mm_to_points(top_spacing_mm) / 2.0
    };

    SafeBleeds {
        left_bleed,
        right_bleed,
        bottom_bleed,
        top_bleed,
    }
}

pub fn centered_trim_box(
    source_width: f64,
    source_height: f64,
    item_width: f64,
    item_height: f64,
) -> CropBox {
    let item_center_x = source_width / 2.0;
    let item_center_y = source_height / 2.0;

    CropBox {
        x0: item_center_x - item_width / 2.0,
        y0: item_center_y - item_height / 2.0,
        x1: item_center_x + item_width / 2.0,
        y1: item_center_y + item_height / 2.0,
    }
}

pub fn calculate_crop_box_for_trim_box(
    workflow: &ImpositionWorkflow,
    source_width: f64,
    source_height: f64,
    trim_box: &CropBox,
    col: usize,
    row: usize,
) -> CropBox {
    let safe_bleeds = calculate_safe_bleeds(workflow, col, row);
    let left_bleed = if col == 0 && !matches!(workflow.bleed_type, BleedType::NoBleed) {
        trim_box.x0
    } else {
        safe_bleeds.left_bleed
    };
    let right_bleed = if col == workflow.num_items_horizontal.saturating_sub(1)
        && !matches!(workflow.bleed_type, BleedType::NoBleed)
    {
        (source_width - trim_box.x1).max(0.0)
    } else {
        safe_bleeds.right_bleed
    };
    let bottom_bleed = if row == 0 && !matches!(workflow.bleed_type, BleedType::NoBleed) {
        trim_box.y0
    } else {
        safe_bleeds.bottom_bleed
    };
    let top_bleed = if row == workflow.num_items_vertical.saturating_sub(1)
        && !matches!(workflow.bleed_type, BleedType::NoBleed)
    {
        (source_height - trim_box.y1).max(0.0)
    } else {
        safe_bleeds.top_bleed
    };

    CropBox {
        x0: (trim_box.x0 - left_bleed).max(0.0),
        y0: (trim_box.y0 - bottom_bleed).max(0.0),
        x1: (trim_box.x1 + right_bleed).min(source_width),
        y1: (trim_box.y1 + top_bleed).min(source_height),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::common::mm_to_points;
    use crate::imposition::models::{BleedType, ImpositionDataInput, LayoutType, SourceSizing};

    fn build_workflow(bleed_type: BleedType) -> ImpositionWorkflow {
        ImpositionWorkflow::from_input(&ImpositionDataInput {
            custom_sheet_size_width: 210.0,
            custom_sheet_size_height: 297.0,
            custom_item_size_width: 90.0,
            custom_item_size_height: 120.0,
            num_items_horizontal: 1,
            num_items_vertical: 1,
            spacing_horizontal: String::new(),
            spacing_vertical: String::new(),
            bleed: 3.0,
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
        .expect("workflow should be valid")
    }

    fn build_layout_workflow(
        layout: LayoutType,
        horizontal: usize,
        vertical: usize,
    ) -> ImpositionWorkflow {
        ImpositionWorkflow::from_input(&ImpositionDataInput {
            custom_sheet_size_width: 210.0,
            custom_sheet_size_height: 297.0,
            custom_item_size_width: 90.0,
            custom_item_size_height: 120.0,
            num_items_horizontal: horizontal,
            num_items_vertical: vertical,
            spacing_horizontal: String::new(),
            spacing_vertical: String::new(),
            bleed: 3.0,
            bleed_type: BleedType::NoBleed,
            source_sizing: SourceSizing::PreserveOriginalSize,
            crop_marks: false,
            layout,
            pages_per_signature: Some(8),
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
        .expect("workflow should be valid")
    }

    #[test]
    fn no_bleed_crop_box_drops_existing_bleed_margin_from_oversized_inputs() {
        let workflow = build_workflow(BleedType::NoBleed);
        let bleed = mm_to_points(3.0);
        let trim_box = centered_trim_box(
            workflow.item_width + 2.0 * bleed,
            workflow.item_height + 2.0 * bleed,
            workflow.item_width,
            workflow.item_height,
        );
        let crop_box = calculate_crop_box_for_trim_box(
            &workflow,
            workflow.item_width + 2.0 * bleed,
            workflow.item_height + 2.0 * bleed,
            &trim_box,
            0,
            0,
        );

        assert!((crop_box.x0 - bleed).abs() < 0.0001);
        assert!((crop_box.y0 - bleed).abs() < 0.0001);
        assert!((crop_box.x1 - (bleed + workflow.item_width)).abs() < 0.0001);
        assert!((crop_box.y1 - (bleed + workflow.item_height)).abs() < 0.0001);
    }

    #[test]
    fn bleed_crop_box_keeps_outer_edges_and_cuts_between_touching_items() {
        let mut workflow = build_workflow(BleedType::BleedIncluded);
        workflow.num_items_horizontal = 2;
        workflow.spacing_horizontal = vec![0.0];

        let source_width = workflow.item_width + 20.0;
        let source_height = workflow.item_height + 20.0;
        let trim_box = CropBox {
            x0: 8.0,
            y0: 6.0,
            x1: 8.0 + workflow.item_width,
            y1: 6.0 + workflow.item_height,
        };

        let left_crop = calculate_crop_box_for_trim_box(
            &workflow,
            source_width,
            source_height,
            &trim_box,
            0,
            0,
        );
        let right_crop = calculate_crop_box_for_trim_box(
            &workflow,
            source_width,
            source_height,
            &trim_box,
            1,
            0,
        );

        assert!((left_crop.x0 - 0.0).abs() < 0.0001);
        assert!((left_crop.y0 - 0.0).abs() < 0.0001);
        assert!((left_crop.x1 - trim_box.x1).abs() < 0.0001);
        assert!((left_crop.y1 - source_height).abs() < 0.0001);
        assert!((right_crop.x0 - trim_box.x0).abs() < 0.0001);
        assert!((right_crop.y0 - 0.0).abs() < 0.0001);
        assert!((right_crop.x1 - source_width).abs() < 0.0001);
        assert!((right_crop.y1 - source_height).abs() < 0.0001);
    }

    #[test]
    fn shuffle_arrangement_interleaves_from_both_sheet_edges_without_duplicates() {
        let workflow = build_layout_workflow(LayoutType::Shuffle, 2, 2);

        let arrangements = build_sheet_arrangements(&workflow, 4);

        assert_eq!(arrangements, vec![vec![Some(0), Some(3), Some(1), Some(2)]]);
    }

    #[test]
    fn dutch_cut_arrangement_matches_column_major_slot_order() {
        let workflow = build_layout_workflow(LayoutType::DutchCut, 2, 2);

        let arrangements = build_sheet_arrangements(&workflow, 4);

        assert_eq!(arrangements, vec![vec![Some(0), Some(3), Some(1), Some(2)]]);
    }

    #[test]
    fn preview_arrangements_reuse_sheet_order_for_front_and_back() {
        let mut workflow = build_layout_workflow(LayoutType::Shuffle, 2, 2);
        workflow.duplex_mode = Some("DUPLEX_LONG_EDGE".to_string());

        let (front, back) = build_preview_sheet_arrangements(&workflow);

        assert_eq!(front, vec![Some(0), Some(3), Some(1), Some(2)]);
        assert_eq!(
            back.expect("duplex preview should expose a back side"),
            vec![Some(4), Some(7), Some(5), Some(6)]
        );
        assert_eq!(slot_page_label(&workflow, 1, false), "4");
        assert_eq!(slot_page_label(&workflow, 3, true), "7");
    }

    #[test]
    fn booklet_preview_exposes_back_side_even_without_duplex_mode() {
        let workflow = build_layout_workflow(LayoutType::Booklet, 2, 1);

        assert!(has_back_side(&workflow));
        // With pages_per_signature=8, the outermost sheet front-left is page 8 (last of sig)
        // and back-left is page 2 (second of sig).
        assert_eq!(slot_page_label(&workflow, 0, false), "8");
        assert_eq!(slot_page_label(&workflow, 0, true), "2");
    }
}

pub fn build_sheet_arrangements(
    workflow: &ImpositionWorkflow,
    source_page_count: usize,
) -> Vec<Vec<Option<usize>>> {
    let slots_per_sheet = workflow.num_items_horizontal * workflow.num_items_vertical;
    match workflow.layout_type {
        LayoutType::StepAndRepeat => (0..source_page_count)
            .map(|page_index| vec![Some(page_index); slots_per_sheet])
            .collect(),
        LayoutType::Booklet => calculate_booklet_sheet_arrangements(
            slots_per_sheet,
            source_page_count,
            workflow.pages_per_signature,
        ),
        LayoutType::NUp => calculate_n_up_sheet_arrangements(slots_per_sheet, source_page_count),
        LayoutType::CutStack => {
            calculate_n_up_sheet_arrangements(slots_per_sheet, source_page_count)
        }
        LayoutType::Shuffle => {
            calculate_shuffle_sheet_arrangements(slots_per_sheet, source_page_count)
        }
        LayoutType::DutchCut => calculate_dutch_cut_sheet_arrangements(
            workflow.num_items_horizontal,
            workflow.num_items_vertical,
            source_page_count,
        ),
    }
}

fn calculate_n_up_sheet_arrangements(
    slots_per_sheet: usize,
    total_pages: usize,
) -> Vec<Vec<Option<usize>>> {
    let mut sheets = Vec::new();
    let mut page_index = 0;

    while page_index < total_pages {
        let mut arrangement = Vec::with_capacity(slots_per_sheet);
        for slot_index in 0..slots_per_sheet {
            let absolute_index = page_index + slot_index;
            arrangement.push((absolute_index < total_pages).then_some(absolute_index));
        }
        sheets.push(arrangement);
        page_index += slots_per_sheet;
    }

    if sheets.is_empty() {
        sheets.push(vec![None; slots_per_sheet]);
    }

    sheets
}

fn calculate_shuffle_sheet_arrangements(
    slots_per_sheet: usize,
    total_pages: usize,
) -> Vec<Vec<Option<usize>>> {
    let mut sheets = Vec::new();
    let mut sheet_start = 0;

    while sheet_start < total_pages {
        let mut arrangement = Vec::with_capacity(slots_per_sheet);
        for position in 0..slots_per_sheet {
            let page_index = if position % 2 == 0 {
                sheet_start + (position / 2)
            } else {
                sheet_start + slots_per_sheet.saturating_sub(1) - (position / 2)
            };
            arrangement.push(
                (page_index < total_pages && page_index >= sheet_start).then_some(page_index),
            );
        }
        sheets.push(arrangement);
        sheet_start += slots_per_sheet;
    }

    if sheets.is_empty() {
        sheets.push(vec![None; slots_per_sheet]);
    }

    sheets
}

fn calculate_dutch_cut_sheet_arrangements(
    horizontal: usize,
    vertical: usize,
    total_pages: usize,
) -> Vec<Vec<Option<usize>>> {
    let slots_per_sheet = horizontal * vertical;
    let mut sheets = Vec::new();
    let mut sheet_start = 0;

    while sheet_start < total_pages {
        let mut arrangement = Vec::with_capacity(slots_per_sheet);
        for col in 0..horizontal {
            for row in 0..vertical {
                let serpentine_col = if row % 2 == 0 {
                    col
                } else {
                    horizontal - 1 - col
                };
                let physical_position = row * horizontal + serpentine_col;
                let page_index = sheet_start + physical_position;
                arrangement.push((page_index < total_pages).then_some(page_index));
            }
        }
        sheets.push(arrangement);
        sheet_start += slots_per_sheet;
    }

    if sheets.is_empty() {
        sheets.push(vec![None; slots_per_sheet]);
    }

    sheets
}

fn calculate_booklet_sheet_arrangements(
    slots_per_sheet: usize,
    total_pages: usize,
    pages_per_signature: Option<usize>,
) -> Vec<Vec<Option<usize>>> {
    if total_pages == 0 {
        return vec![vec![None; slots_per_sheet]];
    }

    // Each physical sheet holds 4 page sides (2 per face × 2 faces).
    // The signature size must be a multiple of 4; default to a single
    // signature spanning all pages when no explicit size is provided.
    let pages_per_sheet = 4usize;
    let raw_sig_size = pages_per_signature
        .unwrap_or(total_pages)
        .max(pages_per_sheet);
    let sig_size = raw_sig_size.div_ceil(pages_per_sheet) * pages_per_sheet;

    let adjusted_total = total_pages.div_ceil(sig_size) * sig_size;
    let num_signatures = adjusted_total / sig_size;
    let sheets_per_sig = sig_size / pages_per_sheet;

    let mut sheets = Vec::new();

    for sig_idx in 0..num_signatures {
        let sig_start = sig_idx * sig_size;

        for j in 0..sheets_per_sig {
            // Saddle-stitch nesting: the outermost sheet (j=0) pairs the
            // last and first pages of the signature; inner sheets work inward.
            let front_left_idx = sig_start + sig_size - 1 - 2 * j;
            let front_right_idx = sig_start + 2 * j;
            let back_left_idx = sig_start + 2 * j + 1;
            let back_right_idx = sig_start + sig_size - 2 - 2 * j;

            let mut front = vec![None; slots_per_sheet];
            if !front.is_empty() {
                front[0] = (front_left_idx < total_pages).then_some(front_left_idx);
            }
            if slots_per_sheet > 1 {
                front[1] = (front_right_idx < total_pages).then_some(front_right_idx);
            }
            sheets.push(front);

            let mut back = vec![None; slots_per_sheet];
            if !back.is_empty() {
                back[0] = (back_left_idx < total_pages).then_some(back_left_idx);
            }
            if slots_per_sheet > 1 {
                back[1] = (back_right_idx < total_pages).then_some(back_right_idx);
            }
            sheets.push(back);
        }
    }

    if sheets.is_empty() {
        sheets.push(vec![None; slots_per_sheet]);
    }

    sheets
}

pub fn is_duplex_mode(mode: Option<&str>) -> bool {
    matches!(mode, Some("DUPLEX_LONG_EDGE" | "DUPLEX_SHORT_EDGE"))
}

pub fn has_back_side(workflow: &ImpositionWorkflow) -> bool {
    matches!(workflow.layout_type, LayoutType::Booklet)
        || is_duplex_mode(workflow.duplex_mode.as_deref())
}

fn preview_source_page_count(workflow: &ImpositionWorkflow) -> usize {
    let slots_per_sheet = workflow.num_items_horizontal * workflow.num_items_vertical;

    match workflow.layout_type {
        LayoutType::StepAndRepeat => {
            if has_back_side(workflow) {
                2
            } else {
                1
            }
        }
        LayoutType::Booklet => workflow
            .pages_per_signature
            .unwrap_or((slots_per_sheet * 2).max(4))
            .max(4),
        LayoutType::NUp | LayoutType::CutStack | LayoutType::Shuffle | LayoutType::DutchCut => {
            if has_back_side(workflow) {
                slots_per_sheet * 2
            } else {
                slots_per_sheet
            }
        }
    }
}

pub fn build_preview_sheet_arrangements(
    workflow: &ImpositionWorkflow,
) -> (Vec<Option<usize>>, Option<Vec<Option<usize>>>) {
    let slots_per_sheet = workflow.num_items_horizontal * workflow.num_items_vertical;
    let arrangements = build_sheet_arrangements(workflow, preview_source_page_count(workflow));
    let front = arrangements
        .first()
        .cloned()
        .unwrap_or_else(|| vec![None; slots_per_sheet]);
    let back = if has_back_side(workflow) {
        Some(
            arrangements
                .get(1)
                .cloned()
                .unwrap_or_else(|| vec![None; slots_per_sheet]),
        )
    } else {
        None
    };

    (front, back)
}

pub fn back_page_transform(rotation: Option<&str>, mirror_back: bool) -> String {
    let rotation_transform = match rotation {
        Some("ROTATION_90") => Some("rotate(90deg)"),
        Some("ROTATION_180") => Some("rotate(180deg)"),
        Some("ROTATION_270") => Some("rotate(270deg)"),
        _ => None,
    };

    match (rotation_transform, mirror_back) {
        (Some(rotation_transform), true) => format!("{rotation_transform} scaleX(-1)"),
        (Some(rotation_transform), false) => rotation_transform.to_string(),
        (None, true) => "scaleX(-1)".to_string(),
        (None, false) => String::new(),
    }
}

#[cfg(test)]
pub fn slot_page_label(
    workflow: &ImpositionWorkflow,
    slot_index: usize,
    is_back_side: bool,
) -> String {
    let (front, back) = build_preview_sheet_arrangements(workflow);
    let arrangement = if is_back_side {
        back.as_deref().unwrap_or(&front)
    } else {
        &front
    };

    arrangement
        .get(slot_index)
        .and_then(|page_index| page_index.map(|page_index| (page_index + 1).to_string()))
        .unwrap_or_default()
}

pub fn dimension_points_json(width_points: f64, height_points: f64) -> serde_json::Value {
    serde_json::json!({
        "widthPoints": round_points(width_points),
        "heightPoints": round_points(height_points),
        "widthMm": points_to_mm(width_points),
        "heightMm": points_to_mm(height_points),
    })
}

fn round_points(value: f64) -> f64 {
    (value * 1000.0).round() / 1000.0
}
