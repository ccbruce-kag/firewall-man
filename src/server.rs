use crate::ai;
use crate::db::{
    AppDb, HaproxyBackendServerUpdate, HaproxyLoadBalancerUpdate, JuniperDeviceUpdate,
};
use crate::firewall::FirewallCmd;
use crate::haproxy::{BackendServer, HaproxyClient};
use crate::juniper::{self, JuniperClient};
use crate::shell;
use crate::system;
use crate::utils;
use axum::body::Body;
use axum::extract::{Form, Path, Request, State};
use axum::http::{header, HeaderValue, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{delete, get, post};
use axum::{Json, Router};
use base64::Engine;
use once_cell::sync::Lazy;
use regex::Regex;
use rust_embed::RustEmbed;
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;

static ARGS_VERIFY: Lazy<Regex> = Lazy::new(|| Regex::new(r"^[0-9A-z-_]+$").unwrap());

#[derive(RustEmbed)]
#[folder = "web"]
struct WebAssets;

#[derive(RustEmbed)]
#[folder = "docs"]
struct DocAssets;

pub struct AppState {
    pub ipv4: Option<Arc<dyn FirewallCmd>>,
    pub ipv6: Option<Arc<dyn FirewallCmd>>,
    pub username: String,
    pub password: String,
    pub platform: String,
    pub db: AppDb,
    pub juniper: Arc<JuniperClient>,
    pub haproxy: Arc<HaproxyClient>,
}

#[derive(Deserialize)]
pub struct ProtocolForm {
    pub protocol: Option<String>,
}

#[derive(Deserialize)]
pub struct RuleForm {
    pub table: Option<String>,
    pub chain: Option<String>,
    pub id: Option<String>,
    pub protocol: Option<String>,
}

#[derive(Deserialize)]
pub struct ExecForm {
    pub args: Option<String>,
    pub protocol: Option<String>,
}

#[derive(Deserialize)]
pub struct ImportForm {
    pub rule: Option<String>,
    pub protocol: Option<String>,
}

#[derive(Deserialize)]
pub struct JuniperVlanForm {
    pub name: Option<String>,
    pub vlan_id: Option<u16>,
}

#[derive(Deserialize)]
pub struct JuniperAccessVlanForm {
    pub vlan_name: Option<String>,
}

#[derive(Deserialize)]
pub struct JuniperTrunkVlanForm {
    pub vlan_names: Option<String>,
}

#[derive(Deserialize)]
pub struct JuniperPortEnabledForm {
    pub enabled: Option<String>,
}

#[derive(Deserialize)]
pub struct JuniperBulkPortForm {
    pub ports: Option<String>,
    pub mode: Option<String>,
    pub vlan_names: Option<String>,
    pub enabled: Option<String>,
}

#[derive(Deserialize)]
pub struct JuniperSettingsForm {
    pub name: Option<String>,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub clear_password: Option<String>,
    pub connect_timeout_secs: Option<u64>,
    pub strict_host_key_checking: Option<String>,
}

#[derive(Deserialize)]
pub struct HaproxyConfigForm {
    pub config: Option<String>,
    pub apply: Option<String>,
}

#[derive(Deserialize)]
pub struct HaproxyLbForm {
    pub name: Option<String>,
    pub bind_port: Option<u16>,
    pub balance_method: Option<String>,
    pub health_check_path: Option<String>,
    pub health_check: Option<String>,
    pub servers: Option<String>,
    pub apply: Option<String>,
}

#[derive(Deserialize)]
pub struct HaproxyEnabledForm {
    pub enabled: Option<String>,
}

#[derive(Deserialize)]
pub struct HaproxyWebTestForm {
    pub url: Option<String>,
    pub count: Option<Value>,
}

#[derive(Deserialize)]
pub struct HaproxySqlTestForm {
    pub host: Option<String>,
    pub port: Option<Value>,
    pub count: Option<Value>,
    pub timeout: Option<Value>,
}

fn pick_firewall(state: &AppState, protocol: Option<&str>) -> Result<Arc<dyn FirewallCmd>, String> {
    match protocol.unwrap_or("ipv4") {
        "ipv4" | "ip4" | "4" | "" => state
            .ipv4
            .clone()
            .ok_or_else(|| "ipv4 iptables not available".to_string()),
        "ipv6" | "ip6" | "6" => state
            .ipv6
            .clone()
            .ok_or_else(|| "ipv6 iptables not available".to_string()),
        p => Err(format!("unsupported protocol {}", p)),
    }
}

fn decode_basic_auth(auth_header: &str) -> Option<(String, String)> {
    let encoded = auth_header.strip_prefix("Basic ")?;
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .ok()?;
    let decoded_str = String::from_utf8(decoded).ok()?;
    let mut parts = decoded_str.splitn(2, ':');
    Some((parts.next()?.to_string(), parts.next()?.to_string()))
}

fn validate_args(table: Option<&str>, chain: Option<&str>) -> Result<(), String> {
    for val in [table, chain].iter().flatten() {
        if !val.is_empty() && !ARGS_VERIFY.is_match(val) {
            return Err("param error!".to_string());
        }
    }
    Ok(())
}

fn parse_form_bool(value: Option<&str>) -> bool {
    value
        .map(|v| matches!(v.to_ascii_lowercase().as_str(), "1" | "true" | "yes" | "on"))
        .unwrap_or(false)
}

fn decode_juniper_port_path(port: &str) -> String {
    port.replace('~', "/")
}

fn parse_backend_servers(raw: Option<String>) -> Result<Vec<HaproxyBackendServerUpdate>, String> {
    let raw = raw.unwrap_or_default();
    if raw.trim().is_empty() {
        return Err("backend server list is required".to_string());
    }
    serde_json::from_str(&raw).map_err(|e| format!("invalid backend server JSON: {e}"))
}

fn haproxy_backend_servers(servers: &[HaproxyBackendServerUpdate]) -> Vec<BackendServer> {
    servers
        .iter()
        .map(|server| BackendServer {
            name: server.name.clone(),
            ip: server.ip.clone(),
            port: server.port,
            health_check: server.health_check,
        })
        .collect()
}

fn json_u16(value: Option<Value>, default: u16, label: &str) -> Result<u16, String> {
    match value {
        None | Some(Value::Null) => Ok(default),
        Some(Value::Number(num)) => num
            .as_u64()
            .filter(|n| *n <= u16::MAX as u64)
            .map(|n| n as u16)
            .ok_or_else(|| format!("invalid {label}")),
        Some(Value::String(text)) => text
            .trim()
            .parse::<u16>()
            .map_err(|_| format!("invalid {label}")),
        _ => Err(format!("invalid {label}")),
    }
}

fn json_u64(value: Option<Value>, default: u64, label: &str) -> Result<u64, String> {
    match value {
        None | Some(Value::Null) => Ok(default),
        Some(Value::Number(num)) => num.as_u64().ok_or_else(|| format!("invalid {label}")),
        Some(Value::String(text)) => text
            .trim()
            .parse::<u64>()
            .map_err(|_| format!("invalid {label}")),
        _ => Err(format!("invalid {label}")),
    }
}

async fn auth_middleware(State(state): State<Arc<AppState>>, req: Request, next: Next) -> Response {
    let auth = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(decode_basic_auth);

    let authorized = match auth {
        Some((user, pass)) => user == state.username && pass == state.password,
        None => false,
    };

    if authorized {
        next.run(req).await
    } else {
        let mut resp = Response::new(Body::from("Unauthorized"));
        resp.headers_mut().insert(
            header::WWW_AUTHENTICATE,
            HeaderValue::from_static("Basic realm=\"restricted\", charset=\"UTF-8\""),
        );
        *resp.status_mut() = StatusCode::UNAUTHORIZED;
        resp
    }
}

// ---- API Handlers ----

async fn handle_version(State(state): State<Arc<AppState>>) -> Json<Value> {
    match &state.ipv4 {
        Some(ipc) => match ipc.version().await {
            Ok(v) => utils::output(None, Some(Value::String(v))),
            Err(e) => utils::output(Some(&e), None),
        },
        None => utils::output(Some("firewall not available"), None),
    }
}

async fn handle_list_rule(
    State(state): State<Arc<AppState>>,
    Form(form): Form<RuleForm>,
) -> Json<Value> {
    if let Err(e) = validate_args(form.table.as_deref(), form.chain.as_deref()) {
        return utils::output(Some(&e), None);
    }
    let ipc = match pick_firewall(&state, form.protocol.as_deref()) {
        Ok(ipc) => ipc,
        Err(e) => return utils::output(Some(&e), None),
    };
    match ipc
        .list_rule(
            form.table.as_deref().unwrap_or(""),
            form.chain.as_deref().unwrap_or(""),
        )
        .await
    {
        Ok(data) => utils::output(None, Some(serde_json::to_value(data).unwrap_or_default())),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_list_exec(
    State(state): State<Arc<AppState>>,
    Form(form): Form<RuleForm>,
) -> Json<Value> {
    if let Err(e) = validate_args(form.table.as_deref(), form.chain.as_deref()) {
        return utils::output(Some(&e), None);
    }
    let ipc = match pick_firewall(&state, form.protocol.as_deref()) {
        Ok(ipc) => ipc,
        Err(e) => return utils::output(Some(&e), None),
    };
    match ipc
        .list_exec(
            form.table.as_deref().unwrap_or(""),
            form.chain.as_deref().unwrap_or(""),
        )
        .await
    {
        Ok(data) => utils::output(None, Some(Value::String(data))),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_flush_rule(
    State(state): State<Arc<AppState>>,
    Form(form): Form<RuleForm>,
) -> Json<Value> {
    if let Err(e) = validate_args(form.table.as_deref(), form.chain.as_deref()) {
        return utils::output(Some(&e), None);
    }
    let ipc = match pick_firewall(&state, form.protocol.as_deref()) {
        Ok(ipc) => ipc,
        Err(e) => return utils::output(Some(&e), None),
    };
    match ipc
        .flush_rule(
            form.table.as_deref().unwrap_or(""),
            form.chain.as_deref().unwrap_or(""),
        )
        .await
    {
        Ok(_) => utils::output(None, None),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_delete_rule(
    State(state): State<Arc<AppState>>,
    Form(form): Form<RuleForm>,
) -> Json<Value> {
    if let Err(e) = validate_args(form.table.as_deref(), form.chain.as_deref()) {
        return utils::output(Some(&e), None);
    }
    let ipc = match pick_firewall(&state, form.protocol.as_deref()) {
        Ok(ipc) => ipc,
        Err(e) => return utils::output(Some(&e), None),
    };
    match ipc
        .delete_rule(
            form.table.as_deref().unwrap_or(""),
            form.chain.as_deref().unwrap_or(""),
            form.id.as_deref().unwrap_or(""),
        )
        .await
    {
        Ok(_) => utils::output(None, None),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_flush_metrics(
    State(state): State<Arc<AppState>>,
    Form(form): Form<RuleForm>,
) -> Json<Value> {
    if let Err(e) = validate_args(form.table.as_deref(), form.chain.as_deref()) {
        return utils::output(Some(&e), None);
    }
    let ipc = match pick_firewall(&state, form.protocol.as_deref()) {
        Ok(ipc) => ipc,
        Err(e) => return utils::output(Some(&e), None),
    };
    match ipc
        .flush_metrics(
            form.table.as_deref().unwrap_or(""),
            form.chain.as_deref().unwrap_or(""),
            form.id.as_deref().unwrap_or(""),
        )
        .await
    {
        Ok(_) => utils::output(None, None),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_get_rule_info(
    State(state): State<Arc<AppState>>,
    Form(form): Form<RuleForm>,
) -> Json<Value> {
    if let Err(e) = validate_args(form.table.as_deref(), form.chain.as_deref()) {
        return utils::output(Some(&e), None);
    }
    let ipc = match pick_firewall(&state, form.protocol.as_deref()) {
        Ok(ipc) => ipc,
        Err(e) => return utils::output(Some(&e), None),
    };
    match ipc
        .get_rule_info(
            form.table.as_deref().unwrap_or(""),
            form.chain.as_deref().unwrap_or(""),
            form.id.as_deref().unwrap_or(""),
        )
        .await
    {
        Ok(data) => utils::output(None, Some(Value::String(data))),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_flush_empty_custom_chain(
    State(state): State<Arc<AppState>>,
    Form(form): Form<ProtocolForm>,
) -> Json<Value> {
    let ipc = match pick_firewall(&state, form.protocol.as_deref()) {
        Ok(ipc) => ipc,
        Err(e) => return utils::output(Some(&e), None),
    };
    match ipc.flush_empty_custom_chain().await {
        Ok(_) => utils::output(None, None),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_export(
    State(state): State<Arc<AppState>>,
    Form(form): Form<RuleForm>,
) -> Json<Value> {
    if let Err(e) = validate_args(form.table.as_deref(), form.chain.as_deref()) {
        return utils::output(Some(&e), None);
    }
    let ipc = match pick_firewall(&state, form.protocol.as_deref()) {
        Ok(ipc) => ipc,
        Err(e) => return utils::output(Some(&e), None),
    };
    match ipc
        .export_rules(
            form.table.as_deref().unwrap_or(""),
            form.chain.as_deref().unwrap_or(""),
        )
        .await
    {
        Ok(data) => utils::output(None, Some(Value::String(data))),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_import(
    State(state): State<Arc<AppState>>,
    Form(form): Form<ImportForm>,
) -> Json<Value> {
    let ipc = match pick_firewall(&state, form.protocol.as_deref()) {
        Ok(ipc) => ipc,
        Err(e) => return utils::output(Some(&e), None),
    };
    match ipc.import_rules(form.rule.as_deref().unwrap_or("")).await {
        Ok(_) => utils::output(None, None),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_exec(
    State(state): State<Arc<AppState>>,
    Form(form): Form<ExecForm>,
) -> Json<Value> {
    let ipc = match pick_firewall(&state, form.protocol.as_deref()) {
        Ok(ipc) => ipc,
        Err(e) => return utils::output(Some(&e), None),
    };
    let args = form.args.as_deref().unwrap_or("");
    if args.is_empty() {
        return utils::output(None, None);
    }
    match ipc.exec(&utils::split_and_trim_space(args, " ")).await {
        Ok(data) => utils::output(None, Some(Value::String(data))),
        Err(e) => utils::output(Some(&e), None),
    }
}

// ---- System Info Handlers ----

async fn handle_system_info(State(state): State<Arc<AppState>>) -> Json<Value> {
    let data = system::get_system_info(&state.platform).await;
    utils::output(None, Some(data))
}

async fn handle_system_processes(State(state): State<Arc<AppState>>) -> Json<Value> {
    let data = system::get_processes(&state.platform).await;
    utils::output(None, Some(data))
}

// ---- Juniper Handlers ----

async fn handle_juniper_info(State(state): State<Arc<AppState>>) -> Json<Value> {
    match state.juniper.info().await {
        Ok(data) => utils::output(None, Some(serde_json::to_value(data).unwrap_or_default())),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_juniper_settings(State(state): State<Arc<AppState>>) -> Json<Value> {
    match state.juniper.settings() {
        Ok(data) => utils::output(None, Some(serde_json::to_value(data).unwrap_or_default())),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_juniper_save_settings(
    State(state): State<Arc<AppState>>,
    Form(form): Form<JuniperSettingsForm>,
) -> Json<Value> {
    let update = JuniperDeviceUpdate {
        name: form.name.unwrap_or_else(|| "default".to_string()),
        host: form.host.unwrap_or_default(),
        port: form.port.unwrap_or(22),
        username: form.username.unwrap_or_default(),
        password: form.password.filter(|v| !v.is_empty()),
        clear_password: parse_form_bool(form.clear_password.as_deref()),
        connect_timeout_secs: form.connect_timeout_secs.unwrap_or(10),
        strict_host_key_checking: parse_form_bool(form.strict_host_key_checking.as_deref()),
    };
    match state.juniper.save_settings(update) {
        Ok(data) => utils::output(None, Some(serde_json::to_value(data).unwrap_or_default())),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_juniper_vlans(State(state): State<Arc<AppState>>) -> Json<Value> {
    match state.juniper.vlans().await {
        Ok(data) => utils::output(None, Some(serde_json::to_value(data).unwrap_or_default())),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_juniper_create_vlan(
    State(state): State<Arc<AppState>>,
    Form(form): Form<JuniperVlanForm>,
) -> Json<Value> {
    let name = form.name.unwrap_or_default();
    let vlan_id = form.vlan_id.unwrap_or(0);
    match state.juniper.create_vlan(&name, vlan_id).await {
        Ok(data) => utils::output(None, Some(serde_json::to_value(data).unwrap_or_default())),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_juniper_delete_vlan(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Json<Value> {
    match state.juniper.delete_vlan(&name).await {
        Ok(data) => utils::output(None, Some(serde_json::to_value(data).unwrap_or_default())),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_juniper_ports(State(state): State<Arc<AppState>>) -> Json<Value> {
    match state.juniper.ports().await {
        Ok(data) => utils::output(None, Some(serde_json::to_value(data).unwrap_or_default())),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_juniper_access_vlan(
    State(state): State<Arc<AppState>>,
    Path(port): Path<String>,
    Form(form): Form<JuniperAccessVlanForm>,
) -> Json<Value> {
    let port = decode_juniper_port_path(&port);
    let vlan_name = form.vlan_name.unwrap_or_default();
    match state.juniper.set_access_vlan(&port, &vlan_name).await {
        Ok(data) => utils::output(None, Some(serde_json::to_value(data).unwrap_or_default())),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_juniper_trunk_vlan(
    State(state): State<Arc<AppState>>,
    Path(port): Path<String>,
    Form(form): Form<JuniperTrunkVlanForm>,
) -> Json<Value> {
    let port = decode_juniper_port_path(&port);
    let vlan_names = juniper::split_vlan_names(&form.vlan_names.unwrap_or_default());
    match state.juniper.set_trunk_vlan(&port, &vlan_names).await {
        Ok(data) => utils::output(None, Some(serde_json::to_value(data).unwrap_or_default())),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_juniper_port_enabled(
    State(state): State<Arc<AppState>>,
    Path(port): Path<String>,
    Form(form): Form<JuniperPortEnabledForm>,
) -> Json<Value> {
    let port = decode_juniper_port_path(&port);
    let enabled = parse_form_bool(form.enabled.as_deref());
    match state.juniper.set_port_enabled(&port, enabled).await {
        Ok(data) => utils::output(None, Some(serde_json::to_value(data).unwrap_or_default())),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_juniper_bulk_ports(
    State(state): State<Arc<AppState>>,
    Form(form): Form<JuniperBulkPortForm>,
) -> Json<Value> {
    let ports = juniper::split_port_names(&form.ports.unwrap_or_default());
    let mode = form.mode.unwrap_or_default();
    let vlan_names = juniper::split_vlan_names(&form.vlan_names.unwrap_or_default());
    let enabled = match form.enabled.as_deref() {
        Some("1" | "true" | "yes" | "on") => Some(true),
        Some("0" | "false" | "no" | "off") => Some(false),
        _ => None,
    };
    match state
        .juniper
        .bulk_config_ports(&ports, &mode, &vlan_names, enabled)
        .await
    {
        Ok(data) => utils::output(None, Some(serde_json::to_value(data).unwrap_or_default())),
        Err(e) => utils::output(Some(&e), None),
    }
}

// ---- HAProxy Handlers ----

async fn handle_haproxy_status(State(state): State<Arc<AppState>>) -> Json<Value> {
    let data = state.haproxy.status().await;
    utils::output(None, Some(serde_json::to_value(data).unwrap_or_default()))
}

async fn handle_haproxy_reload(State(state): State<Arc<AppState>>) -> Json<Value> {
    match state.haproxy.reload().await {
        Ok(data) => utils::output(None, Some(serde_json::to_value(data).unwrap_or_default())),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_haproxy_restart(State(state): State<Arc<AppState>>) -> Json<Value> {
    match state.haproxy.restart().await {
        Ok(data) => utils::output(None, Some(serde_json::to_value(data).unwrap_or_default())),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_haproxy_config(State(state): State<Arc<AppState>>) -> Json<Value> {
    match state.haproxy.read_config().await {
        Ok(data) => utils::output(None, Some(Value::String(data))),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_haproxy_validate(
    State(state): State<Arc<AppState>>,
    Form(form): Form<HaproxyConfigForm>,
) -> Json<Value> {
    let config = form.config.unwrap_or_default();
    if config.trim().is_empty() {
        return utils::output(Some("HAProxy config is required"), None);
    }
    let apply = parse_form_bool(form.apply.as_deref());
    if apply {
        match state.haproxy.apply_config(&config).await {
            Ok(data) => utils::output(None, Some(serde_json::to_value(data).unwrap_or_default())),
            Err(e) => utils::output(Some(&e), None),
        }
    } else {
        match state.haproxy.validate_config_text(&config).await {
            Ok(data) => utils::output(None, Some(Value::String(data))),
            Err(e) => utils::output(Some(&e), None),
        }
    }
}

async fn handle_haproxy_web(
    State(state): State<Arc<AppState>>,
    Form(form): Form<HaproxyLbForm>,
) -> Json<Value> {
    let servers = match parse_backend_servers(form.servers) {
        Ok(servers) => servers,
        Err(e) => return utils::output(Some(&e), None),
    };
    let backend_servers = haproxy_backend_servers(&servers);
    let name = form.name.as_deref().unwrap_or("web");
    let bind_port = form.bind_port.unwrap_or(80);
    let balance_method = form.balance_method.as_deref().unwrap_or("roundrobin");
    let health_check_path = form.health_check_path.as_deref().unwrap_or("/");

    match state.haproxy.build_web_config(
        name,
        bind_port,
        balance_method,
        health_check_path,
        &backend_servers,
    ) {
        Ok(data) => {
            if !parse_form_bool(form.apply.as_deref()) {
                return utils::output(None, Some(serde_json::to_value(data).unwrap_or_default()));
            }
            let update = HaproxyLoadBalancerUpdate {
                lb_type: "web".to_string(),
                enabled: true,
                name: name.to_string(),
                bind_port,
                mode: "http".to_string(),
                balance_method: balance_method.to_string(),
                health_check_path: Some(health_check_path.to_string()),
                health_check: true,
                servers,
            };
            match save_and_apply_haproxy(&state, update).await {
                Ok(value) => utils::output(None, Some(value)),
                Err(e) => utils::output(Some(&e), None),
            }
        }
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_haproxy_sql(
    State(state): State<Arc<AppState>>,
    Form(form): Form<HaproxyLbForm>,
) -> Json<Value> {
    let servers = match parse_backend_servers(form.servers) {
        Ok(servers) => servers,
        Err(e) => return utils::output(Some(&e), None),
    };
    let backend_servers = haproxy_backend_servers(&servers);
    let name = form.name.as_deref().unwrap_or("msql");
    let bind_port = form.bind_port.unwrap_or(1433);
    let balance_method = form.balance_method.as_deref().unwrap_or("source");
    let health_check = parse_form_bool(form.health_check.as_deref());

    match state.haproxy.build_sql_config(
        name,
        bind_port,
        balance_method,
        health_check,
        &backend_servers,
    ) {
        Ok(data) => {
            if !parse_form_bool(form.apply.as_deref()) {
                return utils::output(None, Some(serde_json::to_value(data).unwrap_or_default()));
            }
            let update = HaproxyLoadBalancerUpdate {
                lb_type: "sql".to_string(),
                enabled: true,
                name: name.to_string(),
                bind_port,
                mode: "tcp".to_string(),
                balance_method: balance_method.to_string(),
                health_check_path: None,
                health_check,
                servers,
            };
            match save_and_apply_haproxy(&state, update).await {
                Ok(value) => utils::output(None, Some(value)),
                Err(e) => utils::output(Some(&e), None),
            }
        }
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_haproxy_lbs(State(state): State<Arc<AppState>>) -> Json<Value> {
    match state.db.list_haproxy_lbs() {
        Ok(items) => utils::output(None, Some(serde_json::to_value(items).unwrap_or_default())),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_haproxy_delete_lb(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    let items = match state.db.list_haproxy_lbs() {
        Ok(items) => items,
        Err(e) => return utils::output(Some(&e), None),
    };
    if !items.iter().any(|item| item.id == id) {
        return utils::output(Some("HAProxy load balancer not found"), None);
    }

    let remaining: Vec<_> = items.into_iter().filter(|item| item.id != id).collect();
    let preview = match state.haproxy.build_managed_config(&remaining) {
        Ok(preview) => preview,
        Err(e) => return utils::output(Some(&e), None),
    };
    let apply = match state.haproxy.apply_config(&preview.config).await {
        Ok(apply) => apply,
        Err(e) => return utils::output(Some(&e), None),
    };

    match state.db.delete_haproxy_lb(id) {
        Ok(true) => utils::output(
            None,
            Some(json!({
                "config": preview.config,
                "load_balancers": remaining,
                "apply": apply
            })),
        ),
        Ok(false) => utils::output(Some("HAProxy load balancer not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_haproxy_set_enabled(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Form(form): Form<HaproxyEnabledForm>,
) -> Json<Value> {
    let enabled = parse_form_bool(form.enabled.as_deref());
    match state.db.set_haproxy_lb_enabled(id, enabled) {
        Ok(true) => match apply_saved_haproxy_config(&state).await {
            Ok(value) => utils::output(None, Some(value)),
            Err(e) => utils::output(Some(&e), None),
        },
        Ok(false) => utils::output(Some("HAProxy load balancer not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_haproxy_test_web(
    State(state): State<Arc<AppState>>,
    Json(form): Json<HaproxyWebTestForm>,
) -> Json<Value> {
    let url = form.url.unwrap_or_default();
    let count = match json_u16(form.count, 5, "test count") {
        Ok(value) => value,
        Err(e) => return utils::output(Some(&e), None),
    };
    match state.haproxy.test_web_url(&url, count).await {
        Ok(data) => utils::output(None, Some(serde_json::to_value(data).unwrap_or_default())),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_haproxy_test_sql(
    State(state): State<Arc<AppState>>,
    Json(form): Json<HaproxySqlTestForm>,
) -> Json<Value> {
    let host = form.host.unwrap_or_default();
    let port = match json_u16(form.port, 1433, "TCP port") {
        Ok(value) => value,
        Err(e) => return utils::output(Some(&e), None),
    };
    let count = match json_u16(form.count, 5, "test count") {
        Ok(value) => value,
        Err(e) => return utils::output(Some(&e), None),
    };
    let timeout_secs = match json_u64(form.timeout, 3, "timeout") {
        Ok(value) => value,
        Err(e) => return utils::output(Some(&e), None),
    };
    match state
        .haproxy
        .test_tcp_target(&host, port, count, timeout_secs)
        .await
    {
        Ok(data) => utils::output(None, Some(serde_json::to_value(data).unwrap_or_default())),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn save_and_apply_haproxy(
    state: &AppState,
    update: HaproxyLoadBalancerUpdate,
) -> Result<Value, String> {
    let saved = state.db.save_haproxy_lb(update)?;
    let mut value = apply_saved_haproxy_config(state).await?;
    if let Some(obj) = value.as_object_mut() {
        obj.insert(
            "saved".to_string(),
            serde_json::to_value(saved).unwrap_or_default(),
        );
    }
    Ok(value)
}

async fn apply_saved_haproxy_config(state: &AppState) -> Result<Value, String> {
    let items = state.db.list_haproxy_lbs()?;
    let preview = state.haproxy.build_managed_config(&items)?;
    let apply = state.haproxy.apply_config(&preview.config).await?;
    Ok(json!({
        "config": preview.config,
        "load_balancers": items,
        "apply": apply
    }))
}

// ---- Static File Handlers ----

async fn handle_web_assets(Path(path): Path<String>) -> impl IntoResponse {
    let path = path.trim_start_matches('/');
    match WebAssets::get(path) {
        Some(content) => {
            let content_type = match path.rsplit('.').next().unwrap_or("") {
                "css" => "text/css; charset=utf-8",
                "js" => "application/javascript; charset=utf-8",
                "svg" => "image/svg+xml",
                "woff2" => "font/woff2",
                "woff" => "font/woff",
                "ttf" => "font/ttf",
                "eot" => "application/vnd.ms-fontobject",
                "png" => "image/png",
                "jpg" | "jpeg" => "image/jpeg",
                "ico" => "image/x-icon",
                _ => "application/octet-stream",
            };
            Response::builder()
                .header(header::CONTENT_TYPE, content_type)
                .body(Body::from(content.data.to_vec()))
                .unwrap()
        }
        None => (StatusCode::NOT_FOUND, "Not Found").into_response(),
    }
}

async fn handle_index() -> impl IntoResponse {
    let content = WebAssets::get("index.html")
        .map(|f| f.data.to_vec())
        .unwrap_or_default();
    Response::builder()
        .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
        .header(header::CACHE_CONTROL, "no-cache")
        .body(Body::from(content))
        .unwrap()
}

async fn handle_docs(Path(path): Path<String>) -> impl IntoResponse {
    let filename = if path.is_empty() {
        "iptables-command-reference.html".into()
    } else {
        path
    };
    let content = DocAssets::get(&filename)
        .map(|f| f.data.to_vec())
        .unwrap_or_default();
    let content_type = if filename.ends_with(".html") {
        "text/html; charset=utf-8"
    } else if filename.ends_with(".md") {
        "text/markdown; charset=utf-8"
    } else {
        "application/octet-stream"
    };
    Response::builder()
        .header(header::CONTENT_TYPE, content_type)
        .body(Body::from(content))
        .unwrap()
}

async fn handle_platform(State(state): State<Arc<AppState>>) -> Json<Value> {
    utils::output(None, Some(Value::String(state.platform.clone())))
}

async fn handle_interfaces(State(state): State<Arc<AppState>>) -> Json<Value> {
    let interfaces = system::get_interfaces(&state.platform).await;
    utils::output(None, Some(interfaces))
}

#[derive(Deserialize)]
pub struct LogForm {
    pub level: Option<String>,
    pub msg: Option<String>,
    pub cmd: Option<String>,
}

async fn handle_log(Form(form): Form<LogForm>) -> Json<Value> {
    let level = form.level.as_deref().unwrap_or("info").to_ascii_lowercase();
    let msg = form.msg.as_deref().unwrap_or("");
    let cmd = form.cmd.as_deref().unwrap_or("");
    let target = if cmd.is_empty() {
        msg.to_string()
    } else {
        format!("{msg} → {cmd}")
    };
    match level.as_str() {
        "debug" => tracing::debug!(target: "frontend", "{}", target),
        "info" => tracing::info!(target: "frontend",  "{}", target),
        "warn" => tracing::warn!(target: "frontend",  "{}", target),
        "error" => tracing::error!(target: "frontend", "{}", target),
        _ => tracing::info!(target: "frontend",  "{}", target),
    }
    utils::output(None, None)
}

async fn handle_favicon() -> impl IntoResponse {
    StatusCode::OK
}

// ---- Router Builder ----

pub fn build_router(state: Arc<AppState>) -> Router {
    let auth_layer = middleware::from_fn_with_state(state.clone(), auth_middleware);

    let auth_routes = Router::new()
        .route("/version", get(handle_version))
        .route("/listRule", post(handle_list_rule))
        .route("/listExec", post(handle_list_exec))
        .route("/flushRule", post(handle_flush_rule))
        .route("/deleteRule", post(handle_delete_rule))
        .route("/flushMetrics", post(handle_flush_metrics))
        .route("/getRuleInfo", post(handle_get_rule_info))
        .route(
            "/flushEmptyCustomChain",
            post(handle_flush_empty_custom_chain),
        )
        .route("/export", post(handle_export))
        .route("/import", post(handle_import))
        .route("/exec", post(handle_exec))
        .route("/system/info", get(handle_system_info))
        .route("/system/processes", get(handle_system_processes))
        .route("/haproxy/status", get(handle_haproxy_status))
        .route("/haproxy/reload", post(handle_haproxy_reload))
        .route("/haproxy/restart", post(handle_haproxy_restart))
        .route("/haproxy/config", get(handle_haproxy_config))
        .route("/haproxy/config/validate", post(handle_haproxy_validate))
        .route("/haproxy/lbs", get(handle_haproxy_lbs))
        .route("/haproxy/lbs/:id", delete(handle_haproxy_delete_lb))
        .route("/haproxy/lbs/:id/delete", post(handle_haproxy_delete_lb))
        .route("/haproxy/lbs/:id/enabled", post(handle_haproxy_set_enabled))
        .route("/haproxy/test/web", post(handle_haproxy_test_web))
        .route("/haproxy/test/sql", post(handle_haproxy_test_sql))
        .route("/haproxy/web", post(handle_haproxy_web))
        .route("/haproxy/sql", post(handle_haproxy_sql))
        .route("/api/haproxy/status", get(handle_haproxy_status))
        .route("/api/haproxy/reload", post(handle_haproxy_reload))
        .route("/api/haproxy/restart", post(handle_haproxy_restart))
        .route("/api/haproxy/config", get(handle_haproxy_config))
        .route(
            "/api/haproxy/config/validate",
            post(handle_haproxy_validate),
        )
        .route("/api/haproxy/lbs", get(handle_haproxy_lbs))
        .route("/api/haproxy/lbs/:id", delete(handle_haproxy_delete_lb))
        .route(
            "/api/haproxy/lbs/:id/delete",
            post(handle_haproxy_delete_lb),
        )
        .route(
            "/api/haproxy/lbs/:id/enabled",
            post(handle_haproxy_set_enabled),
        )
        .route("/api/haproxy/test/web", post(handle_haproxy_test_web))
        .route("/api/haproxy/test/sql", post(handle_haproxy_test_sql))
        .route("/api/haproxy/web", post(handle_haproxy_web))
        .route("/api/haproxy/sql", post(handle_haproxy_sql))
        .route("/juniper/info", get(handle_juniper_info))
        .route(
            "/juniper/settings",
            get(handle_juniper_settings).post(handle_juniper_save_settings),
        )
        .route(
            "/juniper/vlans",
            get(handle_juniper_vlans).post(handle_juniper_create_vlan),
        )
        .route("/juniper/vlans/:name", delete(handle_juniper_delete_vlan))
        .route("/juniper/ports", get(handle_juniper_ports))
        .route(
            "/juniper/ports/bulk-config",
            post(handle_juniper_bulk_ports),
        )
        .route(
            "/juniper/ports/:port/access-vlan",
            post(handle_juniper_access_vlan),
        )
        .route(
            "/juniper/ports/:port/trunk-vlan",
            post(handle_juniper_trunk_vlan),
        )
        .route(
            "/juniper/ports/:port/enabled",
            post(handle_juniper_port_enabled),
        )
        .route("/api/juniper/info", get(handle_juniper_info))
        .route(
            "/api/juniper/settings",
            get(handle_juniper_settings).post(handle_juniper_save_settings),
        )
        .route(
            "/api/juniper/vlans",
            get(handle_juniper_vlans).post(handle_juniper_create_vlan),
        )
        .route(
            "/api/juniper/vlans/:name",
            delete(handle_juniper_delete_vlan),
        )
        .route("/api/juniper/ports", get(handle_juniper_ports))
        .route(
            "/api/juniper/ports/bulk-config",
            post(handle_juniper_bulk_ports),
        )
        .route(
            "/api/juniper/ports/:port/access-vlan",
            post(handle_juniper_access_vlan),
        )
        .route(
            "/api/juniper/ports/:port/trunk-vlan",
            post(handle_juniper_trunk_vlan),
        )
        .route(
            "/api/juniper/ports/:port/enabled",
            post(handle_juniper_port_enabled),
        )
        .route("/web/*path", get(handle_web_assets))
        .route("/platform", get(handle_platform))
        .route("/interfaces", get(handle_interfaces))
        .route("/log", post(handle_log))
        .route("/favicon.ico", get(handle_favicon))
        .route("/", get(handle_index))
        .route("/docs/*path", get(handle_docs))
        .layer(auth_layer);

    // WebSocket endpoints: browsers don't send Basic Auth headers on WS upgrade,
    // so these must bypass the auth middleware.
    let ws_routes = Router::new()
        .route("/shell", get(shell::handle_ws_shell))
        .route("/ai", get(ai::handle_ws_ai));

    Router::new()
        .merge(ws_routes)
        .merge(auth_routes)
        .with_state(state)
}
