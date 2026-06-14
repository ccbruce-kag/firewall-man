use serde::{Deserialize, Serialize};

pub fn substitute_variables(text: &str, vars: &[ApiManVariable]) -> String {
    if !text.contains("{{") { return text.to_string(); }
    let mut result = text.to_string();
    for v in vars {
        if !v.enabled { continue; }
        let placeholder = format!("{{{{{}}}}}", v.key);
        result = result.replace(&placeholder, &v.value);
    }
    result
}

#[derive(Clone, Serialize, Deserialize)]
pub struct ApiManVariable {
    pub id: i64,
    pub workspace_id: i64,
    pub key: String,
    pub value: String,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Deserialize)]
pub struct ApiManVariableInput {
    pub key: String,
    pub value: String,
    pub enabled: Option<bool>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct ApiManWireframe {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub scene_json: String,
    pub viewport_json: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Deserialize)]
pub struct ApiManWireframeInput {
    pub name: String,
    pub description: Option<String>,
    pub scene_json: String,
    pub viewport_json: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct ApiManReport {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub report_xml: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Deserialize)]
pub struct ApiManReportInput {
    pub name: String,
    pub description: Option<String>,
    pub report_xml: String,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct ApiManWorkspace {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Deserialize)]
pub struct ApiManWorkspaceInput {
    pub name: String,
    pub description: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct ApiManNode {
    pub id: i64,
    pub workspace_id: i64,
    pub parent_id: Option<i64>,
    pub name: String,
    pub node_type: String,  // "folder" | "request"
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Deserialize)]
pub struct ApiManNodeInput {
    pub workspace_id: i64,
    pub parent_id: Option<i64>,
    pub name: String,
    pub node_type: String,
    pub sort_order: Option<i64>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct ApiManRequest {
    pub id: i64,
    pub node_id: i64,
    pub method: String,
    pub url: String,
    pub headers: Option<String>,
    pub query_params: Option<String>,
    pub body_type: String,
    pub body_content: Option<String>,
    pub auth_config: Option<String>,
    pub last_response_status: Option<i64>,
    pub last_response_headers: Option<String>,
    pub last_response_body: Option<String>,
    pub updated_at: String,
}

#[derive(Clone, Deserialize)]
pub struct ApiManRequestInput {
    pub method: Option<String>,
    pub url: Option<String>,
    pub headers: Option<String>,
    pub query_params: Option<String>,
    pub body_type: Option<String>,
    pub body_content: Option<String>,
    pub auth_config: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct ResponseHistory {
    pub id: i64,
    pub node_id: i64,
    pub status: Option<i64>,
    pub headers: Option<String>,
    pub body: Option<String>,
    pub elapsed_ms: Option<i64>,
    pub created_at: String,
}

#[derive(Clone, Serialize)]
pub struct ApiManTreeNode {
    pub node: ApiManNode,
    pub request: Option<ApiManRequest>,
    pub children: Vec<ApiManTreeNode>,
}

pub fn build_tree(
    nodes: &[ApiManNode],
    requests: &[ApiManRequest],
    parent_id: Option<i64>,
) -> Vec<ApiManTreeNode> {
    let mut tree: Vec<ApiManTreeNode> = Vec::new();
    for node in nodes.iter().filter(|n| n.parent_id == parent_id) {
        let request = if node.node_type == "request" {
            requests.iter().find(|r| r.node_id == node.id).cloned()
        } else {
            None
        };
        let children = build_tree(nodes, requests, Some(node.id));
        tree.push(ApiManTreeNode {
            node: node.clone(),
            request,
            children,
        });
    }
    tree.sort_by(|a, b| a.node.sort_order.cmp(&b.node.sort_order));
    tree
}
