pub const MM_TO_POINTS: f64 = 2.83465;
pub const PRINTER_MARGIN_MM: f64 = 8.0;
pub const DEFAULT_IMAGE_DPI: f64 = 300.0;

pub fn mm_to_points(value_mm: f64) -> f64 {
    value_mm * MM_TO_POINTS
}

pub fn points_to_mm(value_points: f64) -> f64 {
    round_to(value_points / MM_TO_POINTS, 3)
}

pub fn round_to(value: f64, decimals: i32) -> f64 {
    let factor = 10_f64.powi(decimals);
    (value * factor).round() / factor
}

pub fn truncate_to(value: f64, decimals: i32) -> f64 {
    let factor = 10_f64.powi(decimals);
    (value * factor).trunc() / factor
}
