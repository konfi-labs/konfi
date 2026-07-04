use crate::preflight::RasterColorSpace;

#[derive(Debug, Clone, Copy)]
pub struct BleedInsetsPx {
    pub left: u32,
    pub right: u32,
    pub top: u32,
    pub bottom: u32,
}

#[derive(Debug, Clone, Copy)]
enum AxisProjection {
    Inside(u32),
    Outside { distance: u32, before: bool },
}

pub fn content_aware_pad_raster_data(
    data: &[u8],
    width_px: u32,
    height_px: u32,
    color_space: RasterColorSpace,
    insets: BleedInsetsPx,
) -> Result<Vec<u8>, String> {
    validate_raster_data(data, width_px, height_px, color_space)?;

    if insets.left == 0 && insets.right == 0 && insets.top == 0 && insets.bottom == 0 {
        return Ok(data.to_vec());
    }

    Ok(extrapolate_bleed_data(
        data,
        width_px,
        height_px,
        color_space,
        insets,
    ))
}

pub fn mirror_pad_raster_data(
    data: &[u8],
    width_px: u32,
    height_px: u32,
    color_space: RasterColorSpace,
    insets: BleedInsetsPx,
) -> Vec<u8> {
    if insets.left == 0 && insets.right == 0 && insets.top == 0 && insets.bottom == 0 {
        return data.to_vec();
    }

    let channels = color_space_channel_count(color_space);
    let padded_width_px = width_px + insets.left + insets.right;
    let padded_height_px = height_px + insets.top + insets.bottom;
    let mut padded = vec![0_u8; padded_width_px as usize * padded_height_px as usize * channels];

    for padded_y in 0..padded_height_px {
        let source_y = mirrored_pixel_index(padded_y as i64 - insets.top as i64, height_px);

        for padded_x in 0..padded_width_px {
            let source_x = mirrored_pixel_index(padded_x as i64 - insets.left as i64, width_px);
            let source_offset = (source_y * width_px as usize + source_x) * channels;
            let padded_offset =
                (padded_y as usize * padded_width_px as usize + padded_x as usize) * channels;

            padded[padded_offset..padded_offset + channels]
                .copy_from_slice(&data[source_offset..source_offset + channels]);
        }
    }

    padded
}

fn extrapolate_bleed_data(
    data: &[u8],
    width_px: u32,
    height_px: u32,
    color_space: RasterColorSpace,
    insets: BleedInsetsPx,
) -> Vec<u8> {
    let channels = color_space_channel_count(color_space);
    let padded_width_px = width_px + insets.left + insets.right;
    let padded_height_px = height_px + insets.top + insets.bottom;
    let mut output = vec![0_u8; padded_width_px as usize * padded_height_px as usize * channels];

    for y in 0..padded_height_px {
        let y_projection = project_axis(y, insets.top, height_px);

        for x in 0..padded_width_px {
            let x_projection = project_axis(x, insets.left, width_px);
            let (source_x, source_y) = extrapolated_source_coordinate(
                data,
                width_px,
                height_px,
                channels,
                x_projection,
                y_projection,
            );
            let source_start = source_offset(source_x, source_y, width_px, channels);
            let output_offset = source_offset(x, y, padded_width_px, channels);

            output[output_offset..output_offset + channels]
                .copy_from_slice(&data[source_start..source_start + channels]);
        }
    }

    project_edge_features(&mut output, data, width_px, height_px, channels, insets);
    restore_center(&mut output, data, width_px, height_px, color_space, insets);

    output
}

fn extrapolated_source_coordinate(
    data: &[u8],
    width_px: u32,
    height_px: u32,
    channels: usize,
    x_projection: AxisProjection,
    y_projection: AxisProjection,
) -> (u32, u32) {
    match (x_projection, y_projection) {
        (AxisProjection::Inside(x), AxisProjection::Inside(y)) => (x, y),
        (AxisProjection::Outside { distance, before }, AxisProjection::Inside(y)) => {
            choose_horizontal_sample(data, width_px, height_px, channels, y, distance, before)
        }
        (AxisProjection::Inside(x), AxisProjection::Outside { distance, before }) => {
            choose_vertical_sample(data, width_px, height_px, channels, x, distance, before)
        }
        (
            AxisProjection::Outside {
                distance: x_distance,
                before: x_before,
            },
            AxisProjection::Outside {
                distance: y_distance,
                before: y_before,
            },
        ) => {
            let edge_x = if x_before { 0 } else { width_px - 1 };
            let edge_y = if y_before { 0 } else { height_px - 1 };

            if x_distance > y_distance {
                choose_horizontal_sample(
                    data, width_px, height_px, channels, edge_y, x_distance, x_before,
                )
            } else if y_distance > x_distance {
                choose_vertical_sample(
                    data, width_px, height_px, channels, edge_x, y_distance, y_before,
                )
            } else {
                (
                    choose_horizontal_sample(
                        data, width_px, height_px, channels, edge_y, x_distance, x_before,
                    )
                    .0,
                    choose_vertical_sample(
                        data, width_px, height_px, channels, edge_x, y_distance, y_before,
                    )
                    .1,
                )
            }
        }
    }
}

fn project_axis(value: u32, inset_before: u32, source_len: u32) -> AxisProjection {
    if value < inset_before {
        return AxisProjection::Outside {
            distance: inset_before - value,
            before: true,
        };
    }

    let source_end = inset_before + source_len;
    if value >= source_end {
        return AxisProjection::Outside {
            distance: value - source_end + 1,
            before: false,
        };
    }

    AxisProjection::Inside(value - inset_before)
}

fn choose_horizontal_sample(
    data: &[u8],
    width_px: u32,
    height_px: u32,
    channels: usize,
    row: u32,
    distance: u32,
    from_left: bool,
) -> (u32, u32) {
    let edge_x = if from_left { 0 } else { width_px - 1 };
    if width_px <= 1 {
        return (edge_x, row);
    }

    let tangent = horizontal_tangent_shift(data, width_px, height_px, channels, row, from_left);
    let depth = extrapolation_depth(distance, width_px, tangent.match_score);
    let mut source_x = if from_left {
        depth
    } else {
        width_px - 1 - depth
    };
    let mut source_y = shifted_coordinate(row, tangent.shift * depth as i32, height_px);
    if color_distance(data, width_px, channels, edge_x, row, source_x, source_y)
        > strong_edge_threshold(channels)
    {
        source_x = edge_x;
        source_y = row;
    }

    (source_x, source_y)
}

fn choose_vertical_sample(
    data: &[u8],
    width_px: u32,
    height_px: u32,
    channels: usize,
    col: u32,
    distance: u32,
    from_top: bool,
) -> (u32, u32) {
    let edge_y = if from_top { 0 } else { height_px - 1 };
    if height_px <= 1 {
        return (col, edge_y);
    }

    let tangent = vertical_tangent_shift(data, width_px, height_px, channels, col, from_top);
    let depth = extrapolation_depth(distance, height_px, tangent.match_score);
    let mut source_x = shifted_coordinate(col, tangent.shift * depth as i32, width_px);
    let mut source_y = if from_top {
        depth
    } else {
        height_px - 1 - depth
    };
    if color_distance(data, width_px, channels, col, edge_y, source_x, source_y)
        > strong_edge_threshold(channels)
    {
        source_x = col;
        source_y = edge_y;
    }

    (source_x, source_y)
}

#[derive(Debug, Clone, Copy)]
struct TangentShift {
    match_score: u32,
    shift: i32,
}

fn horizontal_tangent_shift(
    data: &[u8],
    width_px: u32,
    height_px: u32,
    channels: usize,
    row: u32,
    from_left: bool,
) -> TangentShift {
    let edge_x = if from_left { 0 } else { width_px - 1 };
    let inner_x = if from_left { 1 } else { width_px - 2 };
    let mut best = TangentShift {
        match_score: u32::MAX,
        shift: 0,
    };

    for shift in -2..=2 {
        let shifted_row = shifted_coordinate(row, shift, height_px);
        let mut score = color_distance(data, width_px, channels, edge_x, row, inner_x, shifted_row);
        score += shift.unsigned_abs() * 18;

        if score < best.match_score {
            best = TangentShift {
                match_score: score,
                shift,
            };
        }
    }

    if best.match_score > strong_edge_threshold(channels) {
        TangentShift {
            match_score: best.match_score,
            shift: 0,
        }
    } else {
        best
    }
}

fn vertical_tangent_shift(
    data: &[u8],
    width_px: u32,
    height_px: u32,
    channels: usize,
    col: u32,
    from_top: bool,
) -> TangentShift {
    let edge_y = if from_top { 0 } else { height_px - 1 };
    let inner_y = if from_top { 1 } else { height_px - 2 };
    let mut best = TangentShift {
        match_score: u32::MAX,
        shift: 0,
    };

    for shift in -2..=2 {
        let shifted_col = shifted_coordinate(col, shift, width_px);
        let mut score = color_distance(data, width_px, channels, col, edge_y, shifted_col, inner_y);
        score += shift.unsigned_abs() * 18;

        if score < best.match_score {
            best = TangentShift {
                match_score: score,
                shift,
            };
        }
    }

    if best.match_score > strong_edge_threshold(channels) {
        TangentShift {
            match_score: best.match_score,
            shift: 0,
        }
    } else {
        best
    }
}

fn project_edge_features(
    output: &mut [u8],
    data: &[u8],
    width_px: u32,
    height_px: u32,
    channels: usize,
    insets: BleedInsetsPx,
) {
    let padded_width_px = width_px + insets.left + insets.right;

    if insets.top > 0 && height_px > 1 {
        for col in 0..width_px {
            let tangent = vertical_tangent_shift(data, width_px, height_px, channels, col, true);
            project_vertical_edge_feature(
                output,
                data,
                width_px,
                height_px,
                padded_width_px,
                channels,
                insets.left,
                insets.top,
                insets.top,
                col,
                true,
                tangent,
            );
        }
    }

    if insets.bottom > 0 && height_px > 1 {
        for col in 0..width_px {
            let tangent = vertical_tangent_shift(data, width_px, height_px, channels, col, false);
            project_vertical_edge_feature(
                output,
                data,
                width_px,
                height_px,
                padded_width_px,
                channels,
                insets.left,
                insets.top,
                insets.bottom,
                col,
                false,
                tangent,
            );
        }
    }

    if insets.left > 0 && width_px > 1 {
        for row in 0..height_px {
            let tangent = horizontal_tangent_shift(data, width_px, height_px, channels, row, true);
            project_horizontal_edge_feature(
                output,
                data,
                width_px,
                height_px,
                padded_width_px,
                channels,
                insets.left,
                insets.top,
                insets.left,
                row,
                true,
                tangent,
            );
        }
    }

    if insets.right > 0 && width_px > 1 {
        for row in 0..height_px {
            let tangent = horizontal_tangent_shift(data, width_px, height_px, channels, row, false);
            project_horizontal_edge_feature(
                output,
                data,
                width_px,
                height_px,
                padded_width_px,
                channels,
                insets.right,
                insets.left,
                insets.top,
                row,
                false,
                tangent,
            );
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn project_vertical_edge_feature(
    output: &mut [u8],
    data: &[u8],
    width_px: u32,
    height_px: u32,
    padded_width_px: u32,
    channels: usize,
    inset_left: u32,
    inset_top: u32,
    bleed_size: u32,
    col: u32,
    from_top: bool,
    tangent: TangentShift,
) {
    if tangent.shift == 0 {
        return;
    }

    let edge_y = if from_top { 0 } else { height_px - 1 };
    let source_edge_offset = source_offset(col, edge_y, width_px, channels);

    for distance in 1..=bleed_size {
        let depth = (distance - 1).min(sampling_strip_depth(height_px) - 1);
        let source_x = shifted_coordinate(col, tangent.shift * depth as i32, width_px);
        let source_y = if from_top {
            depth
        } else {
            height_px - 1 - depth
        };

        if color_distance(data, width_px, channels, col, edge_y, source_x, source_y)
            > projection_threshold(channels)
        {
            continue;
        }

        let output_col = col as i32 - tangent.shift * distance as i32;
        if output_col < 0 || output_col >= width_px as i32 {
            continue;
        }

        let output_x = inset_left + output_col as u32;
        let output_y = if from_top {
            inset_top - distance
        } else {
            inset_top + height_px + distance - 1
        };
        let source_start = source_offset(source_x, source_y, width_px, channels);
        let output_offset = source_offset(output_x, output_y, padded_width_px, channels);

        output[output_offset..output_offset + channels]
            .copy_from_slice(&data[source_start..source_start + channels]);
        if distance == 1 {
            output[output_offset..output_offset + channels]
                .copy_from_slice(&data[source_edge_offset..source_edge_offset + channels]);
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn project_horizontal_edge_feature(
    output: &mut [u8],
    data: &[u8],
    width_px: u32,
    height_px: u32,
    padded_width_px: u32,
    channels: usize,
    bleed_size: u32,
    inset_left: u32,
    inset_top: u32,
    row: u32,
    from_left: bool,
    tangent: TangentShift,
) {
    if tangent.shift == 0 {
        return;
    }

    let edge_x = if from_left { 0 } else { width_px - 1 };
    let source_edge_offset = source_offset(edge_x, row, width_px, channels);

    for distance in 1..=bleed_size {
        let depth = (distance - 1).min(sampling_strip_depth(width_px) - 1);
        let source_x = if from_left {
            depth
        } else {
            width_px - 1 - depth
        };
        let source_y = shifted_coordinate(row, tangent.shift * depth as i32, height_px);

        if color_distance(data, width_px, channels, edge_x, row, source_x, source_y)
            > projection_threshold(channels)
        {
            continue;
        }

        let output_row = row as i32 - tangent.shift * distance as i32;
        if output_row < 0 || output_row >= height_px as i32 {
            continue;
        }

        let output_x = if from_left {
            inset_left - distance
        } else {
            inset_left + width_px + distance - 1
        };
        let output_y = inset_top + output_row as u32;
        let source_start = source_offset(source_x, source_y, width_px, channels);
        let output_offset = source_offset(output_x, output_y, padded_width_px, channels);

        output[output_offset..output_offset + channels]
            .copy_from_slice(&data[source_start..source_start + channels]);
        if distance == 1 {
            output[output_offset..output_offset + channels]
                .copy_from_slice(&data[source_edge_offset..source_edge_offset + channels]);
        }
    }
}

fn extrapolation_depth(distance: u32, source_len: u32, edge_match_score: u32) -> u32 {
    if source_len <= 1 || edge_match_score > strong_edge_threshold(1) * 2 {
        return 0;
    }

    let max_depth = sampling_strip_depth(source_len) - 1;
    (distance - 1).min(max_depth)
}

fn shifted_coordinate(value: u32, shift: i32, dimension: u32) -> u32 {
    if dimension <= 1 {
        return 0;
    }

    (value as i32 + shift).clamp(0, dimension as i32 - 1) as u32
}

fn strong_edge_threshold(channels: usize) -> u32 {
    40 * channels as u32
}

fn projection_threshold(channels: usize) -> u32 {
    strong_edge_threshold(channels) * 2
}

fn color_distance(
    data: &[u8],
    width_px: u32,
    channels: usize,
    ax: u32,
    ay: u32,
    bx: u32,
    by: u32,
) -> u32 {
    let a_offset = source_offset(ax, ay, width_px, channels);
    let b_offset = source_offset(bx, by, width_px, channels);
    let mut distance = 0_u32;

    for channel in 0..channels {
        distance +=
            (data[a_offset + channel] as i32 - data[b_offset + channel] as i32).unsigned_abs();
    }

    distance
}

fn restore_center(
    output: &mut [u8],
    source: &[u8],
    width_px: u32,
    height_px: u32,
    color_space: RasterColorSpace,
    insets: BleedInsetsPx,
) {
    let channels = color_space_channel_count(color_space);
    let padded_width_px = width_px + insets.left + insets.right;

    for y in 0..height_px {
        let source_start = source_offset(0, y, width_px, channels);
        let padded_offset = source_offset(insets.left, y + insets.top, padded_width_px, channels);
        let row_len = width_px as usize * channels;
        output[padded_offset..padded_offset + row_len]
            .copy_from_slice(&source[source_start..source_start + row_len]);
    }
}

fn validate_raster_data(
    data: &[u8],
    width_px: u32,
    height_px: u32,
    color_space: RasterColorSpace,
) -> Result<(), String> {
    if width_px == 0 || height_px == 0 {
        return Err("Cannot build content-aware bleed for an empty raster.".to_string());
    }

    let expected_len =
        width_px as usize * height_px as usize * color_space_channel_count(color_space);
    if data.len() != expected_len {
        return Err(format!(
            "Raster data length mismatch: expected {expected_len} bytes, got {}.",
            data.len()
        ));
    }

    Ok(())
}

fn color_space_channel_count(color_space: RasterColorSpace) -> usize {
    match color_space {
        RasterColorSpace::DeviceGray => 1,
        RasterColorSpace::DeviceRgb => 3,
    }
}

fn sampling_strip_depth(source_len: u32) -> u32 {
    source_len.min(10).max(1)
}

fn source_offset(x: u32, y: u32, width_px: u32, channels: usize) -> usize {
    (y as usize * width_px as usize + x as usize) * channels
}

fn mirrored_pixel_index(value: i64, dimension: u32) -> usize {
    if dimension <= 1 {
        return 0;
    }

    let dimension = dimension as i64;
    let period = dimension * 2;
    let mut position = value % period;

    if position < 0 {
        position += period;
    }

    if position >= dimension {
        (period - position - 1) as usize
    } else {
        position as usize
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn content_aware_solid_color_matches_source_color() {
        let source = vec![32_u8, 64, 128, 32, 64, 128, 32, 64, 128, 32, 64, 128];
        let output = content_aware_pad_raster_data(
            &source,
            2,
            2,
            RasterColorSpace::DeviceRgb,
            BleedInsetsPx {
                left: 1,
                right: 1,
                top: 1,
                bottom: 1,
            },
        )
        .expect("solid color bleed should extrapolate");

        assert_eq!(output.len(), 4 * 4 * 3);
        for chunk in output.chunks_exact(3) {
            assert_eq!(chunk, [32, 64, 128]);
        }
    }

    #[test]
    fn content_aware_edge_pattern_preserves_center_bytes() {
        let source = vec![
            255_u8, 0, 0, 0, 255, 0, //
            0, 0, 255, 255, 255, 0,
        ];
        let output = content_aware_pad_raster_data(
            &source,
            2,
            2,
            RasterColorSpace::DeviceRgb,
            BleedInsetsPx {
                left: 2,
                right: 2,
                top: 2,
                bottom: 2,
            },
        )
        .expect("edge pattern bleed should extrapolate");
        let padded_width = 6_usize;

        for y in 0..2_usize {
            let source_offset = y * 2 * 3;
            let output_offset = ((y + 2) * padded_width + 2) * 3;
            assert_eq!(
                &output[output_offset..output_offset + 2 * 3],
                &source[source_offset..source_offset + 2 * 3]
            );
        }
    }

    #[test]
    fn content_aware_side_bands_pull_from_their_own_edges() {
        let source = vec![
            255_u8, 0, 0, 10, 10, 10, 0, 255, 0, //
            255, 0, 0, 10, 10, 10, 0, 255, 0, //
            255, 0, 0, 10, 10, 10, 0, 255, 0,
        ];
        let output = content_aware_pad_raster_data(
            &source,
            3,
            3,
            RasterColorSpace::DeviceRgb,
            BleedInsetsPx {
                left: 2,
                right: 2,
                top: 0,
                bottom: 0,
            },
        )
        .expect("side bleed should extrapolate");
        let padded_width = 7_usize;

        let left_offset = (1 * padded_width + 0) * 3;
        let right_offset = (1 * padded_width + 6) * 3;
        assert_eq!(&output[left_offset..left_offset + 3], [255, 0, 0]);
        assert_eq!(&output[right_offset..right_offset + 3], [0, 255, 0]);
    }

    #[test]
    fn content_aware_keeps_stripe_bleed_crisp() {
        let source = vec![
            0_u8, 0, 0, 255, 255, 255, //
            0, 0, 0, 255, 255, 255, //
            0, 0, 0, 255, 255, 255,
        ];
        let output = content_aware_pad_raster_data(
            &source,
            2,
            3,
            RasterColorSpace::DeviceRgb,
            BleedInsetsPx {
                left: 3,
                right: 3,
                top: 0,
                bottom: 0,
            },
        )
        .expect("stripe bleed should extrapolate");

        for chunk in output.chunks_exact(3) {
            assert!(chunk == [0, 0, 0] || chunk == [255, 255, 255]);
        }
    }

    #[test]
    fn content_aware_does_not_pull_unrelated_interior_marks_into_flat_edge_bleed() {
        let source = vec![
            0_u8, 0, 0, 0, 0, 0, 0, 0, 0, //
            0, 0, 0, 0, 0, 0, 255, 255, 255, //
            0, 0, 0, 0, 0, 0, 0, 0, 0,
        ];
        let output = content_aware_pad_raster_data(
            &source,
            3,
            3,
            RasterColorSpace::DeviceRgb,
            BleedInsetsPx {
                left: 4,
                right: 0,
                top: 0,
                bottom: 0,
            },
        )
        .expect("flat edge bleed should extrapolate");
        let padded_width = 7_usize;

        for x in 0..4_usize {
            let offset = (padded_width + x) * 3;
            assert_eq!(&output[offset..offset + 3], [0, 0, 0]);
        }
    }

    #[test]
    fn content_aware_projects_diagonal_edge_strokes_into_bleed() {
        let mut source = vec![0_u8; 5 * 5 * 3];
        for (x, y) in [(2_u32, 0_u32), (3, 1), (4, 2)] {
            let offset = source_offset(x, y, 5, 3);
            source[offset..offset + 3].copy_from_slice(&[255, 255, 255]);
        }

        let output = content_aware_pad_raster_data(
            &source,
            5,
            5,
            RasterColorSpace::DeviceRgb,
            BleedInsetsPx {
                left: 0,
                right: 0,
                top: 2,
                bottom: 0,
            },
        )
        .expect("diagonal edge stroke should project into top bleed");
        let padded_width = 5_usize;

        let far_bleed_offset = 0;
        let near_bleed_offset = (padded_width + 1) * 3;
        assert_eq!(
            &output[far_bleed_offset..far_bleed_offset + 3],
            [255, 255, 255]
        );
        assert_eq!(
            &output[near_bleed_offset..near_bleed_offset + 3],
            [255, 255, 255]
        );
    }

    #[test]
    fn content_aware_gradient_has_no_blank_bleed_band() {
        let mut source = Vec::new();
        for y in 0..4_u8 {
            for x in 0..4_u8 {
                source.extend_from_slice(&[x * 32, y * 32, 96]);
            }
        }

        let output = content_aware_pad_raster_data(
            &source,
            4,
            4,
            RasterColorSpace::DeviceRgb,
            BleedInsetsPx {
                left: 2,
                right: 2,
                top: 2,
                bottom: 2,
            },
        )
        .expect("gradient bleed should extrapolate");

        assert!(output.chunks_exact(3).any(|pixel| pixel != [0, 0, 0]));
        assert!(output.chunks_exact(3).all(|pixel| pixel != [255, 255, 255]));
    }

    #[test]
    fn content_aware_grayscale_preserves_center_and_fills_bleed() {
        let source = vec![10_u8, 20, 30, 40];
        let output = content_aware_pad_raster_data(
            &source,
            2,
            2,
            RasterColorSpace::DeviceGray,
            BleedInsetsPx {
                left: 1,
                right: 1,
                top: 1,
                bottom: 1,
            },
        )
        .expect("grayscale bleed should extrapolate");
        let padded_width = 4_usize;

        assert_eq!(output[(padded_width + 1)..(padded_width + 3)], [10, 20]);
        assert!(output.iter().any(|value| *value != 0));
    }
}
