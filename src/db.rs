use crate::juniper::JuniperConfig;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

const DEFAULT_DEVICE_ID: i64 = 1;

#[derive(Clone)]
pub struct AppDb {
    path: PathBuf,
}

#[derive(Clone, Serialize)]
pub struct JuniperDeviceSettings {
    pub id: i64,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub has_password: bool,
    pub connect_timeout_secs: u64,
    pub strict_host_key_checking: bool,
    #[serde(skip_serializing)]
    pub password: Option<String>,
}

#[derive(Clone)]
pub struct JuniperDeviceUpdate {
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: Option<String>,
    pub clear_password: bool,
    pub connect_timeout_secs: u64,
    pub strict_host_key_checking: bool,
}

#[derive(Clone, Serialize)]
pub struct HaproxyBackendServerSettings {
    pub id: i64,
    pub name: String,
    pub ip: String,
    pub port: u16,
    pub health_check: bool,
    pub position: i64,
}

#[derive(Clone, Serialize)]
pub struct HaproxyLoadBalancerSettings {
    pub id: i64,
    pub lb_type: String,
    pub enabled: bool,
    pub name: String,
    pub bind_port: u16,
    pub mode: String,
    pub balance_method: String,
    pub health_check_path: Option<String>,
    pub health_check: bool,
    pub servers: Vec<HaproxyBackendServerSettings>,
    pub updated_at: String,
}

#[derive(Clone)]
pub struct HaproxyLoadBalancerUpdate {
    pub lb_type: String,
    pub enabled: bool,
    pub name: String,
    pub bind_port: u16,
    pub mode: String,
    pub balance_method: String,
    pub health_check_path: Option<String>,
    pub health_check: bool,
    pub servers: Vec<HaproxyBackendServerUpdate>,
}

#[derive(Clone, Deserialize)]
pub struct HaproxyBackendServerUpdate {
    pub name: String,
    pub ip: String,
    pub port: u16,
    pub health_check: Option<bool>,
}

impl AppDb {
    pub fn from_env() -> Result<Self, String> {
        let path = std::env::var("FWM_DB_PATH")
            .ok()
            .filter(|v| !v.trim().is_empty())
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("firewall-man.sqlite3"));
        let db = Self { path };
        db.init()?;
        Ok(db)
    }

    pub fn juniper_config(&self) -> Result<JuniperConfig, String> {
        let settings = self.juniper_settings()?;
        Ok(JuniperConfig {
            host: settings.host,
            port: settings.port,
            username: settings.username,
            password: settings.password,
            connect_timeout_secs: settings.connect_timeout_secs,
            strict_host_key_checking: settings.strict_host_key_checking,
        })
    }

    pub fn juniper_settings(&self) -> Result<JuniperDeviceSettings, String> {
        self.ensure_seeded()?;
        let conn = self.connect()?;
        conn.query_row(
            "SELECT id, name, host, port, username, password, connect_timeout_secs, strict_host_key_checking
             FROM juniper_devices WHERE id = ?1",
            params![DEFAULT_DEVICE_ID],
            |row| {
                let password: Option<String> = row.get(5)?;
                Ok(JuniperDeviceSettings {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    host: row.get(2)?,
                    port: row.get::<_, i64>(3)? as u16,
                    username: row.get(4)?,
                    has_password: password.as_ref().map(|s| !s.is_empty()).unwrap_or(false),
                    password,
                    connect_timeout_secs: row.get::<_, i64>(6)? as u64,
                    strict_host_key_checking: row.get::<_, i64>(7)? != 0,
                })
            },
        )
        .map_err(|e| format!("load Juniper device settings failed: {e}"))
    }

    pub fn save_juniper_settings(
        &self,
        update: JuniperDeviceUpdate,
    ) -> Result<JuniperDeviceSettings, String> {
        validate_device_update(&update)?;
        self.ensure_seeded()?;

        let conn = self.connect()?;
        if update.clear_password || update.password.is_some() {
            conn.execute(
                "UPDATE juniper_devices
                 SET name = ?1, host = ?2, port = ?3, username = ?4, password = ?5,
                     connect_timeout_secs = ?6, strict_host_key_checking = ?7,
                     updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
                 WHERE id = ?8",
                params![
                    update.name,
                    update.host,
                    i64::from(update.port),
                    update.username,
                    update.password,
                    update.connect_timeout_secs as i64,
                    if update.strict_host_key_checking {
                        1
                    } else {
                        0
                    },
                    DEFAULT_DEVICE_ID
                ],
            )
        } else {
            conn.execute(
                "UPDATE juniper_devices
                 SET name = ?1, host = ?2, port = ?3, username = ?4,
                     connect_timeout_secs = ?5, strict_host_key_checking = ?6,
                     updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
                 WHERE id = ?7",
                params![
                    update.name,
                    update.host,
                    i64::from(update.port),
                    update.username,
                    update.connect_timeout_secs as i64,
                    if update.strict_host_key_checking {
                        1
                    } else {
                        0
                    },
                    DEFAULT_DEVICE_ID
                ],
            )
        }
        .map_err(|e| format!("save Juniper device settings failed: {e}"))?;

        self.juniper_settings()
    }

    pub fn list_haproxy_lbs(&self) -> Result<Vec<HaproxyLoadBalancerSettings>, String> {
        let conn = self.connect()?;
        let mut stmt = conn
            .prepare(
                "SELECT id, lb_type, enabled, name, bind_port, mode, balance_method,
                        health_check_path, health_check, updated_at
                 FROM haproxy_load_balancers
                 ORDER BY lb_type, name",
            )
            .map_err(|e| format!("prepare HAProxy load balancer query failed: {e}"))?;

        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)? != 0,
                    row.get::<_, String>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, Option<String>>(7)?,
                    row.get::<_, i64>(8)? != 0,
                    row.get::<_, String>(9)?,
                ))
            })
            .map_err(|e| format!("query HAProxy load balancers failed: {e}"))?;

        let mut items = Vec::new();
        for row in rows {
            let (
                id,
                lb_type,
                enabled,
                name,
                bind_port,
                mode,
                balance_method,
                health_check_path,
                health_check,
                updated_at,
            ) = row.map_err(|e| format!("read HAProxy load balancer row failed: {e}"))?;
            items.push(HaproxyLoadBalancerSettings {
                id,
                lb_type,
                enabled,
                name,
                bind_port: bind_port as u16,
                mode,
                balance_method,
                health_check_path,
                health_check,
                servers: self.haproxy_servers(id)?,
                updated_at,
            });
        }
        Ok(items)
    }

    pub fn save_haproxy_lb(
        &self,
        update: HaproxyLoadBalancerUpdate,
    ) -> Result<HaproxyLoadBalancerSettings, String> {
        validate_haproxy_update(&update)?;
        let mut conn = self.connect()?;
        let tx = conn
            .transaction()
            .map_err(|e| format!("start HAProxy settings transaction failed: {e}"))?;
        let existing_id: Option<i64> = tx
            .query_row(
                "SELECT id FROM haproxy_load_balancers WHERE lb_type = ?1 AND name = ?2",
                params![update.lb_type, update.name],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| format!("lookup HAProxy load balancer failed: {e}"))?;

        if existing_id.is_some() {
            return Err(format!(
                "HAProxy {} load balancer frontend name already exists: {}",
                update.lb_type, update.name
            ));
        }

        tx.execute(
            "INSERT INTO haproxy_load_balancers
             (lb_type, enabled, name, bind_port, mode, balance_method, health_check_path, health_check)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                update.lb_type,
                if update.enabled { 1 } else { 0 },
                update.name,
                i64::from(update.bind_port),
                update.mode,
                update.balance_method,
                update.health_check_path,
                if update.health_check { 1 } else { 0 }
            ],
        )
        .map_err(|e| format!("insert HAProxy load balancer failed: {e}"))?;
        let id = tx.last_insert_rowid();

        tx.execute(
            "DELETE FROM haproxy_backend_servers WHERE lb_id = ?1",
            params![id],
        )
        .map_err(|e| format!("clear HAProxy backend servers failed: {e}"))?;

        for (idx, server) in update.servers.iter().enumerate() {
            tx.execute(
                "INSERT INTO haproxy_backend_servers
                 (lb_id, name, ip, port, health_check, position)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    id,
                    server.name,
                    server.ip,
                    i64::from(server.port),
                    if server.health_check.unwrap_or(true) {
                        1
                    } else {
                        0
                    },
                    idx as i64
                ],
            )
            .map_err(|e| format!("insert HAProxy backend server failed: {e}"))?;
        }

        tx.commit()
            .map_err(|e| format!("commit HAProxy settings failed: {e}"))?;
        self.haproxy_lb(id)
    }

    pub fn delete_haproxy_lb(&self, id: i64) -> Result<bool, String> {
        let conn = self.connect()?;
        conn.execute(
            "DELETE FROM haproxy_backend_servers WHERE lb_id = ?1",
            params![id],
        )
        .map_err(|e| format!("delete HAProxy backend servers failed: {e}"))?;
        let affected = conn
            .execute(
                "DELETE FROM haproxy_load_balancers WHERE id = ?1",
                params![id],
            )
            .map_err(|e| format!("delete HAProxy load balancer failed: {e}"))?;
        Ok(affected > 0)
    }

    pub fn set_haproxy_lb_enabled(&self, id: i64, enabled: bool) -> Result<bool, String> {
        let conn = self.connect()?;
        let affected = conn
            .execute(
                "UPDATE haproxy_load_balancers
                 SET enabled = ?1, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
                 WHERE id = ?2",
                params![if enabled { 1 } else { 0 }, id],
            )
            .map_err(|e| format!("update HAProxy load balancer enabled state failed: {e}"))?;
        Ok(affected > 0)
    }

    fn init(&self) -> Result<(), String> {
        if let Some(parent) = self.path.parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("create database directory failed: {e}"))?;
            }
        }
        let conn = self.connect()?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS juniper_devices (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL DEFAULT 'default',
                host TEXT NOT NULL,
                port INTEGER NOT NULL DEFAULT 22,
                username TEXT NOT NULL,
                password TEXT NULL,
                connect_timeout_secs INTEGER NOT NULL DEFAULT 10,
                strict_host_key_checking INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
                updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
            );
            CREATE TABLE IF NOT EXISTS haproxy_load_balancers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                lb_type TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                name TEXT NOT NULL,
                bind_port INTEGER NOT NULL,
                mode TEXT NOT NULL,
                balance_method TEXT NOT NULL,
                health_check_path TEXT NULL,
                health_check INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
                updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
                UNIQUE(lb_type, name)
            );
            CREATE TABLE IF NOT EXISTS haproxy_backend_servers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                lb_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                ip TEXT NOT NULL,
                port INTEGER NOT NULL,
                health_check INTEGER NOT NULL DEFAULT 1,
                position INTEGER NOT NULL DEFAULT 0
            );",
        )
        .map_err(|e| format!("initialize database schema failed: {e}"))?;
        let _ = conn.execute(
            "ALTER TABLE haproxy_load_balancers ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1",
            [],
        );
        self.ensure_seeded()
    }

    fn haproxy_lb(&self, id: i64) -> Result<HaproxyLoadBalancerSettings, String> {
        let conn = self.connect()?;
        let mut item = conn
            .query_row(
                "SELECT id, lb_type, enabled, name, bind_port, mode, balance_method,
                        health_check_path, health_check, updated_at
                 FROM haproxy_load_balancers WHERE id = ?1",
                params![id],
                |row| {
                    Ok(HaproxyLoadBalancerSettings {
                        id: row.get(0)?,
                        lb_type: row.get(1)?,
                        enabled: row.get::<_, i64>(2)? != 0,
                        name: row.get(3)?,
                        bind_port: row.get::<_, i64>(4)? as u16,
                        mode: row.get(5)?,
                        balance_method: row.get(6)?,
                        health_check_path: row.get(7)?,
                        health_check: row.get::<_, i64>(8)? != 0,
                        servers: Vec::new(),
                        updated_at: row.get(9)?,
                    })
                },
            )
            .map_err(|e| format!("load HAProxy load balancer failed: {e}"))?;
        item.servers = self.haproxy_servers(id)?;
        Ok(item)
    }

    fn haproxy_servers(&self, lb_id: i64) -> Result<Vec<HaproxyBackendServerSettings>, String> {
        let conn = self.connect()?;
        let mut stmt = conn
            .prepare(
                "SELECT id, name, ip, port, health_check, position
                 FROM haproxy_backend_servers
                 WHERE lb_id = ?1
                 ORDER BY position, id",
            )
            .map_err(|e| format!("prepare HAProxy backend server query failed: {e}"))?;
        let rows = stmt
            .query_map(params![lb_id], |row| {
                Ok(HaproxyBackendServerSettings {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    ip: row.get(2)?,
                    port: row.get::<_, i64>(3)? as u16,
                    health_check: row.get::<_, i64>(4)? != 0,
                    position: row.get(5)?,
                })
            })
            .map_err(|e| format!("query HAProxy backend servers failed: {e}"))?;

        let mut servers = Vec::new();
        for row in rows {
            servers.push(row.map_err(|e| format!("read HAProxy backend server failed: {e}"))?);
        }
        Ok(servers)
    }

    fn ensure_seeded(&self) -> Result<(), String> {
        let conn = self.connect()?;
        let exists: Option<i64> = conn
            .query_row(
                "SELECT id FROM juniper_devices WHERE id = ?1",
                params![DEFAULT_DEVICE_ID],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| format!("check Juniper device seed failed: {e}"))?;
        if exists.is_some() {
            return Ok(());
        }

        let config = JuniperConfig::from_env();
        conn.execute(
            "INSERT INTO juniper_devices
             (id, name, host, port, username, password, connect_timeout_secs, strict_host_key_checking)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                DEFAULT_DEVICE_ID,
                "default",
                config.host,
                i64::from(config.port),
                config.username,
                config.password,
                config.connect_timeout_secs as i64,
                if config.strict_host_key_checking { 1 } else { 0 }
            ],
        )
        .map_err(|e| format!("seed Juniper device settings failed: {e}"))?;
        Ok(())
    }

    fn connect(&self) -> Result<Connection, String> {
        Connection::open(&self.path).map_err(|e| format!("open database failed: {e}"))
    }
}

fn validate_haproxy_update(update: &HaproxyLoadBalancerUpdate) -> Result<(), String> {
    if !matches!(update.lb_type.as_str(), "web" | "sql") {
        return Err("invalid HAProxy load balancer type".to_string());
    }
    if update.name.trim().is_empty() || update.name.len() > 64 {
        return Err("invalid HAProxy frontend name".to_string());
    }
    if update.bind_port == 0 {
        return Err("invalid HAProxy listen port".to_string());
    }
    if !matches!(
        update.balance_method.as_str(),
        "roundrobin" | "leastconn" | "source"
    ) {
        return Err("invalid HAProxy balance method".to_string());
    }
    if update.servers.is_empty() {
        return Err("at least one HAProxy backend server is required".to_string());
    }
    Ok(())
}

fn validate_device_update(update: &JuniperDeviceUpdate) -> Result<(), String> {
    if update.name.trim().is_empty() || update.name.len() > 64 {
        return Err("invalid device name".to_string());
    }
    if update.host.trim().is_empty() || update.host.len() > 255 {
        return Err("invalid Juniper host".to_string());
    }
    if update.port == 0 {
        return Err("invalid Juniper SSH port".to_string());
    }
    if update.username.trim().is_empty() || update.username.len() > 64 {
        return Err("invalid Juniper username".to_string());
    }
    if update.connect_timeout_secs == 0 || update.connect_timeout_secs > 120 {
        return Err("invalid Juniper connection timeout".to_string());
    }
    Ok(())
}
