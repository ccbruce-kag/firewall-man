use crate::ai;
use crate::apps::apiman::{ApiManNodeInput, ApiManReportInput, ApiManRequestInput, ApiManWireframeInput, ApiManWorkspaceInput};
use crate::apps::dbman::{DbConnectionInput, ErdDiagramInput};
use crate::apps::network::NetworkArchitectureInput;
use crate::apps::settings::{
    DictionaryInput, RoleInput, SystemSettingInput, UnitInput, UserInput, UserPasswordInput,
};
use crate::apps::workflow::{WorkflowInput, WorkflowStatusInput};
use crate::bapi_log;
use crate::db::{
    AppDb, CronJobInput, HaproxyBackendServerUpdate, HaproxyLoadBalancerUpdate, JuniperDeviceUpdate,
};
use crate::net::firewall::FirewallCmd;
use crate::net::haproxy::{BackendServer, HaproxyClient};
use crate::net::juniper::{self, JuniperClient};
use crate::net::netplan::{NetplanConfig, NetplanConfigInput};
use crate::net::nginx::{NginxClient, NginxSettings, NginxSiteUpdate};
use crate::net::pcap;
use crate::security::{CvsSourceInput, ScanTaskInput};
use crate::sys::crontab::CronService;
use crate::sys::shell;
use crate::sys::system;
use crate::sys::tools;
use crate::utils;
use axum::body::Body;
use axum::extract::{Form, Path, Request, State};
use axum::http::{header, HeaderValue, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{delete, get, post, put};
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
#[folder = "../run/web"]
struct WebAssets;

#[derive(RustEmbed)]
#[folder = "../docs/op"]
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
    pub nginx: std::sync::Mutex<NginxClient>,
    pub cron: Arc<CronService>,
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

// ---- Nginx Handlers ----

async fn handle_nginx_env(State(state): State<Arc<AppState>>) -> Json<Value> {
    let settings = state
        .db
        .nginx_settings()
        .unwrap_or_else(|_| NginxSettings::default());
    utils::output(
        None,
        Some(serde_json::to_value(&settings).unwrap_or_default()),
    )
}

#[derive(Deserialize)]
struct NginxSettingsForm {
    pub nginx_bin: Option<String>,
    pub config_dir: Option<String>,
    pub sites_enabled_dir: Option<String>,
    pub modules_enabled_dir: Option<String>,
    pub conf_d_dir: Option<String>,
}

async fn handle_nginx_save_env(
    State(state): State<Arc<AppState>>,
    Form(form): Form<NginxSettingsForm>,
) -> Json<Value> {
    let settings = NginxSettings {
        nginx_bin: form.nginx_bin.unwrap_or_else(|| "nginx".to_string()),
        config_dir: form.config_dir.unwrap_or_else(|| "/etc/nginx".to_string()),
        sites_enabled_dir: form
            .sites_enabled_dir
            .unwrap_or_else(|| "/etc/nginx/sites-enabled".to_string()),
        modules_enabled_dir: form
            .modules_enabled_dir
            .unwrap_or_else(|| "/etc/nginx/modules-enabled".to_string()),
        conf_d_dir: form
            .conf_d_dir
            .unwrap_or_else(|| "/etc/nginx/conf.d".to_string()),
    };
    match state.db.save_nginx_settings(&settings) {
        Ok(_) => {
            if let Ok(mut nginx) = state.nginx.lock() {
                nginx.update_settings(settings);
            }
            utils::output(None, None)
        }
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_nginx_sites(State(state): State<Arc<AppState>>) -> Json<Value> {
    match state.db.list_nginx_sites() {
        Ok(sites) => utils::output(None, Some(serde_json::to_value(&sites).unwrap_or_default())),
        Err(e) => utils::output(Some(&e), None),
    }
}

#[derive(Deserialize)]
struct NginxSiteForm {
    pub site_name: Option<String>,
    pub server_name: Option<String>,
    pub enabled: Option<String>,
    pub document_root: Option<String>,
    pub config_content: Option<String>,
    pub site_type: Option<String>,
    pub reverse_proxy_pass: Option<String>,
}

async fn handle_nginx_create_site(
    State(state): State<Arc<AppState>>,
    Form(form): Form<NginxSiteForm>,
) -> Json<Value> {
    let name = match form.site_name {
        Some(ref n) if !n.trim().is_empty() => n.trim().to_string(),
        _ => return utils::output(Some("site name is required"), None),
    };
    let update = NginxSiteUpdate {
        site_name: name,
        server_name: form.server_name,
        enabled: Some(parse_form_bool(form.enabled.as_deref())),
        document_root: form.document_root,
        config_content: form.config_content,
        site_type: form.site_type,
        reverse_proxy_pass: form.reverse_proxy_pass,
    };
    match state.db.save_nginx_site(&update) {
        Ok(site) => utils::output(None, Some(serde_json::to_value(&site).unwrap_or_default())),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_nginx_get_site(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Json<Value> {
    match state.db.get_nginx_site(&name) {
        Ok(Some(site)) => {
            utils::output(None, Some(serde_json::to_value(&site).unwrap_or_default()))
        }
        Ok(None) => utils::output(Some("nginx site not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_nginx_update_site(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Form(form): Form<NginxSiteForm>,
) -> Json<Value> {
    let update = NginxSiteUpdate {
        site_name: name.clone(),
        server_name: form.server_name,
        enabled: Some(parse_form_bool(form.enabled.as_deref())),
        document_root: form.document_root,
        config_content: form.config_content,
        site_type: form.site_type,
        reverse_proxy_pass: form.reverse_proxy_pass,
    };
    match state.db.update_nginx_site(&name, &update) {
        Ok(Some(site)) => {
            utils::output(None, Some(serde_json::to_value(&site).unwrap_or_default()))
        }
        Ok(None) => utils::output(Some("nginx site not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_nginx_delete_site(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Json<Value> {
    match state.db.delete_nginx_site(&name) {
        Ok(true) => utils::output(None, None),
        Ok(false) => utils::output(Some("nginx site not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_nginx_site_preview(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Json<Value> {
    let site = match state.db.get_nginx_site(&name) {
        Ok(Some(s)) => s,
        Ok(None) => return utils::output(Some("nginx site not found"), None),
        Err(e) => return utils::output(Some(&e), None),
    };
    let nginx = state
        .nginx
        .lock()
        .map_err(|e| format!("lock nginx client failed: {e}"));
    match nginx {
        Ok(nginx) => {
            let config = if let Some(ref content) = site.config_content {
                if content.trim().is_empty() {
                    nginx.generate_site_config(&site)
                } else {
                    content.clone()
                }
            } else {
                nginx.generate_site_config(&site)
            };
            utils::output(None, Some(json!({"config": config, "site": site})))
        }
        Err(e) => utils::output(Some(&e), None),
    }
}

#[derive(Deserialize)]
struct NginxWriteSiteForm {
    pub write_file: Option<String>,
}

async fn handle_nginx_write_site(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Form(form): Form<NginxWriteSiteForm>,
) -> Json<Value> {
    let site = match state.db.get_nginx_site(&name) {
        Ok(Some(s)) => s,
        Ok(None) => return utils::output(Some("nginx site not found"), None),
        Err(e) => return utils::output(Some(&e), None),
    };
    let nginx = match state.nginx.lock() {
        Ok(n) => n,
        Err(e) => return utils::output(Some(&format!("lock nginx client failed: {e}")), None),
    };
    let config = match &site.config_content {
        Some(c) if !c.trim().is_empty() => c.clone(),
        _ => nginx.generate_site_config(&site),
    };
    let write = parse_form_bool(form.write_file.as_deref());
    if !write {
        return utils::output(None, Some(json!({"config": config})));
    }
    match nginx.write_site_file(&name, &config) {
        Ok(_) => utils::output(None, Some(json!({"config": config, "written": true}))),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_nginx_delete_site_file(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Json<Value> {
    let nginx = match state.nginx.lock() {
        Ok(n) => n,
        Err(e) => return utils::output(Some(&format!("lock nginx client failed: {e}")), None),
    };
    match nginx.remove_site_file(&name) {
        Ok(_) => utils::output(None, None),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_nginx_modules(State(state): State<Arc<AppState>>) -> Json<Value> {
    match state.db.list_nginx_modules() {
        Ok(modules) => utils::output(
            None,
            Some(serde_json::to_value(&modules).unwrap_or_default()),
        ),
        Err(e) => utils::output(Some(&e), None),
    }
}

#[derive(Deserialize)]
struct NginxModuleForm {
    pub module_name: Option<String>,
}

async fn handle_nginx_add_module(
    State(state): State<Arc<AppState>>,
    Form(form): Form<NginxModuleForm>,
) -> Json<Value> {
    let name = match form.module_name {
        Some(ref n) if !n.trim().is_empty() => n.trim().to_string(),
        _ => return utils::output(Some("module name is required"), None),
    };
    match state.db.save_nginx_module(&name) {
        Ok(m) => utils::output(None, Some(serde_json::to_value(&m).unwrap_or_default())),
        Err(e) => utils::output(Some(&e), None),
    }
}

#[derive(Deserialize)]
struct NginxModuleEnabledForm {
    pub enabled: Option<String>,
}

async fn handle_nginx_set_module_enabled(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Form(form): Form<NginxModuleEnabledForm>,
) -> Json<Value> {
    let enabled = parse_form_bool(form.enabled.as_deref());
    match state.db.set_nginx_module_enabled(&name, enabled) {
        Ok(Some(m)) => {
            let nginx = match state.nginx.lock() {
                Ok(n) => n,
                Err(e) => {
                    return utils::output(Some(&format!("lock nginx client failed: {e}")), None)
                }
            };
            if enabled {
                let _ = nginx.enable_module(&name);
            } else {
                let _ = nginx.disable_module(&name);
            }
            utils::output(None, Some(serde_json::to_value(&m).unwrap_or_default()))
        }
        Ok(None) => utils::output(Some("nginx module not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_nginx_scan_modules(State(state): State<Arc<AppState>>) -> Json<Value> {
    let nginx = match state.nginx.lock() {
        Ok(n) => n,
        Err(e) => return utils::output(Some(&format!("lock nginx client failed: {e}")), None),
    };
    match nginx.scan_modules() {
        Ok(modules) => utils::output(
            None,
            Some(serde_json::to_value(&modules).unwrap_or_default()),
        ),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_nginx_scan_sites(State(state): State<Arc<AppState>>) -> Json<Value> {
    let nginx = match state.nginx.lock() {
        Ok(n) => n,
        Err(e) => return utils::output(Some(&format!("lock nginx client failed: {e}")), None),
    };
    match nginx.scan_sites() {
        Ok(sites) => utils::output(None, Some(serde_json::to_value(&sites).unwrap_or_default())),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_nginx_test(State(state): State<Arc<AppState>>) -> Json<Value> {
    let settings = {
        let nginx = state.nginx.lock().unwrap();
        nginx.settings().clone()
    };
    let client = NginxClient::new(settings);
    match client.test_config().await {
        Ok(output) => utils::output(None, Some(Value::String(output))),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_nginx_reload(State(state): State<Arc<AppState>>) -> Json<Value> {
    let settings = {
        let nginx = state.nginx.lock().unwrap();
        nginx.settings().clone()
    };
    let client = NginxClient::new(settings);
    match client.reload().await {
        Ok(output) => utils::output(None, Some(Value::String(output))),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_nginx_config_preview(State(state): State<Arc<AppState>>) -> Json<Value> {
    let sites = match state.db.list_nginx_sites() {
        Ok(s) => s,
        Err(e) => return utils::output(Some(&e), None),
    };
    let modules = match state.db.list_nginx_modules() {
        Ok(m) => m,
        Err(e) => return utils::output(Some(&e), None),
    };
    let nginx = match state.nginx.lock() {
        Ok(n) => n,
        Err(e) => return utils::output(Some(&format!("lock nginx client failed: {e}")), None),
    };
    let active_modules: Vec<String> = modules
        .iter()
        .filter(|m| m.enabled)
        .map(|m| m.module_name.clone())
        .collect();
    let preview = nginx.build_full_config(&sites, &active_modules);
    utils::output(
        None,
        Some(serde_json::to_value(&preview).unwrap_or_default()),
    )
}

// ---- Log Viewer Handlers ----

async fn handle_log_list() -> Json<Value> {
    let log_dir = std::path::Path::new("/var/log");
    let mut files: Vec<String> = Vec::new();
    if let Ok(entries) = std::fs::read_dir(log_dir) {
        for entry in entries.flatten() {
            if let Some(name) = entry.file_name().to_str() {
                if !name.starts_with('.') {
                    files.push(name.to_string());
                }
            }
        }
    }
    files.sort();
    utils::output(None, Some(serde_json::to_value(&files).unwrap_or_default()))
}

#[derive(Deserialize)]
struct LogTailForm {
    pub path: Option<String>,
    pub lines: Option<u32>,
}

async fn handle_log_tail(Form(form): Form<LogTailForm>) -> Json<Value> {
    let path = match form.path {
        Some(ref p) if !p.trim().is_empty() => p.trim().to_string(),
        _ => return utils::output(Some("log path is required"), None),
    };
    let lines = form.lines.unwrap_or(50).max(10).min(5000);

    // If path is just a filename, prepend /var/log/
    let full_path = if path.contains('/') {
        path.clone()
    } else {
        format!("/var/log/{}", path)
    };

    // Use tail command (without -F to avoid hanging)
    let output = tokio::process::Command::new("tail")
        .args(["-n", &lines.to_string(), &full_path])
        .output()
        .await;

    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout).to_string();
            let stderr = String::from_utf8_lossy(&out.stderr).to_string();
            let content = if stdout.is_empty() { stderr } else { stdout };
            let has_more = content.lines().count() as u32 >= lines;
            utils::output(
                None,
                Some(json!({
                    "path": full_path,
                    "content": content,
                    "lines": content.lines().count(),
                    "has_more": has_more,
                })),
            )
        }
        Err(e) => utils::output(Some(&format!("tail failed: {e}")), None),
    }
}

async fn handle_log_content(Form(form): Form<LogTailForm>) -> Json<Value> {
    let path = match form.path {
        Some(ref p) if !p.trim().is_empty() => p.trim().to_string(),
        _ => return utils::output(Some("log path is required"), None),
    };
    let full_path = if path.contains('/') {
        path.clone()
    } else {
        format!("/var/log/{}", path)
    };

    match tokio::fs::read_to_string(&full_path).await {
        Ok(content) => {
            let line_count = content.lines().count();
            utils::output(
                None,
                Some(json!({"path": full_path, "content": content, "lines": line_count})),
            )
        }
        Err(e) => utils::output(Some(&format!("read failed: {e}")), None),
    }
}

// ---- Tools Handlers ----

#[derive(Deserialize)]
pub struct PingForm {
    pub host: Option<String>,
    pub count: Option<u32>,
    pub timeout: Option<u32>,
}

#[derive(Deserialize)]
pub struct PingClasscForm {
    pub network: Option<String>,
}

async fn handle_tools_ping_classc(Form(form): Form<PingClasscForm>) -> Json<Value> {
    let network = match form.network {
        Some(ref n) if !n.trim().is_empty() => n.trim().to_string(),
        _ => return utils::output(Some("network is required"), None),
    };
    Json(crate::sys::tools::ping_classc(&network, 1, 3).await)
}

async fn handle_tools_ping(Form(form): Form<PingForm>) -> Json<Value> {
    let host = form.host.unwrap_or_default();
    if host.is_empty() {
        return utils::output(Some("host is required"), None);
    }
    let count = form.count.unwrap_or(4).max(1).min(100);
    let timeout = form.timeout.unwrap_or(10).max(1).min(60);
    Json(tools::ping(&host, count, timeout).await)
}

#[derive(Deserialize)]
pub struct LsofForm {
    pub port: Option<String>,
    pub process: Option<String>,
    pub protocol: Option<String>,
}

async fn handle_tools_lsof(Form(form): Form<LsofForm>) -> Json<Value> {
    let port = form.port.and_then(|p| p.parse::<u16>().ok());
    Json(tools::lsof(port, form.process.as_deref(), form.protocol.as_deref()).await)
}

#[derive(Deserialize)]
pub struct TracerouteForm {
    pub host: Option<String>,
    pub max_hops: Option<u32>,
}

async fn handle_tools_traceroute(Form(form): Form<TracerouteForm>) -> Json<Value> {
    let host = form.host.unwrap_or_default();
    if host.is_empty() {
        return utils::output(Some("host is required"), None);
    }
    let max_hops = form.max_hops.unwrap_or(30).max(1).min(64);
    Json(tools::traceroute(&host, max_hops).await)
}

#[derive(Deserialize)]
pub struct NslookupForm {
    pub domain: Option<String>,
    pub dns_server: Option<String>,
}

async fn handle_tools_nslookup(Form(form): Form<NslookupForm>) -> Json<Value> {
    let domain = form.domain.unwrap_or_default();
    if domain.is_empty() {
        return utils::output(Some("domain is required"), None);
    }
    Json(tools::nslookup(&domain, form.dns_server.as_deref()).await)
}

#[derive(Deserialize)]
pub struct IpLocationForm {
    pub ip: Option<String>,
}

async fn handle_tools_ip_location(Form(form): Form<IpLocationForm>) -> Json<Value> {
    let ip = form.ip.unwrap_or_default();
    let ip = if ip.is_empty() { "me" } else { &ip };
    Json(tools::ip_location(ip).await)
}

async fn handle_tools_netstat(State(state): State<Arc<AppState>>) -> Json<Value> {
    Json(tools::netstat(&state.platform).await)
}

#[derive(Deserialize)]
struct PcapCaptureForm {
    interface: Option<String>,
    filter: Option<String>,
    count: Option<usize>,
    timeout: Option<u64>,
}

async fn handle_tools_pcap_interfaces() -> Json<Value> {
    Json(json!({"code": 0, "data": pcap::list_interfaces()}))
}

async fn handle_tools_pcap_capture(Form(form): Form<PcapCaptureForm>) -> Json<Value> {
    let interface = form.interface.unwrap_or_else(|| "en0".to_string());
    let filter = form.filter.unwrap_or_default();
    let count = form.count.unwrap_or(50);
    let timeout = form.timeout.unwrap_or(10);
    bapi_log!(
        "info",
        "pcap.capture",
        &format!(
            "iface={}, filter={}, count={}, timeout={}",
            interface, filter, count, timeout
        )
    );

    let iface = interface.clone();
    let flt = filter.clone();
    let result =
        tokio::task::spawn_blocking(move || pcap::capture_packets(&iface, &flt, count, timeout))
            .await;

    match &result {
        Ok(Ok(packets)) => bapi_log!(
            "info",
            "pcap.capture",
            &format!("{} packets captured", packets.len()),
            ""
        ),
        Ok(Err(e)) => bapi_log!("error", "pcap.capture", e, ""),
        Err(e) => bapi_log!("error", "pcap.capture", &format!("task failed: {}", e), ""),
    }
    match result {
        Ok(Ok(packets)) => Json(json!({"code": 0, "data": packets, "count": packets.len()})),
        Ok(Err(e)) => Json(json!({"code": 1, "msg": e})),
        Err(e) => Json(json!({"code": 1, "msg": format!("task failed: {}", e)})),
    }
}

async fn handle_cron_list(State(state): State<Arc<AppState>>) -> Json<Value> {
    match state.db.list_cron_jobs() {
        Ok(jobs) => utils::output(None, Some(json!({ "jobs": jobs }))),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_cron_get(State(state): State<Arc<AppState>>, Path(id): Path<i64>) -> Json<Value> {
    match state.db.cron_job(id) {
        Ok(Some(job)) => utils::output(None, Some(json!({ "job": job }))),
        Ok(None) => utils::output(Some("cron job not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_cron_create(
    State(state): State<Arc<AppState>>,
    Json(input): Json<CronJobInput>,
) -> Json<Value> {
    if let Err(e) = crate::sys::crontab::validate_schedule(&input.schedule) {
        return utils::output(Some(&e), None);
    }
    match state.db.create_cron_job(input) {
        Ok(job) => {
            if let Err(e) = state.cron.reload().await {
                return utils::output(Some(&e), None);
            }
            utils::output(None, Some(json!({ "job": job })))
        }
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_cron_update(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(input): Json<CronJobInput>,
) -> Json<Value> {
    if let Err(e) = crate::sys::crontab::validate_schedule(&input.schedule) {
        return utils::output(Some(&e), None);
    }
    match state.db.update_cron_job(id, input) {
        Ok(Some(job)) => {
            if let Err(e) = state.cron.reload().await {
                return utils::output(Some(&e), None);
            }
            utils::output(None, Some(json!({ "job": job })))
        }
        Ok(None) => utils::output(Some("cron job not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_cron_delete(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    match state.db.delete_cron_job(id) {
        Ok(true) => {
            if let Err(e) = state.cron.reload().await {
                return utils::output(Some(&e), None);
            }
            utils::output(None, Some(json!({ "deleted": true })))
        }
        Ok(false) => utils::output(Some("cron job not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_cron_enable(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    handle_cron_enabled(state, id, true).await
}

async fn handle_cron_disable(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    handle_cron_enabled(state, id, false).await
}

async fn handle_cron_enabled(state: Arc<AppState>, id: i64, enabled: bool) -> Json<Value> {
    match state.db.set_cron_job_enabled(id, enabled) {
        Ok(true) => {
            if let Err(e) = state.cron.reload().await {
                return utils::output(Some(&e), None);
            }
            utils::output(None, Some(json!({ "enabled": enabled })))
        }
        Ok(false) => utils::output(Some("cron job not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_cron_run(State(state): State<Arc<AppState>>, Path(id): Path<i64>) -> Json<Value> {
    match state.cron.run_job(id).await {
        Ok(result) => utils::output(None, Some(json!({ "run": result }))),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_cron_runs(State(state): State<Arc<AppState>>, Path(id): Path<i64>) -> Json<Value> {
    match state.db.list_cron_job_runs(id, 100) {
        Ok(runs) => utils::output(None, Some(json!({ "runs": runs }))),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_workflow_list(State(state): State<Arc<AppState>>) -> Json<Value> {
    match state.db.list_workflows() {
        Ok(items) => utils::output(None, Some(json!({ "workflows": items }))),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_workflow_get(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    match state.db.workflow(id) {
        Ok(Some(wf)) => utils::output(None, Some(json!({ "workflow": wf }))),
        Ok(None) => utils::output(Some("workflow not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_workflow_create(
    State(state): State<Arc<AppState>>,
    Json(input): Json<WorkflowInput>,
) -> Json<Value> {
    match state.db.create_workflow(input) {
        Ok(wf) => utils::output(None, Some(json!({ "workflow": wf }))),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_workflow_update(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(input): Json<WorkflowInput>,
) -> Json<Value> {
    match state.db.update_workflow(id, input) {
        Ok(Some(wf)) => utils::output(None, Some(json!({ "workflow": wf }))),
        Ok(None) => utils::output(Some("workflow not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_workflow_delete(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    match state.db.delete_workflow(id) {
        Ok(true) => utils::output(None, Some(json!({ "deleted": true }))),
        Ok(false) => utils::output(Some("workflow not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_workflow_set_status(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(input): Json<WorkflowStatusInput>,
) -> Json<Value> {
    match state.db.set_workflow_status(id, &input.status) {
        Ok(Some(wf)) => utils::output(None, Some(json!({ "workflow": wf }))),
        Ok(None) => utils::output(Some("workflow not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_network_list(State(state): State<Arc<AppState>>) -> Json<Value> {
    match state.db.list_network_architectures() {
        Ok(items) => utils::output(None, Some(json!({ "architectures": items }))),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_network_get(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    match state.db.network_architecture(id) {
        Ok(Some(item)) => utils::output(None, Some(json!({ "architecture": item }))),
        Ok(None) => utils::output(Some("network architecture not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_network_create(
    State(state): State<Arc<AppState>>,
    Json(input): Json<NetworkArchitectureInput>,
) -> Json<Value> {
    match state.db.create_network_architecture(input) {
        Ok(item) => utils::output(None, Some(json!({ "architecture": item }))),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_network_update(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(input): Json<NetworkArchitectureInput>,
) -> Json<Value> {
    match state.db.update_network_architecture(id, input) {
        Ok(Some(item)) => utils::output(None, Some(json!({ "architecture": item }))),
        Ok(None) => utils::output(Some("network architecture not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_network_delete(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    match state.db.delete_network_architecture(id) {
        Ok(true) => utils::output(None, Some(json!({ "deleted": true }))),
        Ok(false) => utils::output(Some("network architecture not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

#[derive(Deserialize)]
struct SnmpRequestForm {
    host: Option<String>,
    port: Option<u16>,
    community: Option<String>,
    oid: Option<String>,
}

async fn handle_snmp_get(Form(form): Form<SnmpRequestForm>) -> Json<Value> {
    let host = form.host.unwrap_or_else(|| "127.0.0.1".into());
    let port = form.port.unwrap_or(161);
    let community = form.community.unwrap_or_else(|| "public".into());
    let oid = form.oid.unwrap_or_else(|| "1.3.6.1.2.1.1.1.0".into());
    bapi_log!(
        "info",
        "snmp.get",
        &format!(
            "host={}:{}, community={}, oid={}",
            host, port, community, oid
        )
    );
    let h = host.clone();
    let c = community.clone();
    let o = oid.clone();
    let result =
        tokio::task::spawn_blocking(move || crate::net::snmp::snmp_get(&h, port, &c, &o)).await;
    match &result {
        Ok(Ok(data)) => bapi_log!(
            "info",
            "snmp.get",
            &format!(
                "ok, {} results",
                data["results"].as_array().map(|a| a.len()).unwrap_or(0)
            ),
            ""
        ),
        Ok(Err(e)) => bapi_log!("error", "snmp.get", e, ""),
        Err(e) => bapi_log!("error", "snmp.get", &format!("task failed: {}", e), ""),
    }
    match result {
        Ok(Ok(data)) => Json(json!({"code": 0, "data": data})),
        Ok(Err(e)) => Json(json!({"code": 1, "msg": e})),
        Err(e) => Json(json!({"code": 1, "msg": format!("task failed: {}", e)})),
    }
}

async fn handle_snmp_walk(Form(form): Form<SnmpRequestForm>) -> Json<Value> {
    let host = form.host.unwrap_or_else(|| "127.0.0.1".into());
    let port = form.port.unwrap_or(161);
    let community = form.community.unwrap_or_else(|| "public".into());
    let oid = form.oid.unwrap_or_else(|| "1.3.6.1.2.1.1".into());
    bapi_log!(
        "info",
        "snmp.walk",
        &format!(
            "host={}:{}, community={}, oid={}",
            host, port, community, oid
        )
    );
    let h = host.clone();
    let c = community.clone();
    let o = oid.clone();
    let result =
        tokio::task::spawn_blocking(move || crate::net::snmp::snmp_walk(&h, port, &c, &o)).await;
    match &result {
        Ok(Ok(data)) => bapi_log!(
            "info",
            "snmp.walk",
            &format!(
                "ok, {} results",
                data["results"].as_array().map(|a| a.len()).unwrap_or(0)
            ),
            ""
        ),
        Ok(Err(e)) => bapi_log!("error", "snmp.walk", e, ""),
        Err(e) => bapi_log!("error", "snmp.walk", &format!("task failed: {}", e), ""),
    }
    match result {
        Ok(Ok(data)) => Json(json!({"code": 0, "data": data})),
        Ok(Err(e)) => Json(json!({"code": 1, "msg": e})),
        Err(e) => Json(json!({"code": 1, "msg": format!("task failed: {}", e)})),
    }
}

#[derive(Deserialize)]
struct SambaConnectForm {
    host: Option<String>,
    port: Option<u16>,
    username: Option<String>,
    password: Option<String>,
    share: Option<String>,
    path: Option<String>,
}

async fn handle_samba_shares(Form(form): Form<SambaConnectForm>) -> Json<Value> {
    let host = form.host.unwrap_or_else(|| "127.0.0.1".into());
    let port = form.port.unwrap_or(445);
    let username = form.username.unwrap_or_else(|| "guest".into());
    let password = form.password.unwrap_or_default();
    Json(crate::net::samba::list_shares(&host, port, &username, &password).await)
}

async fn handle_samba_ls(Form(form): Form<SambaConnectForm>) -> Json<Value> {
    let host = form.host.unwrap_or_else(|| "127.0.0.1".into());
    let port = form.port.unwrap_or(445);
    let username = form.username.unwrap_or_else(|| "guest".into());
    let password = form.password.unwrap_or_default();
    let share = form.share.unwrap_or_else(|| "IPC$".into());
    let path = form.path.unwrap_or_default();
    bapi_log!(
        "info",
        "samba.ls",
        &format!("host={}:{}, share={}, path={}", host, port, share, path)
    );
    Json(crate::net::samba::list_directory(&host, port, &username, &password, &share, &path).await)
}

async fn handle_samba_download(Form(form): Form<SambaConnectForm>) -> Json<Value> {
    let host = form.host.unwrap_or_else(|| "127.0.0.1".into());
    let port = form.port.unwrap_or(445);
    let username = form.username.unwrap_or_else(|| "guest".into());
    let password = form.password.unwrap_or_default();
    let share = form.share.unwrap_or_else(|| "IPC$".into());
    let path = form.path.unwrap_or_default();
    bapi_log!(
        "info",
        "samba.download",
        &format!("host={}:{}, share={}, path={}", host, port, share, path)
    );
    let result =
        crate::net::samba::download_file(&host, port, &username, &password, &share, &path).await;
    match &result {
        Ok(data) => bapi_log!(
            "info",
            "samba.download",
            &format!("ok, {} bytes", data.len()),
            ""
        ),
        Err(e) => bapi_log!("error", "samba.download", e, ""),
    }
    match result {
        Ok(data) => Json(json!({"code": 0, "data": base64::encode(&data)})),
        Err(e) => Json(json!({"code": 1, "msg": e})),
    }
}

#[derive(Deserialize)]
struct SambaUploadForm {
    host: Option<String>,
    port: Option<u16>,
    username: Option<String>,
    password: Option<String>,
    share: Option<String>,
    path: Option<String>,
    content: Option<String>,
    filename: Option<String>,
}

async fn handle_samba_upload(Form(form): Form<SambaUploadForm>) -> Json<Value> {
    let host = form.host.unwrap_or_else(|| "127.0.0.1".into());
    let port = form.port.unwrap_or(445);
    let username = form.username.unwrap_or_else(|| "guest".into());
    let password = form.password.unwrap_or_default();
    let share = form.share.unwrap_or_else(|| "IPC$".into());
    let filename = form.filename.unwrap_or_else(|| "upload".into());
    let path = format!(
        "{}/{}",
        form.path.unwrap_or_default().trim_end_matches('/'),
        filename
    );
    let content_b64 = form.content.unwrap_or_default();
    let data = match base64::decode(&content_b64) {
        Ok(d) => d,
        Err(e) => return Json(json!({"code": 1, "msg": format!("base64 decode failed: {}", e)})),
    };
    bapi_log!(
        "info",
        "samba.upload",
        &format!(
            "host={}:{}, share={}, path={}, size={}",
            host,
            port,
            share,
            path,
            data.len()
        )
    );
    Json(
        crate::net::samba::upload_file(&host, port, &username, &password, &share, &path, &data)
            .await,
    )
}

async fn handle_samba_mkdir(Form(form): Form<SambaConnectForm>) -> Json<Value> {
    let host = form.host.unwrap_or_else(|| "127.0.0.1".into());
    let port = form.port.unwrap_or(445);
    let username = form.username.unwrap_or_else(|| "guest".into());
    let password = form.password.unwrap_or_default();
    let share = form.share.unwrap_or_else(|| "IPC$".into());
    let path = form.path.unwrap_or_default();
    bapi_log!(
        "info",
        "samba.mkdir",
        &format!("host={}:{}, share={}, path={}", host, port, share, path)
    );
    Json(
        crate::net::samba::create_directory(&host, port, &username, &password, &share, &path).await,
    )
}

async fn handle_samba_rm(Form(form): Form<SambaConnectForm>) -> Json<Value> {
    let host = form.host.unwrap_or_else(|| "127.0.0.1".into());
    let port = form.port.unwrap_or(445);
    let username = form.username.unwrap_or_else(|| "guest".into());
    let password = form.password.unwrap_or_default();
    let share = form.share.unwrap_or_else(|| "IPC$".into());
    let path = form.path.unwrap_or_default();
    bapi_log!(
        "info",
        "samba.rm",
        &format!("host={}:{}, share={}, path={}", host, port, share, path)
    );
    Json(crate::net::samba::remove_file(&host, port, &username, &password, &share, &path).await)
}

#[derive(Deserialize)]
struct SftpForm {
    host: Option<String>,
    port: Option<u16>,
    username: Option<String>,
    password: Option<String>,
    path: Option<String>,
    content: Option<String>,
    filename: Option<String>,
}

async fn handle_sftp_ls(Form(form): Form<SftpForm>) -> Json<Value> {
    let host = form.host.unwrap_or_else(|| "127.0.0.1".into());
    let port = form.port.unwrap_or(22);
    let username = form.username.unwrap_or_else(|| "root".into());
    let password = form.password.unwrap_or_default();
    let path = form.path.unwrap_or_else(|| "/".into());
    bapi_log!(
        "info",
        "sftp.ls",
        &format!("host={}:{}, user={}, path={}", host, port, username, path)
    );
    Json(crate::net::sftp::list_directory(&host, port, &username, &password, &path).await)
}

async fn handle_sftp_download(Form(form): Form<SftpForm>) -> Json<Value> {
    let host = form.host.unwrap_or_else(|| "127.0.0.1".into());
    let port = form.port.unwrap_or(22);
    let username = form.username.unwrap_or_else(|| "root".into());
    let password = form.password.unwrap_or_default();
    let path = form.path.unwrap_or_default();
    bapi_log!(
        "info",
        "sftp.download",
        &format!("host={}:{}, user={}, path={}", host, port, username, path)
    );
    let result = crate::net::sftp::download_file(&host, port, &username, &password, &path).await;
    match result {
        Ok(data) => Json(json!({"code": 0, "data": base64::encode(&data)})),
        Err(e) => Json(json!({"code": 1, "msg": e})),
    }
}

async fn handle_sftp_upload(Form(form): Form<SftpForm>) -> Json<Value> {
    let host = form.host.unwrap_or_else(|| "127.0.0.1".into());
    let port = form.port.unwrap_or(22);
    let username = form.username.unwrap_or_else(|| "root".into());
    let password = form.password.unwrap_or_default();
    let path = format!(
        "{}/{}",
        form.path.unwrap_or_default().trim_end_matches('/'),
        form.filename.unwrap_or_else(|| "upload".into())
    );
    let data = base64::decode(&form.content.unwrap_or_default()).unwrap_or_default();
    bapi_log!(
        "info",
        "sftp.upload",
        &format!(
            "host={}:{}, user={}, path={}, size={}",
            host,
            port,
            username,
            path,
            data.len()
        )
    );
    Json(crate::net::sftp::upload_file(&host, port, &username, &password, &path, &data).await)
}

async fn handle_sftp_mkdir(Form(form): Form<SftpForm>) -> Json<Value> {
    let host = form.host.unwrap_or_else(|| "127.0.0.1".into());
    let port = form.port.unwrap_or(22);
    let username = form.username.unwrap_or_else(|| "root".into());
    let password = form.password.unwrap_or_default();
    let path = form.path.unwrap_or_default();
    bapi_log!(
        "info",
        "sftp.mkdir",
        &format!("host={}:{}, user={}, path={}", host, port, username, path)
    );
    Json(crate::net::sftp::create_directory(&host, port, &username, &password, &path).await)
}

async fn handle_sftp_rm(Form(form): Form<SftpForm>) -> Json<Value> {
    let host = form.host.unwrap_or_else(|| "127.0.0.1".into());
    let port = form.port.unwrap_or(22);
    let username = form.username.unwrap_or_else(|| "root".into());
    let password = form.password.unwrap_or_default();
    let path = form.path.unwrap_or_default();
    bapi_log!(
        "info",
        "sftp.rm",
        &format!("host={}:{}, user={}, path={}", host, port, username, path)
    );
    Json(crate::net::sftp::remove_file(&host, port, &username, &password, &path).await)
}

// ---- Netplan Handlers ----

async fn handle_netplan_interfaces() -> Json<Value> {
    Json(crate::net::netplan::list_interfaces().await)
}

async fn handle_netplan_current(Path(iface): Path<String>) -> Json<Value> {
    Json(crate::net::netplan::get_current_config(&iface).await)
}

async fn handle_netplan_configs(State(state): State<Arc<AppState>>) -> Json<Value> {
    match state.db.list_netplan_configs() {
        Ok(configs) => utils::output(
            None,
            Some(serde_json::to_value(&configs).unwrap_or_default()),
        ),
        Err(e) => utils::output(Some(&e), None),
    }
}

#[derive(Deserialize)]
struct NetplanApplyForm {
    pub interface_name: Option<String>,
    pub dhcp: Option<String>,
    pub ip_address: Option<String>,
    pub netmask_prefix: Option<String>,
    pub gateway: Option<String>,
    pub dns_servers: Option<String>,
    pub config_yaml: Option<String>,
}

async fn handle_netplan_apply(
    State(state): State<Arc<AppState>>,
    Form(form): Form<NetplanApplyForm>,
) -> Json<Value> {
    let iface = form.interface_name.unwrap_or_default();
    if iface.is_empty() {
        return utils::output(Some("interface name is required"), None);
    }

    let input = NetplanConfigInput {
        interface_name: iface.clone(),
        dhcp: parse_form_bool(form.dhcp.as_deref()),
        ip_address: form.ip_address.filter(|v| !v.is_empty()),
        netmask_prefix: form.netmask_prefix.and_then(|v| v.parse::<u8>().ok()),
        gateway: form.gateway.filter(|v| !v.is_empty()),
        dns_servers: form.dns_servers.filter(|v| !v.is_empty()),
    };

    let config_yaml = form
        .config_yaml
        .unwrap_or_else(|| crate::net::netplan::generate_yaml(&input));

    // Save to DB
    let db_config = NetplanConfig {
        id: 0,
        interface_name: iface,
        dhcp: input.dhcp,
        ip_address: input.ip_address.clone(),
        netmask_prefix: input.netmask_prefix,
        gateway: input.gateway.clone(),
        dns_servers: input.dns_servers.clone(),
        config_yaml: Some(config_yaml.clone()),
        created_at: String::new(),
    };

    let saved = match state.db.save_netplan_config(&db_config) {
        Ok(s) => s,
        Err(e) => return utils::output(Some(&e), None),
    };

    // Apply
    match crate::net::netplan::apply_yaml(&config_yaml).await {
        Ok(output) => utils::output(
            None,
            Some(serde_json::json!({
                "output": output,
                "config": config_yaml,
                "saved": saved
            })),
        ),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_netplan_preview(Form(form): Form<NetplanApplyForm>) -> Json<Value> {
    let iface = form.interface_name.unwrap_or_default();
    if iface.is_empty() {
        return utils::output(Some("interface name is required"), None);
    }
    let input = NetplanConfigInput {
        interface_name: iface,
        dhcp: parse_form_bool(form.dhcp.as_deref()),
        ip_address: form.ip_address.filter(|v| !v.is_empty()),
        netmask_prefix: form.netmask_prefix.and_then(|v| v.parse::<u8>().ok()),
        gateway: form.gateway.filter(|v| !v.is_empty()),
        dns_servers: form.dns_servers.filter(|v| !v.is_empty()),
    };
    let yaml = crate::net::netplan::generate_yaml(&input);
    utils::output(None, Some(serde_json::json!({"config": yaml})))
}

async fn handle_netplan_delete_config(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    match state.db.delete_netplan_config(id) {
        Ok(true) => utils::output(None, None),
        Ok(false) => utils::output(Some("netplan config not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

// ---- ApiMan Handlers ----

async fn handle_apiman_workspaces(State(state): State<Arc<AppState>>) -> Json<Value> {
    match state.db.list_apiman_workspaces() {
        Ok(items) => utils::output(None, Some(serde_json::to_value(&items).unwrap_or_default())),
        Err(e) => utils::output(Some(&e), None),
    }
}

#[derive(Deserialize)]
struct ApiManWsForm {
    pub name: Option<String>,
    pub description: Option<String>,
}

async fn handle_apiman_create_workspace(
    State(state): State<Arc<AppState>>,
    Form(form): Form<ApiManWsForm>,
) -> Json<Value> {
    let name = match form.name {
        Some(ref n) if !n.trim().is_empty() => n.trim().to_string(),
        _ => return utils::output(Some("workspace name is required"), None),
    };
    let input = ApiManWorkspaceInput {
        name,
        description: form.description,
    };
    match state.db.save_apiman_workspace(input) {
        Ok(ws) => utils::output(None, Some(serde_json::to_value(&ws).unwrap_or_default())),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_apiman_update_workspace(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Form(form): Form<ApiManWsForm>,
) -> Json<Value> {
    let name = match form.name {
        Some(ref n) if !n.trim().is_empty() => n.trim().to_string(),
        _ => return utils::output(Some("workspace name is required"), None),
    };
    let input = ApiManWorkspaceInput {
        name,
        description: form.description,
    };
    match state.db.update_apiman_workspace(id, input) {
        Ok(Some(ws)) => utils::output(None, Some(serde_json::to_value(&ws).unwrap_or_default())),
        Ok(None) => utils::output(Some("workspace not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_apiman_delete_workspace(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    match state.db.delete_apiman_workspace(id) {
        Ok(true) => utils::output(None, None),
        Ok(false) => utils::output(Some("workspace not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

// Tree nodes
async fn handle_apiman_nodes(
    State(state): State<Arc<AppState>>,
    Path(ws_id): Path<i64>,
) -> Json<Value> {
    let nodes = match state.db.list_apiman_nodes(ws_id) {
        Ok(n) => n,
        Err(e) => return utils::output(Some(&e), None),
    };
    let requests = match state.db.list_apiman_requests(ws_id) {
        Ok(r) => r,
        Err(e) => return utils::output(Some(&e), None),
    };
    let tree = crate::apps::apiman::build_tree(&nodes, &requests, None);
    utils::output(None, Some(serde_json::to_value(&tree).unwrap_or_default()))
}

#[derive(Deserialize)]
struct ApiManNodeForm {
    pub workspace_id: Option<i64>,
    pub parent_id: Option<i64>,
    pub name: Option<String>,
    pub node_type: Option<String>,
    pub sort_order: Option<i64>,
}

async fn handle_apiman_create_node(
    State(state): State<Arc<AppState>>,
    Form(form): Form<ApiManNodeForm>,
) -> Json<Value> {
    let ws_id = match form.workspace_id {
        Some(id) => id,
        None => return utils::output(Some("workspace_id is required"), None),
    };
    let name = match form.name {
        Some(ref n) if !n.trim().is_empty() => n.trim().to_string(),
        _ => return utils::output(Some("node name is required"), None),
    };
    let node_type = form.node_type.unwrap_or_else(|| "request".to_string());
    let input = ApiManNodeInput {
        workspace_id: ws_id,
        parent_id: form.parent_id,
        name,
        node_type,
        sort_order: form.sort_order,
    };
    match state.db.save_apiman_node(input) {
        Ok(node) => utils::output(None, Some(serde_json::to_value(&node).unwrap_or_default())),
        Err(e) => utils::output(Some(&e), None),
    }
}

#[derive(Deserialize)]
struct ApiManNodeUpdateForm {
    pub name: Option<String>,
    pub parent_id: Option<i64>,
    pub sort_order: Option<i64>,
}

async fn handle_apiman_update_node(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Form(form): Form<ApiManNodeUpdateForm>,
) -> Json<Value> {
    let name = form.name.unwrap_or_default();
    match state
        .db
        .update_apiman_node(id, &name, form.parent_id, form.sort_order)
    {
        Ok(Some(node)) => {
            utils::output(None, Some(serde_json::to_value(&node).unwrap_or_default()))
        }
        Ok(None) => utils::output(Some("node not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_apiman_copy_node(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    match state.db.copy_apiman_node(id, None) {
        Ok(Some(node)) => {
            // Refresh tree
            let ws_id = node.workspace_id;
            let nodes = state.db.list_apiman_nodes(ws_id).unwrap_or_default();
            let requests = state.db.list_apiman_requests(ws_id).unwrap_or_default();
            let tree = crate::apps::apiman::build_tree(&nodes, &requests, None);
            utils::output(None, Some(json!({"node": node, "tree": tree})))
        }
        Ok(None) => utils::output(Some("node not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_apiman_delete_node(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    match state.db.delete_apiman_node(id) {
        Ok(true) => utils::output(None, None),
        Ok(false) => utils::output(Some("node not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

#[derive(Deserialize)]
struct ApiManMoveForm {
    pub parent_id: Option<i64>,
    pub sort_order: Option<i64>,
}

async fn handle_apiman_move_node(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Form(form): Form<ApiManMoveForm>,
) -> Json<Value> {
    match state
        .db
        .move_apiman_node(id, form.parent_id, form.sort_order.unwrap_or(0))
    {
        Ok(true) => utils::output(None, None),
        Ok(false) => utils::output(Some("node not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

// Request editing & sending
async fn handle_apiman_get_request(
    State(state): State<Arc<AppState>>,
    Path(node_id): Path<i64>,
) -> Json<Value> {
    match state.db.get_apiman_request(node_id) {
        Ok(Some(req)) => utils::output(None, Some(serde_json::to_value(&req).unwrap_or_default())),
        Ok(None) => utils::output(Some("request not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

#[derive(Deserialize)]
struct ApiManRequestForm {
    pub method: Option<String>,
    pub url: Option<String>,
    pub headers: Option<String>,
    pub query_params: Option<String>,
    pub body_type: Option<String>,
    pub body_content: Option<String>,
    pub auth_config: Option<String>,
}

async fn handle_apiman_save_request(
    State(state): State<Arc<AppState>>,
    Path(node_id): Path<i64>,
    Form(form): Form<ApiManRequestForm>,
) -> Json<Value> {
    let input = ApiManRequestInput {
        method: form.method,
        url: form.url,
        headers: form.headers,
        query_params: form.query_params,
        body_type: form.body_type,
        body_content: form.body_content,
        auth_config: form.auth_config,
    };
    match state.db.update_apiman_request(node_id, input) {
        Ok(Some(req)) => utils::output(None, Some(serde_json::to_value(&req).unwrap_or_default())),
        Ok(None) => utils::output(Some("request not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_apiman_response_history(
    State(state): State<Arc<AppState>>,
    Path(node_id): Path<i64>,
) -> Json<Value> {
    match state.db.list_apiman_response_history(node_id) {
        Ok(items) => utils::output(None, Some(serde_json::to_value(&items).unwrap_or_default())),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_apiman_send_request(
    State(state): State<Arc<AppState>>,
    Path(node_id): Path<i64>,
) -> Json<Value> {
    let req = match state.db.get_apiman_request(node_id) {
        Ok(Some(r)) => r,
        Ok(None) => return utils::output(Some("request not found"), None),
        Err(e) => return utils::output(Some(&e), None),
    };

    // Load variables and substitute
    let node = state.db.get_apiman_node(node_id).ok().flatten();
    let variables = node
        .as_ref()
        .map(|n| {
            state
                .db
                .list_apiman_variables(n.workspace_id)
                .unwrap_or_default()
        })
        .unwrap_or_default();

    let url = crate::apps::apiman::substitute_variables(&req.url, &variables);
    if url.is_empty() {
        return utils::output(Some("URL is empty"), None);
    }

    // Apply auth config to headers
    let auth_headers: Vec<(String, String)> = req
        .auth_config
        .as_deref()
        .and_then(|c| {
            let v: serde_json::Value = serde_json::from_str(c).ok()?;
            let auth_type = v.get("type")?.as_str()?;
            match auth_type {
                "basic" => {
                    let user = v.get("username")?.as_str()?;
                    let pass = v.get("password").and_then(|p| p.as_str()).unwrap_or("");
                    let credentials = format!("{}:{}", user, pass);
                    use base64::Engine;
                    let encoded = base64::engine::general_purpose::STANDARD.encode(credentials);
                    Some(vec![(
                        "Authorization".to_string(),
                        format!("Basic {}", encoded),
                    )])
                }
                "bearer" => {
                    let token = v.get("token")?.as_str()?;
                    Some(vec![(
                        "Authorization".to_string(),
                        format!("Bearer {}", token),
                    )])
                }
                "apikey" => {
                    let key_name = v.get("key_name")?.as_str()?;
                    let key_value = v.get("key_value")?.as_str()?;
                    let key_in = v.get("key_in").and_then(|k| k.as_str()).unwrap_or("header");
                    if key_in == "query" {
                        // Append to URL
                        let separator = if url.contains('?') { "&" } else { "?" };
                        let _new_url = format!("{}{}{}={}", url, separator, key_name, key_value);
                        // Can't modify url here due to borrowing. Will handle query params differently.
                        Some(vec![(key_name.to_string(), key_value.to_string())])
                    } else {
                        Some(vec![(key_name.to_string(), key_value.to_string())])
                    }
                }
                _ => None,
            }
        })
        .unwrap_or_default();

    // Build curl command from request data
    let mut curl_args = vec!["-s", "-S", "-m", "30", "-i"];
    match req.method.as_str() {
        "POST" => {
            curl_args.push("-X");
            curl_args.push("POST");
        }
        "PUT" => {
            curl_args.push("-X");
            curl_args.push("PUT");
        }
        "DELETE" => {
            curl_args.push("-X");
            curl_args.push("DELETE");
        }
        "PATCH" => {
            curl_args.push("-X");
            curl_args.push("PATCH");
        }
        _ => {} // GET
    }

    // Headers (auth headers first, then request headers)
    let mut header_strs: Vec<String> = Vec::new();
    for (k, v) in &auth_headers {
        header_strs.push(format!("{}: {}", k, v));
    }
    if let Some(ref h) = req.headers {
        if let Ok(arr) = serde_json::from_str::<Vec<Value>>(h) {
            for item in &arr {
                if let (Some(key), Some(val)) = (
                    item.get("key")
                        .and_then(|v| v.as_str())
                        .filter(|k| !k.is_empty()),
                    item.get("value").and_then(|v| v.as_str()),
                ) {
                    let enabled = item
                        .get("enabled")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(true);
                    if enabled {
                        let substituted_val =
                            crate::apps::apiman::substitute_variables(val, &variables);
                        header_strs.push(format!("{}: {}", key, substituted_val));
                    }
                }
            }
        }
    }
    for h in &header_strs {
        curl_args.push("-H");
        curl_args.push(h);
    }

    // Body
    let body_str: String;
    if req.body_type != "none" {
        if let Some(ref body) = req.body_content {
            if !body.is_empty() {
                body_str = crate::apps::apiman::substitute_variables(body, &variables);
                curl_args.push("-d");
                curl_args.push(&body_str);
            }
        }
    }

    curl_args.push(&url);

    let output = tokio::process::Command::new("curl")
        .args(&curl_args)
        .output()
        .await;

    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout).to_string();
            let stderr = String::from_utf8_lossy(&out.stderr).to_string();
            let combined = if stdout.is_empty() { stderr } else { stdout };

            // Parse status code from curl -i output
            let status_code = combined
                .lines()
                .next()
                .and_then(|l| l.split_whitespace().nth(1))
                .and_then(|s| s.parse::<i64>().ok())
                .unwrap_or(0);

            // Split headers and body
            let parts: Vec<&str> = combined.splitn(2, "\r\n\r\n").collect();
            let response_headers = parts.first().map(|s| s.to_string());
            let response_body = parts.get(1).map(|s| s.to_string());

            let elapsed_ms = std::time::Instant::now().elapsed().as_millis() as i64;
            let _ = state.db.save_apiman_response(
                node_id,
                status_code,
                response_headers.clone(),
                response_body.clone(),
                elapsed_ms,
            );

            utils::output(
                None,
                Some(json!({
                    "status": status_code,
                    "headers": response_headers,
                    "body": response_body,
                })),
            )
        }
        Err(e) => utils::output(Some(&format!("curl failed: {e}")), None),
    }
}

// ---- DbMan Handlers ----

async fn handle_dbman_connections(State(state): State<Arc<AppState>>) -> Json<Value> {
    match state.db.list_dbman_connections() {
        Ok(items) => utils::output(None, Some(serde_json::to_value(&items).unwrap_or_default())),
        Err(e) => utils::output(Some(&e), None),
    }
}

#[derive(Deserialize)]
struct DbConnForm {
    pub name: Option<String>,
    pub db_type: Option<String>,
    pub file_path: Option<String>,
    pub host: Option<String>,
    pub port: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub database_name: Option<String>,
    pub trust_server_cert: Option<String>,
}

async fn handle_dbman_save_connection(
    State(state): State<Arc<AppState>>,
    Form(form): Form<DbConnForm>,
) -> Json<Value> {
    let name = match form.name {
        Some(ref n) if !n.trim().is_empty() => n.trim().to_string(),
        _ => return utils::output(Some("name is required"), None),
    };
    let db_type = form.db_type.unwrap_or_else(|| "sqlite".to_string());
    let input = DbConnectionInput {
        name,
        db_type,
        file_path: form.file_path,
        host: form.host,
        port: form.port.and_then(|p| p.parse::<u16>().ok()),
        username: form.username,
        password: form.password,
        database_name: form.database_name,
        trust_server_cert: Some(parse_form_bool(form.trust_server_cert.as_deref())),
    };
    match state.db.save_dbman_connection(input) {
        Ok(conn) => utils::output(None, Some(serde_json::to_value(&conn).unwrap_or_default())),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_dbman_update_connection(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Form(form): Form<DbConnForm>,
) -> Json<Value> {
    let name = match form.name {
        Some(ref n) if !n.trim().is_empty() => n.trim().to_string(),
        _ => return utils::output(Some("name is required"), None),
    };
    let db_type = form.db_type.unwrap_or_else(|| "sqlite".to_string());
    let input = DbConnectionInput {
        name,
        db_type,
        file_path: form.file_path,
        host: form.host,
        port: form.port.and_then(|p| p.parse::<u16>().ok()),
        username: form.username,
        password: form.password,
        database_name: form.database_name,
        trust_server_cert: Some(parse_form_bool(form.trust_server_cert.as_deref())),
    };
    match state.db.update_dbman_connection(id, input) {
        Ok(Some(conn)) => {
            utils::output(None, Some(serde_json::to_value(&conn).unwrap_or_default()))
        }
        Ok(None) => utils::output(Some("connection not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

// ---- DbMan Saved Queries ----

async fn handle_dbman_saved_queries(State(state): State<Arc<AppState>>) -> Json<Value> {
    match state.db.list_dbman_saved_queries() {
        Ok(items) => utils::output(None, Some(serde_json::to_value(&items).unwrap_or_default())),
        Err(e) => utils::output(Some(&e), None),
    }
}

#[derive(Deserialize)]
struct DbManSavedQueryForm {
    pub name: Option<String>,
    pub sql_text: Option<String>,
    pub db_type: Option<String>,
}

async fn handle_dbman_save_query(
    State(state): State<Arc<AppState>>,
    Form(form): Form<DbManSavedQueryForm>,
) -> Json<Value> {
    let name = match form.name {
        Some(ref n) if !n.trim().is_empty() => n.trim().to_string(),
        _ => return utils::output(Some("name is required"), None),
    };
    let sql = form.sql_text.unwrap_or_default();
    let db_type = form.db_type.unwrap_or_else(|| "sqlite".to_string());
    match state.db.save_dbman_saved_query(&name, &sql, &db_type) {
        Ok(q) => utils::output(None, Some(serde_json::to_value(&q).unwrap_or_default())),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_dbman_delete_saved_query(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    match state.db.delete_dbman_saved_query(id) {
        Ok(true) => utils::output(None, None),
        Ok(false) => utils::output(Some("not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_dbman_delete_connection(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    match state.db.delete_dbman_connection(id) {
        Ok(true) => utils::output(None, None),
        Ok(false) => utils::output(Some("connection not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

#[derive(Deserialize)]
struct DbConnTestForm {
    pub conn_id: Option<i64>,
    pub db_type: Option<String>,
    pub file_path: Option<String>,
    pub host: Option<String>,
    pub port: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub database_name: Option<String>,
    pub trust_server_cert: Option<String>,
}

async fn handle_dbman_test_connection(Form(form): Form<DbConnTestForm>) -> Json<Value> {
    let db_type = form.db_type.as_deref().unwrap_or("sqlite");
    match db_type {
        "sqlite" => {
            let path = form.file_path.as_deref().unwrap_or("");
            if path.is_empty() {
                return utils::output(Some("file path is required for SQLite"), None);
            }
            match crate::apps::dbman::test_sqlite(path).await {
                Ok(v) => utils::output(None, Some(json!({"version": v}))),
                Err(e) => utils::output(Some(&e), None),
            }
        }
        "mysql" => {
            let host = form.host.as_deref().unwrap_or("127.0.0.1");
            let port = form
                .port
                .as_deref()
                .and_then(|p| p.parse::<u16>().ok())
                .unwrap_or(3306);
            let user = form.username.as_deref().unwrap_or("root");
            let pass = form.password.as_deref().unwrap_or("");
            let db = form.database_name.as_deref().unwrap_or("mysql");
            match crate::apps::dbman::test_mysql(host, port, user, pass, db).await {
                Ok(v) => utils::output(None, Some(json!({"version": v}))),
                Err(e) => utils::output(Some(&e), None),
            }
        }
        "sqlserver" => {
            let host = form.host.as_deref().unwrap_or("127.0.0.1");
            let port = form
                .port
                .as_deref()
                .and_then(|p| p.parse::<u16>().ok())
                .unwrap_or(1433);
            let user = form.username.as_deref().unwrap_or("sa");
            let pass = form.password.as_deref().unwrap_or("");
            let db = form.database_name.as_deref().unwrap_or("master");
            let trust = parse_form_bool(form.trust_server_cert.as_deref());
            match crate::apps::dbman::test_sqlserver(host, port, user, pass, db, trust).await {
                Ok(v) => utils::output(None, Some(json!({"version": v}))),
                Err(e) => utils::output(Some(&e), None),
            }
        }
        _ => utils::output(Some("unsupported db type"), None),
    }
}

async fn handle_dbman_tables(Form(form): Form<DbConnTestForm>) -> Json<Value> {
    let db_type = form.db_type.as_deref().unwrap_or("sqlite");
    match db_type {
        "sqlite" => {
            let path = form.file_path.as_deref().unwrap_or("");
            match crate::apps::dbman::list_sqlite_tables(path).await {
                Ok(tables) => utils::output(
                    None,
                    Some(serde_json::to_value(&tables).unwrap_or_default()),
                ),
                Err(e) => utils::output(Some(&e), None),
            }
        }
        _ => {
            let host = form.host.as_deref().unwrap_or("127.0.0.1");
            let port = form
                .port
                .as_deref()
                .and_then(|p| p.parse::<u16>().ok())
                .unwrap_or(if db_type == "mysql" { 3306 } else { 1433 });
            let user = form.username.as_deref().unwrap_or("");
            let pass = form.password.as_deref().unwrap_or("");
            let db = form.database_name.as_deref().unwrap_or("");
            let trust = parse_form_bool(form.trust_server_cert.as_deref());
            match crate::apps::dbman::list_cli_tables(db_type, host, port, user, pass, db, trust)
                .await
            {
                Ok(tables) => utils::output(
                    None,
                    Some(serde_json::to_value(&tables).unwrap_or_default()),
                ),
                Err(e) => utils::output(Some(&e), None),
            }
        }
    }
}

#[derive(Deserialize)]
struct DbQueryForm {
    pub db_type: Option<String>,
    pub file_path: Option<String>,
    pub host: Option<String>,
    pub port: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub database_name: Option<String>,
    pub trust_server_cert: Option<String>,
    pub sql: Option<String>,
}

async fn handle_dbman_query(Form(form): Form<DbQueryForm>) -> Json<Value> {
    let db_type = form.db_type.as_deref().unwrap_or("sqlite");
    let sql = form.sql.as_deref().unwrap_or("").trim().to_string();
    if sql.is_empty() {
        return utils::output(Some("SQL is required"), None);
    }
    match db_type {
        "sqlite" => {
            let path = form.file_path.as_deref().unwrap_or("");
            match crate::apps::dbman::query_sqlite(path, &sql).await {
                Ok(result) => utils::output(
                    None,
                    Some(serde_json::to_value(&result).unwrap_or_default()),
                ),
                Err(e) => utils::output(Some(&e), None),
            }
        }
        _ => {
            let host = form.host.as_deref().unwrap_or("127.0.0.1");
            let port = form
                .port
                .as_deref()
                .and_then(|p| p.parse::<u16>().ok())
                .unwrap_or(if db_type == "mysql" { 3306 } else { 1433 });
            let user = form.username.as_deref().unwrap_or("");
            let pass = form.password.as_deref().unwrap_or("");
            let db = form.database_name.as_deref().unwrap_or("");
            let trust = parse_form_bool(form.trust_server_cert.as_deref());
            match crate::apps::dbman::exec_cli_sql(db_type, host, port, user, pass, db, &sql, trust)
                .await
            {
                Ok(result) => utils::output(
                    None,
                    Some(serde_json::to_value(&result).unwrap_or_default()),
                ),
                Err(e) => utils::output(Some(&e), None),
            }
        }
    }
}

#[derive(Deserialize)]
struct DbColumnsForm {
    pub db_type: Option<String>,
    pub file_path: Option<String>,
    pub host: Option<String>,
    pub port: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub database_name: Option<String>,
    pub trust_server_cert: Option<String>,
    pub table: Option<String>,
}

async fn handle_dbman_table_columns(Form(form): Form<DbColumnsForm>) -> Json<Value> {
    let db_type = form.db_type.as_deref().unwrap_or("sqlite");
    let table = form.table.as_deref().unwrap_or("");
    if table.is_empty() {
        return utils::output(Some("table name is required"), None);
    }
    match db_type {
        "sqlite" => {
            let path = form.file_path.as_deref().unwrap_or("");
            match crate::apps::dbman::get_sqlite_columns(path, table).await {
                Ok(cols) => {
                    utils::output(None, Some(serde_json::to_value(&cols).unwrap_or_default()))
                }
                Err(e) => utils::output(Some(&e), None),
            }
        }
        _ => {
            let host = form.host.as_deref().unwrap_or("127.0.0.1");
            let port = form
                .port
                .as_deref()
                .and_then(|p| p.parse::<u16>().ok())
                .unwrap_or(if db_type == "mysql" { 3306 } else { 1433 });
            let user = form.username.as_deref().unwrap_or("");
            let pass = form.password.as_deref().unwrap_or("");
            let db = form.database_name.as_deref().unwrap_or("");
            let trust = parse_form_bool(form.trust_server_cert.as_deref());
            match crate::apps::dbman::list_cli_columns(
                db_type, host, port, user, pass, db, table, trust,
            )
            .await
            {
                Ok(cols) => {
                    utils::output(None, Some(serde_json::to_value(&cols).unwrap_or_default()))
                }
                Err(e) => utils::output(Some(&e), None),
            }
        }
    }
}

// ---- ERD Handlers ----

async fn handle_erd_list(State(state): State<Arc<AppState>>) -> Json<Value> {
    match state.db.list_erd_diagrams() {
        Ok(items) => utils::output(None, Some(json!({ "diagrams": items }))),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_erd_get(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    match state.db.erd_diagram(id) {
        Ok(Some(item)) => utils::output(None, Some(json!({ "diagram": item }))),
        Ok(None) => utils::output(Some("erd diagram not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_erd_create(
    State(state): State<Arc<AppState>>,
    Json(input): Json<ErdDiagramInput>,
) -> Json<Value> {
    match state.db.create_erd_diagram(input) {
        Ok(item) => utils::output(None, Some(json!({ "diagram": item }))),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_erd_update(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(input): Json<ErdDiagramInput>,
) -> Json<Value> {
    match state.db.update_erd_diagram(id, input) {
        Ok(Some(item)) => utils::output(None, Some(json!({ "diagram": item }))),
        Ok(None) => utils::output(Some("erd diagram not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_erd_delete(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    match state.db.delete_erd_diagram(id) {
        Ok(true) => utils::output(None, Some(json!({ "deleted": true }))),
        Ok(false) => utils::output(Some("erd diagram not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

#[derive(Deserialize)]
struct ErdSchemaForm {
    pub connection_id: Option<i64>,
}

async fn handle_erd_schema(
    State(state): State<Arc<AppState>>,
    Form(form): Form<ErdSchemaForm>,
) -> Json<Value> {
    let conn_id = match form.connection_id {
        Some(v) if v > 0 => v,
        _ => return utils::output(Some("connection_id is required"), None),
    };
    let conn = match state.db.get_dbman_connection(conn_id) {
        Ok(Some(c)) => c,
        Ok(None) => return utils::output(Some("connection not found"), None),
        Err(e) => return utils::output(Some(&e), None),
    };
    let db_type = conn.db_type.clone();
    let password = conn.password.clone();
    let host_opt = conn.host.clone();
    let port_opt = conn.port;
    let database_opt = conn.database_name.clone();
    let username_opt = conn.username.clone();
    let file_path_opt = conn.file_path.clone();
    let trust_cert = conn.trust_server_cert;

    let host = host_opt.as_deref().unwrap_or("127.0.0.1");
    let port = port_opt.unwrap_or(match db_type.as_str() {
        "mysql" => 3306,
        "sqlserver" => 1433,
        _ => 0,
    });
    let database = database_opt.as_deref().unwrap_or("");
    let username = username_opt.as_deref().unwrap_or("");
    let pass = password.as_deref().unwrap_or("");

    let tables_result: Result<Vec<crate::apps::dbman::TableInfo>, String> = match db_type.as_str() {
        "sqlite" => {
            let path = file_path_opt.as_deref().unwrap_or("");
            crate::apps::dbman::list_sqlite_tables(path).await
        }
        _ => {
            crate::apps::dbman::list_cli_tables(
                &db_type, host, port, username, pass, database, trust_cert,
            )
            .await
        }
    };
    let tables = match tables_result {
        Ok(t) => t,
        Err(e) => return utils::output(Some(&e), None),
    };

    let mut columns_map: serde_json::Map<String, serde_json::Value> = serde_json::Map::new();
    for t in &tables {
        let cols_result: Result<Vec<crate::apps::dbman::ColumnInfo>, String> = match db_type.as_str() {
            "sqlite" => {
                let path = file_path_opt.as_deref().unwrap_or("");
                crate::apps::dbman::get_sqlite_columns(path, &t.name).await
            }
            _ => {
                crate::apps::dbman::list_cli_columns(
                    &db_type, host, port, username, pass, database, &t.name, trust_cert,
                )
                .await
            }
        };
        match cols_result {
            Ok(cols) => {
                columns_map.insert(t.name.clone(), serde_json::to_value(&cols).unwrap_or_default());
            }
            Err(e) => {
                columns_map.insert(t.name.clone(), json!({ "error": e }));
            }
        }
    }

    utils::output(
        None,
        Some(json!({
            "connection": {
                "id": conn.id,
                "name": conn.name,
                "db_type": db_type,
            },
            "tables": tables,
            "columns": columns_map,
        })),
    )
}

// ---- Settings: Roles ----

async fn handle_role_list(State(state): State<Arc<AppState>>) -> Json<Value> {
    match state.db.list_roles() {
        Ok(items) => utils::output(None, Some(json!({ "roles": items }))),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_role_get(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    match state.db.role(id) {
        Ok(Some(r)) => utils::output(None, Some(json!({ "role": r }))),
        Ok(None) => utils::output(Some("role not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_role_create(
    State(state): State<Arc<AppState>>,
    Json(input): Json<RoleInput>,
) -> Json<Value> {
    match state.db.create_role(input) {
        Ok(r) => utils::output(None, Some(json!({ "role": r }))),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_role_update(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(input): Json<RoleInput>,
) -> Json<Value> {
    match state.db.update_role(id, input) {
        Ok(Some(r)) => utils::output(None, Some(json!({ "role": r }))),
        Ok(None) => utils::output(Some("role not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_role_delete(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    match state.db.delete_role(id) {
        Ok(true) => utils::output(None, Some(json!({ "deleted": true }))),
        Ok(false) => utils::output(Some("role not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

// ---- Settings: Units ----

async fn handle_unit_list(State(state): State<Arc<AppState>>) -> Json<Value> {
    match state.db.list_units() {
        Ok(items) => utils::output(None, Some(json!({ "units": items }))),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_unit_get(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    match state.db.unit(id) {
        Ok(Some(u)) => utils::output(None, Some(json!({ "unit": u }))),
        Ok(None) => utils::output(Some("unit not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_unit_create(
    State(state): State<Arc<AppState>>,
    Json(input): Json<UnitInput>,
) -> Json<Value> {
    match state.db.create_unit(input) {
        Ok(u) => utils::output(None, Some(json!({ "unit": u }))),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_unit_update(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(input): Json<UnitInput>,
) -> Json<Value> {
    match state.db.update_unit(id, input) {
        Ok(Some(u)) => utils::output(None, Some(json!({ "unit": u }))),
        Ok(None) => utils::output(Some("unit not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_unit_delete(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    match state.db.delete_unit(id) {
        Ok(true) => utils::output(None, Some(json!({ "deleted": true }))),
        Ok(false) => utils::output(Some("unit not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

// ---- Settings: Users ----

async fn handle_user_list(State(state): State<Arc<AppState>>) -> Json<Value> {
    match state.db.list_users() {
        Ok(items) => utils::output(None, Some(json!({ "users": items }))),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_user_get(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    match state.db.user(id) {
        Ok(Some(u)) => utils::output(None, Some(json!({ "user": u }))),
        Ok(None) => utils::output(Some("user not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_user_create(
    State(state): State<Arc<AppState>>,
    Json(input): Json<UserInput>,
) -> Json<Value> {
    match state.db.create_user(input) {
        Ok(u) => utils::output(None, Some(json!({ "user": u }))),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_user_update(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(input): Json<UserInput>,
) -> Json<Value> {
    match state.db.update_user(id, input) {
        Ok(Some(u)) => utils::output(None, Some(json!({ "user": u }))),
        Ok(None) => utils::output(Some("user not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_user_reset_password(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(input): Json<UserPasswordInput>,
) -> Json<Value> {
    match state.db.reset_user_password(id, &input.password) {
        Ok(true) => utils::output(None, Some(json!({ "reset": true }))),
        Ok(false) => utils::output(Some("user not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_user_delete(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    match state.db.delete_user(id) {
        Ok(true) => utils::output(None, Some(json!({ "deleted": true }))),
        Ok(false) => utils::output(Some("user not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

// ---- Settings: Dictionary ----

async fn handle_dictionary_list(State(state): State<Arc<AppState>>) -> Json<Value> {
    match state.db.list_dictionary() {
        Ok(items) => utils::output(None, Some(json!({ "entries": items }))),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_dictionary_get(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    match state.db.dictionary_entry(id) {
        Ok(Some(item)) => utils::output(None, Some(json!({ "entry": item }))),
        Ok(None) => utils::output(Some("dictionary entry not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_dictionary_create(
    State(state): State<Arc<AppState>>,
    Json(input): Json<DictionaryInput>,
) -> Json<Value> {
    match state.db.create_dictionary(input) {
        Ok(item) => utils::output(None, Some(json!({ "entry": item }))),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_dictionary_update(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(input): Json<DictionaryInput>,
) -> Json<Value> {
    match state.db.update_dictionary(id, input) {
        Ok(Some(item)) => utils::output(None, Some(json!({ "entry": item }))),
        Ok(None) => utils::output(Some("dictionary entry not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_dictionary_delete(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    match state.db.delete_dictionary(id) {
        Ok(true) => utils::output(None, Some(json!({ "deleted": true }))),
        Ok(false) => utils::output(Some("dictionary entry not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

// ---- Settings: System Settings ----

async fn handle_setting_list(State(state): State<Arc<AppState>>) -> Json<Value> {
    match state.db.list_settings() {
        Ok(items) => {
            let public: Vec<_> = items
                .into_iter()
                .map(|s| {
                    let value = if s.is_secret {
                        crate::apps::settings::mask_secret(&s.value)
                    } else {
                        s.value
                    };
                    json!({
                        "id": s.id,
                        "key": s.key,
                        "value": value,
                        "category": s.category,
                        "data_type": s.data_type,
                        "description": s.description,
                        "is_secret": s.is_secret,
                        "created_at": s.created_at,
                        "updated_at": s.updated_at,
                    })
                })
                .collect();
            utils::output(None, Some(json!({ "settings": public })))
        }
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_setting_get(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    match state.db.system_setting(id) {
        Ok(Some(s)) => {
            let value = if s.is_secret {
                crate::apps::settings::mask_secret(&s.value)
            } else {
                s.value
            };
            utils::output(
                None,
                Some(json!({
                    "setting": {
                        "id": s.id,
                        "key": s.key,
                        "value": value,
                        "category": s.category,
                        "data_type": s.data_type,
                        "description": s.description,
                        "is_secret": s.is_secret,
                        "created_at": s.created_at,
                        "updated_at": s.updated_at,
                    }
                })),
            )
        }
        Ok(None) => utils::output(Some("setting not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_setting_create(
    State(state): State<Arc<AppState>>,
    Json(input): Json<SystemSettingInput>,
) -> Json<Value> {
    match state.db.create_setting(input) {
        Ok(s) => utils::output(None, Some(json!({ "setting": s }))),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_setting_update(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(input): Json<SystemSettingInput>,
) -> Json<Value> {
    match state.db.update_setting(id, input) {
        Ok(Some(s)) => utils::output(None, Some(json!({ "setting": s }))),
        Ok(None) => utils::output(Some("setting not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_setting_delete(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    match state.db.delete_setting(id) {
        Ok(true) => utils::output(None, Some(json!({ "deleted": true }))),
        Ok(false) => utils::output(Some("setting not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

// ---- Security Handlers ----

async fn handle_security_cvs_sources(State(state): State<Arc<AppState>>) -> Json<Value> {
    match state.db.list_security_cvs_sources() {
        Ok(items) => utils::output(None, Some(serde_json::to_value(&items).unwrap_or_default())),
        Err(e) => utils::output(Some(&e), None),
    }
}

#[derive(Deserialize)]
struct CvsSourceForm {
    pub name: Option<String>,
    pub url: Option<String>,
    pub table_name: Option<String>,
    pub delimiter: Option<String>,
    pub has_header: Option<String>,
    pub auto_import: Option<String>,
}

async fn handle_security_save_cvs_source(
    State(state): State<Arc<AppState>>,
    Form(form): Form<CvsSourceForm>,
) -> Json<Value> {
    let name = match form.name {
        Some(ref n) if !n.trim().is_empty() => n.trim().to_string(),
        _ => return utils::output(Some("name is required"), None),
    };
    let url = match form.url {
        Some(ref u) if !u.trim().is_empty() => u.trim().to_string(),
        _ => return utils::output(Some("url is required"), None),
    };
    let input = CvsSourceInput {
        name,
        url,
        table_name: form.table_name.unwrap_or_else(|| "cvs_import".to_string()),
        delimiter: form.delimiter,
        has_header: Some(parse_form_bool(form.has_header.as_deref())),
        auto_import: Some(parse_form_bool(form.auto_import.as_deref())),
    };
    match state.db.save_security_cvs_source(input) {
        Ok(s) => utils::output(None, Some(serde_json::to_value(&s).unwrap_or_default())),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_security_delete_cvs_source(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    match state.db.delete_security_cvs_source(id) {
        Ok(true) => utils::output(None, None),
        Ok(false) => utils::output(Some("not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

#[derive(Deserialize)]
struct CvsImportForm {
    pub url: Option<String>,
    pub table_name: Option<String>,
    pub delimiter: Option<String>,
    pub has_header: Option<String>,
}

async fn handle_security_import_csv(Form(form): Form<CvsImportForm>) -> Json<Value> {
    let url = match form.url {
        Some(ref u) if !u.trim().is_empty() => u.trim().to_string(),
        _ => return utils::output(Some("url is required"), None),
    };
    let _table = form.table_name.unwrap_or_else(|| "cvs_import".to_string());
    let delimiter = form.delimiter.unwrap_or_else(|| ",".to_string());
    let has_header = parse_form_bool(form.has_header.as_deref());
    let _ = _table;
    match crate::security::download_and_parse_csv(&url, &delimiter, has_header).await {
        Ok(parsed) => utils::output(
            None,
            Some(serde_json::to_value(&parsed).unwrap_or_default()),
        ),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_security_save_csv(
    _state: State<Arc<AppState>>,
    Form(form): Form<CvsImportForm>,
) -> Json<Value> {
    let _ = _state;
    let url = match form.url {
        Some(ref u) if !u.trim().is_empty() => u.trim().to_string(),
        _ => return utils::output(Some("url is required"), None),
    };
    let table_name = form.table_name.unwrap_or_else(|| "cvs_import".to_string());
    let delimiter = form.delimiter.unwrap_or_else(|| ",".to_string());
    let has_header = parse_form_bool(form.has_header.as_deref());

    let parsed = match crate::security::download_and_parse_csv(&url, &delimiter, has_header).await {
        Ok(p) => p,
        Err(e) => return utils::output(Some(&e), None),
    };
    let db_path = "kyklos.sqlite3";
    match crate::security::save_csv_to_db(db_path, &table_name, &parsed.columns, &parsed.rows).await
    {
        Ok(count) => utils::output(
            None,
            Some(
                json!({"imported": count, "table": table_name, "columns": parsed.columns, "preview": parsed.preview}),
            ),
        ),
        Err(e) => utils::output(Some(&e), None),
    }
}

// Scan tasks
async fn handle_security_scan_tasks(State(state): State<Arc<AppState>>) -> Json<Value> {
    match state.db.list_security_scan_tasks() {
        Ok(items) => utils::output(None, Some(serde_json::to_value(&items).unwrap_or_default())),
        Err(e) => utils::output(Some(&e), None),
    }
}

#[derive(Deserialize)]
struct ScanTaskForm {
    pub name: Option<String>,
    pub target: Option<String>,
    pub ports: Option<String>,
    pub scan_type: Option<String>,
}

async fn handle_security_create_scan_task(
    State(state): State<Arc<AppState>>,
    Form(form): Form<ScanTaskForm>,
) -> Json<Value> {
    let name = match form.name {
        Some(ref n) if !n.trim().is_empty() => n.trim().to_string(),
        _ => return utils::output(Some("name is required"), None),
    };
    let target = match form.target {
        Some(ref t) if !t.trim().is_empty() => t.trim().to_string(),
        _ => return utils::output(Some("target is required"), None),
    };
    let input = ScanTaskInput {
        name,
        target,
        ports: form.ports,
        scan_type: form.scan_type,
    };
    match state.db.save_security_scan_task(input) {
        Ok(t) => utils::output(None, Some(serde_json::to_value(&t).unwrap_or_default())),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_security_run_scan(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    let task = match state.db.get_security_scan_task(id) {
        Ok(Some(t)) => t,
        Ok(None) => return utils::output(Some("task not found"), None),
        Err(e) => return utils::output(Some(&e), None),
    };
    let _ = state
        .db
        .update_security_scan_task_status(id, "running", None);
    match crate::security::scan_ports(&task.target, &task.ports, &task.scan_type).await {
        Ok(results) => {
            let open_count = results.iter().filter(|r| r.state == "open").count();
            let summary = json!({"total": results.len(), "open": open_count, "closed": results.len() - open_count}).to_string();
            let _ = state.db.save_security_scan_results(id, &results);
            let _ = state
                .db
                .update_security_scan_task_status(id, "completed", Some(&summary));
            utils::output(None, Some(json!({"results": results, "summary": summary})))
        }
        Err(e) => {
            let _ = state
                .db
                .update_security_scan_task_status(id, "failed", Some(&e));
            utils::output(Some(&e), None)
        }
    }
}

async fn handle_security_correlate(
    _state: State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    let _ = _state;
    match crate::security::correlate_threats("kyklos.sqlite3", id).await {
        Ok(cor) => utils::output(None, Some(serde_json::to_value(&cor).unwrap_or_default())),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_security_scan_results(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    match state.db.list_security_scan_results(id) {
        Ok(items) => utils::output(None, Some(serde_json::to_value(&items).unwrap_or_default())),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_security_delete_scan_task(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    match state.db.delete_security_scan_task(id) {
        Ok(true) => utils::output(None, None),
        Ok(false) => utils::output(Some("not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

// ---- Security: CSV Export ----

async fn handle_security_export_csv(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> axum::response::Response {
    let results = match state.db.list_security_scan_results(id) {
        Ok(r) => r,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    };
    let mut csv = String::from("ip,port,protocol,service,state,banner\n");
    for r in &results {
        let banner = r.banner.as_deref().unwrap_or("").replace('"', "'");
        csv.push_str(&format!(
            "{},{},{},{},{},\"{}\"\n",
            r.ip,
            r.port,
            r.protocol,
            r.service.as_deref().unwrap_or(""),
            r.state,
            banner
        ));
    }
    Response::builder()
        .header(header::CONTENT_TYPE, "text/csv; charset=utf-8")
        .header(
            header::CONTENT_DISPOSITION,
            &format!("attachment; filename=\"scan-results-{}.csv\"", id),
        )
        .body(axum::body::Body::from(csv))
        .unwrap()
}

// ---- ApiMan: Variables ----

async fn handle_apiman_variables(
    State(state): State<Arc<AppState>>,
    Path(ws_id): Path<i64>,
) -> Json<Value> {
    match state.db.list_apiman_variables(ws_id) {
        Ok(items) => utils::output(None, Some(serde_json::to_value(&items).unwrap_or_default())),
        Err(e) => utils::output(Some(&e), None),
    }
}

#[derive(Deserialize)]
struct ApiManVarForm {
    pub key: Option<String>,
    pub value: Option<String>,
    pub enabled: Option<String>,
}

async fn handle_apiman_upsert_variable(
    State(state): State<Arc<AppState>>,
    Path(ws_id): Path<i64>,
    Form(form): Form<ApiManVarForm>,
) -> Json<Value> {
    let key = match form.key {
        Some(ref k) if !k.trim().is_empty() => k.trim().to_string(),
        _ => return utils::output(Some("key is required"), None),
    };
    let input = crate::apps::apiman::ApiManVariableInput {
        key,
        value: form.value.unwrap_or_default(),
        enabled: Some(parse_form_bool(form.enabled.as_deref())),
    };
    match state.db.upsert_apiman_variable(ws_id, input) {
        Ok(v) => utils::output(None, Some(serde_json::to_value(&v).unwrap_or_default())),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_apiman_delete_variable(
    State(state): State<Arc<AppState>>,
    Path(params): Path<(i64, String)>,
) -> Json<Value> {
    let (ws_id, key) = params;
    match state.db.delete_apiman_variable(ws_id, &key) {
        Ok(true) => utils::output(None, Some(json!({ "deleted": true }))),
        Ok(false) => utils::output(Some("variable not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

// ---- ApiMan: Wireframes ----

async fn handle_apiman_wireframe_list(State(state): State<Arc<AppState>>) -> Json<Value> {
    match state.db.list_wireframes() {
        Ok(items) => utils::output(None, Some(json!({ "wireframes": items }))),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_apiman_wireframe_get(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    match state.db.wireframe(id) {
        Ok(Some(item)) => utils::output(None, Some(json!({ "wireframe": item }))),
        Ok(None) => utils::output(Some("wireframe not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_apiman_wireframe_create(
    State(state): State<Arc<AppState>>,
    Json(input): Json<ApiManWireframeInput>,
) -> Json<Value> {
    match state.db.create_wireframe(input) {
        Ok(item) => utils::output(None, Some(json!({ "wireframe": item }))),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_apiman_wireframe_update(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(input): Json<ApiManWireframeInput>,
) -> Json<Value> {
    match state.db.update_wireframe(id, input) {
        Ok(Some(item)) => utils::output(None, Some(json!({ "wireframe": item }))),
        Ok(None) => utils::output(Some("wireframe not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

async fn handle_apiman_wireframe_delete(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    match state.db.delete_wireframe(id) {
        Ok(true) => utils::output(None, Some(json!({ "deleted": true }))),
        Ok(false) => utils::output(Some("wireframe not found"), None),
        Err(e) => utils::output(Some(&e), None),
    }
}

// ---- ApiMan: Export/Import Workspace ----

async fn handle_apiman_export_workspace(
    State(state): State<Arc<AppState>>,
    Path(ws_id): Path<i64>,
) -> Json<Value> {
    let ws = match state.db.list_apiman_workspaces() {
        Ok(list) => list.into_iter().find(|w| w.id == ws_id),
        Err(e) => return utils::output(Some(&e), None),
    };
    let ws = match ws {
        Some(w) => w,
        None => return utils::output(Some("workspace not found"), None),
    };
    let nodes = match state.db.list_apiman_nodes(ws_id) {
        Ok(n) => n,
        Err(e) => return utils::output(Some(&e), None),
    };
    let requests = match state.db.list_apiman_requests(ws_id) {
        Ok(r) => r,
        Err(e) => return utils::output(Some(&e), None),
    };
    utils::output(
        None,
        Some(json!({
            "workspace": ws,
            "nodes": nodes,
            "requests": requests,
        })),
    )
}

#[derive(Deserialize)]
struct ApiManImportForm {
    pub data: Option<String>,
}

async fn handle_apiman_import_workspace(
    State(state): State<Arc<AppState>>,
    Form(form): Form<ApiManImportForm>,
) -> Json<Value> {
    let raw = match form.data {
        Some(ref d) if !d.trim().is_empty() => d.clone(),
        _ => return utils::output(Some("import data is required"), None),
    };
    let import: Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(e) => return utils::output(Some(&format!("invalid JSON: {e}")), None),
    };
    let ws_name = import["workspace"]["name"]
        .as_str()
        .unwrap_or("Imported Workspace");
    let ws_input = ApiManWorkspaceInput {
        name: ws_name.to_string(),
        description: import["workspace"]["description"]
            .as_str()
            .map(|s| s.to_string()),
    };
    let ws = match state.db.save_apiman_workspace(ws_input) {
        Ok(w) => w,
        Err(e) => return utils::output(Some(&e), None),
    };
    let mut node_id_map: std::collections::HashMap<i64, i64> = std::collections::HashMap::new();
    if let Some(nodes) = import["nodes"].as_array() {
        for node_val in nodes {
            if let Some(old_id) = node_val["id"].as_i64() {
                let parent_old = node_val["parent_id"].as_i64();
                let new_parent = parent_old.and_then(|pid| node_id_map.get(&pid)).copied();
                let input = ApiManNodeInput {
                    workspace_id: ws.id,
                    parent_id: new_parent,
                    name: node_val["name"].as_str().unwrap_or("?").to_string(),
                    node_type: node_val["node_type"]
                        .as_str()
                        .unwrap_or("request")
                        .to_string(),
                    sort_order: node_val["sort_order"].as_i64(),
                };
                if let Ok(new_node) = state.db.save_apiman_node(input) {
                    node_id_map.insert(old_id, new_node.id);
                    // Restore request details
                    if let Some(requests) = import["requests"].as_array() {
                        for req_val in requests {
                            if req_val["node_id"].as_i64() == Some(old_id) {
                                let req_input = ApiManRequestInput {
                                    method: req_val["method"].as_str().map(|s| s.to_string()),
                                    url: req_val["url"].as_str().map(|s| s.to_string()),
                                    headers: req_val["headers"].as_str().map(|s| s.to_string()),
                                    query_params: req_val["query_params"]
                                        .as_str()
                                        .map(|s| s.to_string()),
                                    body_type: req_val["body_type"].as_str().map(|s| s.to_string()),
                                    body_content: req_val["body_content"]
                                        .as_str()
                                        .map(|s| s.to_string()),
                                    auth_config: req_val["auth_config"]
                                        .as_str()
                                        .map(|s| s.to_string()),
                                };
                                let _ = state.db.update_apiman_request(new_node.id, req_input);
                            }
                        }
                    }
                }
            }
        }
    }
    utils::output(None, Some(json!({"workspace": ws})))
}

// ---- Activity Feed ----

async fn handle_activity(State(state): State<Arc<AppState>>) -> Json<Value> {
    let mut activities: Vec<Value> = Vec::new();

    // Scan tasks
    if let Ok(tasks) = state.db.list_security_scan_tasks() {
        for t in tasks.iter().take(5) {
            activities.push(json!({
                "type": "scan", "icon": "bx-scan", "label": format!("掃描: {}", t.name),
                "status": t.status, "time": t.created_at, "target": t.target,
            }));
        }
    }

    // ApiMan requests
    if let Ok(ws_list) = state.db.list_apiman_workspaces() {
        for ws in ws_list.iter().take(3) {
            if let Ok(requests) = state.db.list_apiman_requests(ws.id) {
                for req in requests.iter().take(3) {
                    activities.push(json!({
                        "type": "apiman", "icon": "bx-link",
                        "label": format!("{} {} [{}]", req.method, req.url, ws.name),
                        "status": req.last_response_status.map(|s| s.to_string()).unwrap_or_default(),
                        "time": req.updated_at,
                    }));
                }
            }
        }
    }

    // Nginx sites
    if let Ok(sites) = state.db.list_nginx_sites() {
        for site in sites.iter().take(5) {
            activities.push(json!({
                "type": "nginx", "icon": "bx-windows",
                "label": format!("Nginx site: {}", site.site_name),
                "status": if site.enabled { "enabled" } else { "disabled" },
                "time": site.updated_at,
            }));
        }
    }

    // Netplan configs
    if let Ok(configs) = state.db.list_netplan_configs() {
        for cfg in configs.iter().take(3) {
            activities.push(json!({
                "type": "netplan", "icon": "bx-wifi",
                "label": format!("Netplan: {}", cfg.interface_name),
                "status": if cfg.dhcp { "DHCP" } else { "Static" },
                "time": cfg.created_at,
            }));
        }
    }

    // Sort by time descending and take top 20
    activities.sort_by(|a, b| {
        b["time"]
            .as_str()
            .unwrap_or("")
            .cmp(&a["time"].as_str().unwrap_or(""))
    });
    activities.truncate(20);

    utils::output(None, Some(json!(activities)))
}

// ---- Health Check ----

async fn handle_health() -> Json<Value> {
    utils::output(
        None,
        Some(json!({
            "status": "ok",
            "version": env!("CARGO_PKG_VERSION"),
            "platform": std::env::consts::OS,
        })),
    )
}

// ---- Static File Handlers ----

fn embedded_asset_response(path: &str) -> Response {
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

async fn handle_web_assets(Path(path): Path<String>) -> Response {
    embedded_asset_response(&path)
}

async fn handle_assets(Path(path): Path<String>) -> Response {
    embedded_asset_response(&format!("assets/{path}"))
}

async fn handle_sneat_assets(Path(path): Path<String>) -> Response {
    embedded_asset_response(&format!("sneat/{path}"))
}

async fn handle_layui_assets(Path(path): Path<String>) -> Response {
    embedded_asset_response(&format!("layui/{path}"))
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

async fn handle_api_log() -> Json<Value> {
    let entries = crate::logger::global().drain();
    Json(json!({"code": 0, "data": entries}))
}

async fn handle_app_js() -> Response {
    embedded_asset_response("app.js")
}

async fn handle_env_js() -> Response {
    embedded_asset_response("env.js")
}

async fn handle_icons_svg() -> Response {
    embedded_asset_response("icons.svg")
}

async fn handle_favicon_svg() -> Response {
    embedded_asset_response("favicon.svg")
}

// ---- Router Builder ----

pub fn build_router(state: Arc<AppState>) -> Router {
    // Split routes into API (prefixed) and Web (non-prefixed)
    let web_routes = Router::new()
        .route("/web/*path", get(handle_web_assets))
        .route("/assets/*path", get(handle_assets))
        .route("/sneat/*path", get(handle_sneat_assets))
        .route("/layui/*path", get(handle_layui_assets))
        .route("/app.js", get(handle_app_js))
        .route("/env.js", get(handle_env_js))
        .route("/icons.svg", get(handle_icons_svg))
        .route("/favicon.svg", get(handle_favicon_svg))
        .route("/health", get(handle_health))
        .route("/activity", get(handle_activity))
        .route("/platform", get(handle_platform))
        .route("/interfaces", get(handle_interfaces))
        .route("/log", post(handle_log))
        .route("/log/api", get(handle_api_log))
        .route("/favicon.ico", get(handle_favicon))
        .route("/", get(handle_index))
        .route("/docs/*path", get(handle_docs));

    let api_routes = Router::new()
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
        .route(
            "/nginx/env",
            get(handle_nginx_env).post(handle_nginx_save_env),
        )
        .route(
            "/nginx/sites",
            get(handle_nginx_sites).post(handle_nginx_create_site),
        )
        .route("/nginx/sites/scan", get(handle_nginx_scan_sites))
        .route(
            "/nginx/sites/:name",
            get(handle_nginx_get_site)
                .post(handle_nginx_update_site)
                .delete(handle_nginx_delete_site),
        )
        .route("/nginx/sites/:name/preview", get(handle_nginx_site_preview))
        .route("/nginx/sites/:name/write", post(handle_nginx_write_site))
        .route(
            "/nginx/sites/:name/file",
            delete(handle_nginx_delete_site_file),
        )
        .route(
            "/nginx/modules",
            get(handle_nginx_modules).post(handle_nginx_add_module),
        )
        .route("/nginx/modules/scan", get(handle_nginx_scan_modules))
        .route(
            "/nginx/modules/:name/enabled",
            post(handle_nginx_set_module_enabled),
        )
        .route("/nginx/config/preview", get(handle_nginx_config_preview))
        .route("/nginx/test", post(handle_nginx_test))
        .route("/nginx/reload", post(handle_nginx_reload))
        .route("/netplan/interfaces", get(handle_netplan_interfaces))
        .route(
            "/netplan/interfaces/:iface/current",
            get(handle_netplan_current),
        )
        .route("/netplan/configs", get(handle_netplan_configs))
        .route("/netplan/apply", post(handle_netplan_apply))
        .route("/netplan/preview", post(handle_netplan_preview))
        .route("/netplan/configs/:id", delete(handle_netplan_delete_config))
        .route("/api/netplan/interfaces", get(handle_netplan_interfaces))
        .route(
            "/api/netplan/interfaces/:iface/current",
            get(handle_netplan_current),
        )
        .route("/api/netplan/configs", get(handle_netplan_configs))
        .route("/api/netplan/apply", post(handle_netplan_apply))
        .route("/api/netplan/preview", post(handle_netplan_preview))
        .route(
            "/api/netplan/configs/:id",
            delete(handle_netplan_delete_config),
        )
        .route(
            "/dbman/connections",
            get(handle_dbman_connections).post(handle_dbman_save_connection),
        )
        .route(
            "/dbman/saved-queries",
            get(handle_dbman_saved_queries).post(handle_dbman_save_query),
        )
        .route(
            "/dbman/saved-queries/:id",
            delete(handle_dbman_delete_saved_query),
        )
        .route(
            "/dbman/connections/:id",
            put(handle_dbman_update_connection).delete(handle_dbman_delete_connection),
        )
        .route("/dbman/test", post(handle_dbman_test_connection))
        .route("/dbman/tables", post(handle_dbman_tables))
        .route("/dbman/table/columns", post(handle_dbman_table_columns))
        .route("/dbman/query", post(handle_dbman_query))
        .route(
            "/api/dbman/connections",
            get(handle_dbman_connections).post(handle_dbman_save_connection),
        )
        .route(
            "/api/dbman/connections/:id",
            delete(handle_dbman_delete_connection),
        )
        .route("/api/dbman/test", post(handle_dbman_test_connection))
        .route("/api/dbman/tables", post(handle_dbman_tables))
        .route("/api/dbman/table/columns", post(handle_dbman_table_columns))
        .route("/api/dbman/query", post(handle_dbman_query))
        .route(
            "/security/cvs/sources",
            get(handle_security_cvs_sources).post(handle_security_save_cvs_source),
        )
        .route(
            "/security/cvs/sources/:id",
            delete(handle_security_delete_cvs_source),
        )
        .route("/security/cvs/import", post(handle_security_import_csv))
        .route("/security/cvs/save", post(handle_security_save_csv))
        .route(
            "/security/scan/tasks",
            get(handle_security_scan_tasks).post(handle_security_create_scan_task),
        )
        .route(
            "/security/scan/tasks/:id",
            delete(handle_security_delete_scan_task),
        )
        .route(
            "/security/scan/tasks/:id/run",
            post(handle_security_run_scan),
        )
        .route(
            "/security/scan/tasks/:id/results",
            get(handle_security_scan_results),
        )
        .route(
            "/security/scan/tasks/:id/correlate",
            get(handle_security_correlate),
        )
        .route(
            "/security/scan/tasks/:id/export",
            get(handle_security_export_csv),
        )
        .route(
            "/apiman/workspaces/export/:ws_id",
            get(handle_apiman_export_workspace),
        )
        .route(
            "/apiman/workspaces/import",
            post(handle_apiman_import_workspace),
        )
        .route(
            "/apiman/workspaces",
            get(handle_apiman_workspaces).post(handle_apiman_create_workspace),
        )
        .route(
            "/apiman/workspaces/:id",
            put(handle_apiman_update_workspace).delete(handle_apiman_delete_workspace),
        )
        .route("/apiman/workspaces/:ws_id/nodes", get(handle_apiman_nodes))
        .route("/apiman/nodes", post(handle_apiman_create_node))
        .route(
            "/apiman/nodes/:id",
            put(handle_apiman_update_node).delete(handle_apiman_delete_node),
        )
        .route("/apiman/nodes/:id/move", post(handle_apiman_move_node))
        .route("/apiman/nodes/:id/copy", post(handle_apiman_copy_node))
        .route(
            "/apiman/requests/:node_id",
            get(handle_apiman_get_request).put(handle_apiman_save_request),
        )
        .route(
            "/apiman/requests/:node_id/send",
            post(handle_apiman_send_request),
        )
        .route(
            "/apiman/requests/:node_id/history",
            get(handle_apiman_response_history),
        )
        .route(
            "/apiman/variables/:ws_id",
            get(handle_apiman_variables).post(handle_apiman_upsert_variable),
        )
        .route(
            "/apiman/variables/:ws_id/:key",
            delete(handle_apiman_delete_variable),
        )
        .route(
            "/api/apiman/workspaces",
            get(handle_apiman_workspaces).post(handle_apiman_create_workspace),
        )
        .route(
            "/api/apiman/workspaces/:id",
            put(handle_apiman_update_workspace).delete(handle_apiman_delete_workspace),
        )
        .route(
            "/api/apiman/workspaces/:ws_id/nodes",
            get(handle_apiman_nodes),
        )
        .route("/api/apiman/nodes", post(handle_apiman_create_node))
        .route(
            "/api/apiman/nodes/:id",
            put(handle_apiman_update_node).delete(handle_apiman_delete_node),
        )
        .route("/api/apiman/nodes/:id/move", post(handle_apiman_move_node))
        .route(
            "/api/apiman/requests/:node_id",
            get(handle_apiman_get_request).put(handle_apiman_save_request),
        )
        .route(
            "/api/apiman/requests/:node_id/send",
            post(handle_apiman_send_request),
        )
        .route(
            "/api/apiman/requests/:node_id/history",
            get(handle_apiman_response_history),
        )
        .route(
            "/api/apiman/variables/:ws_id",
            get(handle_apiman_variables).post(handle_apiman_upsert_variable),
        )
        .route(
            "/api/apiman/variables/:ws_id/:key",
            delete(handle_apiman_delete_variable),
        )
        .route(
            "/apiman/wireframes",
            get(handle_apiman_wireframe_list).post(handle_apiman_wireframe_create),
        )
        .route(
            "/apiman/wireframes/:id",
            get(handle_apiman_wireframe_get)
                .put(handle_apiman_wireframe_update)
                .delete(handle_apiman_wireframe_delete),
        )
        .route(
            "/api/apiman/wireframes",
            get(handle_apiman_wireframe_list).post(handle_apiman_wireframe_create),
        )
        .route(
            "/api/apiman/wireframes/:id",
            get(handle_apiman_wireframe_get)
                .put(handle_apiman_wireframe_update)
                .delete(handle_apiman_wireframe_delete),
        )
        .route(
            "/workflows",
            get(handle_workflow_list).post(handle_workflow_create),
        )
        .route(
            "/workflows/:id",
            get(handle_workflow_get)
                .put(handle_workflow_update)
                .delete(handle_workflow_delete),
        )
        .route(
            "/workflows/:id/status",
            post(handle_workflow_set_status),
        )
        .route(
            "/api/workflows",
            get(handle_workflow_list).post(handle_workflow_create),
        )
        .route(
            "/api/workflows/:id",
            get(handle_workflow_get)
                .put(handle_workflow_update)
                .delete(handle_workflow_delete),
        )
        .route(
            "/api/workflows/:id/status",
            post(handle_workflow_set_status),
        )
        .route(
            "/network-architectures",
            get(handle_network_list).post(handle_network_create),
        )
        .route(
            "/network-architectures/:id",
            get(handle_network_get)
                .put(handle_network_update)
                .delete(handle_network_delete),
        )
        .route(
            "/api/network-architectures",
            get(handle_network_list).post(handle_network_create),
        )
        .route(
            "/api/network-architectures/:id",
            get(handle_network_get)
                .put(handle_network_update)
                .delete(handle_network_delete),
        )
        .route(
            "/erd-diagrams",
            get(handle_erd_list).post(handle_erd_create),
        )
        .route(
            "/erd-diagrams/:id",
            get(handle_erd_get)
                .put(handle_erd_update)
                .delete(handle_erd_delete),
        )
        .route("/erd-diagrams/schema", post(handle_erd_schema))
        .route(
            "/api/erd-diagrams",
            get(handle_erd_list).post(handle_erd_create),
        )
        .route(
            "/api/erd-diagrams/:id",
            get(handle_erd_get)
                .put(handle_erd_update)
                .delete(handle_erd_delete),
        )
        .route("/api/erd-diagrams/schema", post(handle_erd_schema))
        .route(
            "/settings/roles",
            get(handle_role_list).post(handle_role_create),
        )
        .route(
            "/settings/roles/:id",
            get(handle_role_get)
                .put(handle_role_update)
                .delete(handle_role_delete),
        )
        .route(
            "/settings/units",
            get(handle_unit_list).post(handle_unit_create),
        )
        .route(
            "/settings/units/:id",
            get(handle_unit_get)
                .put(handle_unit_update)
                .delete(handle_unit_delete),
        )
        .route(
            "/settings/users",
            get(handle_user_list).post(handle_user_create),
        )
        .route(
            "/settings/users/:id",
            get(handle_user_get)
                .put(handle_user_update)
                .delete(handle_user_delete),
        )
        .route(
            "/settings/users/:id/reset-password",
            post(handle_user_reset_password),
        )
        .route(
            "/settings/dictionary",
            get(handle_dictionary_list).post(handle_dictionary_create),
        )
        .route(
            "/settings/dictionary/:id",
            get(handle_dictionary_get)
                .put(handle_dictionary_update)
                .delete(handle_dictionary_delete),
        )
        .route(
            "/settings/system",
            get(handle_setting_list).post(handle_setting_create),
        )
        .route(
            "/settings/system/:id",
            get(handle_setting_get)
                .put(handle_setting_update)
                .delete(handle_setting_delete),
        )
        .route(
            "/api/settings/roles",
            get(handle_role_list).post(handle_role_create),
        )
        .route(
            "/api/settings/roles/:id",
            get(handle_role_get)
                .put(handle_role_update)
                .delete(handle_role_delete),
        )
        .route(
            "/api/settings/units",
            get(handle_unit_list).post(handle_unit_create),
        )
        .route(
            "/api/settings/units/:id",
            get(handle_unit_get)
                .put(handle_unit_update)
                .delete(handle_unit_delete),
        )
        .route(
            "/api/settings/users",
            get(handle_user_list).post(handle_user_create),
        )
        .route(
            "/api/settings/users/:id",
            get(handle_user_get)
                .put(handle_user_update)
                .delete(handle_user_delete),
        )
        .route(
            "/api/settings/users/:id/reset-password",
            post(handle_user_reset_password),
        )
        .route(
            "/api/settings/dictionary",
            get(handle_dictionary_list).post(handle_dictionary_create),
        )
        .route(
            "/api/settings/dictionary/:id",
            get(handle_dictionary_get)
                .put(handle_dictionary_update)
                .delete(handle_dictionary_delete),
        )
        .route(
            "/api/settings/system",
            get(handle_setting_list).post(handle_setting_create),
        )
        .route(
            "/api/settings/system/:id",
            get(handle_setting_get)
                .put(handle_setting_update)
                .delete(handle_setting_delete),
        )
        .route(
            "/api/nginx/env",
            get(handle_nginx_env).post(handle_nginx_save_env),
        )
        .route(
            "/api/nginx/sites",
            get(handle_nginx_sites).post(handle_nginx_create_site),
        )
        .route("/api/nginx/sites/scan", get(handle_nginx_scan_sites))
        .route(
            "/api/nginx/sites/:name",
            get(handle_nginx_get_site)
                .post(handle_nginx_update_site)
                .delete(handle_nginx_delete_site),
        )
        .route(
            "/api/nginx/sites/:name/preview",
            get(handle_nginx_site_preview),
        )
        .route(
            "/api/nginx/sites/:name/write",
            post(handle_nginx_write_site),
        )
        .route(
            "/api/nginx/sites/:name/file",
            delete(handle_nginx_delete_site_file),
        )
        .route(
            "/api/nginx/modules",
            get(handle_nginx_modules).post(handle_nginx_add_module),
        )
        .route("/api/nginx/modules/scan", get(handle_nginx_scan_modules))
        .route(
            "/api/nginx/modules/:name/enabled",
            post(handle_nginx_set_module_enabled),
        )
        .route(
            "/api/nginx/config/preview",
            get(handle_nginx_config_preview),
        )
        .route("/api/nginx/test", post(handle_nginx_test))
        .route("/api/nginx/reload", post(handle_nginx_reload))
        .route(
            "/api/security/cvs/sources",
            get(handle_security_cvs_sources).post(handle_security_save_cvs_source),
        )
        .route(
            "/api/security/cvs/sources/:id",
            delete(handle_security_delete_cvs_source),
        )
        .route("/api/security/cvs/import", post(handle_security_import_csv))
        .route("/api/security/cvs/save", post(handle_security_save_csv))
        .route(
            "/api/security/scan/tasks",
            get(handle_security_scan_tasks).post(handle_security_create_scan_task),
        )
        .route(
            "/api/security/scan/tasks/:id",
            delete(handle_security_delete_scan_task),
        )
        .route(
            "/api/security/scan/tasks/:id/run",
            post(handle_security_run_scan),
        )
        .route(
            "/api/security/scan/tasks/:id/results",
            get(handle_security_scan_results),
        )
        .route(
            "/api/security/scan/tasks/:id/correlate",
            get(handle_security_correlate),
        )
        .route("/tools/log/list", get(handle_log_list))
        .route("/tools/log/tail", post(handle_log_tail))
        .route("/tools/log/content", post(handle_log_content))
        .route("/system/log/list", get(handle_log_list))
        .route("/system/log/tail", post(handle_log_tail))
        .route("/system/log/content", post(handle_log_content))
        .route("/tools/ping", post(handle_tools_ping))
        .route("/tools/ping-classc", post(handle_tools_ping_classc))
        .route("/tools/lsof", post(handle_tools_lsof))
        .route("/tools/traceroute", post(handle_tools_traceroute))
        .route("/tools/nslookup", post(handle_tools_nslookup))
        .route("/tools/ip-location", post(handle_tools_ip_location))
        .route("/tools/netstat", post(handle_tools_netstat))
        .route("/tools/pcap/interfaces", get(handle_tools_pcap_interfaces))
        .route("/tools/pcap/capture", post(handle_tools_pcap_capture))
        .route(
            "/tools/crontab/jobs",
            get(handle_cron_list).post(handle_cron_create),
        )
        .route(
            "/tools/crontab/jobs/:id",
            get(handle_cron_get)
                .put(handle_cron_update)
                .delete(handle_cron_delete),
        )
        .route("/tools/crontab/jobs/:id/enable", post(handle_cron_enable))
        .route("/tools/crontab/jobs/:id/disable", post(handle_cron_disable))
        .route("/tools/crontab/jobs/:id/run", post(handle_cron_run))
        .route("/tools/crontab/jobs/:id/runs", get(handle_cron_runs))
        .route(
            "/system/crontab/jobs",
            get(handle_cron_list).post(handle_cron_create),
        )
        .route(
            "/system/crontab/jobs/:id",
            get(handle_cron_get)
                .put(handle_cron_update)
                .delete(handle_cron_delete),
        )
        .route("/system/crontab/jobs/:id/enable", post(handle_cron_enable))
        .route("/system/crontab/jobs/:id/disable", post(handle_cron_disable))
        .route("/system/crontab/jobs/:id/run", post(handle_cron_run))
        .route("/system/crontab/jobs/:id/runs", get(handle_cron_runs))
        .route("/snmp/get", post(handle_snmp_get))
        .route("/snmp/walk", post(handle_snmp_walk))
        .route("/samba/shares", post(handle_samba_shares))
        .route("/samba/ls", post(handle_samba_ls))
        .route("/samba/download", post(handle_samba_download))
        .route("/samba/upload", post(handle_samba_upload))
        .route("/samba/mkdir", post(handle_samba_mkdir))
        .route("/samba/rm", post(handle_samba_rm))
        .route("/sftp/ls", post(handle_sftp_ls))
        .route("/sftp/download", post(handle_sftp_download))
        .route("/sftp/upload", post(handle_sftp_upload))
        .route("/sftp/mkdir", post(handle_sftp_mkdir))
        .route("/sftp/rm", post(handle_sftp_rm))
        .route("/api/tools/log/list", get(handle_log_list))
        .route("/api/tools/log/tail", post(handle_log_tail))
        .route("/api/tools/log/content", post(handle_log_content))
        .route("/api/system/log/list", get(handle_log_list))
        .route("/api/system/log/tail", post(handle_log_tail))
        .route("/api/system/log/content", post(handle_log_content))
        .route("/api/tools/ping", post(handle_tools_ping))
        .route("/api/tools/ping-classc", post(handle_tools_ping_classc))
        .route("/api/tools/lsof", post(handle_tools_lsof))
        .route("/api/tools/traceroute", post(handle_tools_traceroute))
        .route("/api/tools/nslookup", post(handle_tools_nslookup))
        .route("/api/tools/ip-location", post(handle_tools_ip_location))
        .route("/api/tools/netstat", post(handle_tools_netstat))
        .route(
            "/api/tools/pcap/interfaces",
            get(handle_tools_pcap_interfaces),
        )
        .route("/api/tools/pcap/capture", post(handle_tools_pcap_capture))
        .route(
            "/api/tools/crontab/jobs",
            get(handle_cron_list).post(handle_cron_create),
        )
        .route(
            "/api/tools/crontab/jobs/:id",
            get(handle_cron_get)
                .put(handle_cron_update)
                .delete(handle_cron_delete),
        )
        .route(
            "/api/tools/crontab/jobs/:id/enable",
            post(handle_cron_enable),
        )
        .route(
            "/api/tools/crontab/jobs/:id/disable",
            post(handle_cron_disable),
        )
        .route("/api/tools/crontab/jobs/:id/run", post(handle_cron_run))
        .route("/api/tools/crontab/jobs/:id/runs", get(handle_cron_runs))
        .route(
            "/api/system/crontab/jobs",
            get(handle_cron_list).post(handle_cron_create),
        )
        .route(
            "/api/system/crontab/jobs/:id",
            get(handle_cron_get)
                .put(handle_cron_update)
                .delete(handle_cron_delete),
        )
        .route(
            "/api/system/crontab/jobs/:id/enable",
            post(handle_cron_enable),
        )
        .route(
            "/api/system/crontab/jobs/:id/disable",
            post(handle_cron_disable),
        )
        .route("/api/system/crontab/jobs/:id/run", post(handle_cron_run))
        .route("/api/system/crontab/jobs/:id/runs", get(handle_cron_runs))
        .route("/api/snmp/get", post(handle_snmp_get))
        .route("/api/snmp/walk", post(handle_snmp_walk))
        .route("/api/samba/shares", post(handle_samba_shares))
        .route("/api/samba/ls", post(handle_samba_ls))
        .route("/api/samba/download", post(handle_samba_download))
        .route("/api/samba/upload", post(handle_samba_upload))
        .route("/api/samba/mkdir", post(handle_samba_mkdir))
        .route("/api/samba/rm", post(handle_samba_rm))
        .route("/api/sftp/ls", post(handle_sftp_ls))
        .route("/api/sftp/download", post(handle_sftp_download))
        .route("/api/sftp/upload", post(handle_sftp_upload))
        .route("/api/sftp/mkdir", post(handle_sftp_mkdir))
        .route("/api/sftp/rm", post(handle_sftp_rm));

    // Auth layer applied to both web and API routes
    let auth_layer = middleware::from_fn_with_state(state.clone(), auth_middleware);
    let auth_web = web_routes.layer(auth_layer.clone());
    let auth_api = api_routes.layer(auth_layer.clone());

    // Prefixed API routes
    let prefixed_backend_api = Router::new().nest("/miitai-fwm/0.52/backend", auth_api.clone());

    // WebSocket endpoints: browsers don't send Basic Auth headers on WS upgrade,
    // so these must bypass the auth middleware.
    let ws_routes = Router::new()
        .route("/shell", get(shell::handle_ws_shell))
        .route("/ai", get(ai::handle_ws_ai));

    Router::new()
        .merge(ws_routes)
        .merge(auth_web)
        .merge(auth_api)
        .merge(prefixed_backend_api)
        .with_state(state)
}
