use super::models::{PricingWorkbookData, PricingWorkbookInput, SheetData};
use rust_xlsxwriter::{DocProperties, ExcelDateTime, Workbook, Worksheet, XlsxError};
use serde_json::Value;
#[cfg(not(target_arch = "wasm32"))]
use std::path::Path;

impl PricingWorkbookInput {
    pub fn into_workbook_data(self) -> Result<PricingWorkbookData, String> {
        PricingWorkbookData::from_row_json_strings(
            &self.prices_row_data,
            &self.threshold_row_data,
            &self.delivery_times_row_data,
            &self.active_row_data,
        )
    }
}

impl PricingWorkbookData {
    pub fn from_row_json_strings(
        prices_row_data: &str,
        threshold_row_data: &str,
        delivery_times_row_data: &str,
        active_row_data: &str,
    ) -> Result<Self, String> {
        Ok(Self {
            sheets: vec![
                parse_sheet("prices", prices_row_data)?,
                parse_sheet("thresholds", threshold_row_data)?,
                parse_sheet("deliveryTimes", delivery_times_row_data)?,
                parse_sheet("active", active_row_data)?,
            ],
        })
    }

    #[cfg(not(target_arch = "wasm32"))]
    pub fn write_to_path(&self, path: &Path) -> Result<(), String> {
        std::fs::write(path, self.write_to_bytes()?)
            .map_err(|error| format!("Failed to write workbook: {error}"))
    }

    pub fn write_to_bytes(&self) -> Result<Vec<u8>, String> {
        export_workbook_to_bytes(self)
    }
}

pub fn export_workbook_to_bytes(workbook_data: &PricingWorkbookData) -> Result<Vec<u8>, String> {
    let mut workbook = Workbook::new();
    let creation_date = ExcelDateTime::from_ymd(2023, 1, 1)
        .map_err(|error| format!("Failed to build workbook creation date: {error}"))?;
    let properties = DocProperties::new().set_creation_datetime(&creation_date);

    workbook.set_properties(&properties);

    for sheet in &workbook_data.sheets {
        let worksheet = workbook.add_worksheet();
        populate_sheet(worksheet, sheet)
            .map_err(|error| format!("Failed to populate sheet '{}': {error}", sheet.name))?;
    }

    workbook
        .save_to_buffer()
        .map_err(|error| format!("Failed to write workbook: {error}"))
}

fn parse_sheet(name: &'static str, raw_data: &str) -> Result<SheetData, String> {
    let rows: Vec<Vec<Value>> = serde_json::from_str(raw_data)
        .map_err(|error| format!("Invalid JSON for sheet '{name}': {error}"))?;

    let Some((header_row, data_rows)) = rows.split_first() else {
        return Err(format!("Sheet '{name}' must include a header row"));
    };

    let headers = header_row.iter().map(value_to_header).collect();

    Ok(SheetData {
        name,
        headers,
        rows: data_rows.to_vec(),
    })
}

fn value_to_header(value: &Value) -> String {
    match value {
        Value::Null => String::new(),
        Value::Bool(flag) => flag.to_string(),
        Value::Number(number) => number.to_string(),
        Value::String(text) => text.clone(),
        Value::Array(_) | Value::Object(_) => serde_json::to_string(value).unwrap_or_default(),
    }
}

fn populate_sheet(worksheet: &mut Worksheet, sheet: &SheetData) -> Result<(), XlsxError> {
    worksheet.set_name(sheet.name)?;

    for (column_index, header) in sheet.headers.iter().enumerate() {
        worksheet.write_string(0, column_index as u16, header)?;
    }

    for (row_index, row) in sheet.rows.iter().enumerate() {
        let target_row = (row_index + 1) as u32;
        for (column_index, value) in row.iter().enumerate() {
            write_cell(worksheet, target_row, column_index as u16, value)?;
        }
    }

    Ok(())
}

fn write_cell(
    worksheet: &mut Worksheet,
    row: u32,
    column: u16,
    value: &Value,
) -> Result<(), XlsxError> {
    match value {
        Value::Null => Ok(()),
        Value::Bool(flag) => worksheet.write_boolean(row, column, *flag).map(|_| ()),
        Value::Number(number) => {
            if let Some(integer) = number.as_i64() {
                worksheet
                    .write_number(row, column, integer as f64)
                    .map(|_| ())
            } else if let Some(unsigned_integer) = number.as_u64() {
                worksheet
                    .write_number(row, column, unsigned_integer as f64)
                    .map(|_| ())
            } else if let Some(float_value) = number.as_f64() {
                worksheet.write_number(row, column, float_value).map(|_| ())
            } else {
                worksheet
                    .write_string(row, column, number.to_string())
                    .map(|_| ())
            }
        }
        Value::String(text) => worksheet.write_string(row, column, text).map(|_| ()),
        Value::Array(_) | Value::Object(_) => worksheet
            .write_string(
                row,
                column,
                serde_json::to_string(value).unwrap_or_default(),
            )
            .map(|_| ()),
    }
}
