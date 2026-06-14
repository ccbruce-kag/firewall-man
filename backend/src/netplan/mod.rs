use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::process::Command;

const MAX_SAVED: usize = 3;

#[derive(Clone, Serialize, Deserialize)]
pub struct NetplanConfig {
    pub id: i64,
    pub interface_name: String,
    pub dhcp: bool,
    pub ip_address: Option<String>,
    pub netmask_prefix: Option<u8>,
    pub gateway: Option<String>,
    pub dns_servers: Option<String>,
    pub config_yaml: Option<String>,
    pub created_at: String,
}

#[derive(Clone, Deserialize)]
pub struct NetplanConfigInput {
    pub interface_name: String,
    pub dhcp: bool,
    pub ip_address: Option<String>,
    pub netmask_prefix: Option<u8>,
    pub gateway: Option<String>,
    pub dns_servers: Option<String>,
}

pub fn generate_yaml(input: &NetplanConfigInput) -> String {
    let mut yaml = String::new();
    yaml.push_str("network:\n  version: 2\n  renderer: networkd\n  ethernets:\n");
    yaml.push_str(&format!("    {}:\n", input.interface_name));

    if input.dhcp {
        yaml.push_str("      dhcp4: true\n");
    } else {
        yaml.push_str("      dhcp4: no\n");
        if let Some(ref ip) = input.ip_address {
            let prefix = input.netmask_prefix.unwrap_or(24);
            yaml.push_str(&format!("      addresses:\n        - {}/{}\n", ip, prefix));
        }
        if let Some(ref gw) = input.gateway {
            if !gw.is_empty() {
                yaml.push_str(&format!("      gateway4: {}\n", gw));
            }
        }
        if let Some(ref dns) = input.dns_servers {
            let servers: Vec<&str> = dns.split(|c: char| c == ',' || c == ' ').filter(|s| !s.is_empty()).collect();
            if !servers.is_empty() {
                yaml.push_str("      nameservers:\n        addresses:\n");
                for s in &servers {
                    yaml.push_str(&format!("          - {}\n", s));
                }
            }
        }
    }
    yaml
}

pub async fn list_interfaces() -> Value {
    let output = Command::new("sh")
        .args([
            "-c",
            "ls /sys/class/net/ 2>/dev/null | grep -v lo || ip -o link show | awk -F': ' '{print $2}' | grep -v lo",
        ])
        .output()
        .await;
    match output {
        Ok(out) if out.status.success() => {
            let text = String::from_utf8_lossy(&out.stdout).to_string();
            let ifaces: Vec<&str> = text.split_whitespace().collect();
            json!(ifaces)
        }
        _ => json!([]),
    }
}

pub async fn get_current_config(iface: &str) -> Value {
    let output = Command::new("sh")
        .args([
            "-c",
            &format!("ip addr show {} 2>/dev/null | grep 'inet ' | head -1", iface),
        ])
        .output()
        .await;
    match output {
        Ok(out) if out.status.success() => {
            let line = String::from_utf8_lossy(&out.stdout).to_string();
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 {
                let addr_parts: Vec<&str> = parts[1].split('/').collect();
                let ip = addr_parts.first().unwrap_or(&"").to_string();
                let prefix = addr_parts.get(1).and_then(|s| s.parse::<u8>().ok());
                return json!({
                    "ip_address": ip,
                    "netmask_prefix": prefix,
                });
            }
            json!({})
        }
        _ => json!({}),
    }
}

pub async fn apply_yaml(yaml: &str) -> Result<String, String> {
    // Write temporary file
    let tmp_path = "/tmp/firewall-man-netplan.yaml";
    std::fs::write(tmp_path, yaml)
        .map_err(|e| format!("write netplan temp file failed: {e}"))?;

    // Copy to /etc/netplan/
    let copy = Command::new("sh")
        .args([
            "-c",
            &format!("cp {} /etc/netplan/01-firewall-man.yaml 2>&1", tmp_path),
        ])
        .output()
        .await
        .map_err(|e| format!("copy netplan file failed: {e}"))?;
    if !copy.status.success() {
        let err = String::from_utf8_lossy(&copy.stderr).to_string();
        return Err(format!("copy netplan file failed: {err}"));
    }

    // netplan generate
    let gen = Command::new("netplan")
        .args(["generate"])
        .output()
        .await
        .map_err(|e| format!("netplan generate failed: {e}"))?;
    if !gen.status.success() {
        let err = String::from_utf8_lossy(&gen.stderr).to_string();
        let _ = std::fs::remove_file(tmp_path);
        return Err(format!("netplan generate failed: {err}"));
    }

    // netplan apply
    let apply = Command::new("netplan")
        .args(["apply"])
        .output()
        .await
        .map_err(|e| format!("netplan apply failed: {e}"))?;
    let _ = std::fs::remove_file(tmp_path);

    if !apply.status.success() {
        let err = String::from_utf8_lossy(&apply.stderr).to_string();
        Err(format!("netplan apply failed: {err}"))
    } else {
        let stdout = String::from_utf8_lossy(&apply.stdout).to_string();
        Ok(stdout)
    }
}

pub async fn current_netplan_yaml() -> Result<String, String> {
    let output = Command::new("sh")
        .args([
            "-c",
            "cat /etc/netplan/01-firewall-man.yaml 2>/dev/null || netplan get 2>/dev/null || echo 'No config found'",
        ])
        .output()
        .await
        .map_err(|e| format!("read current netplan config failed: {e}"))?;
    let text = String::from_utf8_lossy(&output.stdout).to_string();
    Ok(text)
}

pub fn prune_old_configs(configs: &[NetplanConfig]) -> Vec<i64> {
    // Return IDs of configs to delete (keep newest MAX_SAVED)
    if configs.len() <= MAX_SAVED {
        return Vec::new();
    }
    let mut sorted = configs.to_vec();
    sorted.sort_by(|a, b| b.id.cmp(&a.id));
    sorted[MAX_SAVED..].iter().map(|c| c.id).collect()
}
