use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize)]
pub struct Workflow {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub trigger: String,
    pub status: String,
    pub nodes_json: String,
    pub edges_json: String,
    pub viewport_json: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Deserialize)]
pub struct WorkflowInput {
    pub name: String,
    pub description: Option<String>,
    pub trigger: Option<String>,
    pub status: Option<String>,
    pub nodes_json: String,
    pub edges_json: String,
    pub viewport_json: Option<String>,
}

#[derive(Clone, Deserialize)]
pub struct WorkflowStatusInput {
    pub status: String,
}
