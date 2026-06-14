use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize)]
pub struct NetworkArchitecture {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub nodes_json: String,
    pub edges_json: String,
    pub viewport_json: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Deserialize)]
pub struct NetworkArchitectureInput {
    pub name: String,
    pub description: Option<String>,
    pub nodes_json: String,
    pub edges_json: String,
    pub viewport_json: Option<String>,
}
