use async_trait::async_trait;

use crate::firewall::FirewallCmd;
use crate::iptables::types::{Column, SystemTable, SystemTitle, TableListData};
use crate::utils;
use tokio::process::Command;

pub struct PfctlCmd {
    binary: String,
}

impl PfctlCmd {
    pub fn new() -> Self {
        PfctlCmd {
            binary: "pfctl".to_string(),
        }
    }

    async fn run_pfctl(&self, args: &[&str]) -> Result<String, String> {
        let output = Command::new(&self.binary)
            .args(args)
            .output()
            .await
            .map_err(|e| format!("exec: [{} {}] err: {}", self.binary, args.join(" "), e))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!(
                "exec: [{} {}] err: {}",
                self.binary,
                args.join(" "),
                stderr.trim()
            ));
        }
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    }
}

impl Default for PfctlCmd {
    fn default() -> Self {
        Self::new()
    }
}

fn parse_rule_line(line: &str, index: usize, section: &str) -> Column {
    let line = line.trim();
    let has_counters = line.contains("[ Evaluations:");
    let (rule_text, pkts_str, bytes_str) = if has_counters {
        if let Some(pos) = line.rfind("[ Evaluations:") {
            let text = line[..pos].trim();
            let meta = &line[pos..];
            let pkts = extract_counter(meta, "Packets:");
            let bytes = extract_counter(meta, "Bytes:");
            (text, pkts, bytes)
        } else {
            (line, "0".to_string(), "0".to_string())
        }
    } else {
        (line, "0".to_string(), "0".to_string())
    };

    let prot = if rule_text.contains("proto tcp") {
        "tcp"
    } else if rule_text.contains("proto udp") {
        "udp"
    } else if rule_text.contains("proto icmp") {
        "icmp"
    } else {
        "all"
    };

    let iface = if let Some(pos) = rule_text.find(" on ") {
        let rest = &rule_text[pos + 4..];
        let if_end = rest.find(|c: char| c.is_whitespace()).unwrap_or(rest.len());
        rest[..if_end].to_string()
    } else {
        String::new()
    };

    let source = if let Some(pos) = rule_text.find(" from ") {
        let rest = &rule_text[pos + 6..];
        if let Some(to_pos) = rest.find(" to ") {
            rest[..to_pos].trim().to_string()
        } else if let Some(end_pos) = rest.find(|c: char| c == '[' || c == '#') {
            rest[..end_pos].trim().to_string()
        } else {
            rest.trim().to_string()
        }
    } else {
        String::new()
    };

    let destination = if let Some(pos) = rule_text.find(" to ") {
        let rest = &rule_text[pos + 4..];
        if let Some(end_pos) = rest.find(|c: char| c == '[' || c == '#') {
            rest[..end_pos].trim().to_string()
        } else {
            rest.trim().to_string()
        }
    } else {
        String::new()
    };

    Column {
        num: (index + 1).to_string(),
        pkts: pkts_str,
        bytes: bytes_str,
        target: section.to_string(),
        prot: prot.to_string(),
        opt: "--".to_string(),
        r#in: iface.clone(),
        out: iface,
        source,
        destination,
        action: rule_text.to_string(),
    }
}

fn extract_counter(text: &str, key: &str) -> String {
    if let Some(pos) = text.find(key) {
        let rest = &text[pos + key.len()..].trim();
        let val_end = rest.find(char::is_whitespace).unwrap_or(rest.len());
        rest[..val_end].trim().to_string()
    } else {
        "0".to_string()
    }
}

#[async_trait]
impl FirewallCmd for PfctlCmd {
    async fn version(&self) -> Result<String, String> {
        match self.run_pfctl(&["-v"]).await {
            Ok(v) => {
                let first = v.lines().next().unwrap_or("pfctl").to_string();
                Ok(first)
            }
            Err(_) => Ok("pfctl (macOS Packet Filter)".to_string()),
        }
    }

    async fn list_rule(&self, _table: &str, _chain: &str) -> Result<TableListData, String> {
        let output = self.run_pfctl(&["-s", "rules", "-v"]).await?;
        let lines: Vec<&str> = output.lines().collect();

        let mut columns = Vec::new();
        let mut current_section = "rule";
        let mut has_any_rule = false;

        for (i, line) in lines.iter().enumerate() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            if trimmed.ends_with("Rules:") || trimmed == "Scrub Rules:" {
                current_section = trimmed.trim_end_matches(':');
                continue;
            }
            if trimmed.starts_with("Anchor") || trimmed.starts_with("anchor") {
                continue;
            }
            if trimmed.starts_with("No ") {
                continue;
            }
            if trimmed.starts_with("(") {
                continue;
            }

            has_any_rule = true;
            columns.push(parse_rule_line(line, i, current_section));
        }

        let mut system = Vec::new();
        system.push(SystemTable {
            title: SystemTitle {
                chain: "pf".to_string(),
                policy: "pass".to_string(),
                packets: "0".to_string(),
                bytes: "0".to_string(),
            },
            list: columns,
        });

        if !has_any_rule {
            system[0].title.policy = "default".to_string();
        }

        Ok(TableListData {
            system,
            custom: Vec::new(),
        })
    }

    async fn list_exec(&self, table: &str, _chain: &str) -> Result<String, String> {
        if table.is_empty() || table == "filter" {
            self.run_pfctl(&["-s", "all"]).await
        } else {
            Ok(format!("pfctl does not support table '{}'", table))
        }
    }

    async fn flush_rule(&self, _table: &str, _chain: &str) -> Result<(), String> {
        Err(
            "flush rule is not supported on pfctl. Use pfctl -f to reload rules from file."
                .to_string(),
        )
    }

    async fn delete_rule(&self, _table: &str, _chain: &str, _id: &str) -> Result<(), String> {
        Err("delete rule by id is not supported on pfctl".to_string())
    }

    async fn flush_metrics(&self, _table: &str, _chain: &str, _id: &str) -> Result<(), String> {
        Err("flush metrics is not supported on pfctl".to_string())
    }

    async fn get_rule_info(&self, _table: &str, _chain: &str, id: &str) -> Result<String, String> {
        let output = self.run_pfctl(&["-s", "all"]).await?;
        let lines: Vec<&str> = output.lines().collect();
        let id_int: usize = id.parse().map_err(|_| format!("invalid id: {}", id))?;
        let mut rule_idx = 0;
        for line in &lines {
            let trimmed = line.trim();
            if trimmed.is_empty()
                || trimmed.ends_with("Rules:")
                || trimmed == "Scrub Rules:"
                || trimmed.starts_with("Anchor")
                || trimmed.starts_with("No ")
                || trimmed.starts_with("(")
            {
                continue;
            }
            rule_idx += 1;
            if rule_idx == id_int {
                return Ok(trimmed.to_string());
            }
        }
        Err(format!("rule #{} not found", id))
    }

    async fn flush_empty_custom_chain(&self) -> Result<(), String> {
        Err("custom chains are not supported on pfctl".to_string())
    }

    async fn export_rules(&self, _table: &str, _chain: &str) -> Result<String, String> {
        self.run_pfctl(&["-s", "all"]).await
    }

    async fn import_rules(&self, rule: &str) -> Result<(), String> {
        if rule.is_empty() {
            return Ok(());
        }
        let tmp_dir = std::env::temp_dir();
        let tmp_path = tmp_dir.join(format!("pf-rule-{}.tmp", utils::generate_uuid()));
        tokio::fs::write(&tmp_path, rule)
            .await
            .map_err(|e| format!("import rule write error: {}", e))?;
        let result = self.run_pfctl(&["-f", tmp_path.to_str().unwrap()]).await;
        let _ = tokio::fs::remove_file(&tmp_path).await;
        result?;
        Ok(())
    }

    async fn exec(&self, params: &[String]) -> Result<String, String> {
        let args: Vec<&str> = params
            .iter()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .collect();
        if args.is_empty() {
            return Ok(String::new());
        }
        self.run_pfctl(&args).await
    }
}
