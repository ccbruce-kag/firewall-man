use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub fn hash_password(password: &str, salt: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(format!("{}::{}", salt, password).as_bytes());
    let digest = hasher.finalize();
    format!("{}${}", salt, hex::encode(digest))
}

pub fn verify_password(password: &str, stored: &str) -> bool {
    let parts: Vec<&str> = stored.splitn(2, '$').collect();
    if parts.len() != 2 { return false; }
    let salt = parts[0];
    let expected = hash_password(password, salt);
    expected == stored
}

pub fn derive_salt(seed: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(format!("kyklos-salt::{}", seed).as_bytes());
    hex::encode(hasher.finalize())[..16].to_string()
}

// ---- Role ----

#[derive(Clone, Serialize, Deserialize)]
pub struct Role {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Deserialize)]
pub struct RoleInput {
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    pub enabled: Option<bool>,
}

// ---- Unit ----

#[derive(Clone, Serialize, Deserialize)]
pub struct Unit {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub parent_id: Option<i64>,
    pub description: Option<String>,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Deserialize)]
pub struct UnitInput {
    pub code: String,
    pub name: String,
    pub parent_id: Option<i64>,
    pub description: Option<String>,
    pub enabled: Option<bool>,
}

// ---- User ----

#[derive(Clone, Serialize, Deserialize)]
pub struct User {
    pub id: i64,
    pub username: String,
    pub display_name: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    #[serde(skip_serializing)]
    pub password_hash: String,
    pub unit_id: Option<i64>,
    pub role_codes: Vec<String>,
    pub enabled: bool,
    pub last_login_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Deserialize)]
pub struct UserInput {
    pub username: String,
    pub display_name: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub password: Option<String>,
    pub unit_id: Option<i64>,
    pub role_codes: Option<Vec<String>>,
    pub enabled: Option<bool>,
}

#[derive(Clone, Deserialize)]
pub struct UserPasswordInput {
    pub password: String,
}

// ---- Data Dictionary ----

#[derive(Clone, Serialize, Deserialize)]
pub struct DictionaryEntry {
    pub id: i64,
    pub category: String,
    pub code: String,
    pub label: String,
    pub description: Option<String>,
    pub sort_order: i64,
    pub extra_json: Option<String>,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Deserialize)]
pub struct DictionaryInput {
    pub category: String,
    pub code: String,
    pub label: String,
    pub description: Option<String>,
    pub sort_order: Option<i64>,
    pub extra_json: Option<String>,
    pub enabled: Option<bool>,
}

// ---- System Setting ----

#[derive(Clone, Serialize, Deserialize)]
pub struct SystemSetting {
    pub id: i64,
    pub key: String,
    pub value: String,
    pub category: String,
    pub data_type: String,
    pub description: Option<String>,
    pub is_secret: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Deserialize)]
pub struct SystemSettingInput {
    pub key: String,
    pub value: String,
    pub category: Option<String>,
    pub data_type: Option<String>,
    pub description: Option<String>,
    pub is_secret: Option<bool>,
}

pub fn mask_secret(value: &str) -> String {
    if value.is_empty() { return String::new(); }
    let visible = value.chars().take(2).collect::<String>();
    let len = value.chars().count();
    format!("{}{}", visible, "*".repeat(len.min(8)))
}
