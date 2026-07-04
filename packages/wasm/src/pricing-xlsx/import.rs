use super::models::PricingWorkbookJson;
use calamine::{Data, Reader, Xlsx};
use serde_json::{Map, Number, Value};
use std::io::{Read, Seek};
#[cfg(not(target_arch = "wasm32"))]
use std::path::Path;

impl PricingWorkbookJson {
    #[cfg(not(target_arch = "wasm32"))]
    pub fn read_from_path(path: &Path) -> Result<Self, String> {
        let bytes =
            std::fs::read(path).map_err(|error| format!("Failed to read workbook: {error}"))?;
        Self::read_from_bytes(&bytes)
    }

    pub fn read_from_bytes(bytes: &[u8]) -> Result<Self, String> {
        read_workbook_json_from_bytes(bytes)
    }
}

pub fn read_workbook_json_from_bytes(bytes: &[u8]) -> Result<PricingWorkbookJson, String> {
    let cursor = std::io::Cursor::new(bytes.to_vec());
    let mut workbook: Xlsx<_> =
        Xlsx::new(cursor).map_err(|error| format!("Failed to open workbook: {error}"))?;

    Ok(PricingWorkbookJson {
        prices: read_sheet_records(&mut workbook, "prices")?,
        thresholds: read_sheet_records(&mut workbook, "thresholds")?,
        delivery_times: read_sheet_records(&mut workbook, "deliveryTimes")?,
        active: read_sheet_records(&mut workbook, "active")?,
    })
}

fn read_sheet_records<R>(
    workbook: &mut Xlsx<R>,
    sheet_name: &str,
) -> Result<Vec<Map<String, Value>>, String>
where
    R: Read + Seek,
{
    let range = workbook
        .worksheet_range(sheet_name)
        .map_err(|error| format!("Failed to read sheet '{sheet_name}': {error}"))?;

    let mut rows = range.rows();
    let Some(header_row) = rows.next() else {
        return Ok(Vec::new());
    };

    let headers: Vec<String> = header_row.iter().map(data_to_header).collect();
    let mut records = Vec::new();

    for row in rows {
        let mut record = Map::new();
        for (column_index, header) in headers.iter().enumerate() {
            let value = row
                .get(column_index)
                .map(data_to_json)
                .unwrap_or(Value::Null);
            record.insert(header.clone(), value);
        }
        records.push(record);
    }

    Ok(records)
}

fn data_to_header(value: &Data) -> String {
    match value {
        Data::Empty => String::new(),
        Data::String(text) => text.clone(),
        Data::Float(number) => trim_float(*number),
        Data::Int(number) => number.to_string(),
        Data::Bool(flag) => flag.to_string(),
        Data::DateTime(value) => value.to_string(),
        Data::DateTimeIso(text) => text.clone(),
        Data::DurationIso(text) => text.clone(),
        Data::Error(error) => error.to_string(),
    }
}

fn data_to_json(value: &Data) -> Value {
    match value {
        Data::Empty => Value::Null,
        Data::String(text) => Value::String(text.clone()),
        Data::Float(number) => float_to_json(*number),
        Data::Int(number) => Value::Number(Number::from(*number)),
        Data::Bool(flag) => Value::Bool(*flag),
        Data::DateTime(value) => Value::String(value.to_string()),
        Data::DateTimeIso(text) => Value::String(text.clone()),
        Data::DurationIso(text) => Value::String(text.clone()),
        Data::Error(error) => Value::String(error.to_string()),
    }
}

fn float_to_json(value: f64) -> Value {
    if value.is_finite() && value.fract() == 0.0 {
        let integer = value as i64;
        if (integer as f64 - value).abs() < f64::EPSILON {
            return Value::Number(Number::from(integer));
        }
    }

    Number::from_f64(value)
        .map(Value::Number)
        .unwrap_or(Value::Null)
}

fn trim_float(value: f64) -> String {
    if value.fract() == 0.0 {
        format!("{value:.0}")
    } else {
        let mut text = format!("{value}");
        while text.contains('.') && text.ends_with('0') {
            text.pop();
        }
        if text.ends_with('.') {
            text.pop();
        }
        text
    }
}
