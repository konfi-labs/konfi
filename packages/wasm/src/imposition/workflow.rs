use crate::common::{PRINTER_MARGIN_MM, mm_to_points};
use crate::imposition::models::{BleedType, ImpositionDataInput, LayoutType, SourceSizing};

#[derive(Debug, Clone)]
pub struct ImpositionWorkflow {
    pub sheet_width: f64,
    pub sheet_height: f64,
    pub item_width: f64,
    pub item_height: f64,
    pub num_items_horizontal: usize,
    pub num_items_vertical: usize,
    pub spacing_horizontal: Vec<f64>,
    pub spacing_vertical: Vec<f64>,
    pub crop_mark_length: f64,
    pub crop_mark_offset: f64,
    pub bleed: f64,
    pub bleed_type: BleedType,
    pub source_sizing: SourceSizing,
    pub crop_marks: bool,
    pub layout_type: LayoutType,
    pub pages_per_signature: Option<usize>,
    pub binding_edge: Option<String>,
    pub duplex_mode: Option<String>,
    pub back_page_rotation: Option<String>,
    pub front_back_alignment: bool,
    pub mirror_back: bool,
    pub automatic_sheet_orientation: bool,
    pub automatic_item_orientation: bool,
    pub automatic_number_of_horizontal_items: bool,
    pub automatic_number_of_vertical_items: bool,
    pub automatic_spacing_horizontal: bool,
    pub automatic_spacing_vertical: bool,
    pub file_width: Option<f64>,
    pub file_height: Option<f64>,
    pub scaling_factor: f64,
    pub needs_scaling: bool,
    pub needs_bleed_addition: bool,
    pub size_tolerance_pts: f64,
}

impl ImpositionWorkflow {
    pub fn from_input(input: &ImpositionDataInput) -> Result<Self, String> {
        let mut sheet_width_mm = input.custom_sheet_size_width;
        let mut sheet_height_mm = input.custom_sheet_size_height;
        let mut item_width_mm = input.custom_item_size_width;
        let mut item_height_mm = input.custom_item_size_height;

        if sheet_width_mm <= 0.0 || sheet_height_mm <= 0.0 {
            return Err("Sheet dimensions must be greater than zero".to_string());
        }
        if item_width_mm <= 0.0 || item_height_mm <= 0.0 {
            return Err("Item dimensions must be greater than zero".to_string());
        }

        if input.automatic_sheet_orientation {
            // Test both orientations and pick the one that maximizes item fit
            let portrait_w = sheet_width_mm.min(sheet_height_mm);
            let portrait_h = sheet_width_mm.max(sheet_height_mm);
            let landscape_w = portrait_h;
            let landscape_h = portrait_w;

            let portrait_fit = calculate_orientation_fit(
                portrait_w,
                portrait_h,
                item_width_mm,
                item_height_mm,
                input.automatic_item_orientation,
            );
            let landscape_fit = calculate_orientation_fit(
                landscape_w,
                landscape_h,
                item_width_mm,
                item_height_mm,
                input.automatic_item_orientation,
            );

            if landscape_fit > portrait_fit {
                sheet_width_mm = landscape_w;
                sheet_height_mm = landscape_h;
            } else {
                sheet_width_mm = portrait_w;
                sheet_height_mm = portrait_h;
            }
        }

        if input.automatic_item_orientation {
            let normal_horizontal = ((sheet_width_mm - PRINTER_MARGIN_MM) / item_width_mm)
                .floor()
                .max(0.0);
            let normal_vertical = ((sheet_height_mm - PRINTER_MARGIN_MM) / item_height_mm)
                .floor()
                .max(0.0);
            let rotated_horizontal = ((sheet_width_mm - PRINTER_MARGIN_MM) / item_height_mm)
                .floor()
                .max(0.0);
            let rotated_vertical = ((sheet_height_mm - PRINTER_MARGIN_MM) / item_width_mm)
                .floor()
                .max(0.0);

            if rotated_horizontal * rotated_vertical > normal_horizontal * normal_vertical {
                std::mem::swap(&mut item_width_mm, &mut item_height_mm);
            }
        }

        let num_items_horizontal = if input.automatic_number_of_horizontal_items {
            ((sheet_width_mm - PRINTER_MARGIN_MM) / item_width_mm)
                .floor()
                .max(1.0) as usize
        } else {
            input.num_items_horizontal.max(1)
        };
        let num_items_vertical = if input.automatic_number_of_vertical_items {
            ((sheet_height_mm - PRINTER_MARGIN_MM) / item_height_mm)
                .floor()
                .max(1.0) as usize
        } else {
            input.num_items_vertical.max(1)
        };

        let spacing_horizontal = if input.automatic_spacing_horizontal {
            vec![0.0]
        } else {
            parse_spacing_values(&input.spacing_horizontal)
        };
        let spacing_vertical = if input.automatic_spacing_vertical {
            vec![0.0]
        } else {
            parse_spacing_values(&input.spacing_vertical)
        };

        let expected_horizontal_spacing = num_items_horizontal.saturating_sub(1);
        let expected_vertical_spacing = num_items_vertical.saturating_sub(1);

        let normalized_horizontal_spacing = normalize_spacing_values(
            spacing_horizontal,
            expected_horizontal_spacing,
            num_items_horizontal,
            "spacingHorizontal",
        )?;
        let normalized_vertical_spacing = normalize_spacing_values(
            spacing_vertical,
            expected_vertical_spacing,
            num_items_vertical,
            "spacingVertical",
        )?;

        let bleed = match input.bleed_type {
            BleedType::OnePointFiveMmScale => mm_to_points(1.5),
            BleedType::TwoMmMirror => mm_to_points(2.0),
            BleedType::DifferentialDiffusion | BleedType::ContentAwareFast
                if input.bleed <= 0.0 =>
            {
                mm_to_points(3.0)
            }
            _ => mm_to_points(input.bleed.max(0.0)),
        };

        Ok(Self {
            sheet_width: mm_to_points(sheet_width_mm),
            sheet_height: mm_to_points(sheet_height_mm),
            item_width: mm_to_points(item_width_mm),
            item_height: mm_to_points(item_height_mm),
            num_items_horizontal,
            num_items_vertical,
            spacing_horizontal: normalized_horizontal_spacing,
            spacing_vertical: normalized_vertical_spacing,
            crop_mark_length: mm_to_points(6.0),
            crop_mark_offset: mm_to_points(3.0),
            bleed,
            bleed_type: input.bleed_type.clone(),
            source_sizing: input.source_sizing.clone(),
            crop_marks: input.crop_marks,
            layout_type: input.layout.clone(),
            pages_per_signature: input.pages_per_signature,
            binding_edge: input.binding_edge.clone(),
            duplex_mode: input.duplex_mode.clone(),
            back_page_rotation: input.back_page_rotation.clone(),
            front_back_alignment: input.front_back_alignment,
            mirror_back: input.mirror_back,
            automatic_sheet_orientation: input.automatic_sheet_orientation,
            automatic_item_orientation: input.automatic_item_orientation,
            automatic_number_of_horizontal_items: input.automatic_number_of_horizontal_items,
            automatic_number_of_vertical_items: input.automatic_number_of_vertical_items,
            automatic_spacing_horizontal: input.automatic_spacing_horizontal,
            automatic_spacing_vertical: input.automatic_spacing_vertical,
            file_width: None,
            file_height: None,
            scaling_factor: 1.0,
            needs_scaling: false,
            needs_bleed_addition: false,
            size_tolerance_pts: mm_to_points(0.1),
        })
    }

    pub fn set_source_dimensions(&mut self, file_width: f64, file_height: f64) {
        self.file_width = Some(file_width);
        self.file_height = Some(file_height);
        self.determine_scaling_strategy();
    }

    pub fn determine_scaling_strategy(&mut self) {
        let Some(file_width) = self.file_width else {
            return;
        };
        let Some(file_height) = self.file_height else {
            return;
        };

        self.scaling_factor = 1.0;
        self.needs_scaling = false;
        self.needs_bleed_addition = false;

        let maybe_fit_target = match self.bleed_type {
            BleedType::NoBleed => match self.source_sizing {
                SourceSizing::FitOutputBox => Some((self.item_width, self.item_height)),
                SourceSizing::PreserveOriginalSize => None,
            },
            BleedType::BleedIncluded => match self.source_sizing {
                SourceSizing::FitOutputBox => Some((
                    self.item_width + 2.0 * self.bleed,
                    self.item_height + 2.0 * self.bleed,
                )),
                SourceSizing::PreserveOriginalSize => None,
            },
            BleedType::OnePointFiveMmScale
            | BleedType::DifferentialDiffusion
            | BleedType::ContentAwareFast => Some((
                self.item_width + 2.0 * self.bleed,
                self.item_height + 2.0 * self.bleed,
            )),
            BleedType::TwoMmMirror => Some((self.item_width, self.item_height)),
        };

        let Some((target_width, target_height)) = maybe_fit_target else {
            return;
        };

        if (file_width - target_width).abs() <= self.size_tolerance_pts
            && (file_height - target_height).abs() <= self.size_tolerance_pts
        {
            return;
        }

        self.scaling_factor = cover_scale(file_width, file_height, target_width, target_height);
        self.needs_scaling = (self.scaling_factor - 1.0).abs() > f64::EPSILON;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::common::mm_to_points;
    use crate::imposition::models::SourceSizing;

    fn build_workflow(bleed_type: BleedType, source_sizing: SourceSizing) -> ImpositionWorkflow {
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
            source_sizing,
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

    #[test]
    fn no_bleed_item_sized_source_keeps_trim_without_added_bleed() {
        let mut workflow = build_workflow(BleedType::NoBleed, SourceSizing::PreserveOriginalSize);

        workflow.set_source_dimensions(mm_to_points(90.0), mm_to_points(120.0));

        assert_eq!(workflow.scaling_factor, 1.0);
        assert!(!workflow.needs_scaling);
        assert!(!workflow.needs_bleed_addition);
    }

    #[test]
    fn no_bleed_oversized_source_prefers_center_crop_over_downscaling() {
        let mut workflow = build_workflow(BleedType::NoBleed, SourceSizing::PreserveOriginalSize);

        workflow.set_source_dimensions(mm_to_points(96.0), mm_to_points(126.0));

        assert_eq!(workflow.scaling_factor, 1.0);
        assert!(!workflow.needs_scaling);
        assert!(!workflow.needs_bleed_addition);
    }

    #[test]
    fn bleed_included_preserve_original_size_keeps_undersized_source_at_100_percent() {
        let mut workflow =
            build_workflow(BleedType::BleedIncluded, SourceSizing::PreserveOriginalSize);

        workflow.set_source_dimensions(mm_to_points(90.0), mm_to_points(120.0));

        assert_eq!(workflow.scaling_factor, 1.0);
        assert!(!workflow.needs_scaling);
        assert!(!workflow.needs_bleed_addition);
    }

    #[test]
    fn bleed_included_fit_output_box_scales_to_cover_requested_bleed_area() {
        let mut workflow = build_workflow(BleedType::BleedIncluded, SourceSizing::FitOutputBox);

        workflow.set_source_dimensions(mm_to_points(90.0), mm_to_points(120.0));

        assert!(workflow.needs_scaling);
        assert!(!workflow.needs_bleed_addition);
        assert!((workflow.scaling_factor - 1.066_666_666_7).abs() < 0.0001);
    }

    #[test]
    fn no_bleed_fit_output_box_uses_cover_scaling_for_aspect_ratio_mismatch() {
        let mut workflow = build_workflow(BleedType::NoBleed, SourceSizing::FitOutputBox);

        workflow.set_source_dimensions(mm_to_points(90.0), mm_to_points(90.0));

        assert!(workflow.needs_scaling);
        assert!((workflow.scaling_factor - 1.333_333_333_3).abs() < 0.0001);
    }

    #[test]
    fn mirror_bleed_uses_cover_scaling_for_aspect_ratio_mismatch() {
        let mut workflow = build_workflow(BleedType::TwoMmMirror, SourceSizing::FitOutputBox);

        workflow.set_source_dimensions(mm_to_points(90.0), mm_to_points(90.0));

        assert!(workflow.needs_scaling);
        assert!((workflow.scaling_factor - 1.333_333_333_3).abs() < 0.0001);
    }
}

fn cover_scale(file_width: f64, file_height: f64, target_width: f64, target_height: f64) -> f64 {
    if file_width <= 0.0 || file_height <= 0.0 {
        return 1.0;
    }

    (target_width / file_width).max(target_height / file_height)
}

/// Calculate the maximum number of items that fit on a sheet with the given orientation,
/// considering optional automatic item orientation (testing both rotations).
fn calculate_orientation_fit(
    sheet_w: f64,
    sheet_h: f64,
    item_w: f64,
    item_h: f64,
    auto_item_orientation: bool,
) -> f64 {
    let fit = |sw: f64, sh: f64, iw: f64, ih: f64| -> f64 {
        ((sw - PRINTER_MARGIN_MM) / iw).floor().max(0.0)
            * ((sh - PRINTER_MARGIN_MM) / ih).floor().max(0.0)
    };

    let normal_fit = fit(sheet_w, sheet_h, item_w, item_h);

    if auto_item_orientation {
        let rotated_fit = fit(sheet_w, sheet_h, item_h, item_w);
        normal_fit.max(rotated_fit)
    } else {
        normal_fit
    }
}

fn parse_spacing_values(value: &str) -> Vec<f64> {
    value
        .split(',')
        .filter_map(|entry| {
            let trimmed = entry.trim();
            if trimmed.is_empty() {
                None
            } else {
                trimmed.parse::<f64>().ok().map(|parsed| parsed.max(0.0))
            }
        })
        .collect()
}

fn normalize_spacing_values(
    spacing_values: Vec<f64>,
    expected_spacing_count: usize,
    item_count: usize,
    _field_name: &str,
) -> Result<Vec<f64>, String> {
    if item_count <= 1 || expected_spacing_count == 0 {
        return Ok(Vec::new());
    }

    if spacing_values.is_empty() {
        return Ok(vec![0.0; expected_spacing_count]);
    }

    if spacing_values.len() == 1 {
        return Ok(vec![spacing_values[0]; expected_spacing_count]);
    }

    if spacing_values.len() >= expected_spacing_count {
        return Ok(spacing_values[..expected_spacing_count].to_vec());
    }

    // Pad with the last value to reach expected count
    let mut padded = spacing_values;
    let last_value = *padded.last().unwrap_or(&0.0);
    padded.resize(expected_spacing_count, last_value);
    Ok(padded)
}
