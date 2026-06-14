use async_trait::async_trait;

use crate::iptables::types::TableListData;

#[async_trait]
pub trait FirewallCmd: Send + Sync {
    async fn version(&self) -> Result<String, String>;
    async fn list_rule(&self, table: &str, chain: &str) -> Result<TableListData, String>;
    async fn list_exec(&self, table: &str, chain: &str) -> Result<String, String>;
    async fn flush_rule(&self, table: &str, chain: &str) -> Result<(), String>;
    async fn delete_rule(&self, table: &str, chain: &str, id: &str) -> Result<(), String>;
    async fn flush_metrics(&self, table: &str, chain: &str, id: &str) -> Result<(), String>;
    async fn get_rule_info(&self, table: &str, chain: &str, id: &str) -> Result<String, String>;
    async fn flush_empty_custom_chain(&self) -> Result<(), String>;
    async fn export_rules(&self, table: &str, chain: &str) -> Result<String, String>;
    async fn import_rules(&self, rule: &str) -> Result<(), String>;
    async fn exec(&self, params: &[String]) -> Result<String, String>;
}
