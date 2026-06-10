use crate::db::HaproxyLoadBalancerSettings;
use chrono::Utc;
use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tokio::net::TcpStream;
use tokio::process::Command;
use tokio::time::timeout;
use uuid::Uuid;

static NAME_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"^[A-Za-z][A-Za-z0-9_-]{0,63}$").unwrap());
static HOST_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,254}$").unwrap());
static URL_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"^https?://[^\s/$.?#].[^\s]*$").unwrap());

#[derive(Clone)]
pub struct HaproxyClient {
    config_path: PathBuf,
}

#[derive(Serialize)]
pub struct HaproxyStatus {
    pub installed: bool,
    pub service_status: String,
    pub config_path: String,
    pub config_exists: bool,
    pub config_valid: bool,
    pub version: String,
    pub status_output: String,
    pub validation_output: String,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct BackendServer {
    pub name: String,
    pub ip: String,
    pub port: u16,
    pub health_check: Option<bool>,
}

#[derive(Serialize)]
pub struct HaproxyConfigPreview {
    pub config: String,
}

#[derive(Serialize)]
pub struct HaproxyCommandResult {
    pub success: bool,
    pub output: String,
}

#[derive(Serialize)]
pub struct HaproxyApplyResult {
    pub success: bool,
    pub backup_path: Option<String>,
    pub validation_output: String,
    pub reload_output: String,
}

#[derive(Serialize)]
pub struct HaproxyWebTestResponse {
    pub success: bool,
    pub results: Vec<HaproxyWebTestResult>,
}

#[derive(Serialize)]
pub struct HaproxyWebTestResult {
    pub index: u16,
    pub status: Option<u16>,
    pub body: String,
    pub success: bool,
    pub response_time_ms: u128,
    pub error: Option<String>,
}

#[derive(Serialize)]
pub struct HaproxyTcpTestResponse {
    pub success: bool,
    pub results: Vec<HaproxyTcpTestResult>,
}

#[derive(Serialize)]
pub struct HaproxyTcpTestResult {
    pub index: u16,
    pub host: String,
    pub port: u16,
    pub connected: bool,
    pub response_time_ms: u128,
    pub error: Option<String>,
}

impl HaproxyClient {
    pub fn from_env() -> Self {
        let config_path = std::env::var("HAPROXY_CONFIG_PATH")
            .ok()
            .filter(|v| !v.trim().is_empty())
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("/etc/haproxy/haproxy.cfg"));
        Self { config_path }
    }

    pub async fn status(&self) -> HaproxyStatus {
        let version_result = run_command("haproxy", &["-v"]).await;
        let installed = version_result.is_ok();
        let version = version_result
            .as_ref()
            .map(|out| first_line(out))
            .unwrap_or_else(|err| err.clone());

        let service = run_command("systemctl", &["is-active", "haproxy"]).await;
        let service_status = service
            .as_ref()
            .map(|out| out.trim().to_string())
            .unwrap_or_else(|err| format!("unknown ({err})"));

        let status_output = run_command("systemctl", &["status", "haproxy", "--no-pager"])
            .await
            .unwrap_or_else(|err| err);

        let validation = self.validate_existing_config().await;
        let (config_valid, validation_output) = match validation {
            Ok(output) => (true, output),
            Err(err) => (false, err),
        };

        HaproxyStatus {
            installed,
            service_status,
            config_path: self.config_path.display().to_string(),
            config_exists: self.config_path.exists(),
            config_valid,
            version,
            status_output,
            validation_output,
        }
    }

    pub async fn reload(&self) -> Result<HaproxyCommandResult, String> {
        let validation = self.validate_existing_config().await?;
        let output = run_command("systemctl", &["reload", "haproxy"]).await?;
        Ok(HaproxyCommandResult {
            success: true,
            output: format!("{validation}\n{output}"),
        })
    }

    pub async fn restart(&self) -> Result<HaproxyCommandResult, String> {
        let validation = self.validate_existing_config().await?;
        let output = run_command("systemctl", &["restart", "haproxy"]).await?;
        Ok(HaproxyCommandResult {
            success: true,
            output: format!("{validation}\n{output}"),
        })
    }

    pub async fn read_config(&self) -> Result<String, String> {
        tokio::fs::read_to_string(&self.config_path)
            .await
            .map_err(|e| format!("read HAProxy config failed: {e}"))
    }

    pub async fn test_web_url(
        &self,
        url: &str,
        count: u16,
    ) -> Result<HaproxyWebTestResponse, String> {
        validate_url(url)?;
        let count = validate_count(count)?;
        let mut results = Vec::new();
        for index in 1..=count {
            results.push(run_curl_test(index, url, 5).await);
        }
        Ok(HaproxyWebTestResponse {
            success: results.iter().all(|result| result.success),
            results,
        })
    }

    pub async fn test_tcp_target(
        &self,
        host: &str,
        port: u16,
        count: u16,
        timeout_secs: u64,
    ) -> Result<HaproxyTcpTestResponse, String> {
        validate_host(host)?;
        validate_port(port, "TCP port")?;
        let count = validate_count(count)?;
        let timeout_secs = validate_timeout(timeout_secs)?;
        let mut results = Vec::new();
        for index in 1..=count {
            results.push(run_tcp_test(index, host, port, timeout_secs).await);
        }
        Ok(HaproxyTcpTestResponse {
            success: results.iter().all(|result| result.connected),
            results,
        })
    }

    pub async fn validate_config_text(&self, config: &str) -> Result<String, String> {
        let tmp_path =
            std::env::temp_dir().join(format!("firewall-man-haproxy-{}.cfg", Uuid::new_v4()));
        tokio::fs::write(&tmp_path, config)
            .await
            .map_err(|e| format!("write temporary HAProxy config failed: {e}"))?;
        let result = run_command("haproxy", &["-c", "-f", path_str(&tmp_path)?]).await;
        let _ = tokio::fs::remove_file(&tmp_path).await;
        result
    }

    pub async fn apply_config(&self, config: &str) -> Result<HaproxyApplyResult, String> {
        let preview_validation = self.validate_config_text(config).await?;
        if let Some(parent) = self.config_path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| format!("create HAProxy config directory failed: {e}"))?;
        }

        let backup_path = if self.config_path.exists() {
            let backup = backup_path(&self.config_path);
            tokio::fs::copy(&self.config_path, &backup)
                .await
                .map_err(|e| format!("backup HAProxy config failed: {e}"))?;
            Some(backup)
        } else {
            None
        };

        tokio::fs::write(&self.config_path, config)
            .await
            .map_err(|e| format!("write HAProxy config failed: {e}"))?;

        let validation_output = match self.validate_existing_config().await {
            Ok(output) => output,
            Err(err) => {
                restore_backup(&self.config_path, backup_path.as_deref()).await;
                return Err(format!(
                    "HAProxy validation failed after write; config was restored when possible.\n{err}"
                ));
            }
        };

        let reload_output = match run_command("systemctl", &["reload", "haproxy"]).await {
            Ok(output) => output,
            Err(err) => {
                return Err(format!(
                    "HAProxy config validated but reload failed.\nValidation before write:\n{preview_validation}\nValidation after write:\n{validation_output}\nReload error:\n{err}"
                ));
            }
        };

        Ok(HaproxyApplyResult {
            success: true,
            backup_path: backup_path.map(|p| p.display().to_string()),
            validation_output,
            reload_output,
        })
    }

    pub fn build_web_config(
        &self,
        name: &str,
        bind_port: u16,
        balance_method: &str,
        health_check_path: &str,
        servers: &[BackendServer],
    ) -> Result<HaproxyConfigPreview, String> {
        validate_lb(name, bind_port, balance_method, servers)?;
        let frontend = format!("{name}_front");
        let backend = format!("{name}_back");
        let health_path = if health_check_path.trim().is_empty() {
            "/"
        } else {
            health_check_path.trim()
        };
        if !health_path.starts_with('/') {
            return Err("health check path must start with /".to_string());
        }

        let mut config = base_config("http");
        config.push_str(&format!(
            "\nfrontend {frontend}\n    bind *:{bind_port}\n    mode http\n    default_backend {backend}\n\nbackend {backend}\n    mode http\n    balance {balance_method}\n"
        ));
        if servers
            .iter()
            .any(|server| server.health_check.unwrap_or(true))
        {
            config.push_str(&format!("    option httpchk GET {health_path}\n"));
        }
        for server in servers {
            config.push_str(&server_line(server));
        }
        Ok(HaproxyConfigPreview { config })
    }

    pub fn build_sql_config(
        &self,
        name: &str,
        bind_port: u16,
        balance_method: &str,
        health_check: bool,
        servers: &[BackendServer],
    ) -> Result<HaproxyConfigPreview, String> {
        validate_lb(name, bind_port, balance_method, servers)?;
        let frontend = format!("{name}_front");
        let backend = format!("{name}_back");
        let mut config = base_config("tcp");
        config.push_str(&format!(
            "\nfrontend {frontend}\n    bind *:{bind_port}\n    mode tcp\n    default_backend {backend}\n\nbackend {backend}\n    mode tcp\n    balance {balance_method}\n"
        ));
        if health_check {
            config.push_str("    option tcp-check\n");
        }
        for server in servers {
            config.push_str(&server_line(server));
        }
        Ok(HaproxyConfigPreview { config })
    }

    pub fn build_managed_config(
        &self,
        lbs: &[HaproxyLoadBalancerSettings],
    ) -> Result<HaproxyConfigPreview, String> {
        let mut config = base_config_without_mode();
        let enabled_lbs: Vec<_> = lbs.iter().filter(|lb| lb.enabled).collect();
        if enabled_lbs.is_empty() {
            config.push_str("\n# No managed load balancers are currently configured.\n");
            config.push_str(
                "# HAProxy requires at least one listener, so Firewall-Man keeps this local-only placeholder.\n",
            );
            config.push_str("frontend firewall_man_placeholder\n");
            config.push_str("    bind 127.0.0.1:65535\n");
            config.push_str("    mode tcp\n");
            config.push_str("    tcp-request connection reject\n");
            return Ok(HaproxyConfigPreview { config });
        }
        for lb in enabled_lbs {
            let servers: Vec<BackendServer> = lb
                .servers
                .iter()
                .map(|server| BackendServer {
                    name: server.name.clone(),
                    ip: server.ip.clone(),
                    port: server.port,
                    health_check: Some(server.health_check),
                })
                .collect();
            validate_lb(&lb.name, lb.bind_port, &lb.balance_method, &servers)?;
            let frontend = format!("{}_front", lb.name);
            let backend = format!("{}_back", lb.name);
            match lb.lb_type.as_str() {
                "web" => {
                    let health_path = lb.health_check_path.as_deref().unwrap_or("/");
                    if !health_path.starts_with('/') {
                        return Err(format!(
                            "health check path for {} must start with /",
                            lb.name
                        ));
                    }
                    config.push_str(&format!(
                        "\nfrontend {frontend}\n    bind *:{}\n    mode http\n    default_backend {backend}\n\nbackend {backend}\n    mode http\n    balance {}\n",
                        lb.bind_port, lb.balance_method
                    ));
                    if servers
                        .iter()
                        .any(|server| server.health_check.unwrap_or(true))
                    {
                        config.push_str(&format!("    option httpchk GET {health_path}\n"));
                    }
                }
                "sql" => {
                    config.push_str(&format!(
                        "\nfrontend {frontend}\n    bind *:{}\n    mode tcp\n    default_backend {backend}\n\nbackend {backend}\n    mode tcp\n    balance {}\n",
                        lb.bind_port, lb.balance_method
                    ));
                    if lb.health_check {
                        config.push_str("    option tcp-check\n");
                    }
                }
                _ => {
                    return Err(format!(
                        "unsupported HAProxy load balancer type: {}",
                        lb.lb_type
                    ))
                }
            }
            for server in &servers {
                config.push_str(&server_line(server));
            }
        }
        Ok(HaproxyConfigPreview { config })
    }

    async fn validate_existing_config(&self) -> Result<String, String> {
        run_command("haproxy", &["-c", "-f", path_str(&self.config_path)?]).await
    }
}

fn base_config(mode: &str) -> String {
    format!(
        "global\n    log /dev/log local0\n    log /dev/log local1 notice\n    daemon\n    maxconn 4096\n\ndefaults\n    log global\n    mode {mode}\n    option dontlognull\n    timeout connect 5s\n    timeout client 50s\n    timeout server 50s\n"
    )
}

fn base_config_without_mode() -> String {
    "global\n    log /dev/log local0\n    log /dev/log local1 notice\n    daemon\n    maxconn 4096\n\ndefaults\n    log global\n    option dontlognull\n    timeout connect 5s\n    timeout client 50s\n    timeout server 50s\n".to_string()
}

fn server_line(server: &BackendServer) -> String {
    let check = if server.health_check.unwrap_or(true) {
        " check"
    } else {
        ""
    };
    format!(
        "    server {} {}:{}{}\n",
        server.name, server.ip, server.port, check
    )
}

fn validate_lb(
    name: &str,
    bind_port: u16,
    balance_method: &str,
    servers: &[BackendServer],
) -> Result<(), String> {
    validate_name(name, "frontend name")?;
    validate_port(bind_port, "listen port")?;
    if !matches!(balance_method, "roundrobin" | "leastconn" | "source") {
        return Err("invalid balance method".to_string());
    }
    if servers.is_empty() {
        return Err("at least one backend server is required".to_string());
    }
    for server in servers {
        validate_name(&server.name, "server name")?;
        validate_host(&server.ip)?;
        validate_port(server.port, "server port")?;
    }
    Ok(())
}

fn validate_url(value: &str) -> Result<(), String> {
    if value.len() > 2048 || !URL_RE.is_match(value) {
        return Err("invalid target URL".to_string());
    }
    Ok(())
}

fn validate_host(value: &str) -> Result<(), String> {
    if value.trim().is_empty()
        || value.len() > 255
        || value.contains('/')
        || value
            .chars()
            .any(|ch| ch.is_control() || ch.is_whitespace())
        || !HOST_RE.is_match(value)
    {
        return Err(format!("invalid host: {value}"));
    }
    Ok(())
}

fn validate_count(count: u16) -> Result<u16, String> {
    if count == 0 || count > 50 {
        return Err("test count must be between 1 and 50".to_string());
    }
    Ok(count)
}

fn validate_timeout(timeout_secs: u64) -> Result<u64, String> {
    if timeout_secs == 0 || timeout_secs > 30 {
        return Err("timeout must be between 1 and 30 seconds".to_string());
    }
    Ok(timeout_secs)
}

fn validate_name(value: &str, label: &str) -> Result<(), String> {
    if NAME_RE.is_match(value) {
        Ok(())
    } else {
        Err(format!("invalid {label}"))
    }
}

fn validate_port(port: u16, label: &str) -> Result<(), String> {
    if port > 0 {
        Ok(())
    } else {
        Err(format!("invalid {label}"))
    }
}

fn backup_path(path: &Path) -> PathBuf {
    let ts = Utc::now().format("%Y%m%d%H%M%S");
    PathBuf::from(format!("{}.bak-{ts}", path.display()))
}

async fn restore_backup(config_path: &Path, backup_path: Option<&Path>) {
    if let Some(backup) = backup_path {
        let _ = tokio::fs::copy(backup, config_path).await;
    } else {
        let _ = tokio::fs::remove_file(config_path).await;
    }
}

fn path_str(path: &Path) -> Result<&str, String> {
    path.to_str()
        .ok_or_else(|| format!("invalid path encoding: {}", path.display()))
}

fn first_line(text: &str) -> String {
    text.lines().next().unwrap_or("").trim().to_string()
}

async fn run_curl_test(index: u16, url: &str, timeout_secs: u64) -> HaproxyWebTestResult {
    let started = Instant::now();
    let timeout_arg = timeout_secs.to_string();
    let output = Command::new("curl")
        .args([
            "-sS",
            "-L",
            "--max-time",
            &timeout_arg,
            "-w",
            "\n__FWM_HTTP_CODE:%{http_code}",
            url,
        ])
        .output()
        .await;
    let response_time_ms = started.elapsed().as_millis();

    match output {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let (body, status) = parse_curl_output(&stdout);
            let success = output.status.success()
                && status
                    .map(|code| (200..400).contains(&code))
                    .unwrap_or(false);
            HaproxyWebTestResult {
                index,
                status,
                body: truncate_chars(body.trim(), 200),
                success,
                response_time_ms,
                error: if success {
                    None
                } else if stderr.is_empty() {
                    Some(format!("curl exited with status {}", output.status))
                } else {
                    Some(stderr)
                },
            }
        }
        Err(e) => HaproxyWebTestResult {
            index,
            status: None,
            body: String::new(),
            success: false,
            response_time_ms,
            error: Some(format!("failed to run curl: {e}")),
        },
    }
}

async fn run_tcp_test(
    index: u16,
    host: &str,
    port: u16,
    timeout_secs: u64,
) -> HaproxyTcpTestResult {
    let started = Instant::now();
    let result = timeout(
        Duration::from_secs(timeout_secs),
        TcpStream::connect((host, port)),
    )
    .await;
    let response_time_ms = started.elapsed().as_millis();

    match result {
        Ok(Ok(_stream)) => HaproxyTcpTestResult {
            index,
            host: host.to_string(),
            port,
            connected: true,
            response_time_ms,
            error: None,
        },
        Ok(Err(e)) => HaproxyTcpTestResult {
            index,
            host: host.to_string(),
            port,
            connected: false,
            response_time_ms,
            error: Some(e.to_string()),
        },
        Err(_) => HaproxyTcpTestResult {
            index,
            host: host.to_string(),
            port,
            connected: false,
            response_time_ms,
            error: Some(format!("connection timed out after {timeout_secs}s")),
        },
    }
}

fn parse_curl_output(output: &str) -> (&str, Option<u16>) {
    const MARKER: &str = "\n__FWM_HTTP_CODE:";
    if let Some(pos) = output.rfind(MARKER) {
        let body = &output[..pos];
        let code = output[pos + MARKER.len()..].trim().parse::<u16>().ok();
        (body, code)
    } else {
        (output, None)
    }
}

fn truncate_chars(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}

async fn run_command(program: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new(program)
        .args(args)
        .output()
        .await
        .map_err(|e| format!("failed to run {program}: {e}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let combined = match (stdout.trim().is_empty(), stderr.trim().is_empty()) {
        (true, true) => String::new(),
        (false, true) => stdout,
        (true, false) => stderr,
        (false, false) => format!("{stdout}\n{stderr}"),
    };
    if output.status.success() {
        Ok(combined)
    } else {
        Err(combined.trim().to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn servers() -> Vec<BackendServer> {
        vec![
            BackendServer {
                name: "web1".to_string(),
                ip: "10.20.50.101".to_string(),
                port: 80,
                health_check: Some(true),
            },
            BackendServer {
                name: "web2".to_string(),
                ip: "10.20.50.102".to_string(),
                port: 80,
                health_check: Some(true),
            },
        ]
    }

    #[test]
    fn builds_web_haproxy_config() {
        let client = HaproxyClient::from_env();
        let preview = client
            .build_web_config("web", 8080, "roundrobin", "/", &servers())
            .unwrap();

        assert!(preview.config.contains("frontend web_front"));
        assert!(preview.config.contains("bind *:8080"));
        assert!(preview.config.contains("mode http"));
        assert!(preview.config.contains("option httpchk GET /"));
        assert!(preview.config.contains("server web1 10.20.50.101:80 check"));
    }

    #[test]
    fn builds_sql_haproxy_config_with_tcp_check() {
        let client = HaproxyClient::from_env();
        let sql_servers = vec![BackendServer {
            name: "sql1".to_string(),
            ip: "10.20.50.201".to_string(),
            port: 1433,
            health_check: Some(true),
        }];
        let preview = client
            .build_sql_config("msql", 1433, "source", true, &sql_servers)
            .unwrap();

        assert!(preview.config.contains("frontend msql_front"));
        assert!(preview.config.contains("mode tcp"));
        assert!(preview.config.contains("balance source"));
        assert!(preview.config.contains("option tcp-check"));
        assert!(!preview.config.contains("option httpchk"));
    }

    #[test]
    fn managed_config_with_no_lbs_keeps_placeholder_listener() {
        let client = HaproxyClient::from_env();
        let preview = client.build_managed_config(&[]).unwrap();

        assert!(preview.config.contains("frontend firewall_man_placeholder"));
        assert!(preview.config.contains("bind 127.0.0.1:65535"));
        assert!(preview.config.contains("tcp-request connection reject"));
    }
}
