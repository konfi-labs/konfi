use serde::Deserialize;
use serde::Serialize;
use serde_json::{Map, Value};

#[derive(Debug, Deserialize)]
pub struct PricingWorkbookInput {
    pub prices_row_data: String,
    pub threshold_row_data: String,
    pub delivery_times_row_data: String,
    pub active_row_data: String,
}

#[derive(Debug)]
pub struct PricingWorkbookData {
    pub(crate) sheets: Vec<SheetData>,
}

#[derive(Debug, Serialize)]
pub struct PricingWorkbookJson {
    pub prices: Vec<Map<String, Value>>,
    pub thresholds: Vec<Map<String, Value>>,
    #[serde(rename = "deliveryTimes")]
    pub delivery_times: Vec<Map<String, Value>>,
    pub active: Vec<Map<String, Value>>,
}

#[derive(Debug)]
pub(crate) struct SheetData {
    pub(crate) name: &'static str,
    pub(crate) headers: Vec<String>,
    pub(crate) rows: Vec<Vec<Value>>,
}
