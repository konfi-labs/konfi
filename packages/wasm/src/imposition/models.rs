use serde::Deserialize;

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum BleedType {
    NoBleed,
    BleedIncluded,
    OnePointFiveMmScale,
    TwoMmMirror,
    DifferentialDiffusion,
    ContentAwareFast,
}

impl Default for BleedType {
    fn default() -> Self {
        Self::BleedIncluded
    }
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SourceSizing {
    PreserveOriginalSize,
    FitOutputBox,
}

impl Default for SourceSizing {
    fn default() -> Self {
        Self::PreserveOriginalSize
    }
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum LayoutType {
    StepAndRepeat,
    Booklet,
    #[serde(rename = "N_UP")]
    NUp,
    CutStack,
    Shuffle,
    DutchCut,
}

impl Default for LayoutType {
    fn default() -> Self {
        Self::StepAndRepeat
    }
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ImpositionDataInput {
    pub custom_sheet_size_width: f64,
    pub custom_sheet_size_height: f64,
    pub custom_item_size_width: f64,
    pub custom_item_size_height: f64,
    pub num_items_horizontal: usize,
    pub num_items_vertical: usize,
    pub spacing_horizontal: String,
    pub spacing_vertical: String,
    pub bleed: f64,
    pub bleed_type: BleedType,
    pub source_sizing: SourceSizing,
    pub crop_marks: bool,
    pub layout: LayoutType,
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
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImpositionEnvelope {
    data: ImpositionDataInput,
}

pub fn parse_request_json(request_json: &str) -> Result<ImpositionDataInput, String> {
    serde_json::from_str::<ImpositionEnvelope>(request_json)
        .map(|envelope| envelope.data)
        .or_else(|_| serde_json::from_str::<ImpositionDataInput>(request_json))
        .map_err(|error| format!("Failed to parse imposition request JSON: {error}"))
}
