use crate::db::AppDb;
use once_cell::sync::Lazy;
use regex::Regex;
use serde::Serialize;
use std::collections::BTreeMap;
use std::process::Stdio;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;

static VLAN_NAME_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^[A-Za-z][A-Za-z0-9_.-]{0,63}$").unwrap());
static PORT_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"^(ge|xe|et)-\d+/\d+/\d+$").unwrap());
static IFACE_TOKEN_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^(ge|xe|et)-\d+/\d+/\d+(\.\d+)?[*]?$").unwrap());
static BRACKET_VERSION_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\[([0-9][A-Za-z0-9._-]*)\]").unwrap());
static UPTIME_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)\bup\s+(.+?)(?:,\s+\d+\s+users?|$)").unwrap());

#[derive(Clone)]
pub struct JuniperConfig {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: Option<String>,
    pub connect_timeout_secs: u64,
    pub strict_host_key_checking: bool,
}

impl JuniperConfig {
    pub fn from_env() -> Self {
        let host = std::env::var("JUNIPER_HOST")
            .ok()
            .filter(|v| !v.trim().is_empty())
            .unwrap_or_else(|| "10.20.50.2".to_string());
        let port = std::env::var("JUNIPER_PORT")
            .ok()
            .and_then(|v| v.parse::<u16>().ok())
            .unwrap_or(22);
        let username = std::env::var("JUNIPER_USERNAME")
            .ok()
            .filter(|v| !v.trim().is_empty())
            .unwrap_or_else(|| "root".to_string());
        let password = std::env::var("JUNIPER_PASSWORD")
            .ok()
            .filter(|v| !v.is_empty());
        let connect_timeout_secs = std::env::var("JUNIPER_CONNECT_TIMEOUT")
            .ok()
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(10);
        let strict_host_key_checking = std::env::var("JUNIPER_STRICT_HOST_KEY_CHECKING")
            .map(|v| matches!(v.to_ascii_lowercase().as_str(), "1" | "true" | "yes"))
            .unwrap_or(false);

        Self {
            host,
            port,
            username,
            password,
            connect_timeout_secs,
            strict_host_key_checking,
        }
    }
}

#[derive(Clone)]
pub struct JuniperClient {
    db: AppDb,
}

#[derive(Serialize)]
pub struct JuniperInfo {
    pub hostname: String,
    pub model: String,
    pub junos_version: String,
    pub uptime: String,
    pub serial_number: String,
    pub management_ip: String,
    pub connected: bool,
}

#[derive(Clone, Serialize)]
pub struct JuniperVlan {
    pub name: String,
    pub vlan_id: u16,
    pub interfaces: Vec<String>,
}

#[derive(Clone, Serialize)]
pub struct JuniperPort {
    pub port: String,
    pub admin_status: String,
    pub link_status: String,
    pub enabled: bool,
    pub mode: String,
    pub vlan_members: Vec<String>,
}

#[derive(Serialize)]
pub struct JuniperCommandResult {
    pub preview: Vec<String>,
    pub output: String,
}

impl JuniperClient {
    pub fn new(db: AppDb) -> Self {
        Self { db }
    }

    pub fn settings(&self) -> Result<crate::db::JuniperDeviceSettings, String> {
        self.db.juniper_settings()
    }

    pub fn save_settings(
        &self,
        update: crate::db::JuniperDeviceUpdate,
    ) -> Result<crate::db::JuniperDeviceSettings, String> {
        self.db.save_juniper_settings(update)
    }

    pub async fn info(&self) -> Result<JuniperInfo, String> {
        // Keep device discovery in one authenticated CLI session. Older EX
        // switches can be slow to accept repeated SSH logins.
        let output = self
            .run_cli(&[
                "show version | no-more",
                "show chassis hardware | no-more",
                "show system uptime | no-more",
            ])
            .await?;
        let config = self.db.juniper_config()?;
        Ok(parse_info(&output, &output, &output, &config.host))
    }

    pub async fn vlans(&self) -> Result<Vec<JuniperVlan>, String> {
        let output = self.run_cli(&["show vlans"]).await?;
        Ok(parse_vlans(&output))
    }

    pub async fn create_vlan(
        &self,
        name: &str,
        vlan_id: u16,
    ) -> Result<JuniperCommandResult, String> {
        validate_vlan_name(name)?;
        validate_vlan_id(vlan_id)?;
        let commands = vec![
            "configure".to_string(),
            format!("set vlans {name} vlan-id {vlan_id}"),
            "commit and-quit".to_string(),
        ];
        self.run_config(commands).await
    }

    pub async fn delete_vlan(&self, name: &str) -> Result<JuniperCommandResult, String> {
        validate_vlan_name(name)?;
        let commands = vec![
            "configure".to_string(),
            format!("delete vlans {name}"),
            "commit and-quit".to_string(),
        ];
        self.run_config(commands).await
    }

    pub async fn ports(&self) -> Result<Vec<JuniperPort>, String> {
        let terse = self.run_cli(&["show interfaces terse"]).await?;
        let vlans = self.run_cli(&["show vlans"]).await?;
        let config = self
            .run_cli(&["show configuration interfaces | display set"])
            .await?;
        Ok(parse_ports(&terse, &parse_vlans(&vlans), &config))
    }

    pub async fn set_access_vlan(
        &self,
        port: &str,
        vlan_name: &str,
    ) -> Result<JuniperCommandResult, String> {
        validate_port(port)?;
        validate_vlan_name(vlan_name)?;
        let commands = vec![
            "configure".to_string(),
            format!("delete interfaces {port} unit 0 family ethernet-switching vlan members"),
            format!("delete interfaces {port} unit 0 family ethernet-switching port-mode"),
            format!(
                "set interfaces {port} unit 0 family ethernet-switching vlan members {vlan_name}"
            ),
            "commit and-quit".to_string(),
        ];
        self.run_config(commands).await
    }

    pub async fn set_trunk_vlan(
        &self,
        port: &str,
        vlan_names: &[String],
    ) -> Result<JuniperCommandResult, String> {
        validate_port(port)?;
        if vlan_names.is_empty() {
            return Err("at least one VLAN member is required".to_string());
        }
        for name in vlan_names {
            validate_vlan_name(name)?;
        }
        let members = vlan_names.join(" ");
        let commands = vec![
            "configure".to_string(),
            format!("delete interfaces {port} unit 0 family ethernet-switching vlan members"),
            format!("set interfaces {port} unit 0 family ethernet-switching port-mode trunk"),
            format!(
                "set interfaces {port} unit 0 family ethernet-switching vlan members [ {members} ]"
            ),
            "commit and-quit".to_string(),
        ];
        self.run_config(commands).await
    }

    pub async fn set_port_enabled(
        &self,
        port: &str,
        enabled: bool,
    ) -> Result<JuniperCommandResult, String> {
        validate_port(port)?;
        let command = if enabled {
            format!("delete interfaces {port} disable")
        } else {
            format!("set interfaces {port} disable")
        };
        let commands = vec![
            "configure".to_string(),
            command,
            "commit and-quit".to_string(),
        ];
        self.run_config(commands).await
    }

    pub async fn bulk_config_ports(
        &self,
        ports: &[String],
        mode: &str,
        vlan_names: &[String],
        enabled: Option<bool>,
    ) -> Result<JuniperCommandResult, String> {
        let commands = build_bulk_port_commands(ports, mode, vlan_names, enabled)?;
        self.run_config(commands).await
    }

    async fn run_config(&self, commands: Vec<String>) -> Result<JuniperCommandResult, String> {
        let refs: Vec<&str> = commands.iter().map(String::as_str).collect();
        let output = self.run_cli(&refs).await?;
        Ok(JuniperCommandResult {
            preview: commands,
            output,
        })
    }

    async fn run_cli(&self, commands: &[&str]) -> Result<String, String> {
        let config = self.db.juniper_config()?;
        let mut all_commands = Vec::with_capacity(commands.len() + 2);
        all_commands.push("set cli screen-length 0".to_string());
        all_commands.extend(commands.iter().map(|s| s.to_string()));
        all_commands.push("exit".to_string());

        let mut cmd = if config.password.is_some() {
            let mut c = Command::new("sshpass");
            c.arg("-e").arg("ssh");
            if let Some(password) = &config.password {
                c.env("SSHPASS", password);
            }
            c
        } else {
            Command::new("ssh")
        };

        cmd.arg("-p")
            .arg(config.port.to_string())
            .arg("-o")
            .arg(format!("ConnectTimeout={}", config.connect_timeout_secs));

        if !config.strict_host_key_checking {
            cmd.arg("-o")
                .arg("StrictHostKeyChecking=no")
                .arg("-o")
                .arg("UserKnownHostsFile=/dev/null");
        }

        if config.password.is_none() {
            cmd.arg("-o").arg("BatchMode=yes");
        }

        cmd.arg(format!("{}@{}", config.username, config.host))
            .arg("cli")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = cmd.spawn().map_err(|e| self.spawn_error(e))?;

        if let Some(stdin) = child.stdin.as_mut() {
            let script = all_commands.join("\n") + "\n";
            stdin
                .write_all(script.as_bytes())
                .await
                .map_err(|e| format!("failed to write Juniper CLI stdin: {e}"))?;
        }

        let output = child
            .wait_with_output()
            .await
            .map_err(|e| format!("failed to wait Juniper SSH command: {e}"))?;
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let combined = combine_output(&stdout, &stderr);

        if !output.status.success() {
            if combined.to_ascii_lowercase().contains("permission denied") {
                return Err(
                    "Juniper SSH authentication failed. Save the SSH password in Juniper settings and install sshpass, or configure SSH key authentication for the user running firewall-man."
                        .to_string(),
                );
            }
            return Err(format!("Juniper SSH command failed: {}", combined.trim()));
        }
        if looks_like_commit_error(&combined) {
            return Err(combined);
        }
        Ok(combined)
    }

    fn spawn_error(&self, err: std::io::Error) -> String {
        let has_password = self
            .db
            .juniper_settings()
            .map(|settings| settings.has_password)
            .unwrap_or(false);
        if has_password {
            format!(
                "failed to start sshpass/ssh: {err}. Install sshpass or use SSH key auth without JUNIPER_PASSWORD"
            )
        } else {
            format!("failed to start ssh: {err}")
        }
    }
}

fn validate_vlan_name(name: &str) -> Result<(), String> {
    if VLAN_NAME_RE.is_match(name) {
        Ok(())
    } else {
        Err("invalid VLAN name".to_string())
    }
}

fn validate_vlan_id(vlan_id: u16) -> Result<(), String> {
    if (1..=4094).contains(&vlan_id) {
        Ok(())
    } else {
        Err("invalid VLAN ID".to_string())
    }
}

fn validate_port(port: &str) -> Result<(), String> {
    if PORT_RE.is_match(port) {
        Ok(())
    } else {
        Err("invalid port name".to_string())
    }
}

fn build_bulk_port_commands(
    ports: &[String],
    mode: &str,
    vlan_names: &[String],
    enabled: Option<bool>,
) -> Result<Vec<String>, String> {
    if ports.is_empty() {
        return Err("at least one port is required".to_string());
    }
    for port in ports {
        validate_port(port)?;
    }
    if vlan_names.is_empty() {
        return Err("at least one VLAN member is required".to_string());
    }
    for name in vlan_names {
        validate_vlan_name(name)?;
    }
    if mode == "access" && vlan_names.len() != 1 {
        return Err("access mode requires exactly one VLAN member".to_string());
    }
    if mode != "access" && mode != "trunk" {
        return Err("invalid port mode".to_string());
    }

    let mut commands = vec!["configure".to_string()];
    let members = vlan_names.join(" ");
    for port in unique(ports.to_vec()) {
        commands.push(format!(
            "delete interfaces {port} unit 0 family ethernet-switching vlan members"
        ));
        if mode == "access" {
            commands.push(format!(
                "delete interfaces {port} unit 0 family ethernet-switching port-mode"
            ));
            commands.push(format!(
                "set interfaces {port} unit 0 family ethernet-switching vlan members {}",
                vlan_names[0]
            ));
        } else {
            commands.push(format!(
                "set interfaces {port} unit 0 family ethernet-switching port-mode trunk"
            ));
            commands.push(format!(
                "set interfaces {port} unit 0 family ethernet-switching vlan members [ {members} ]"
            ));
        }

        if let Some(enabled) = enabled {
            commands.push(if enabled {
                format!("delete interfaces {port} disable")
            } else {
                format!("set interfaces {port} disable")
            });
        }
    }
    commands.push("commit and-quit".to_string());
    Ok(commands)
}

pub fn split_vlan_names(raw: &str) -> Vec<String> {
    raw.split(|c: char| c == ',' || c == ' ' || c == '\n' || c == '\t')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToString::to_string)
        .collect()
}

pub fn split_port_names(raw: &str) -> Vec<String> {
    raw.split(|c: char| c == ',' || c == ' ' || c == '\n' || c == '\t')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToString::to_string)
        .collect()
}

fn combine_output(stdout: &str, stderr: &str) -> String {
    match (stdout.trim().is_empty(), stderr.trim().is_empty()) {
        (true, true) => String::new(),
        (false, true) => stdout.to_string(),
        (true, false) => stderr.to_string(),
        (false, false) => format!("{stdout}\n{stderr}"),
    }
}

fn looks_like_commit_error(output: &str) -> bool {
    let lower = output.to_ascii_lowercase();
    lower.contains("commit failed")
        || lower.contains("error:")
        || lower.contains("syntax error")
        || lower.contains("missing mandatory statement")
}

fn parse_info(version: &str, hardware: &str, uptime: &str, management_ip: &str) -> JuniperInfo {
    let hostname = find_colon_value(version, "Hostname").unwrap_or_default();
    let mut model = find_colon_value(version, "Model").unwrap_or_default();
    let junos_version = find_junos_version(version).unwrap_or_default();
    let mut serial_number = String::new();

    for line in hardware.lines() {
        let trimmed = line.trim();
        if starts_with_key(trimmed, "Chassis") {
            let parts: Vec<&str> = trimmed.split_whitespace().collect();
            if parts.len() >= 2 && !parts[1].eq_ignore_ascii_case("version") {
                serial_number = parts[1].to_string();
            }
            if model.is_empty() && parts.len() >= 3 {
                model = parts[2..].join(" ");
            }
            break;
        }
    }

    let uptime_value = find_uptime(uptime).unwrap_or_default();

    JuniperInfo {
        hostname,
        model,
        junos_version,
        uptime: uptime_value,
        serial_number,
        management_ip: management_ip.to_string(),
        connected: true,
    }
}

fn find_colon_value(text: &str, key: &str) -> Option<String> {
    for line in text.lines() {
        let trimmed = line.trim();
        if let Some((label, value)) = trimmed.split_once(':') {
            if label.trim().eq_ignore_ascii_case(key) {
                return Some(value.trim().to_string());
            }
        }
    }
    None
}

fn find_junos_version(text: &str) -> Option<String> {
    for line in text.lines() {
        let trimmed = line.trim();
        if let Some(value) = find_colon_value(trimmed, "Junos") {
            if !value.is_empty() {
                return Some(value);
            }
        }

        // JunOS 12.x on EX2200 commonly reports package lines such as:
        // "JUNOS Base OS boot [12.3R6.6]" instead of a "Junos:" field.
        if trimmed.to_ascii_uppercase().starts_with("JUNOS ") {
            if let Some(caps) = BRACKET_VERSION_RE.captures(trimmed) {
                return Some(caps[1].to_string());
            }
        }
    }
    None
}

fn find_uptime(text: &str) -> Option<String> {
    if let Some(value) = text
        .lines()
        .find_map(|line| find_colon_value(line, "System uptime"))
    {
        return Some(value);
    }

    for line in text.lines() {
        if let Some(value) = find_colon_value(line, "System booted") {
            if let Some(start) = value.rfind('(') {
                if let Some(end) = value[start + 1..].find(')') {
                    return Some(
                        value[start + 1..start + 1 + end]
                            .trim()
                            .trim_end_matches(" ago")
                            .to_string(),
                    );
                }
            }
        }
    }

    text.lines().find_map(|line| {
        UPTIME_RE
            .captures(line)
            .map(|caps| caps[1].trim().to_string())
    })
}

fn starts_with_key(text: &str, key: &str) -> bool {
    text.split_whitespace()
        .next()
        .map(|value| value.eq_ignore_ascii_case(key))
        .unwrap_or(false)
}

fn parse_vlans(output: &str) -> Vec<JuniperVlan> {
    let mut vlans = Vec::new();
    let mut current: Option<usize> = None;

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty()
            || trimmed.starts_with("Name")
            || trimmed.starts_with("---")
            || trimmed.starts_with("Routing instance")
        {
            continue;
        }

        let parts: Vec<&str> = trimmed.split_whitespace().collect();
        if parts.len() >= 2 {
            if let Ok(vlan_id) = parts[1].parse::<u16>() {
                vlans.push(JuniperVlan {
                    name: parts[0].to_string(),
                    vlan_id,
                    interfaces: parts[2..]
                        .iter()
                        .filter_map(|p| normalize_iface_token(p))
                        .collect(),
                });
                current = Some(vlans.len() - 1);
                continue;
            }
        }

        if let Some(idx) = current {
            for part in parts {
                if let Some(iface) = normalize_iface_token(part) {
                    if !vlans[idx].interfaces.contains(&iface) {
                        vlans[idx].interfaces.push(iface);
                    }
                }
            }
        }
    }

    vlans
}

fn parse_ports(terse: &str, vlans: &[JuniperVlan], config: &str) -> Vec<JuniperPort> {
    let mut ports: BTreeMap<String, JuniperPort> = BTreeMap::new();

    for line in terse.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 3 || !PORT_RE.is_match(parts[0]) {
            continue;
        }
        ports.insert(
            parts[0].to_string(),
            JuniperPort {
                port: parts[0].to_string(),
                admin_status: parts[1].to_string(),
                link_status: parts[2].to_string(),
                enabled: !parts[1].eq_ignore_ascii_case("down"),
                mode: "unknown".to_string(),
                vlan_members: Vec::new(),
            },
        );
    }

    let mut iface_vlan_map: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for vlan in vlans {
        for iface in &vlan.interfaces {
            iface_vlan_map
                .entry(strip_unit(iface))
                .or_default()
                .push(vlan.name.clone());
        }
    }

    for (port, names) in iface_vlan_map {
        if let Some(p) = ports.get_mut(&port) {
            p.vlan_members = unique(names);
            if p.mode == "unknown" && !p.vlan_members.is_empty() {
                p.mode = "access".to_string();
            }
        }
    }

    for line in config.lines() {
        let trimmed = line.trim();
        if !trimmed.starts_with("set interfaces ") {
            continue;
        }
        let parts: Vec<&str> = trimmed.split_whitespace().collect();
        if parts.len() < 4 || !PORT_RE.is_match(parts[2]) {
            continue;
        }
        if let Some(port) = ports.get_mut(parts[2]) {
            if trimmed == format!("set interfaces {} disable", parts[2]) {
                port.enabled = false;
            }
            if trimmed.contains(" family ethernet-switching port-mode trunk")
                || trimmed.contains(" family ethernet-switching interface-mode trunk")
            {
                port.mode = "trunk".to_string();
            } else if trimmed.contains(" family ethernet-switching port-mode access")
                || trimmed.contains(" family ethernet-switching interface-mode access")
            {
                port.mode = "access".to_string();
            }

            if let Some((_, members_raw)) = trimmed.split_once(" vlan members ") {
                let members = parse_vlan_members(members_raw);
                if !members.is_empty() {
                    for member in members {
                        if !port.vlan_members.contains(&member) {
                            port.vlan_members.push(member);
                        }
                    }
                    if port.mode == "unknown" {
                        port.mode = "access".to_string();
                    }
                }
            }
        }
    }

    ports.into_values().collect()
}

fn normalize_iface_token(token: &str) -> Option<String> {
    let cleaned = token
        .trim_matches(|c: char| c == '[' || c == ']' || c == ',')
        .trim_end_matches('*');
    if IFACE_TOKEN_RE.is_match(cleaned) {
        Some(strip_unit(cleaned))
    } else {
        None
    }
}

fn strip_unit(iface: &str) -> String {
    iface.split('.').next().unwrap_or(iface).to_string()
}

fn parse_vlan_members(raw: &str) -> Vec<String> {
    raw.trim()
        .trim_start_matches('[')
        .trim_end_matches(']')
        .split_whitespace()
        .filter(|part| *part != "[" && *part != "]")
        .map(|part| part.trim_matches(|c: char| c == '[' || c == ']' || c == ','))
        .filter(|part| VLAN_NAME_RE.is_match(part))
        .map(ToString::to_string)
        .collect()
}

fn unique(values: Vec<String>) -> Vec<String> {
    let mut out = Vec::new();
    for value in values {
        if !out.contains(&value) {
            out.push(value);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_ex2200_junos_12_device_info() {
        let output = r#"
Hostname: ex2200-lab
Model: ex2200-24t-4g
JUNOS Base OS boot [12.3R6.6]
JUNOS Base OS Software Suite [12.3R6.6]
JUNOS Kernel Software Suite [12.3R6.6]

Hardware inventory:
Item             Version  Part number  Serial number     Description
Chassis                                CW0212345678      EX2200-24T-4G
FPC 0            REV 15   750-026468   CW0212345678      EX2200-24T-4G

Current time: 2026-06-04 10:30:00 UTC
System booted: 2026-05-01 08:15:00 UTC (4w6d 02:15 ago)
Protocols started: 2026-05-01 08:16:00 UTC (4w6d 02:14 ago)
10:30AM  up 34 days,  2:15, 1 user, load averages: 0.08, 0.05, 0.01
"#;

        let info = parse_info(output, output, output, "10.20.50.2");

        assert_eq!(info.hostname, "ex2200-lab");
        assert_eq!(info.model, "ex2200-24t-4g");
        assert_eq!(info.junos_version, "12.3R6.6");
        assert_eq!(info.serial_number, "CW0212345678");
        assert_eq!(info.uptime, "4w6d 02:15");
        assert_eq!(info.management_ip, "10.20.50.2");
        assert!(info.connected);
    }

    #[test]
    fn parses_modern_junos_device_info_case_insensitively() {
        let version = "hostname: switch-01\nmodel: EX3400-24T\nJunos: 21.4R3-S5.4\n";
        let hardware = "Chassis                                AB1234            EX3400-24T\n";
        let uptime = "System uptime: 12 days, 03:14\n";

        let info = parse_info(version, hardware, uptime, "192.0.2.10");

        assert_eq!(info.hostname, "switch-01");
        assert_eq!(info.model, "EX3400-24T");
        assert_eq!(info.junos_version, "21.4R3-S5.4");
        assert_eq!(info.serial_number, "AB1234");
        assert_eq!(info.uptime, "12 days, 03:14");
    }

    #[test]
    fn parses_port_enabled_state_separately_from_link_state() {
        let terse = r#"
ge-0/0/0                up    down
ge-0/0/1                down  down
"#;
        let config = r#"
set interfaces ge-0/0/0 unit 0 family ethernet-switching vlan members default
set interfaces ge-0/0/1 disable
"#;

        let ports = parse_ports(terse, &[], config);

        assert_eq!(ports.len(), 2);
        assert!(ports[0].enabled);
        assert_eq!(ports[0].link_status, "down");
        assert!(!ports[1].enabled);
    }

    #[test]
    fn builds_bulk_trunk_commands_with_single_commit() {
        let ports = vec!["ge-0/0/1".to_string(), "ge-0/0/2".to_string()];
        let vlans = vec!["VLAN10".to_string(), "VLAN20".to_string()];

        let commands = build_bulk_port_commands(&ports, "trunk", &vlans, Some(true)).unwrap();

        assert_eq!(commands.first().unwrap(), "configure");
        assert_eq!(commands.last().unwrap(), "commit and-quit");
        assert_eq!(
            commands
                .iter()
                .filter(|command| command.as_str() == "commit and-quit")
                .count(),
            1
        );
        assert!(commands.contains(
            &"set interfaces ge-0/0/1 unit 0 family ethernet-switching port-mode trunk".to_string()
        ));
        assert!(commands.contains(
            &"set interfaces ge-0/0/2 unit 0 family ethernet-switching vlan members [ VLAN10 VLAN20 ]"
                .to_string()
        ));
        assert!(commands.contains(&"delete interfaces ge-0/0/2 disable".to_string()));
    }

    #[test]
    fn rejects_multiple_vlans_for_bulk_access_mode() {
        let ports = vec!["ge-0/0/1".to_string()];
        let vlans = vec!["VLAN10".to_string(), "VLAN20".to_string()];

        let error = build_bulk_port_commands(&ports, "access", &vlans, None).unwrap_err();

        assert_eq!(error, "access mode requires exactly one VLAN member");
    }
}
