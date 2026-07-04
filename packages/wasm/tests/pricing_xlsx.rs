use calamine::{Data, Reader, Xlsx, open_workbook};
use serde_json::json;
use std::path::PathBuf;
use wasm::pricing_xlsx::{PricingWorkbookData, PricingWorkbookJson};

fn temp_output_path(name: &str) -> PathBuf {
    let unique = format!("{}-{}.xlsx", name, std::process::id());
    std::env::temp_dir().join(unique)
}

#[test]
fn pricing_workbook_writer_creates_expected_sheets_and_values() {
    let workbook_data = PricingWorkbookData::from_row_json_strings(
        r#"[["size","price"],["A4",12.5],["A3",18]]"#,
        r#"[["threshold","discount"],[10,5],[20,10]]"#,
        r#"[["speed","days"],["standard",5],["rush",2]]"#,
        r#"[["enabled"],[true],[false]]"#,
    )
    .expect("workbook data should parse");

    let output_path = temp_output_path("pricing-workbook-test");
    workbook_data
        .write_to_path(&output_path)
        .expect("workbook should be written");

    let mut workbook: Xlsx<_> = open_workbook(&output_path).expect("xlsx should open");

    let prices = workbook
        .worksheet_range("prices")
        .expect("prices sheet should exist");
    assert_eq!(
        prices.get_value((0, 0)),
        Some(&Data::String("size".to_string()))
    );
    assert_eq!(
        prices.get_value((1, 0)),
        Some(&Data::String("A4".to_string()))
    );
    assert_eq!(prices.get_value((1, 1)), Some(&Data::Float(12.5)));

    let thresholds = workbook
        .worksheet_range("thresholds")
        .expect("thresholds sheet should exist");
    assert_eq!(thresholds.get_value((2, 0)), Some(&Data::Float(20.0)));

    let delivery_times = workbook
        .worksheet_range("deliveryTimes")
        .expect("deliveryTimes sheet should exist");
    assert_eq!(delivery_times.get_value((2, 1)), Some(&Data::Float(2.0)));

    let active = workbook
        .worksheet_range("active")
        .expect("active sheet should exist");
    assert_eq!(active.get_value((1, 0)), Some(&Data::Bool(true)));
    assert_eq!(active.get_value((2, 0)), Some(&Data::Bool(false)));

    let _ = std::fs::remove_file(output_path);
}

#[test]
fn pricing_workbook_reader_returns_expected_json_records() {
    let workbook_data = PricingWorkbookData::from_row_json_strings(
        r#"[["size","price"],["A4",12.5],["A3",18]]"#,
        r#"[["threshold","discount"],[10,5],[20,10]]"#,
        r#"[["speed","days"],["standard",5],["rush",2]]"#,
        r#"[["enabled"],[true],[false]]"#,
    )
    .expect("workbook data should parse");

    let output_path = temp_output_path("pricing-workbook-read-test");
    workbook_data
        .write_to_path(&output_path)
        .expect("workbook should be written");

    let workbook_json = PricingWorkbookJson::read_from_path(&output_path)
        .expect("workbook should be readable as JSON records");

    assert_eq!(
        workbook_json.prices,
        vec![
            serde_json::from_value(json!({"size": "A4", "price": 12.5})).unwrap(),
            serde_json::from_value(json!({"size": "A3", "price": 18})).unwrap(),
        ]
    );
    assert_eq!(
        workbook_json.thresholds,
        vec![
            serde_json::from_value(json!({"threshold": 10, "discount": 5})).unwrap(),
            serde_json::from_value(json!({"threshold": 20, "discount": 10})).unwrap(),
        ]
    );
    assert_eq!(
        workbook_json.delivery_times,
        vec![
            serde_json::from_value(json!({"speed": "standard", "days": 5})).unwrap(),
            serde_json::from_value(json!({"speed": "rush", "days": 2})).unwrap(),
        ]
    );
    assert_eq!(
        workbook_json.active,
        vec![
            serde_json::from_value(json!({"enabled": true})).unwrap(),
            serde_json::from_value(json!({"enabled": false})).unwrap(),
        ]
    );

    let _ = std::fs::remove_file(output_path);
}

#[test]
fn pricing_workbook_round_trips_through_bytes_api() {
    let workbook_data = PricingWorkbookData::from_row_json_strings(
        r#"[["size","price"],["A4",12.5],["A3",18]]"#,
        r#"[["threshold","discount"],[10,5],[20,10]]"#,
        r#"[["speed","days"],["standard",5],["rush",2]]"#,
        r#"[["enabled"],[true],[false]]"#,
    )
    .expect("workbook data should parse");

    let workbook_bytes = workbook_data
        .write_to_bytes()
        .expect("workbook bytes should be generated");

    let workbook_json = PricingWorkbookJson::read_from_bytes(&workbook_bytes)
        .expect("workbook bytes should be readable as JSON records");

    assert_eq!(
        workbook_json.prices,
        vec![
            serde_json::from_value(json!({"size": "A4", "price": 12.5})).unwrap(),
            serde_json::from_value(json!({"size": "A3", "price": 18})).unwrap(),
        ]
    );
    assert_eq!(
        workbook_json.thresholds,
        vec![
            serde_json::from_value(json!({"threshold": 10, "discount": 5})).unwrap(),
            serde_json::from_value(json!({"threshold": 20, "discount": 10})).unwrap(),
        ]
    );
    assert_eq!(
        workbook_json.delivery_times,
        vec![
            serde_json::from_value(json!({"speed": "standard", "days": 5})).unwrap(),
            serde_json::from_value(json!({"speed": "rush", "days": 2})).unwrap(),
        ]
    );
    assert_eq!(
        workbook_json.active,
        vec![
            serde_json::from_value(json!({"enabled": true})).unwrap(),
            serde_json::from_value(json!({"enabled": false})).unwrap(),
        ]
    );
}
