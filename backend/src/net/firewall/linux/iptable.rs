use async_trait::async_trait;

use crate::firewall::FirewallCmd;
use crate::iptables::{
    parse_column, parse_custom_title, parse_system_title, CustomTable, Protocol, SystemTable,
    TableListData,
};
use crate::utils;
use tokio::process::Command;

pub struct IptablesCmd {
    binary: String,
    save_binary: String,
    restore_binary: String,
    #[allow(dead_code)]
    pub protocol: Protocol,
}

impl IptablesCmd {
    pub fn new(protocol: Protocol) -> Self {
        IptablesCmd {
            binary: protocol.binary_name().to_string(),
            save_binary: protocol.save_binary_name().to_string(),
            restore_binary: protocol.restore_binary_name().to_string(),
            protocol,
        }
    }

    #[allow(dead_code)]
    pub fn with_binary(mut self, cmd: &str) -> Self {
        self.binary = cmd.to_string();
        self
    }

    #[allow(dead_code)]
    pub fn with_save_binary(mut self, cmd: &str) -> Self {
        self.save_binary = cmd.to_string();
        self
    }

    #[allow(dead_code)]
    pub fn with_restore_binary(mut self, cmd: &str) -> Self {
        self.restore_binary = cmd.to_string();
        self
    }

    pub fn new_ipv4() -> Self {
        IptablesCmd::new(Protocol::IPv4)
    }

    pub fn new_ipv6() -> Self {
        IptablesCmd::new(Protocol::IPv6)
    }

    async fn run_iptables(&self, args: &[&str]) -> Result<String, String> {
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

    async fn run_iptables_save(&self, args: &[&str]) -> Result<String, String> {
        let output = Command::new(&self.save_binary)
            .args(args)
            .output()
            .await
            .map_err(|e| format!("exec: [{} {}] err: {}", self.save_binary, args.join(" "), e))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!(
                "exec: [{} {}] err: {}",
                self.save_binary,
                args.join(" "),
                stderr.trim()
            ));
        }
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    }

    async fn run_iptables_restore(&self, file_name: &str) -> Result<String, String> {
        let output = Command::new(&self.restore_binary)
            .arg(file_name)
            .output()
            .await
            .map_err(|e| format!("exec: [{} {}] err: {}", self.restore_binary, file_name, e))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!(
                "exec: [{} {}] err: {}",
                self.restore_binary,
                file_name,
                stderr.trim()
            ));
        }
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    }

    // ---- Public API ----

    pub async fn version(&self) -> Result<String, String> {
        self.run_iptables(&["--version"]).await
    }

    pub async fn list_rule(&self, table: &str, chain: &str) -> Result<TableListData, String> {
        let tbl = if table.is_empty() { "filter" } else { table };
        let str = if chain.is_empty() {
            self.run_iptables(&["-t", tbl, "-nvL", "--line-numbers"])
                .await?
        } else {
            self.run_iptables(&["-t", tbl, "-L", chain, "-nv", "--line-numbers"])
                .await?
        };

        let mut tl = TableListData {
            system: Vec::new(),
            custom: Vec::new(),
        };

        let chains = utils::split_and_trim_space(&str, "\n\n");
        for chain_str in &chains {
            let chain_list = utils::split_and_trim_space(chain_str, "\n");
            if chain_list.is_empty() {
                continue;
            }
            let mut column = Vec::new();
            if chain_list.len() > 2 {
                column = parse_column(&chain_list[2..]).map_err(|e| {
                    tracing::warn!("{}", e);
                    e
                })?;
            }

            if let Ok(stitle) = parse_system_title(&chain_list[0]) {
                tl.system.push(SystemTable {
                    title: stitle,
                    list: column,
                });
            } else if let Ok(ctitle) = parse_custom_title(&chain_list[0]) {
                tl.custom.push(CustomTable {
                    title: ctitle,
                    list: column,
                });
            }
        }
        Ok(tl)
    }

    pub async fn flush_rule(&self, table: &str, chain: &str) -> Result<(), String> {
        if table.is_empty() && chain.is_empty() {
            let mut first_err = None;
            for tbl in &["raw", "mangle", "nat", "filter"] {
                if let Err(e) = self.run_iptables(&["-t", tbl, "-F"]).await {
                    tracing::warn!("FlushRule table={} err={}", tbl, e);
                    if first_err.is_none() {
                        first_err = Some(e);
                    }
                }
            }
            return match first_err {
                Some(e) => Err(e),
                None => Ok(()),
            };
        }
        let tbl = if table.is_empty() { "filter" } else { table };
        if chain.is_empty() {
            self.run_iptables(&["-t", tbl, "-F"]).await?;
        } else {
            self.run_iptables(&["-t", tbl, "-F", chain]).await?;
        }
        Ok(())
    }

    pub async fn flush_metrics(&self, table: &str, chain: &str, id: &str) -> Result<(), String> {
        if !id.is_empty() {
            if table.is_empty() || chain.is_empty() {
                return Err(format!(
                    "FlushMetrics args error. table:{} chain:{} id:{}",
                    table, chain, id
                ));
            }
            self.run_iptables(&["-t", table, "-Z", chain, id]).await?;
            return Ok(());
        }

        if table.is_empty() && chain.is_empty() {
            let mut first_err = None;
            for tbl in &["raw", "mangle", "nat", "filter"] {
                if let Err(e) = self.run_iptables(&["-t", tbl, "-Z"]).await {
                    tracing::warn!("FlushMetrics table={} err={}", tbl, e);
                    if first_err.is_none() {
                        first_err = Some(e);
                    }
                }
            }
            return match first_err {
                Some(e) => Err(e),
                None => Ok(()),
            };
        }
        let tbl = if table.is_empty() { "filter" } else { table };
        if chain.is_empty() {
            self.run_iptables(&["-t", tbl, "-Z"]).await?;
        } else {
            self.run_iptables(&["-t", tbl, "-Z", chain]).await?;
        }
        Ok(())
    }

    pub async fn delete_rule(&self, table: &str, chain: &str, id: &str) -> Result<(), String> {
        if table.is_empty() || chain.is_empty() || id.is_empty() {
            return Err(format!(
                "DeleteRule args error. table:{} chain:{} id:{}",
                table, chain, id
            ));
        }
        self.run_iptables(&["-t", table, "-D", chain, id]).await?;
        Ok(())
    }

    pub async fn list_exec(&self, table: &str, chain: &str) -> Result<String, String> {
        let tbl = if table.is_empty() { "filter" } else { table };
        let str = self.run_iptables_save(&["-t", tbl]).await?;
        if chain.is_empty() {
            return Ok(str);
        }
        let search = format!(" {} ", chain);
        let lines = utils::split_and_trim_space(&str, "\n");
        let filtered: Vec<&str> = lines
            .iter()
            .filter(|l| l.contains(&search))
            .map(|s| s.as_str())
            .collect();
        Ok(filtered.join("\n"))
    }

    pub async fn exec(&self, params: &[String]) -> Result<String, String> {
        let args: Vec<&str> = params
            .iter()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .collect();
        if args.is_empty() {
            return Ok(String::new());
        }
        self.run_iptables(&args).await
    }

    pub async fn get_rule_info(
        &self,
        table: &str,
        chain: &str,
        id: &str,
    ) -> Result<String, String> {
        if table.is_empty() || chain.is_empty() || id.is_empty() {
            return Err(format!(
                "GetRuleInfo args error. table:{} chain:{} id:{}",
                table, chain, id
            ));
        }
        let s = self.run_iptables_save(&["-t", table]).await?;
        let search = format!(" {} ", chain);
        let lines = utils::split_and_trim_space(&s, "\n");
        let list: Vec<&str> = lines
            .iter()
            .filter(|l| l.contains(&search))
            .map(|s| s.as_str())
            .collect();
        let id_int: usize = id.parse().map_err(|_| format!("invalid id: {}", id))?;
        if list.len() < id_int {
            return Err(format!(
                "GetRuleInfo rule not found. table:{} chain:{} id:{}",
                table, chain, id
            ));
        }
        Ok(list[id_int - 1].to_string())
    }

    pub async fn flush_empty_custom_chain(&self) -> Result<(), String> {
        let mut first_err = None;
        for tbl in &["raw", "mangle", "nat", "filter"] {
            if let Err(e) = self.run_iptables(&["-t", tbl, "-X"]).await {
                tracing::warn!("FlushEmptyCustomChain table={} err={}", tbl, e);
                if first_err.is_none() {
                    first_err = Some(e);
                }
            }
        }
        match first_err {
            Some(e) => Err(e),
            None => Ok(()),
        }
    }

    pub async fn export_rules(&self, table: &str, chain: &str) -> Result<String, String> {
        let mut args = vec![];
        if !table.is_empty() {
            args.push("-t");
            args.push(table);
        }
        if !chain.is_empty() {
            args.push(chain);
        }
        self.run_iptables_save(&args).await
    }

    pub async fn import_rules(&self, rule: &str) -> Result<(), String> {
        if rule.is_empty() {
            return Ok(());
        }
        let tmp_dir = std::env::temp_dir();
        let tmp_path = tmp_dir.join(format!("iptables-rule-{}.tmp", utils::generate_uuid()));
        tokio::fs::write(&tmp_path, rule)
            .await
            .map_err(|e| format!("Import rule write error. err:{}", e))?;
        let result = self.run_iptables_restore(tmp_path.to_str().unwrap()).await;
        let _ = tokio::fs::remove_file(&tmp_path).await;
        result?;
        Ok(())
    }
}

#[async_trait]
impl FirewallCmd for IptablesCmd {
    async fn version(&self) -> Result<String, String> {
        self.version().await
    }

    async fn list_rule(&self, table: &str, chain: &str) -> Result<TableListData, String> {
        self.list_rule(table, chain).await
    }

    async fn list_exec(&self, table: &str, chain: &str) -> Result<String, String> {
        self.list_exec(table, chain).await
    }

    async fn flush_rule(&self, table: &str, chain: &str) -> Result<(), String> {
        self.flush_rule(table, chain).await
    }

    async fn delete_rule(&self, table: &str, chain: &str, id: &str) -> Result<(), String> {
        self.delete_rule(table, chain, id).await
    }

    async fn flush_metrics(&self, table: &str, chain: &str, id: &str) -> Result<(), String> {
        self.flush_metrics(table, chain, id).await
    }

    async fn get_rule_info(&self, table: &str, chain: &str, id: &str) -> Result<String, String> {
        self.get_rule_info(table, chain, id).await
    }

    async fn flush_empty_custom_chain(&self) -> Result<(), String> {
        self.flush_empty_custom_chain().await
    }

    async fn export_rules(&self, table: &str, chain: &str) -> Result<String, String> {
        self.export_rules(table, chain).await
    }

    async fn import_rules(&self, rule: &str) -> Result<(), String> {
        self.import_rules(rule).await
    }

    async fn exec(&self, params: &[String]) -> Result<String, String> {
        self.exec(params).await
    }
}
