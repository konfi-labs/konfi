use serde::{Deserialize, Serialize};

pub const DEFAULT_GROUP_MAX_DISTINCT_ITEMS: usize = 8;
pub const DEFAULT_MEDIA_WIDTH_MM: f64 = 1000.0;
pub const DEFAULT_MIN_SPACING_MM: f64 = 4.0;
pub const DEFAULT_OPOS_MARK_CLEARANCE_MM: f64 = 10.0;
pub const DEFAULT_OPOS_MARK_MARGIN_MM: f64 = 10.0;
pub const DEFAULT_OPOS_MARK_SIZE_MM: f64 = 3.0;
pub const DEFAULT_OPOS_MARK_SPACING_MM: f64 = 400.0;
pub const DEFAULT_FILL_ROWS: bool = true;
pub const DEFAULT_MANUAL_CUT_MARK_LENGTH_MM: f64 = 5.0;
pub const DEFAULT_PART_GAP_MM: f64 = 8.0;
pub const DEFAULT_PART_MARGIN_MM: f64 = 0.0;
pub const DEFAULT_PREFERRED_SHEET_LENGTH_MM: f64 = 1000.0;
pub const DEFAULT_PREVIEW_MARGIN_MM: f64 = 20.0;
pub const DEFAULT_SHEET_GAP_MM: f64 = 8.0;

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum StickerPackingMode {
    GroupedParts,
    SingleCutRows,
}

impl Default for StickerPackingMode {
    fn default() -> Self {
        Self::SingleCutRows
    }
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum StickerCutShape {
    Circle,
    DieCut,
    ReadySheet,
    Rectangle,
}

impl Default for StickerCutShape {
    fn default() -> Self {
        Self::Rectangle
    }
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum StickerBleedFillMode {
    Mirror,
    ContentAwareFast,
}

impl Default for StickerBleedFillMode {
    fn default() -> Self {
        Self::Mirror
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct StickerSettings {
    pub allow_long_sheets: bool,
    pub fill_rows: bool,
    pub group_max_distinct_items: usize,
    pub manual_cut_mark_length_mm: f64,
    pub manual_cut_marks_enabled: bool,
    pub media_width_mm: f64,
    pub min_spacing_mm: f64,
    pub opos_mark_clearance_mm: f64,
    pub opos_mark_margin_mm: f64,
    pub opos_mark_size_mm: f64,
    pub opos_mark_spacing_mm: f64,
    pub opos_marks_enabled: bool,
    pub packing_mode: StickerPackingMode,
    pub part_gap_mm: f64,
    pub part_margin_mm: f64,
    pub preferred_sheet_length_mm: f64,
    pub preview_margin_mm: f64,
    pub sheet_gap_mm: f64,
}

impl Default for StickerSettings {
    fn default() -> Self {
        Self {
            allow_long_sheets: true,
            fill_rows: DEFAULT_FILL_ROWS,
            group_max_distinct_items: DEFAULT_GROUP_MAX_DISTINCT_ITEMS,
            manual_cut_mark_length_mm: DEFAULT_MANUAL_CUT_MARK_LENGTH_MM,
            manual_cut_marks_enabled: false,
            media_width_mm: DEFAULT_MEDIA_WIDTH_MM,
            min_spacing_mm: DEFAULT_MIN_SPACING_MM,
            opos_mark_clearance_mm: DEFAULT_OPOS_MARK_CLEARANCE_MM,
            opos_mark_margin_mm: DEFAULT_OPOS_MARK_MARGIN_MM,
            opos_mark_size_mm: DEFAULT_OPOS_MARK_SIZE_MM,
            opos_mark_spacing_mm: DEFAULT_OPOS_MARK_SPACING_MM,
            opos_marks_enabled: false,
            packing_mode: StickerPackingMode::SingleCutRows,
            part_gap_mm: DEFAULT_PART_GAP_MM,
            part_margin_mm: DEFAULT_PART_MARGIN_MM,
            preferred_sheet_length_mm: DEFAULT_PREFERRED_SHEET_LENGTH_MM,
            preview_margin_mm: DEFAULT_PREVIEW_MARGIN_MM,
            sheet_gap_mm: DEFAULT_SHEET_GAP_MM,
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StickerItem {
    #[serde(default)]
    pub bleed_mm: f64,
    #[serde(default)]
    pub bleed_fill_mode: StickerBleedFillMode,
    pub cut_offset_mm: f64,
    pub cut_shape: StickerCutShape,
    pub filename: String,
    pub height_mm: f64,
    pub id: String,
    pub page_number: usize,
    pub quantity: usize,
    #[serde(default)]
    pub source_height_mm: Option<f64>,
    pub source_file_index: usize,
    #[serde(default)]
    pub source_width_mm: Option<f64>,
    pub width_mm: f64,
    #[serde(default)]
    pub mirror_bleed_enabled: bool,
    #[serde(default)]
    pub selected_pdf_cut_line_ids: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StickerArtworkAsset {
    pub data_url: String,
    pub item_id: String,
}

#[derive(Debug, Clone, Deserialize, Default, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct StickerRequest {
    pub assets: Vec<StickerArtworkAsset>,
    pub items: Vec<StickerItem>,
    pub settings: StickerSettings,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StickerDataEnvelope {
    data: StickerRequest,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StickerPlacement {
    pub bleed_mm: f64,
    pub bleed_fill_mode: StickerBleedFillMode,
    pub cut_offset_mm: f64,
    pub cut_shape: StickerCutShape,
    pub filename: String,
    pub height_mm: f64,
    pub instance_index: usize,
    pub item_id: String,
    pub mirror_bleed_enabled: bool,
    pub page_number: usize,
    pub part_id: Option<String>,
    pub rotation_degrees: u16,
    pub selected_pdf_cut_line_ids: Vec<String>,
    pub sheet_index: usize,
    pub source_height_mm: Option<f64>,
    pub source_file_index: usize,
    pub source_width_mm: Option<f64>,
    pub width_mm: f64,
    pub x_mm: f64,
    pub y_mm: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StickerPartBoundary {
    pub height_mm: f64,
    pub id: String,
    pub sheet_index: usize,
    pub width_mm: f64,
    pub x_mm: f64,
    pub y_mm: f64,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum OposMarkKind {
    Bar,
    Square,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OposMarkPosition {
    pub clearance_mm: f64,
    pub height_mm: f64,
    pub kind: OposMarkKind,
    pub width_mm: f64,
    pub x_mm: f64,
    pub y_mm: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManualCutMark {
    pub x1_mm: f64,
    pub x2_mm: f64,
    pub y1_mm: f64,
    pub y2_mm: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StickerSheet {
    pub export_height_mm: f64,
    pub export_width_mm: f64,
    pub export_x_mm: f64,
    pub export_y_mm: f64,
    pub index: usize,
    pub manual_cut_marks: Vec<ManualCutMark>,
    pub media_width_mm: f64,
    pub opos_marks: Vec<OposMarkPosition>,
    pub part_boundaries: Vec<StickerPartBoundary>,
    pub placements: Vec<StickerPlacement>,
    pub preview_length_mm: f64,
    pub utilization_percent: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StickerPlan {
    pub item_count: usize,
    pub media_width_mm: f64,
    pub packing_mode: StickerPackingMode,
    pub sheet_count: usize,
    pub sheets: Vec<StickerSheet>,
    pub total_area_mm2: f64,
    pub used_area_mm2: f64,
}

pub fn parse_request_json(request_json: &str) -> Result<StickerRequest, String> {
    serde_json::from_str::<StickerDataEnvelope>(request_json)
        .map(|envelope| envelope.data)
        .or_else(|_| serde_json::from_str::<StickerRequest>(request_json))
        .map_err(|error| format!("Failed to parse sticker imposition request JSON: {error}"))
}
