use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Issue {
    pub description: String,
    pub rule: String,
    pub attributes: serde_json::Value,
}

pub fn make_issue(description: &str, rule: &str, attributes: serde_json::Value) -> Issue {
    Issue {
        description: description.to_string(),
        rule: rule.to_string(),
        attributes,
    }
}
