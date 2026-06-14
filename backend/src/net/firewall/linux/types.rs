use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Protocol {
    IPv4,
    IPv6,
}

impl Protocol {
    pub fn binary_name(&self) -> &str {
        match self {
            Protocol::IPv4 => "iptables",
            Protocol::IPv6 => "ip6tables",
        }
    }

    pub fn save_binary_name(&self) -> &str {
        match self {
            Protocol::IPv4 => "iptables-save",
            Protocol::IPv6 => "ip6tables-save",
        }
    }

    pub fn restore_binary_name(&self) -> &str {
        match self {
            Protocol::IPv4 => "iptables-restore",
            Protocol::IPv6 => "ip6tables-restore",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemTitle {
    pub chain: String,
    pub policy: String,
    pub packets: String,
    pub bytes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomTitle {
    pub chain: String,
    pub references: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Column {
    pub num: String,
    pub pkts: String,
    pub bytes: String,
    pub target: String,
    pub prot: String,
    pub opt: String,
    #[serde(rename = "in")]
    pub r#in: String,
    pub out: String,
    pub source: String,
    pub destination: String,
    pub action: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemTable {
    pub title: SystemTitle,
    pub list: Vec<Column>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomTable {
    pub title: CustomTitle,
    pub list: Vec<Column>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableListData {
    pub system: Vec<SystemTable>,
    pub custom: Vec<CustomTable>,
}
