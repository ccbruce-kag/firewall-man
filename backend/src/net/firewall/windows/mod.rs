use async_trait::async_trait;

use crate::firewall::FirewallCmd;
use crate::iptables::types::{Column, SystemTable, SystemTitle, TableListData};
use crate::utils;
use tokio::process::Command;

pub struct WindowsCmd {
    binary: String,
}

impl WindowsCmd {
    pub fn new() -> Self {
        WindowsCmd {
            binary: "powershell.exe".to_string(),
        }
    }

    async fn run_powershell(&self, script: &str) -> Result<String, String> {
        let output = Command::new(&self.binary)
            .args(["-NoProfile", "-NonInteractive", "-Command", script])
            .output()
            .await
            .map_err(|e| format!("exec: powershell err: {}", e))?;
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("powershell err: {}", stderr.trim()));
        }
        Ok(stdout)
    }
}

impl Default for WindowsCmd {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl FirewallCmd for WindowsCmd {
    async fn version(&self) -> Result<String, String> {
        let v = self
            .run_powershell("$PSVersionTable.PSVersion.ToString()")
            .await?;
        Ok(format!("PowerShell {}", v.trim()))
    }

    async fn list_rule(&self, _table: &str, _chain: &str) -> Result<TableListData, String> {
        let script = r#"
$rules = Get-NetFirewallRule
$i = 1
$rules | ForEach-Object {
    $addr = $_ | Get-NetFirewallAddressFilter -ErrorAction SilentlyContinue
    $port = $_ | Get-NetFirewallPortFilter -ErrorAction SilentlyContinue
    $la = if ($addr) { ($addr.LocalAddress -join ',') } else { 'Any' }
    $ra = if ($addr) { ($addr.RemoteAddress -join ',') } else { 'Any' }
    $lp = if ($port) { ($port.LocalPort -join ',') } else { 'Any' }
    $rp = if ($port) { ($port.RemotePort -join ',') } else { 'Any' }
    "$i|$($_.Direction)|$($_.Action)|$($_.Enabled)|$($_.Profile)|$($_.Protocol)|$lp|$rp|$la|$ra|$($_.DisplayName)"
    $i++
}
"#;
        let output = self.run_powershell(script).await?;
        let mut columns = Vec::new();

        for line in output.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            let parts: Vec<&str> = trimmed.split('|').collect();
            if parts.len() < 11 {
                continue;
            }
            columns.push(Column {
                num: parts[0].to_string(),
                pkts: "0".to_string(),
                bytes: "0".to_string(),
                target: parts[2].to_string(),
                prot: parts[5].to_string(),
                opt: parts[1].to_string(),
                r#in: parts[8].to_string(),
                out: parts[9].to_string(),
                source: parts[8].to_string(),
                destination: parts[9].to_string(),
                action: parts[10].to_string(),
            });
        }

        Ok(TableListData {
            system: vec![SystemTable {
                title: SystemTitle {
                    chain: "WindowsFirewall".to_string(),
                    policy: "default".to_string(),
                    packets: "0".to_string(),
                    bytes: "0".to_string(),
                },
                list: columns,
            }],
            custom: Vec::new(),
        })
    }

    async fn list_exec(&self, _table: &str, _chain: &str) -> Result<String, String> {
        self.run_powershell("Get-NetFirewallRule | Format-List")
            .await
    }

    async fn flush_rule(&self, _table: &str, _chain: &str) -> Result<(), String> {
        Err("Windows 防火牆不支援 flush，請使用 Remove-NetFirewallRule 逐一刪除規則。".to_string())
    }

    async fn delete_rule(&self, _table: &str, _chain: &str, id: &str) -> Result<(), String> {
        let idx: usize = id.parse().map_err(|_| format!("invalid rule id: {}", id))?;
        if idx == 0 {
            return Err("rule id must be >= 1".to_string());
        }
        let script = format!(
            "Get-NetFirewallRule | Select-Object -Index {} | Remove-NetFirewallRule",
            idx - 1
        );
        self.run_powershell(&script).await?;
        Ok(())
    }

    async fn flush_metrics(&self, _table: &str, _chain: &str, _id: &str) -> Result<(), String> {
        Err("Windows 防火牆不支援計數器清零。".to_string())
    }

    async fn get_rule_info(&self, _table: &str, _chain: &str, id: &str) -> Result<String, String> {
        let idx: usize = id.parse().map_err(|_| format!("invalid rule id: {}", id))?;
        if idx == 0 {
            return Err("rule id must be >= 1".to_string());
        }
        let script = format!(
            "Get-NetFirewallRule | Select-Object -Index {} | Format-List",
            idx - 1
        );
        self.run_powershell(&script).await
    }

    async fn flush_empty_custom_chain(&self) -> Result<(), String> {
        Err("Windows 防火牆不支援自定義鏈。".to_string())
    }

    async fn export_rules(&self, _table: &str, _chain: &str) -> Result<String, String> {
        self.run_powershell("Get-NetFirewallRule | Format-List")
            .await
    }

    async fn import_rules(&self, rule: &str) -> Result<(), String> {
        if rule.is_empty() {
            return Ok(());
        }
        let tmp_dir = std::env::temp_dir();
        let tmp_path = tmp_dir.join(format!("win-fw-{}.ps1", utils::generate_uuid()));
        tokio::fs::write(&tmp_path, rule)
            .await
            .map_err(|e| format!("import rule write error: {}", e))?;
        let output = Command::new(&self.binary)
            .args([
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                tmp_path.to_str().unwrap(),
            ])
            .output()
            .await
            .map_err(|e| format!("exec powershell err: {}", e))?;
        let _ = tokio::fs::remove_file(&tmp_path).await;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("import rule error: {}", stderr.trim()));
        }
        Ok(())
    }

    async fn exec(&self, params: &[String]) -> Result<String, String> {
        if params.is_empty() {
            return Ok(String::new());
        }
        let script = params.join(" ");
        self.run_powershell(&script).await
    }
}
